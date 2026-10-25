-- Attendance engine and administrative RPCs (§8, §11), run as real roles.

-- A session for the demo professor that ended 5 minutes ago.
create temp table t as
with g as (
  select ta.teaching_group_id, tg.offering_id, tg.component, tg.division_id, o.department_id, o.term_id, s.id as staff_id
  from public.teaching_assignments ta
  join public.staff s on s.id = ta.staff_id
  join public.profiles p on p.id = s.user_id and p.email = 'professor@sjcem.edu.in'
  join public.teaching_groups tg on tg.id = ta.teaching_group_id and tg.kind = 'division'
  join public.subject_offerings o on o.id = tg.offering_id
  limit 1
), s as (
  insert into public.class_sessions (session_date, starts_at, ends_at, teaching_group_id, offering_id, component, session_type,
                                     department_id, term_id, division_id)
  select app.today(), now() - interval '50 minutes', now() - interval '5 minutes', teaching_group_id, offering_id, component, 'extra',
         department_id, term_id, division_id from g
  returning id
)
select s.id as session_id, g.* from s, g;
insert into public.session_staff (session_id, staff_id, role) select session_id, staff_id, 'primary' from t;
insert into public.attendance_registers (session_id) select session_id from t;
create temp table roster as select * from app.roster((select session_id from t));
alter table t add column rid1 uuid default gen_random_uuid(), add column rid2 uuid default gen_random_uuid(), add column rid3 uuid default gen_random_uuid();
grant select on t, roster to authenticated;
create temp table res (k text primary key, v jsonb);
grant all on res to authenticated;

-- ── submit_attendance ────────────────────────────────────────────────────
select tests.login('professor@sjcem.edu.in');
set role authenticated;
select tests.ok((select count(*) from public.session_roster((select session_id from t))) = (select count(*) from roster) and (select count(*) from roster) > 20,
                'professor downloads the roster');

-- all present except the first three; the last two are omitted (default to A)
insert into res select 'first', public.submit_attendance(
  (select session_id from t), (select rid1 from t), null,
  (select jsonb_agg(jsonb_build_object('student_id', student_id, 'status', case when rn <= 3 then 'A' else 'P' end))
     from (select student_id, row_number() over (order by roll_no) rn, count(*) over () n from roster) x where rn <= n - 2));
