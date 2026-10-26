-- Mobile API (MobileApp_Architecture.md §7.3).
--
-- Persona-scoped read models and write RPCs used by the React Native app.
-- Additive only: no table changes. Contract tests live in the mobile
-- project (EcasMobileApp/backend/tests, run by backend/test-local.ps1).
--
-- Conventions follow the earlier migrations: SECURITY DEFINER functions with
-- search_path = '' and explicit checks, stable error codes (src/shared/errors.ts),
-- security_invoker views where RLS already scopes rows, and security_barrier
-- views with an explicit caller filter where RLS on a joined table would hide
-- rows the caller is entitled to (e.g. a substitute reading a register).

-- ── Helpers ───────────────────────────────────────────────────────────────
-- Self (student) or a verified guardian of the student.
create or replace function app.can_view_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_student is not null and (p_student = app.my_student_id() or app.is_guardian_of(p_student))
$$;

-- Current members of a teaching group (same rules as app.roster, by group).
create or replace function app.group_members(p_group uuid, p_on date default null)
returns table (student_id uuid, full_name text, roll_no integer, division_id uuid, batch_id uuid)
language sql stable security definer set search_path = '' as $$
  with g as (select * from public.teaching_groups where id = p_group),
  d as (select coalesce(p_on, app.today()) as on_date),
  members as (
    select e.student_id, e.roll_no, e.division_id, e.batch_id
    from g, d join public.student_enrollments e on e.is_primary and e.valid_during @> d.on_date
    where (g.kind = 'division' and e.division_id = g.division_id) or (g.kind = 'batch' and e.batch_id = g.batch_id)
    union
    select r.student_id, e.roll_no, e.division_id, e.batch_id
    from g, d
    join public.student_subject_registrations r on r.valid_during @> d.on_date
    left join public.student_enrollments e on e.student_id = r.student_id and e.is_primary and e.valid_during @> d.on_date
    where g.kind = 'custom' and r.teaching_group_id = g.id
  )
  select m.student_id, st.full_name, m.roll_no, m.division_id, m.batch_id
  from members m join public.students st on st.id = m.student_id and st.status = 'active'
  order by m.roll_no nulls last, st.full_name
$$;

create or replace function app.group_label(p_group uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case g.kind
           when 'batch' then app.division_label(dv.program_year, d.code, dv.code) || ' · B' || b.code
           when 'custom' then coalesce(g.name, app.division_label(dv.program_year, d.code, dv.code))
           else app.division_label(dv.program_year, d.code, dv.code)
         end
  from public.teaching_groups g
  left join public.divisions dv on dv.id = g.division_id
  left join public.departments d on d.id = dv.department_id
  left join public.batches b on b.id = g.batch_id
  where g.id = p_group
$$;

-- In-app notification (the notification centre is the source of truth, §12)
-- plus an idempotent push through the outbox.
create or replace function app.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_data jsonb, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, data) values (p_user, p_kind, p_title, p_body, coalesce(p_data, '{}'));
  perform app.enqueue('push', p_user, p_kind, coalesce(p_data, '{}') || jsonb_build_object('title', p_title, 'body', p_body), p_dedupe);
end $$;

