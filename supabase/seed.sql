-- Reference data every environment needs (production included).
-- The role → permission matrix mirrors src/shared/permissions.ts; Admin can
-- change it afterwards in Settings → Roles & permissions.

insert into public.program_years (code, name, ord) values
  ('FE', 'First Year Engineering', 1),
  ('SE', 'Second Year Engineering', 2),
  ('TE', 'Third Year Engineering', 3),
  ('BE', 'Final Year Engineering', 4)
on conflict (code) do nothing;

insert into public.semesters (number, program_year_code, parity) values
  (1, 'FE', 'odd'), (2, 'FE', 'even'), (3, 'SE', 'odd'), (4, 'SE', 'even'),
  (5, 'TE', 'odd'), (6, 'TE', 'even'), (7, 'BE', 'odd'), (8, 'BE', 'even')
on conflict (number) do nothing;

insert into public.attendance_status_codes (code, label, color, counts_as_attended, counts_in_held, professor_can_set, requires_reason, sort_order) values
  ('P',  'Present',        '#16a34a', true,  true,  true,  false, 1),
  ('A',  'Absent',         '#dc2626', false, true,  true,  false, 2),
  ('L',  'Approved leave', '#d97706', false, true,  false, false, 3),
  ('OD', 'On duty',        '#2563eb', true,  true,  true,  true,  4),
  ('ML', 'Medical leave',  '#9333ea', false, true,  false, true,  5),
  ('EX', 'Excused',        '#64748b', false, false, false, true,  6)
on conflict (code) do nothing;

insert into public.attendance_policies (scope, min_percent, warn_percent, count_mode, eligibility_basis, default_unmarked_status,
                                        edit_window_hours, lock_after_hours, leave_applies_retroactively, effective_from)
select 'college', 75, 80, 'session', 'per_subject_component', 'A', 24, 48, true, date '2020-01-01'
where not exists (select 1 from public.attendance_policies where scope = 'college' and effective_to is null);

insert into public.exam_types (code, name, sort_order) values
  ('IAET-1', 'Internal Assessment Test 1', 1),
  ('IAET-2', 'Internal Assessment Test 2', 2),
  ('Practical', 'Term-work practical', 3),
  ('Oral', 'Oral / viva', 4),
  ('End-Sem', 'University end-semester', 5)
on conflict (code) do nothing;

insert into public.app_config (key, value) values
  ('require_mfa_for_admins', 'true'),
  ('min_mobile_version', '"1.0.0"'),
  ('maintenance_banner', 'null')
on conflict (key) do nothing;

insert into public.permissions (key) values
  ('settings.manage'), ('roles.manage'), ('audit.view'),
  ('blueprint.view'), ('blueprint.manage'), ('blueprint.activate'),
  ('calendar.manage'), ('year.rollover'),
  ('students.view'), ('students.manage'), ('students.import'), ('students.promote'),
  ('guardians.manage'),
  ('staff.view'), ('staff.manage'), ('staff.import'), ('assignments.manage'),
  ('timetable.view'), ('timetable.edit'), ('timetable.publish'), ('sessions.manage'),
  ('attendance.view'), ('attendance.mark'), ('attendance.override'), ('attendance.reopen'),
  ('attendance.correct.approve'), ('attendance.policy.manage'),
  ('leave.student.decide'), ('leave.staff.decide'),
  ('exams.view'), ('exams.manage'), ('exams.attendance.mark'),
  ('announcements.college'), ('announcements.class'),
  ('reports.view'), ('reports.export')
on conflict (key) do nothing;

-- Principal: everything. Admin: everything except staff-leave decisions.
insert into public.role_permissions (role, permission, scope)
select 'principal', key, 'all' from public.permissions
union all
select 'admin', key, 'all' from public.permissions where key <> 'leave.staff.decide'
on conflict do nothing;

insert into public.role_permissions (role, permission, scope)
select 'operations', p, 'all' from unnest(array[
  'blueprint.view', 'students.view', 'students.manage', 'students.import', 'guardians.manage',
  'staff.view', 'staff.manage', 'staff.import', 'assignments.manage',
  'timetable.view', 'timetable.edit', 'timetable.publish', 'sessions.manage',
  'attendance.view', 'attendance.override', 'attendance.reopen', 'attendance.correct.approve',
  'leave.student.decide', 'exams.view', 'announcements.college', 'reports.view', 'reports.export']) p
union all
select 'exam_cell', p, 'all' from unnest(array[
  'blueprint.view', 'students.view', 'staff.view', 'timetable.view', 'attendance.view',
  'exams.view', 'exams.manage', 'exams.attendance.mark', 'announcements.college', 'reports.view', 'reports.export']) p
union all
select 'hod', p, 'department' from unnest(array[
  'blueprint.view', 'students.view', 'staff.view', 'assignments.manage', 'timetable.view', 'timetable.edit',
  'sessions.manage', 'attendance.view', 'attendance.reopen', 'attendance.correct.approve',
  'leave.student.decide', 'leave.staff.decide', 'exams.view', 'announcements.class', 'reports.view', 'reports.export']) p
union all
select 'professor', p, 'assigned' from unnest(array['attendance.mark', 'attendance.view', 'timetable.view']) p
union all
select 'student', p, 'self' from unnest(array['attendance.view', 'timetable.view']) p
union all
select 'parent', 'attendance.view', 'linked'
on conflict do nothing;
