-- Identity → database (§5.5). Helper functions live in the private `app`
-- schema (not exposed by PostgREST). Argument-free helpers are wrapped in
-- (select …) inside policies so Postgres evaluates them once per statement.

-- Today in the college's timezone.
create or replace function app.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create or replace function app.jwt_roles() returns text[]
language sql stable set search_path = '' as $$
  select coalesce(array(select jsonb_array_elements_text(auth.jwt() -> 'app_roles')), '{}')
$$;

-- Does the caller hold `perm` with exactly `scope` through any of their roles?
create or replace function app.can(perm text, scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.role_permissions rp
    where rp.permission = perm
      and rp.scope = can.scope
      and (auth.jwt() -> 'app_roles') ? rp.role
  )
$$;

-- Broadest scope the caller holds for `perm`, or null.
create or replace function app.scope_of(perm text) returns text
language sql stable security definer set search_path = '' as $$
  select rp.scope from public.role_permissions rp
  where rp.permission = perm and (auth.jwt() -> 'app_roles') ? rp.role
  order by case rp.scope when 'all' then 1 when 'department' then 2 when 'assigned' then 3 else 4 end
  limit 1
$$;

create or replace function app.my_staff_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.staff where user_id = auth.uid()
$$;

create or replace function app.my_student_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.students where user_id = auth.uid()
$$;

create or replace function app.my_guardian_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.guardians where user_id = auth.uid()
$$;

-- Departments the caller heads today (HOD scope).
create or replace function app.my_department_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(ds.department_id), '{}')
  from public.department_staff ds
  join public.staff s on s.id = ds.staff_id
  where s.user_id = auth.uid() and ds.role = 'hod' and ds.valid_during @> app.today()
$$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false)
$$;

create or replace function app.student_department(p_student uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.department_id from public.student_enrollments e
  where e.student_id = p_student and e.is_primary and e.valid_during @> app.today()
  union all
  select s.admitted_department_id from public.students s where s.id = p_student
  limit 1
$$;

create or replace function app.student_in_my_departments(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.student_department(p_student) = any (app.my_department_ids())
$$;

-- Is the caller primary, co or substitute staff on the session?
create or replace function app.teaches_session(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_staff ss
    join public.staff s on s.id = ss.staff_id
    where ss.session_id = p_session and s.user_id = auth.uid()
  )
$$;

-- Does the caller currently teach a group the student belongs to?
create or replace function app.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.staff s on s.id = ta.staff_id and s.user_id = auth.uid()
    join public.teaching_groups g on g.id = ta.teaching_group_id
    join public.student_enrollments e
      on e.student_id = p_student and e.is_primary and e.valid_during @> app.today()
    where ta.valid_during @> app.today()
      and ((g.kind = 'division' and g.division_id = e.division_id)
        or (g.kind = 'batch' and g.batch_id = e.batch_id)
        or (g.kind = 'custom' and exists (
              select 1 from public.student_subject_registrations r
              where r.teaching_group_id = g.id and r.student_id = p_student and r.valid_during @> app.today())))
  )
$$;

create or replace function app.is_class_teacher_of(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.class_teacher_assignments ct
    join public.staff s on s.id = ct.staff_id and s.user_id = auth.uid()
    join public.student_enrollments e
      on e.division_id = ct.division_id and e.student_id = p_student and e.is_primary and e.valid_during @> app.today()
    where ct.valid_during @> app.today()
  )
$$;

create or replace function app.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guardian_links gl
    join public.guardians g on g.id = gl.guardian_id
    where gl.student_id = p_student and g.user_id = auth.uid() and gl.status = 'verified'
  )
$$;

-- Row visibility for a permission given the row's department.
create or replace function app.in_scope(perm text, p_department uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can(perm, 'all')
      or (app.can(perm, 'department') and p_department = any (app.my_department_ids()))
$$;

create or replace function app.mfa_required() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value)::boolean from public.app_config where key = 'require_mfa_for_admins'), true)
$$;

-- First statement of every write RPC (§8.3): active account, permission,
-- department scope, and aal2 for the most sensitive permissions.
create or replace function app.require(perm text, p_department uuid default null) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if not app.is_active_user() then
    raise exception 'ACCOUNT_INACTIVE' using errcode = 'P0001';
  end if;
  v_scope := app.scope_of(perm);
  if v_scope is null or v_scope not in ('all', 'department') then
    raise exception 'FORBIDDEN' using errcode = 'P0001', detail = perm;
  end if;
  if v_scope = 'department' and (p_department is null or not p_department = any (app.my_department_ids())) then
    raise exception 'OUT_OF_SCOPE' using errcode = 'P0001', detail = perm;
  end if;
  if perm in ('roles.manage', 'settings.manage', 'attendance.policy.manage', 'blueprint.activate', 'year.rollover')
     and app.mfa_required()
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA_REQUIRED' using errcode = 'P0001';
  end if;
end $$;

create or replace function app.actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select display_name from public.profiles where id = auth.uid()), 'system')
$$;

create or replace function app.audit(
  p_action text, p_entity text, p_entity_id text, p_summary text,
  p_before jsonb default null, p_after jsonb default null, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary, before, after, reason, ip, user_agent)
  values (auth.uid(), app.actor_name(), p_action, p_entity, p_entity_id, p_summary, p_before, p_after, p_reason,
          coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip'), v_headers ->> 'user-agent');
end $$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- Custom Access Token Hook: claims added at sign-in and on every refresh (§5.5).
-- Enable in Supabase: Authentication → Hooks → Custom Access Token → public.custom_access_token_hook.
create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_uid    uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_roles  jsonb;
begin
  select coalesce(jsonb_agg(ur.role order by ur.role), '[]'::jsonb) into v_roles
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.is_active
  where ur.user_id = v_uid;

  v_claims := v_claims
    || jsonb_build_object(
      'app_roles', v_roles,
      'staff_id', (select id from public.staff where user_id = v_uid),
      'student_id', (select id from public.students where user_id = v_uid),
      'guardian_id', (select id from public.guardians where user_id = v_uid)
    );
  return jsonb_set(event, '{claims}', v_claims);
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.user_roles, public.profiles, public.staff, public.students, public.guardians to supabase_auth_admin;