create or replace function app.class_teacher_user(p_student uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select st.user_id
  from public.student_enrollments e
  join public.class_teacher_assignments ct on ct.division_id = e.division_id and ct.valid_during @> app.today()
  join public.staff st on st.id = ct.staff_id
  where e.student_id = p_student and e.is_primary and e.valid_during @> app.today()
  limit 1
$$;

create or replace function app.require_active() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not app.is_active_user() then raise exception 'ACCOUNT_INACTIVE' using errcode = 'P0001'; end if;
end $$;

-- ── All personas ──────────────────────────────────────────────────────────
-- One round trip at launch: identity, persona inputs, capabilities, app config.
create or replace function public.my_capabilities() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', p.id,
    'display_name', p.display_name,
    'is_active', p.is_active,
    'roles', coalesce((select jsonb_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id = p.id), '[]'::jsonb),
    'staff_id', app.my_staff_id(),
    'student_id', app.my_student_id(),
    'guardian_id', app.my_guardian_id(),
    'class_teacher_of', coalesce((
      select jsonb_agg(jsonb_build_object('division_id', dv.id, 'label', app.division_label(dv.program_year, d.code, dv.code)))
      from public.class_teacher_assignments ct
      join public.staff st on st.id = ct.staff_id and st.user_id = p.id
      join public.divisions dv on dv.id = ct.division_id
      join public.departments d on d.id = dv.department_id
      where ct.valid_during @> app.today()), '[]'::jsonb),
    'hod_of', coalesce((
      select jsonb_agg(jsonb_build_object('department_id', d.id, 'code', d.code, 'name', d.name))
      from public.departments d where d.id = any (app.my_department_ids())), '[]'::jsonb),
    'teaching_groups', (
      select count(*) from public.teaching_assignments ta join public.staff st on st.id = ta.staff_id and st.user_id = p.id
      where ta.valid_during @> app.today()),
    'exam_duties', (
      select count(*) from public.exam_duties ed
      join public.exam_sessions es on es.id = ed.exam_session_id and es.ends_at > now()
      join public.staff st on st.id = ed.staff_id and st.user_id = p.id),
    'config', jsonb_build_object(
      'min_mobile_version', coalesce((select value from public.app_config where key = 'min_mobile_version'), '"1.0.0"'::jsonb),
      'maintenance_banner', coalesce((select value from public.app_config where key = 'maintenance_banner'), 'null'::jsonb),
      'marking_opens_minutes', coalesce((select value from public.app_config where key = 'marking_opens_minutes'), '15'::jsonb),
      'roster_photos', coalesce((select value from public.app_config where key = 'roster_photos'), 'false'::jsonb)
    )
  )
  from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.register_device(p_token text, p_platform text, p_app_version text default null, p_device_id text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_active();
  if p_platform not in ('android', 'ios') or length(coalesce(p_token, '')) < 10 then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;
  -- A token moves to whoever signed in last on that device.
  insert into public.device_tokens (user_id, token, platform, app_version, last_seen_at, disabled_at)
  values (auth.uid(), p_token, p_platform, p_app_version, now(), null)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, app_version = excluded.app_version,
        last_seen_at = now(), disabled_at = null;
end $$;

create or replace function public.unregister_device(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.device_tokens where token = p_token and user_id = auth.uid()
$$;

-- p_ids null = mark everything read. Returns the number of rows changed.
create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform app.require_active();
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace view public.v_my_announcements with (security_barrier) as
select a.id, a.title, a.body, a.priority, a.audience, a.publish_at, a.expires_at,
       coalesce(pr.display_name, 'College') as author_name, r.read_at
from public.announcement_recipients r
join public.announcements a on a.id = r.announcement_id and a.published
left join public.profiles pr on pr.id = a.created_by
where r.user_id = auth.uid() and (a.expires_at is null or a.expires_at > now());

create or replace view public.v_academic_calendar with (security_invoker = true) as
select e.id, e.title, e.kind, e.starts_on, e.ends_on
from public.academic_calendar_events e
join public.academic_years y on y.id = e.academic_year_id and y.status = 'active';

-- ── Professor ─────────────────────────────────────────────────────────────
create or replace view public.v_my_sessions with (security_barrier) as
select s.id, s.session_date, s.starts_at, s.ends_at,
       to_char(s.starts_at at time zone 'Asia/Kolkata', 'HH24:MI') as start_time,
       to_char(s.ends_at at time zone 'Asia/Kolkata', 'HH24:MI') as end_time,
       s.component, s.session_type, s.room_label, s.status, s.cancel_reason,
       s.rescheduled_from_id,
       (select n.id from public.class_sessions n where n.rescheduled_from_id = s.id order by n.created_at desc limit 1) as rescheduled_to_id,
       sub.code as subject_code, sub.name as subject_name, s.offering_id, s.teaching_group_id, s.term_id, s.department_id,
       app.group_label(s.teaching_group_id) as group_label,
       ss.role as my_role,
       (select sd.full_name from public.session_staff x join public.staff_directory sd on sd.id = x.staff_id
         where x.session_id = s.id and x.role = 'substitute' limit 1) as substitute_name,
       r.state as register_state, r.version as register_version, r.submitted_at, r.locked_at, r.reopen_until,
       r.present_count, r.total_count, r.is_late,
       s.starts_at - make_interval(mins => coalesce((select (value #>> '{}')::integer from public.app_config where key = 'marking_opens_minutes'), 15)) as marking_opens_at,
       case when r.submitted_at is not null then r.submitted_at + make_interval(hours => pol.edit_window_hours) end as edit_until,
       s.ends_at + make_interval(hours => pol.lock_after_hours) as locks_at,
       pol.default_unmarked_status
from public.class_sessions s
join public.session_staff ss on ss.session_id = s.id and ss.staff_id = app.my_staff_id()
join public.subject_offerings o on o.id = s.offering_id
join public.subjects sub on sub.id = o.subject_id
left join public.attendance_registers r on r.session_id = s.id
cross join lateral app.policy_for(s.department_id) pol;

create or replace view public.v_my_teaching_groups with (security_barrier) as
select g.id as group_id, g.component, g.kind, app.group_label(g.id) as group_label,
       sub.code as subject_code, sub.name as subject_name, o.id as offering_id, o.term_id, o.department_id,
       ta.role as my_role, g.division_id,
       app.division_label(dv.program_year, d.code, dv.code) as division_label
from public.teaching_assignments ta
join public.teaching_groups g on g.id = ta.teaching_group_id
join public.subject_offerings o on o.id = g.offering_id
join public.academic_terms t on t.id = o.term_id and t.status = 'active'
join public.subjects sub on sub.id = o.subject_id
left join public.divisions dv on dv.id = g.division_id
left join public.departments d on d.id = dv.department_id
where ta.staff_id = app.my_staff_id() and ta.valid_during @> app.today();

create or replace function public.session_roster_for_marking(p_session uuid)
returns table (session_id uuid, student_id uuid, full_name text, roll_no integer, batch_code text, suggested_status text, photo_url text)
language plpgsql stable security definer set search_path = '' as $$
declare v_department uuid;
begin
  select department_id into v_department from public.class_sessions where id = p_session;
  if v_department is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not (app.teaches_session(p_session) or app.in_scope('attendance.view', v_department)) then
    raise exception 'ATT_NOT_ASSIGNED' using errcode = 'P0001';
  end if;
  -- photo_url: signed Cloudinary thumbnails arrive with the media-url Edge Function (§13).
  return query
  select p_session, r.student_id, r.full_name, r.roll_no, b.code, r.suggested_status, null::text
  from app.roster(p_session) r left join public.batches b on b.id = r.batch_id;
end $$;

-- Prefetch (§9.4): every roster for the caller's sessions in a window, in one call.
create or replace function public.my_rosters_for_window(p_from date, p_to date)
returns table (session_id uuid, student_id uuid, full_name text, roll_no integer, batch_code text, suggested_status text, photo_url text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_active();
  if p_to < p_from or p_to - p_from > 14 then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  return query
  select s.id, r.student_id, r.full_name, r.roll_no, b.code, r.suggested_status, null::text
  from public.class_sessions s
  join public.session_staff ss on ss.session_id = s.id and ss.staff_id = app.my_staff_id()
  cross join lateral app.roster(s.id) r
  left join public.batches b on b.id = r.batch_id
  where s.session_date between p_from and p_to and s.status in ('scheduled', 'held');
end $$;

-- Submitted register with names; visible to the session's staff (including
-- substitutes, whom students RLS would hide) and to in-scope viewers.
create or replace view public.v_register_detail with (security_barrier) as
select r.session_id, r.id as record_id, r.student_id, st.full_name, e.roll_no, r.status_code, r.source, r.marked_at
from public.attendance_records r
join public.students st on st.id = r.student_id
left join public.student_enrollments e on e.student_id = r.student_id and e.is_primary and e.valid_during @> r.session_date
where app.teaches_session(r.session_id) or app.in_scope('attendance.view', r.department_id);

create or replace function public.class_attendance_stats(p_group uuid, p_term uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_group public.teaching_groups; v_offering public.subject_offerings; v_policy public.attendance_policies; v_sub public.subjects;
begin
  perform app.require_active();
  select * into v_group from public.teaching_groups where id = p_group;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into v_offering from public.subject_offerings where id = v_group.offering_id;
  if p_term is not null and v_offering.term_id <> p_term then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not (
    exists (select 1 from public.teaching_assignments ta where ta.teaching_group_id = p_group and ta.staff_id = app.my_staff_id())
    or exists (select 1 from public.class_teacher_assignments ct where ct.division_id = v_group.division_id
               and ct.staff_id = app.my_staff_id() and ct.valid_during @> app.today())
    or app.in_scope('attendance.view', v_offering.department_id)
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select * into v_sub from public.subjects where id = v_offering.subject_id;
  v_policy := app.policy_for(v_offering.department_id, v_offering.program_year, v_offering.subject_id);

  return jsonb_build_object(
    'group_id', p_group,
    'group_label', app.group_label(p_group),
    'subject_code', v_sub.code,
    'subject_name', v_sub.name,
    'component', v_group.component,
    'min_percent', v_policy.min_percent,
    'warn_percent', v_policy.warn_percent,
    'sessions', (
      select jsonb_build_object(
        'scheduled', count(*) filter (where s.status <> 'cancelled'),
        'held', count(*) filter (where g.state in ('submitted', 'locked', 'reopened') and g.submitted_at is not null),
        'due', count(*) filter (where s.status <> 'cancelled' and s.ends_at < now()),
        'missing', count(*) filter (where s.status <> 'cancelled' and app.register_is_missing(g.state, g.submitted_at, s.ends_at)),
        'cancelled', count(*) filter (where s.status = 'cancelled'))
      from public.class_sessions s left join public.attendance_registers g on g.session_id = s.id
      where s.teaching_group_id = p_group and s.status <> 'rescheduled'),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'student_id', m.student_id, 'full_name', m.full_name, 'roll_no', m.roll_no,
               'held', coalesce(a.held, 0), 'attended', coalesce(a.attended, 0), 'percent', a.percent)
             order by a.percent nulls last, m.roll_no)
      from app.group_members(p_group) m
      left join public.attendance_summaries a
        on a.student_id = m.student_id and a.offering_id = v_group.offering_id and a.component = v_group.component), '[]'::jsonb)
  );
end $$;

-- Rule 5 (§9.3): locked registers are changed through correction requests.
-- p_changes: [{ "student_id": uuid, "to_status": "P" }, …]
create or replace function public.request_attendance_correction(p_session uuid, p_changes jsonb, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_session public.class_sessions; v_staff uuid := app.my_staff_id(); v_count integer; v_sub text;
begin
  perform app.require_active();
  select * into v_session from public.class_sessions where id = p_session;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_staff is null or not app.teaches_session(p_session) then raise exception 'ATT_NOT_ASSIGNED' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.attendance_records where session_id = p_session) then
    raise exception 'ATT_NEEDS_REOPEN' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_changes, '[]')) x
             left join public.attendance_status_codes c on c.code = x ->> 'to_status'
             where c.code is null or not c.professor_can_set) then
    raise exception 'ATT_INVALID_STATUS' using errcode = 'P0001';
  end if;

  insert into public.attendance_correction_requests (session_id, student_id, requested_by, from_status, to_status, reason)
  select p_session, ar.student_id, v_staff, ar.status_code, x ->> 'to_status', trim(p_reason)
  from jsonb_array_elements(coalesce(p_changes, '[]')) x
  join public.attendance_records ar on ar.session_id = p_session and ar.student_id = (x ->> 'student_id')::uuid
  where ar.status_code <> x ->> 'to_status'
    and not exists (select 1 from public.attendance_correction_requests q
                    where q.session_id = p_session and q.student_id = ar.student_id and q.status = 'pending');
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'NO_CHANGE' using errcode = 'P0001'; end if;

  select sub.name into v_sub from public.subject_offerings o join public.subjects sub on sub.id = o.subject_id where o.id = v_session.offering_id;
  perform app.notify_user(st.user_id, 'correction_requested', 'Attendance correction requested',
            format('%s correction(s) for %s on %s', v_count, v_sub, to_char(v_session.session_date, 'DD Mon')),
            jsonb_build_object('session_id', p_session, 'url', 'collegeapp://notifications'),
            format('corrreq:%s:%s:%s', p_session, now(), st.user_id))
  from public.department_staff ds join public.staff st on st.id = ds.staff_id
  where ds.department_id = v_session.department_id and ds.role = 'hod' and ds.valid_during @> app.today();

  perform app.audit('attendance.correction.requested', 'attendance_correction_requests', p_session::text,
    format('Requested %s correction(s) for %s on %s', v_count, v_sub, v_session.session_date), null, p_changes, p_reason);
  return v_count;
end $$;

create or replace view public.v_leave_pending_for_me with (security_barrier) as
select l.id, l.student_id, st.full_name, e.roll_no,
       app.division_label(dv.program_year, d.code, dv.code) as division_label,
       l.leave_type, l.from_date, l.to_date, lower(l.leave_period) as starts_at, upper(l.leave_period) as ends_at,
       l.reason, l.status, l.document_asset_id is not null as has_document, l.created_at,
       (select count(*) from public.leave_request_sessions ls where ls.leave_request_id = l.id) as session_count
from public.leave_requests l
join public.students st on st.id = l.student_id
left join public.student_enrollments e on e.student_id = l.student_id and e.is_primary and e.valid_during @> app.today()
left join public.divisions dv on dv.id = e.division_id
left join public.departments d on d.id = dv.department_id
where l.status in ('pending', 'needs_info') and app.is_class_teacher_of(l.student_id);

create or replace function public.apply_staff_leave(p_type text, p_from date, p_to date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_staff uuid := app.my_staff_id(); v_id uuid;
begin
  perform app.require_active();
  if v_staff is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_type not in ('casual', 'medical', 'duty', 'earned') or p_to < p_from then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_leave_requests r where r.staff_id = v_staff and r.status in ('pending', 'approved')
             and daterange(r.from_date, r.to_date, '[]') && daterange(p_from, p_to, '[]')) then
    raise exception 'LEAVE_OVERLAP' using errcode = 'P0001';
  end if;
  insert into public.staff_leave_requests (staff_id, leave_type, from_date, to_date, reason)
  values (v_staff, p_type, p_from, p_to, trim(p_reason)) returning id into v_id;
  perform app.notify_user(hst.user_id, 'staff_leave_pending', 'Staff leave request',
            format('%s: %s leave %s – %s', s.full_name, p_type, to_char(p_from, 'DD Mon'), to_char(p_to, 'DD Mon')),
            jsonb_build_object('staff_leave_id', v_id), format('sleave:%s:%s', v_id, hst.user_id))
  from public.staff s
  join public.department_staff ds on ds.department_id = s.home_department_id and ds.role = 'hod' and ds.valid_during @> app.today()
  join public.staff hst on hst.id = ds.staff_id and hst.id <> v_staff
  where s.id = v_staff;
  perform app.audit('staff_leave.applied', 'staff_leave_requests', v_id::text, format('Applied for %s leave %s – %s', p_type, p_from, p_to));
  return v_id;
end $$;

create or replace function public.cancel_staff_leave(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_active();
  update public.staff_leave_requests set status = 'cancelled'
  where id = p_id and staff_id = app.my_staff_id() and status = 'pending';
  if not found then raise exception 'ALREADY_DECIDED' using errcode = 'P0001'; end if;
end $$;

create or replace view public.v_my_staff_leave with (security_barrier) as
select r.id, r.leave_type, r.from_date, r.to_date, r.reason, r.status, r.decided_at, r.substitute_arranged, r.created_at
from public.staff_leave_requests r
where r.staff_id = app.my_staff_id();

-- Class announcement to one division's students (and, optionally, their verified guardians).
create or replace function public.create_class_announcement(p_division uuid, p_title text, p_body text,
                                                            p_priority text default 'normal', p_include_parents boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_staff uuid := app.my_staff_id(); v_div public.divisions; v_id uuid; v_count integer;
begin
  perform app.require_active();
  select * into v_div from public.divisions where id = p_division;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_staff is null or not (
    exists (select 1 from public.class_teacher_assignments ct where ct.division_id = p_division and ct.staff_id = v_staff and ct.valid_during @> app.today())
    or exists (select 1 from public.teaching_assignments ta join public.teaching_groups g on g.id = ta.teaching_group_id
               where ta.staff_id = v_staff and ta.valid_during @> app.today() and g.division_id = p_division)
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_title, ''))) < 4 or length(trim(coalesce(p_body, ''))) < 10
     or coalesce(p_priority, 'normal') not in ('normal', 'important', 'urgent') then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;

  -- audience 'department' keeps the existing check constraint; recipients are the division only.
  insert into public.announcements (title, body, priority, audience, department_id, channels, created_by, publish_at, published)
  values (trim(p_title), trim(p_body), coalesce(p_priority, 'normal'), 'department', v_div.department_id, '{inapp,push}', auth.uid(), now(), true)
  returning id into v_id;

  insert into public.announcement_recipients (announcement_id, user_id)
  select distinct v_id, u.user_id from (
    select s.user_id from public.student_enrollments e join public.students s on s.id = e.student_id and s.status = 'active'
    where e.division_id = p_division and e.is_primary and e.valid_during @> app.today()
    union
    select g.user_id from public.student_enrollments e
    join public.guardian_links gl on gl.student_id = e.student_id and gl.status = 'verified'
    join public.guardians g on g.id = gl.guardian_id
    where p_include_parents and e.division_id = p_division and e.is_primary and e.valid_during @> app.today()
  ) u where u.user_id is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;

  perform app.notify_user(r.user_id, 'announcement', trim(p_title), left(trim(p_body), 280),
            jsonb_build_object('announcement_id', v_id), format('ann:%s:%s', v_id, r.user_id))
  from public.announcement_recipients r where r.announcement_id = v_id;
  update public.announcements set recipient_count = v_count where id = v_id;

  perform app.audit('announcement.class', 'announcements', v_id::text, format('Class announcement “%s” to %s recipients', trim(p_title), v_count));
  return jsonb_build_object('id', v_id, 'recipients', v_count);
end $$;

-- Disputes and guardian queries raised on the caller's sessions or class.
create or replace view public.v_disputes_for_me with (security_barrier) as
select dp.id, dp.record_id, dp.message, dp.status, dp.thread, dp.created_at,
       r.session_id, r.student_id, st.full_name, e.roll_no, r.status_code, r.session_date,
       sub.code as subject_code, sub.name as subject_name, r.component,
       exists (select 1 from public.guardians g where g.user_id = dp.raised_by) as from_guardian
from public.attendance_disputes dp
join public.attendance_records r on r.id = dp.record_id
join public.students st on st.id = r.student_id
left join public.student_enrollments e on e.student_id = r.student_id and e.is_primary and e.valid_during @> app.today()
join public.subject_offerings o on o.id = r.offering_id
join public.subjects sub on sub.id = o.subject_id
where app.teaches_session(r.session_id) or app.is_class_teacher_of(r.student_id);

-- ── Student and parent ────────────────────────────────────────────────────
create or replace view public.v_my_children with (security_invoker = true) as
select gl.student_id, st.full_name, st.enrollment_no, gl.is_primary, g.relation,
       e.program_year, e.semester, e.roll_no, d.code as department_code,
       app.division_label(dv.program_year, d.code, dv.code) as division_label, b.code as batch_code
from public.guardian_links gl
join public.guardians g on g.id = gl.guardian_id and g.user_id = auth.uid()
join public.students st on st.id = gl.student_id
left join public.student_enrollments e on e.student_id = st.id and e.is_primary and e.valid_during @> app.today()
left join public.divisions dv on dv.id = e.division_id
left join public.departments d on d.id = dv.department_id
left join public.batches b on b.id = e.batch_id
where gl.status = 'verified';

create or replace view public.v_my_profile with (security_invoker = true) as
select v.id as student_id, v.enrollment_no, v.prn, v.full_name, v.gender, v.dob, v.email, v.phone, v.admission_year,
       v.admission_type, v.status, v.department_id, v.department_code, d.name as department_name,
       v.program_year, v.semester, v.division_label, v.batch_code, v.roll_no, v.enrollment_type,
       coalesce((
         select jsonb_agg(jsonb_build_object('code', sub.code, 'name', sub.name, 'credits', sub.credits, 'is_elective', sub.is_elective)
                order by sub.code)
         from public.student_enrollments e
         join public.subject_offerings o on o.term_id = e.term_id and o.department_id = e.department_id and o.program_year = e.program_year
         join public.subjects sub on sub.id = o.subject_id and sub.semester = e.semester
         where e.id = v.enrollment_id
           and (not sub.is_elective or exists (select 1 from public.student_subject_registrations r
                                               where r.student_id = v.id and r.offering_id = o.id and r.valid_during @> app.today()))
       ), '[]'::jsonb) as subjects
from public.v_students v
left join public.departments d on d.id = v.department_id
where app.can_view_student(v.id);

create or replace view public.v_my_faculty with (security_invoker = true) as
select st.id as student_id, sub.code as subject_code, sub.name as subject_name, g.component,
       sd.full_name as staff_name, sd.designation, ta.role
from public.students st
join public.student_enrollments e on e.student_id = st.id and e.is_primary and e.valid_during @> app.today()
join public.teaching_groups g on (g.kind = 'division' and g.division_id = e.division_id)
                              or (g.kind = 'batch' and g.batch_id = e.batch_id)
                              or (g.kind = 'custom' and exists (select 1 from public.student_subject_registrations r
                                   where r.teaching_group_id = g.id and r.student_id = st.id and r.valid_during @> app.today()))
join public.subject_offerings o on o.id = g.offering_id and o.term_id = e.term_id
join public.subjects sub on sub.id = o.subject_id
join public.teaching_assignments ta on ta.teaching_group_id = g.id and ta.valid_during @> app.today()
join public.staff_directory sd on sd.id = ta.staff_id
where app.can_view_student(st.id)
union all
select st.id, null, null, null, sd.full_name, sd.designation, 'class_teacher'
from public.students st
join public.student_enrollments e on e.student_id = st.id and e.is_primary and e.valid_during @> app.today()
join public.class_teacher_assignments ct on ct.division_id = e.division_id and ct.valid_during @> app.today()
join public.staff_directory sd on sd.id = ct.staff_id
where app.can_view_student(st.id);

create or replace view public.v_my_attendance_summary with (security_invoker = true) as
select a.student_id, a.offering_id, o.term_id, t.label as term_label, t.status as term_status,
       sub.code as subject_code, sub.name as subject_name, a.component,
       a.held, a.attended, a.excused, a.percent, a.updated_at,
       (select count(*) from public.attendance_records r
         join public.attendance_registers g on g.session_id = r.session_id and g.state in ('submitted', 'locked', 'reopened')
         where r.student_id = a.student_id and r.offering_id = a.offering_id and r.component = a.component and r.status_code = 'A') as absent,
       (select count(*) from public.class_sessions s
         join public.teaching_groups g on g.id = s.teaching_group_id
         join public.student_enrollments e on e.student_id = a.student_id and e.is_primary and e.valid_during @> app.today()
         where s.offering_id = a.offering_id and s.component = a.component and s.session_date >= app.today() and s.status = 'scheduled'
           and ((g.kind = 'division' and g.division_id = e.division_id) or (g.kind = 'batch' and g.batch_id = e.batch_id))) as remaining,
       pol.min_percent, pol.warn_percent
from public.attendance_summaries a
join public.subject_offerings o on o.id = a.offering_id
join public.academic_terms t on t.id = o.term_id
join public.subjects sub on sub.id = o.subject_id
cross join lateral app.policy_for(o.department_id, o.program_year, o.subject_id) pol
where app.can_view_student(a.student_id);

-- Session-by-session detail for one subject (§10). p_student defaults to the caller.
create or replace function public.my_subject_attendance(p_offering uuid, p_student uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_student uuid := coalesce(p_student, app.my_student_id()); v_offering public.subject_offerings; v_sub public.subjects;
        v_policy public.attendance_policies;
begin
  perform app.require_active();
  if not app.can_view_student(v_student) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into v_offering from public.subject_offerings where id = p_offering;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into v_sub from public.subjects where id = v_offering.subject_id;
  v_policy := app.policy_for(v_offering.department_id, v_offering.program_year, v_offering.subject_id);
  return jsonb_build_object(
    'student_id', v_student,
    'offering_id', p_offering,
    'subject_code', v_sub.code,
    'subject_name', v_sub.name,
    'min_percent', v_policy.min_percent,
    'warn_percent', v_policy.warn_percent,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'record_id', r.id, 'session_id', s.id, 'session_date', s.session_date,
               'start_time', to_char(s.starts_at at time zone 'Asia/Kolkata', 'HH24:MI'),
               'end_time', to_char(s.ends_at at time zone 'Asia/Kolkata', 'HH24:MI'),
               'component', s.component, 'session_type', s.session_type, 'status', r.status_code,
               'submitted_at', g.submitted_at, 'marked_at', r.marked_at,
               'open_dispute', exists (select 1 from public.attendance_disputes dp where dp.record_id = r.id and dp.status = 'open'))
             order by s.starts_at desc)
      from public.attendance_records r
      join public.class_sessions s on s.id = r.session_id and s.status <> 'cancelled'
      join public.attendance_registers g on g.session_id = r.session_id and g.state in ('submitted', 'locked', 'reopened')
      where r.student_id = v_student and r.offering_id = p_offering), '[]'::jsonb)
  );