select tests.ok((select v ->> 'result' from res where k = 'first') = 'ok', 'first submission accepted');
select tests.ok(jsonb_array_length((select v -> 'defaulted_students' from res where k = 'first')) = 2, 'two omitted students defaulted to A');
select tests.ok((select (v #>> '{register,present_count}')::int from res where k = 'first') = (select count(*) from roster) - 5, 'present count = roster − 5');

insert into res select 'dup', public.submit_attendance((select session_id from t), (select rid1 from t), null, '[]');
select tests.ok((select v ->> 'result' from res where k = 'dup') = 'duplicate', 'retrying the same submission id is a safe duplicate');

insert into res select 'edit', public.submit_attendance((select session_id from t), (select rid2 from t), 1,
  (select jsonb_agg(jsonb_build_object('student_id', student_id, 'status', 'P')) from roster));
select tests.ok((select v ->> 'result' from res where k = 'edit') = 'ok' and (select (v #>> '{register,version}')::int from res where k = 'edit') = 2,
                'edit within the window bumps the version');

insert into res select 'stale', public.submit_attendance((select session_id from t), (select rid3 from t), 1, '[]');
select tests.ok((select v ->> 'result' from res where k = 'stale') = 'conflict', 'stale base version returns a conflict with the server copy');

select tests.raises($$select public.submit_attendance((select session_id from t), gen_random_uuid(), 2,
  jsonb_build_array(jsonb_build_object('student_id', gen_random_uuid(), 'status', 'P')))$$, 'ATT_UNKNOWN_STUDENT', 'unknown students are rejected');
select tests.raises($$select public.submit_attendance((select session_id from t), gen_random_uuid(), 2,
  jsonb_build_array(jsonb_build_object('student_id', (select student_id from roster limit 1), 'status', 'L')))$$, 'ATT_INVALID_STATUS',
  'professors cannot set leave codes');
reset role;

select tests.ok((select count(*) from public.attendance_record_history where session_id = (select session_id from t)) = 5,
                'edits wrote five history rows (3 A→P, 2 defaulted A→P)');
select tests.ok((select count(*) from public.attendance_records where session_id = (select session_id from t)) = (select count(*) from roster),
                'one record per rostered student');

select tests.login(tests.hod_email('IT'));
set role authenticated;
select tests.raises($$select public.submit_attendance((select session_id from t), gen_random_uuid(), 2, '[]')$$, 'ATT_NOT_ASSIGNED',
                    'staff not on the session cannot submit');
reset role;

-- ── Corrections ──────────────────────────────────────────────────────────
update public.attendance_records set status_code = 'A' where session_id = (select session_id from t)
  and student_id = (select student_id from roster order by roll_no limit 1);
insert into public.attendance_correction_requests (session_id, student_id, requested_by, from_status, to_status, reason)
select session_id, (select student_id from roster order by roll_no limit 1), staff_id, 'A', 'P', 'Marked absent by mistake' from t;
insert into res select 'corr', to_jsonb(id) from public.attendance_correction_requests where session_id = (select session_id from t);

select tests.login(tests.hod_email('IT'));
set role authenticated;
select tests.ok(not exists (select 1 from public.attendance_correction_requests where session_id = (select session_id from t)),
                'another department''s HOD cannot see the correction');
select tests.raises($$select public.decide_correction((select (v #>> '{}')::uuid from res where k = 'corr'), 'approved')$$,
                    'OUT_OF_SCOPE', 'another department''s HOD cannot approve it by id either');
reset role;

select tests.login('operations@sjcem.edu.in');
set role authenticated;
select public.decide_correction((select id from public.attendance_correction_requests where session_id = (select session_id from t)), 'approved', 'Verified with CCTV');
select tests.raises($$select public.decide_correction((select id from public.attendance_correction_requests where session_id = (select session_id from t)), 'approved')$$,
                    'ALREADY_DECIDED', 'a decided correction cannot be decided again');
select tests.raises($$select public.override_attendance((select session_id from t), (select student_id from roster limit 1), 'OD', 'no')$$,
                    'REASON_REQUIRED', 'overrides need a reason');
reset role;
select tests.ok((select status_code from public.attendance_records where session_id = (select session_id from t)
                  and student_id = (select student_id from roster order by roll_no limit 1)) = 'P', 'approved correction updated the record');
select tests.ok(exists (select 1 from public.audit_log where action = 'attendance.correction.approved'), 'correction approval is audited');

-- ── Cancellation voids a marked register and stops it counting ──────────
create temp table before_cancel as
select sum(held) as held from public.attendance_summaries where offering_id = (select offering_id from t);
select tests.login('operations@sjcem.edu.in');
set role authenticated;
select public.cancel_session((select session_id from t), 'Industry expert talk in the seminar hall');
reset role;
select tests.ok((select state from public.attendance_registers where session_id = (select session_id from t)) = 'voided', 'cancelled after marking → register voided');
select tests.ok((select sum(held) from public.attendance_summaries where offering_id = (select offering_id from t))
                = (select held from before_cancel) - (select count(*) from roster), 'voided session no longer counts as held');

-- ── Reopen a missing register (HOD, own department) ─────────────────────
insert into res select 'it_locked', to_jsonb(s.id) from public.class_sessions s join public.attendance_registers g on g.session_id = s.id
  join public.departments d on d.id = s.department_id and d.code = 'IT' where g.state = 'locked' limit 1;
select tests.login(tests.hod_email('COMP'));
set role authenticated;
select public.reopen_register(
  (select s.id from public.class_sessions s join public.attendance_registers g on g.session_id = s.id
   join public.departments d on d.id = s.department_id and d.code = 'COMP'
   where g.state = 'locked' and g.submitted_at is null limit 1),
  'Professor''s phone was lost; allow late marking');
select tests.raises($$select public.reopen_register((select (v #>> '{}')::uuid from res where k = 'it_locked'), 'Late marking please')$$,
  'OUT_OF_SCOPE', 'HOD cannot reopen another department''s register');
reset role;
select tests.ok(exists (select 1 from public.attendance_registers where state = 'reopened'), 'register reopened');

-- ── MFA gate on sensitive permissions ───────────────────────────────────
select tests.login('admin@sjcem.edu.in', 'aal1');
set role authenticated;
select tests.raises($$select public.set_role_permission('operations', 'audit.view', 'all')$$, 'MFA_REQUIRED', 'role edits need aal2');
reset role;
select tests.login('admin@sjcem.edu.in', 'aal2');
set role authenticated;
select public.set_role_permission('operations', 'audit.view', 'all');
select tests.raises($$select public.set_role_permission('admin', 'roles.manage', 'none')$$, 'LOCKOUT', 'admin cannot remove its own roles.manage');
reset role;
select tests.login('operations@sjcem.edu.in');
set role authenticated;
select tests.ok((select count(*) from public.audit_log) > 0, 'granted permission applies immediately (no re-login)');
reset role;
select tests.login('admin@sjcem.edu.in');
set role authenticated;
select public.set_role_permission('operations', 'audit.view', 'none');
reset role;

-- ── Timetable publish (republish rule) ──────────────────────────────────
select tests.ok(jsonb_array_length(public.validate_timetable((select v.id from public.timetable_versions v join public.departments d on d.id = v.department_id
   where d.code = 'IT' and v.program_year = 'TE' and v.status = 'draft'))) = 0, 'draft timetable has no conflicts');
select tests.login('operations@sjcem.edu.in');
set role authenticated;
insert into res select 'publish', public.publish_timetable((select v.id from public.timetable_versions v join public.departments d on d.id = v.department_id
   where d.code = 'IT' and v.program_year = 'TE' and v.status = 'draft'));
reset role;
select tests.ok((select (v ->> 'created')::int from res where k = 'publish') > 0
                and (select (v ->> 'replaced')::int from res where k = 'publish') = (select (v ->> 'created')::int from res where k = 'publish'),
                'republish regenerated exactly the untouched future sessions');
select tests.ok((select count(*) from public.timetable_versions v join public.departments d on d.id = v.department_id
                 where d.code = 'IT' and v.program_year = 'TE' and v.status = 'archived') = 1, 'previous version archived');

-- ── Students, guardians, imports ─────────────────────────────────────────
select tests.login('operations@sjcem.edu.in');
set role authenticated;
insert into res select 'student', to_jsonb(public.create_student(jsonb_build_object(
  'name', 'Test Student Rao', 'enrollmentNo', '26COMP9001', 'gender', 'F', 'dob', '2008-05-05', 'email', 'test.rao@example.com',
  'phone', '9876501234', 'divisionId', (select dv.id from public.divisions dv join public.departments d on d.id = dv.department_id where d.code = 'COMP' and dv.program_year = 'FE' and dv.code = 'A'),
  'batchId', (select b.id from public.batches b join public.divisions dv on dv.id = b.division_id join public.departments d on d.id = dv.department_id where d.code = 'COMP' and dv.program_year = 'FE' and dv.code = 'A' and b.code = '1'),
  'admissionType', 'fe_regular', 'guardianName', 'Ramesh Rao', 'guardianRelation', 'Father', 'guardianPhone', '9822001122')));
select tests.raises($$select public.create_student(jsonb_build_object('name', 'Other', 'enrollmentNo', '26COMP9001', 'gender', 'M', 'dob', '2008-01-01',
  'phone', '9000000000', 'divisionId', (select division_id from public.student_enrollments where student_id = (select (v #>> '{}')::uuid from res where k = 'student')),
  'batchId', (select batch_id from public.student_enrollments where student_id = (select (v #>> '{}')::uuid from res where k = 'student'))))$$,
  'DUPLICATE', 'duplicate enrollment number is blocked');
select public.transfer_student(
  (select (v #>> '{}')::uuid from res where k = 'student'),
  (select dv.id from public.divisions dv join public.departments d on d.id = dv.department_id where d.code = 'COMP' and dv.program_year = 'FE' and dv.code = 'B'),
  (select b.id from public.batches b join public.divisions dv on dv.id = b.division_id join public.departments d on d.id = dv.department_id where d.code = 'COMP' and dv.program_year = 'FE' and dv.code = 'B' and b.code = '2'),
  app.today() + 1, 'Elective group balancing');
select public.set_guardian_link_status((select id from public.guardian_links where student_id = (select (v #>> '{}')::uuid from res where k = 'student')), 'verified');

insert into res select 'import', to_jsonb(public.stage_student_import('round4.csv', jsonb_build_array(
  jsonb_build_object('line', 2, 'name', 'Aarohi Sawant', 'enrollmentNo', '26COMP9002', 'prn', '', 'gender', 'F', 'dob', '2008-03-14',
    'email', 'aarohi@example.com', 'phone', '9876543210', 'department', 'COMP', 'programYear', 'FE', 'division', 'A', 'batch', '1',
    'admissionType', 'fe_regular', 'guardianName', 'Sunil Sawant', 'guardianRelation', 'Father', 'guardianPhone', '9822012345'),
  jsonb_build_object('line', 3, 'name', 'Bad', 'enrollmentNo', 'x1', 'gender', 'Q', 'dob', 'yesterday', 'email', 'nope', 'phone', '123',
    'department', 'ZZZ', 'programYear', 'FE', 'division', 'A', 'batch', '1', 'admissionType', 'x', 'guardianPhone', '1'))));
select tests.ok((select ok_rows = 1 and error_rows = 1 from public.import_jobs where id = (select (v #>> '{}')::uuid from res where k = 'import')),
                'import staged: 1 valid, 1 with errors');
select tests.ok(public.commit_student_import((select (v #>> '{}')::uuid from res where k = 'import')) = 1, 'import committed one student');
select tests.ok(public.commit_student_import((select (v #>> '{}')::uuid from res where k = 'import')) = 0, 'commit is idempotent');
reset role;
select tests.ok((select count(*) from public.student_enrollments where student_id = (select (v #>> '{}')::uuid from res where k = 'student')) = 2,
                'transfer closed one enrollment and opened another');

-- ── Leave ────────────────────────────────────────────────────────────────
select tests.login('operations@sjcem.edu.in');
set role authenticated;
select public.decide_leave((select id from public.leave_requests where status = 'pending' order by created_at limit 1), 'approved');
reset role;
select tests.ok(exists (select 1 from public.audit_log where action = 'leave.approved'), 'leave approval audited');

-- ── Announcements and shortage warnings (HOD → own department) ──────────
select tests.login(tests.hod_email('COMP'));
set role authenticated;
insert into res select 'ann', public.publish_announcement(jsonb_build_object('title', 'COMP industry visit', 'body', 'Report at the gate by 8 AM.',
  'priority', 'normal', 'audience', 'college', 'channels', jsonb_build_array('inapp', 'push')));
select tests.ok(public.notify_shortage() > 0, 'HOD can warn their department''s shortage list');
reset role;
select tests.ok((select audience = 'department' and department_id = (select id from public.departments where code = 'COMP')
                 from public.announcements where id = (select (v ->> 'id')::uuid from res where k = 'ann')), 'HOD announcements are forced to own department');

-- ── Blueprint draft → activate ──────────────────────────────────────────
select tests.login('admin@sjcem.edu.in');
set role authenticated;
insert into res select 'bp', public.save_blueprint_draft((select document from public.blueprint_versions where status = 'active'));
select public.activate_blueprint((select (v ->> 'id')::uuid from res where k = 'bp'));
select tests.raises($$select public.complete_setup('{}'::jsonb)$$, 'SETUP_DONE', 'setup wizard refuses once setup is complete');
reset role;
select tests.ok((select count(*) from public.blueprint_versions where status = 'active') = 1
                and (select count(*) from public.blueprint_versions where status = 'superseded') = 1, 'blueprint activation supersedes the previous version');

-- ── Rollover: next year + FE promotion ──────────────────────────────────
insert into res select 'students_before', to_jsonb(count(*)) from public.students;
select tests.login('admin@sjcem.edu.in');
set role authenticated;
insert into res select 'year', to_jsonb(public.create_next_academic_year(jsonb_build_object('label', '2027-28', 'start', '2027-07-01', 'end', '2028-06-30',
  'oddStart', '2027-07-12', 'oddEnd', '2027-11-20', 'evenStart', '2028-01-03', 'evenEnd', '2028-05-06')));
insert into res select 'promote', public.promote_students((select (v #>> '{}')::uuid from res where k = 'year'), 'FE',
  jsonb_build_array(jsonb_build_object('student_id', (select e.student_id from public.student_enrollments e join public.departments d on d.id = e.department_id
    where e.program_year = 'FE' and d.code = 'CIVIL' limit 1), 'outcome', 'detained')));
reset role;
select tests.ok((select (v ->> 'detained')::int from res where k = 'promote') = 1 and (select (v ->> 'promoted')::int from res where k = 'promote') > 900,
                'FE promotion recorded outcomes');
select tests.ok((select count(*) from public.student_enrollments e join public.academic_years y on y.id = e.academic_year_id
                 where y.label = '2027-28' and e.program_year = 'SE') = (select (v ->> 'promoted')::int from res where k = 'promote'),
                'promoted students have SE enrollments next year');
select tests.ok((select count(*) from public.students) = (select (v #>> '{}')::bigint from res where k = 'students_before'),
                'promotion added enrollments, not duplicate students');

-- ── Jobs and drift ───────────────────────────────────────────────────────
select tests.ok(public.lock_registers() >= 0, 'lock job runs');
select tests.ok(public.reconcile_attendance_summaries() = 0, 'incremental summaries match a full recompute (no drift)');
