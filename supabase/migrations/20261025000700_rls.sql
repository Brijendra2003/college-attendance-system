-- Row Level Security (§5.4, §17). RLS is on for every table in `public`.
-- Clients only SELECT; every write goes through a SECURITY DEFINER RPC that
-- checks permission and scope and writes the audit log. The few user-owned
-- tables (notifications, preferences, device tokens) also allow own writes.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public grant select on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;

-- ── Non-personal structure: readable by every signed-in user ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'college', 'departments', 'department_staff', 'academic_years', 'academic_terms', 'program_years', 'semesters',
    'rooms', 'divisions', 'batches', 'period_templates', 'academic_calendar_events', 'curriculum_schemes',
    'elective_baskets', 'subjects', 'subject_components', 'subject_offerings', 'teaching_groups',
    'teaching_assignments', 'class_teacher_assignments', 'timetable_versions', 'timetable_slots',
    'class_sessions', 'session_staff', 'attendance_status_codes', 'attendance_policies', 'permissions',
    'role_permissions', 'exam_types', 'exams', 'exam_sessions', 'exam_duties', 'app_config'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

create policy blueprint_versions_read on public.blueprint_versions for select to authenticated
  using ((select app.can('blueprint.view', 'all')) or (select app.can('blueprint.view', 'department')));

-- ── Identity ─────────────────────────────────────────────────────────────
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select app.can('roles.manage', 'all'))
  or (select app.can('staff.view', 'all'))
);
create policy user_roles_read on public.user_roles for select to authenticated using (
  user_id = (select auth.uid()) or (select app.can('roles.manage', 'all'))
);
create policy auth_admin_reads_roles on public.user_roles for select to supabase_auth_admin using (true);
create policy auth_admin_reads_profiles on public.profiles for select to supabase_auth_admin using (true);
create policy auth_admin_reads_staff on public.staff for select to supabase_auth_admin using (true);
create policy auth_admin_reads_students on public.students for select to supabase_auth_admin using (true);
create policy auth_admin_reads_guardians on public.guardians for select to supabase_auth_admin using (true);

-- ── Staff ────────────────────────────────────────────────────────────────
create policy staff_read on public.staff for select to authenticated using (
  (select app.can('staff.view', 'all'))
  or ((select app.can('staff.view', 'department')) and home_department_id = any (array(select unnest(app.my_department_ids()))))
  or user_id = (select auth.uid())
);

-- Names and designations only, for every signed-in user (timetables, substitutes).
create view public.staff_directory with (security_barrier) as
  select id, employee_id, full_name, designation, home_department_id, status from public.staff;
grant select on public.staff_directory to authenticated;

-- ── Students and guardians ───────────────────────────────────────────────
create policy students_read on public.students for select to authenticated using (
  (select app.can('students.view', 'all'))
  or ((select app.can('students.view', 'department')) and app.student_in_my_departments(id))
  or ((select app.can('attendance.mark', 'assigned')) and app.teaches_student(id))
  or user_id = (select auth.uid())
  or app.is_guardian_of(id)
);

create policy enrollments_read on public.student_enrollments for select to authenticated using (
  (select app.can('students.view', 'all'))
  or ((select app.can('students.view', 'department')) and department_id = any (array(select unnest(app.my_department_ids()))))
  or ((select app.can('attendance.mark', 'assigned')) and app.teaches_student(student_id))
  or student_id = (select app.my_student_id())
  or app.is_guardian_of(student_id)
);

create policy registrations_read on public.student_subject_registrations for select to authenticated using (
  (select app.can('students.view', 'all'))
  or ((select app.can('students.view', 'department')) and app.student_in_my_departments(student_id))
  or ((select app.can('attendance.mark', 'assigned')) and app.teaches_student(student_id))
  or student_id = (select app.my_student_id())
);

create policy guardian_links_read on public.guardian_links for select to authenticated using (
  (select app.can('guardians.manage', 'all'))
  or (select app.can('students.view', 'all'))
  or ((select app.can('students.view', 'department')) and app.student_in_my_departments(student_id))
  or student_id = (select app.my_student_id())
  or guardian_id = (select app.my_guardian_id())
);

create policy guardians_read on public.guardians for select to authenticated using (
  (select app.can('guardians.manage', 'all'))
  or (select app.can('students.view', 'all'))
  or user_id = (select auth.uid())
  or exists (
    select 1 from public.guardian_links gl
    where gl.guardian_id = guardians.id
      and (((select app.can('students.view', 'department')) and app.student_in_my_departments(gl.student_id))
        or gl.student_id = (select app.my_student_id())
        or app.is_class_teacher_of(gl.student_id))
  )
);

create policy student_documents_read on public.student_documents for select to authenticated using (
  (select app.can('students.view', 'all'))
  or ((select app.can('students.view', 'department')) and app.student_in_my_departments(student_id))
  or student_id = (select app.my_student_id())
  or app.is_guardian_of(student_id)
);

create policy media_assets_read on public.media_assets for select to authenticated using (
  created_by = (select auth.uid()) or (select app.can('students.view', 'all')) or delivery_type = 'upload'
);