end $$;

create or replace view public.v_my_timetable with (security_invoker = true) as
select st.id as student_id, s.id as session_id, s.session_date, s.starts_at, s.ends_at,
       to_char(s.starts_at at time zone 'Asia/Kolkata', 'HH24:MI') as start_time,
       to_char(s.ends_at at time zone 'Asia/Kolkata', 'HH24:MI') as end_time,
       s.component, s.session_type, s.room_label, s.status, s.cancel_reason,
       (select n.id from public.class_sessions n where n.rescheduled_from_id = s.id order by n.created_at desc limit 1) as rescheduled_to_id,
       s.rescheduled_from_id,
       sub.code as subject_code, sub.name as subject_name, s.offering_id,
       (select sd.full_name from public.session_staff x join public.staff_directory sd on sd.id = x.staff_id
         where x.session_id = s.id order by case x.role when 'substitute' then 0 when 'primary' then 1 else 2 end limit 1) as staff_name,
       exists (select 1 from public.session_staff x where x.session_id = s.id and x.role = 'substitute') as has_substitute,
       (select ar.status_code from public.attendance_records ar
         join public.attendance_registers rg on rg.session_id = ar.session_id and rg.state in ('submitted', 'locked', 'reopened')
         where ar.session_id = s.id and ar.student_id = st.id) as my_status
