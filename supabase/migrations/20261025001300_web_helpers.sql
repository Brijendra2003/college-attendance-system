-- Small helpers for the web app's request bootstrap and screens.

-- Everything the web shell needs about the caller, in one round trip.
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.display_name,
    'email', p.email,
    'is_active', p.is_active,
    'roles', coalesce(auth.jwt() -> 'app_roles', '[]'::jsonb),
    'grants', coalesce((
      select jsonb_object_agg(permission, scope) from (
        select distinct on (rp.permission) rp.permission, rp.scope
        from public.role_permissions rp
        where (auth.jwt() -> 'app_roles') ? rp.role
        order by rp.permission, case rp.scope when 'all' then 1 when 'department' then 2 when 'assigned' then 3 else 4 end
      ) g), '{}'::jsonb),
    'staff_id', (select id from public.staff where user_id = p.id),
    'department_ids', to_jsonb(app.my_department_ids()),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'mfa_required', app.mfa_required(),
    'setup_completed', exists (select 1 from public.college where setup_completed_at is not null)
  )
  from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.touch_last_seen() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set last_seen_at = now() where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')
$$;

-- Live data-quality checks for the Admin dashboard and the hierarchy page (§7.4, §11.10).
create or replace function public.setup_health() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'students_without_enrollment', (select count(*) from public.students s where s.status = 'active'
       and not exists (select 1 from public.student_enrollments e where e.student_id = s.id and e.is_primary and e.valid_during @> app.today())),
    'pending_guardian_links', (select count(*) from public.guardian_links where status = 'pending'),
    'students_without_prn', (select count(*) from public.students where status = 'active' and prn is null),
    'timetable_drafts', (select count(*) from public.timetable_versions where status = 'draft'),
    'divisions_without_class_teacher', (select count(*) from public.divisions dv
       join public.academic_years y on y.id = dv.academic_year_id and y.status = 'active'
       where not exists (select 1 from public.class_teacher_assignments ct where ct.division_id = dv.id and ct.valid_during @> app.today())),
    'departments_without_hod', (select count(*) from public.departments d where d.is_active
       and not exists (select 1 from public.department_staff ds where ds.department_id = d.id and ds.role = 'hod' and ds.valid_during @> app.today())),
    'overlapping_primary_enrollments', 0,
    'divisions', (select count(*) from public.divisions dv join public.academic_years y on y.id = dv.academic_year_id and y.status = 'active'),
    'batches', (select count(*) from public.batches b join public.divisions dv on dv.id = b.division_id
       join public.academic_years y on y.id = dv.academic_year_id and y.status = 'active'),
    'theory_groups', (select count(*) from public.teaching_groups g join public.subject_offerings o on o.id = g.offering_id
       join public.academic_terms t on t.id = o.term_id and t.status = 'active' where g.kind = 'division'),
    'practical_groups', (select count(*) from public.teaching_groups g join public.subject_offerings o on o.id = g.offering_id
       join public.academic_terms t on t.id = o.term_id and t.status = 'active' where g.kind = 'batch'),
    'closed_enrollments', (select count(*) from public.student_enrollments where upper(valid_during) <= app.today()),
    'active_students', (select count(*) from public.students where status = 'active')
  )
  where app.can('blueprint.view', 'all') or app.can('blueprint.view', 'department')
$$;

-- Teaching days done vs scheduled in the active term (days with at least one session).
create or replace function public.term_progress() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'label', t.label,
    'done', (select count(distinct s.session_date) from public.class_sessions s where s.term_id = t.id and s.session_date < app.today()),
    'total', (select count(distinct s.session_date) from public.class_sessions s where s.term_id = t.id)
  )
  from public.academic_terms t where t.status = 'active'
$$;

-- App configuration (§11.15). Values arrive as text and are stored as JSON.
create or replace function public.set_app_config(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb;
begin
  perform app.require('settings.manage');
  v_new := case p_key
    when 'require_mfa_for_admins' then to_jsonb(p_value::boolean)
    when 'min_mobile_version' then case when p_value ~ '^\d+\.\d+\.\d+$' then to_jsonb(p_value) end
    when 'maintenance_banner' then case when nullif(trim(p_value), '') is null then 'null'::jsonb else to_jsonb(trim(p_value)) end
  end;
  if v_new is null then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  select value into v_old from public.app_config where key = p_key;
  insert into public.app_config (key, value, updated_at) values (p_key, v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform app.audit('app_config.updated', 'app_config', p_key, format('Set %s', p_key), jsonb_build_object('value', v_old), jsonb_build_object('value', v_new));
end $$;

grant execute on function public.set_app_config(text, text) to authenticated;
revoke execute on function public.set_app_config(text, text) from anon, public;

-- Exports of personal data are audited (§17).
create or replace function public.log_export(p_report text, p_format text, p_rows integer, p_filters jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(app.scope_of('reports.export'), '') not in ('all', 'department') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform app.audit('report.exported', 'reports', p_report, format('Exported %s as %s (%s rows)', p_report, upper(p_format), p_rows),
    null, jsonb_build_object('filters', p_filters - 'format', 'rows', p_rows, 'format', p_format));
end $$;

grant execute on function public.log_export(text, text, integer, jsonb) to authenticated;
revoke execute on function public.log_export(text, text, integer, jsonb) from anon, public;

grant execute on function public.whoami(), public.touch_last_seen(), public.setup_health(), public.term_progress() to authenticated;
revoke execute on function public.whoami(), public.touch_last_seen(), public.setup_health(), public.term_progress() from anon, public;