-- ── Attendance ───────────────────────────────────────────────────────────
create policy registers_read on public.attendance_registers for select to authenticated using (
  (select app.can('attendance.view', 'all'))
  or ((select app.can('attendance.view', 'department'))
      and exists (select 1 from public.class_sessions s where s.id = session_id and s.department_id = any (array(select unnest(app.my_department_ids())))))
  or app.teaches_session(session_id)
);

create policy attendance_records_select on public.attendance_records for select to authenticated using (
  (select app.can('attendance.view', 'all'))
  or ((select app.can('attendance.view', 'department')) and department_id = any (array(select unnest(app.my_department_ids()))))
  or ((select app.can('attendance.view', 'assigned')) and app.teaches_session(session_id))
  or ((select app.can('attendance.view', 'self')) and student_id = (select app.my_student_id()))
  or ((select app.can('attendance.view', 'linked')) and app.is_guardian_of(student_id))
);

create policy record_history_read on public.attendance_record_history for select to authenticated using (
  (select app.can('attendance.view', 'all'))
  or ((select app.can('attendance.view', 'department')) and app.student_in_my_departments(student_id))
  or student_id = (select app.my_student_id())
);

create policy summaries_read on public.attendance_summaries for select to authenticated using (
  (select app.can('attendance.view', 'all'))
  or ((select app.can('attendance.view', 'department')) and app.student_in_my_departments(student_id))
  or ((select app.can('attendance.view', 'assigned')) and app.teaches_student(student_id))
  or ((select app.can('attendance.view', 'self')) and student_id = (select app.my_student_id()))
  or ((select app.can('attendance.view', 'linked')) and app.is_guardian_of(student_id))
);

create policy corrections_read on public.attendance_correction_requests for select to authenticated using (
  (select app.can('attendance.correct.approve', 'all'))
  or ((select app.can('attendance.correct.approve', 'department')) and app.student_in_my_departments(student_id))
  or requested_by = (select app.my_staff_id())
  or student_id = (select app.my_student_id())
);

create policy disputes_read on public.attendance_disputes for select to authenticated using (
  raised_by = (select auth.uid())
  or (select app.can('attendance.correct.approve', 'all'))
  or exists (
    select 1 from public.attendance_records r
    where r.id = record_id
      and (((select app.can('attendance.correct.approve', 'department')) and r.department_id = any (array(select unnest(app.my_department_ids()))))
        or app.teaches_session(r.session_id))
  )
);

-- ── Leave ────────────────────────────────────────────────────────────────
create policy leave_read on public.leave_requests for select to authenticated using (
  (select app.can('leave.student.decide', 'all'))
  or ((select app.can('leave.student.decide', 'department')) and app.student_in_my_departments(student_id))
  or app.is_class_teacher_of(student_id)
  or student_id = (select app.my_student_id())
  or app.is_guardian_of(student_id)
);
create policy leave_sessions_read on public.leave_request_sessions for select to authenticated using (
  exists (select 1 from public.leave_requests l where l.id = leave_request_id)
);
create policy staff_leave_read on public.staff_leave_requests for select to authenticated using (
  (select app.can('leave.staff.decide', 'all'))
  or ((select app.can('leave.staff.decide', 'department'))
      and exists (select 1 from public.staff s where s.id = staff_id and s.home_department_id = any (array(select unnest(app.my_department_ids())))))
  or staff_id = (select app.my_staff_id())
);

-- ── Exams ────────────────────────────────────────────────────────────────
create policy exam_attendance_read on public.exam_attendance for select to authenticated using (
  (select app.can('exams.view', 'all'))
  or ((select app.can('exams.view', 'department')) and app.student_in_my_departments(student_id))
  or student_id = (select app.my_student_id())
  or app.is_guardian_of(student_id)
);

-- ── Communication ────────────────────────────────────────────────────────
create policy announcements_read on public.announcements for select to authenticated using (
  (select app.can('announcements.college', 'all'))
  or ((select app.can('announcements.class', 'department')) and department_id = any (array(select unnest(app.my_department_ids()))))
  or exists (select 1 from public.announcement_recipients r where r.announcement_id = announcements.id and r.user_id = (select auth.uid()))
);
create policy recipients_read on public.announcement_recipients for select to authenticated using (
  user_id = (select auth.uid()) or (select app.can('announcements.college', 'all'))
);
create policy recipients_mark_read on public.announcement_recipients for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update (read_at) on public.announcement_recipients to authenticated;

create policy notifications_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update (read_at) on public.notifications to authenticated;

create policy preferences_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant insert, update, delete on public.notification_preferences to authenticated;

create policy device_tokens_own on public.device_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant insert, update, delete on public.device_tokens to authenticated;

-- notification_outbox: no policies → only the service role (dispatcher) can read it.

-- ── Platform ─────────────────────────────────────────────────────────────
create policy import_jobs_read on public.import_jobs for select to authenticated using (
  (select app.can('students.import', 'all')) or (select app.can('staff.import', 'all'))
);
create policy import_rows_read on public.import_rows for select to authenticated using (
  (select app.can('students.import', 'all')) or (select app.can('staff.import', 'all'))
);
create policy report_jobs_read on public.report_jobs for select to authenticated using (
  created_by = (select auth.uid()) or (select app.can('reports.export', 'all'))
);
create policy audit_read on public.audit_log for select to authenticated using ((select app.can('audit.view', 'all')));