from public.students st
join public.student_enrollments e on e.student_id = st.id and e.is_primary
join public.class_sessions s on e.valid_during @> s.session_date
join public.teaching_groups g on g.id = s.teaching_group_id
join public.subject_offerings o on o.id = s.offering_id
join public.subjects sub on sub.id = o.subject_id
where (st.user_id = auth.uid() or app.is_guardian_of(st.id))
  and ((g.kind = 'division' and g.division_id = e.division_id)
    or (g.kind = 'batch' and g.batch_id = e.batch_id)
    or (g.kind = 'custom' and exists (select 1 from public.student_subject_registrations r
          where r.teaching_group_id = g.id and r.student_id = st.id and r.valid_during @> s.session_date)));

create or replace view public.v_my_exams with (security_invoker = true) as
select st.id as student_id, es.id as exam_session_id, ex.id as exam_id, ex.title as exam_title, ex.exam_type,
       et.name as exam_type_name, sub.code as subject_code, sub.name as subject_name,
       es.starts_at, es.ends_at, es.room_label,
       (select a.status from public.exam_attendance a where a.exam_session_id = es.id and a.student_id = st.id) as my_status
from public.students st
join public.student_enrollments e on e.student_id = st.id and e.is_primary and e.valid_during @> app.today()
join public.subject_offerings o on o.term_id = e.term_id and o.department_id = e.department_id and o.program_year = e.program_year
join public.exam_sessions es on es.offering_id = o.id
join public.exams ex on ex.id = es.exam_id and ex.status in ('published', 'completed')
join public.exam_types et on et.code = ex.exam_type
join public.subjects sub on sub.id = o.subject_id
where app.can_view_student(st.id)
  and (es.teaching_group_id is null or exists (select 1 from app.group_members(es.teaching_group_id) m where m.student_id = st.id));

