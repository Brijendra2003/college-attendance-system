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

grant execute on function public.whoami(), public.touch_last_seen(), public.setup_health() to authenticated;
revoke execute on function public.whoami(), public.touch_last_seen(), public.setup_health() from anon, public;