create or replace view public.v_my_leave with (security_invoker = true) as
select l.id, l.student_id, l.leave_type, l.from_date, l.to_date,
       lower(l.leave_period) as starts_at, upper(l.leave_period) as ends_at,
       l.reason, l.status, l.decision_note, l.decided_at, l.document_asset_id is not null as has_document, l.created_at,
       (select count(*) from public.leave_request_sessions ls where ls.leave_request_id = l.id) as session_count
from public.leave_requests l
where app.can_view_student(l.student_id);

-- p: { leave_type, from_date, to_date, half ('first'|'second'), session_ids[], reason }
create or replace function public.apply_leave(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid := app.my_student_id();
  v_type    text := p ->> 'leave_type';
  v_from    date := (p ->> 'from_date')::date;
  v_to      date := coalesce((p ->> 'to_date')::date, (p ->> 'from_date')::date);
  v_reason  text := trim(coalesce(p ->> 'reason', ''));
  v_sessions uuid[] := coalesce(array(select jsonb_array_elements_text(p -> 'session_ids')::uuid), '{}');
  v_period  tstzrange;
  v_id      uuid;
  v_name    text;
begin
  perform app.require_active();
  if v_student is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if v_type not in ('full_day', 'half_day', 'session', 'medical') then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  if length(v_reason) < 5 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;

  if v_type = 'session' then
    if cardinality(v_sessions) = 0 then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
    if exists (select 1 from unnest(v_sessions) sid
               where not exists (select 1 from app.roster(sid) r where r.student_id = v_student)) then
      raise exception 'ATT_UNKNOWN_STUDENT' using errcode = 'P0001';
    end if;
    select tstzrange(min(s.starts_at), max(s.ends_at)), min(s.session_date), max(s.session_date)
      into v_period, v_from, v_to
    from public.class_sessions s where s.id = any (v_sessions);
  elsif v_from is null or v_to < v_from then
    raise exception 'VALIDATION' using errcode = 'P0001';
  elsif v_type = 'half_day' then
    v_to := v_from;
    v_period := case when coalesce(p ->> 'half', 'first') = 'first'
      then tstzrange(v_from::timestamp at time zone 'Asia/Kolkata', (v_from::timestamp + interval '13 hours') at time zone 'Asia/Kolkata')
      else tstzrange((v_from::timestamp + interval '13 hours') at time zone 'Asia/Kolkata', (v_from + 1)::timestamp at time zone 'Asia/Kolkata')
    end;
  else
    v_period := tstzrange(v_from::timestamp at time zone 'Asia/Kolkata', (v_to + 1)::timestamp at time zone 'Asia/Kolkata');
  end if;
  if v_from < app.today() - 30 or v_to > app.today() + 120 then raise exception 'VALIDATION' using errcode = 'P0001'; end if;

  begin
    insert into public.leave_requests (student_id, leave_type, leave_period, from_date, to_date, reason, submitted_by)
    values (v_student, v_type, v_period, v_from, v_to, v_reason, auth.uid()) returning id into v_id;
  exception when exclusion_violation then
    raise exception 'LEAVE_OVERLAP' using errcode = 'P0001';
  end;
  if v_type = 'session' then
    insert into public.leave_request_sessions (leave_request_id, session_id) select v_id, unnest(v_sessions) on conflict do nothing;
  end if;

  select full_name into v_name from public.students where id = v_student;
  perform app.notify_user(app.class_teacher_user(v_student), 'leave_pending', 'Leave request',
            format('%s: %s %s', v_name, replace(v_type, '_', ' '),
                   case when v_from = v_to then to_char(v_from, 'DD Mon') else to_char(v_from, 'DD Mon') || ' – ' || to_char(v_to, 'DD Mon') end),
            jsonb_build_object('leave_id', v_id, 'url', 'collegeapp://professor/inbox'), format('leavereq:%s', v_id));
  perform app.audit('leave.applied', 'leave_requests', v_id::text, format('%s applied for %s leave %s – %s', v_name, v_type, v_from, v_to));
  return v_id;
end $$;

create or replace function public.cancel_leave(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_active();
  update public.leave_requests set status = 'cancelled'
  where id = p_id and student_id = app.my_student_id() and status in ('pending', 'needs_info');
  if not found then raise exception 'ALREADY_DECIDED' using errcode = 'P0001'; end if;
end $$;

create or replace function app.raise_record_thread(p_record uuid, p_message text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_rec public.attendance_records; v_id uuid; v_sub text; v_name text;
begin
  select * into v_rec from public.attendance_records where id = p_record;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not app.can_view_student(v_rec.student_id) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_message, ''))) < 5 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.attendance_disputes where record_id = p_record and raised_by = auth.uid() and status = 'open') then
    raise exception 'DUPLICATE' using errcode = 'P0001';
  end if;
  insert into public.attendance_disputes (record_id, raised_by, message, thread)
  values (p_record, auth.uid(), trim(p_message),
          jsonb_build_array(jsonb_build_object('by', app.actor_name(), 'role', p_role, 'message', trim(p_message), 'at', now())))
  returning id into v_id;

  select sub.name into v_sub from public.subject_offerings o join public.subjects sub on sub.id = o.subject_id where o.id = v_rec.offering_id;
  select full_name into v_name from public.students where id = v_rec.student_id;
  perform app.notify_user(u.user_id, 'attendance_dispute',
            case p_role when 'parent' then 'Parent query' else 'Attendance reported' end,
            format('%s · %s on %s (%s)', v_name, v_sub, to_char(v_rec.session_date, 'DD Mon'), v_rec.status_code),
            jsonb_build_object('dispute_id', v_id, 'url', 'collegeapp://professor/inbox'), format('disp:%s:%s', v_id, u.user_id))
  from (
    select st.user_id from public.session_staff ss join public.staff st on st.id = ss.staff_id
    where ss.session_id = v_rec.session_id and p_role = 'student'
    union
    select app.class_teacher_user(v_rec.student_id)
  ) u where u.user_id is not null;
  return v_id;
end $$;

create or replace function public.raise_attendance_dispute(p_record uuid, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_active();
  if app.my_student_id() is null then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.attendance_records where id = p_record and student_id = app.my_student_id()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return app.raise_record_thread(p_record, p_message, 'student');
end $$;

-- Parents: "Ask about this absence" (§11). Threads reuse attendance_disputes.
create or replace function public.raise_guardian_query(p_student uuid, p_record uuid, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_active();
  if not app.is_guardian_of(p_student) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_record is null or not exists (select 1 from public.attendance_records where id = p_record and student_id = p_student) then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;
  return app.raise_record_thread(p_record, p_message, 'parent');
end $$;

-- Professor / class teacher replies; p_status resolves or rejects the thread.
create or replace function public.reply_dispute(p_id uuid, p_message text, p_status text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_dp public.attendance_disputes; v_rec public.attendance_records;
begin
  perform app.require_active();
  select * into v_dp from public.attendance_disputes where id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into v_rec from public.attendance_records where id = v_dp.record_id;
  if not (app.teaches_session(v_rec.session_id) or app.is_class_teacher_of(v_rec.student_id) or v_dp.raised_by = auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_dp.status <> 'open' then raise exception 'ALREADY_DECIDED' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_message, ''))) < 2 then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  if p_status is not null and (p_status not in ('resolved', 'rejected') or v_dp.raised_by = auth.uid()) then
    raise exception 'VALIDATION' using errcode = 'P0001';
  end if;
  update public.attendance_disputes set
    thread = thread || jsonb_build_array(jsonb_build_object('by', app.actor_name(),
               'role', case when v_dp.raised_by = auth.uid() then 'author' else 'staff' end, 'message', trim(p_message), 'at', now())),
    status = coalesce(p_status, status),
    resolved_by = case when p_status is not null then auth.uid() else resolved_by end,
    resolved_at = case when p_status is not null then now() else resolved_at end
  where id = p_id;
  if v_dp.raised_by <> auth.uid() then
    perform app.notify_user(v_dp.raised_by, 'dispute_reply', 'Reply about your attendance', left(trim(p_message), 280),
              jsonb_build_object('dispute_id', p_id), format('dispreply:%s:%s', p_id, now()));
  end if;
end $$;

create or replace view public.v_my_disputes with (security_invoker = true) as
select dp.id, dp.record_id, dp.message, dp.status, dp.thread, dp.created_at, dp.resolved_at,
       r.student_id, r.session_id, r.session_date, r.status_code, r.component, sub.code as subject_code, sub.name as subject_name
from public.attendance_disputes dp
join public.attendance_records r on r.id = dp.record_id
join public.subject_offerings o on o.id = r.offering_id
join public.subjects sub on sub.id = o.subject_id
where dp.raised_by = auth.uid();

-- ── Grants ────────────────────────────────────────────────────────────────
grant execute on function app.can_view_student(uuid), app.group_members(uuid, date), app.group_label(uuid),
  app.class_teacher_user(uuid), app.require_active() to authenticated;
revoke all on function app.notify_user(uuid, text, text, text, jsonb, text), app.raise_record_thread(uuid, text, text) from public, authenticated;

grant select on public.v_my_announcements, public.v_academic_calendar, public.v_my_sessions, public.v_my_teaching_groups,
  public.v_register_detail, public.v_leave_pending_for_me, public.v_my_staff_leave, public.v_disputes_for_me,
  public.v_my_children, public.v_my_profile, public.v_my_faculty, public.v_my_attendance_summary, public.v_my_timetable,
  public.v_my_exams, public.v_my_leave, public.v_my_disputes to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.my_capabilities()',
    'public.register_device(text, text, text, text)',
    'public.unregister_device(text)',
    'public.mark_notifications_read(uuid[])',
    'public.session_roster_for_marking(uuid)',
    'public.my_rosters_for_window(date, date)',
    'public.class_attendance_stats(uuid, uuid)',
    'public.request_attendance_correction(uuid, jsonb, text)',
    'public.apply_staff_leave(text, date, date, text)',
    'public.cancel_staff_leave(uuid)',
    'public.create_class_announcement(uuid, text, text, text, boolean)',
    'public.my_subject_attendance(uuid, uuid)',
    'public.apply_leave(jsonb)',
    'public.cancel_leave(uuid)',
    'public.raise_attendance_dispute(uuid, text)',
    'public.raise_guardian_query(uuid, uuid, text)',
    'public.reply_dispute(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
