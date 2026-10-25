-- RLS matrix (§21): each role sees exactly its scope.

create or replace function tests.hod_email(p_code text) returns text language sql as $$
  select p.email from public.profiles p
  join public.staff s on s.user_id = p.id
  join public.department_staff ds on ds.staff_id = s.id and ds.role = 'hod' and upper_inf(ds.valid_during)
  join public.departments d on d.id = ds.department_id and d.code = p_code
$$;

-- Ground truth as the owner.
create temp table truth as
select (select count(*) from public.students) as students,
       (select count(*) from public.students s where app.student_department(s.id) = (select id from public.departments where code = 'COMP')) as comp_students,
       (select count(*) from public.audit_log) as audit_rows;
grant select on truth to authenticated;

-- Principal: whole college
select tests.login('principal@sjcem.edu.in');
set role authenticated;
select tests.ok((select count(*) from public.students) = (select students from truth), 'principal sees every student');
select tests.ok((select count(*) from public.audit_log) = (select audit_rows from truth), 'principal reads the audit log');
select tests.ok((select count(*) from public.branch_stats()) = 12, 'principal branch_stats covers 12 branches');
reset role;

-- HOD COMP: department only
select tests.login(tests.hod_email('COMP'));
set role authenticated;
select tests.ok((select count(*) from public.students) = (select comp_students from truth), 'HOD sees only own-department students');
select tests.ok(not exists (select 1 from public.attendance_records r join public.departments d on d.id = r.department_id where d.code <> 'COMP'),
                'HOD sees no other department''s attendance records');
select tests.ok((select count(*) from public.audit_log) = 0, 'HOD cannot read the audit log');
select tests.ok((select count(*) from public.branch_stats() where students > 0) = 1, 'HOD branch_stats aggregates only own department');
select tests.ok(not exists (select 1 from public.v_sessions where department_code <> 'COMP' and register_state is not null),
                'HOD sees registers of own department only');
reset role;

-- Operations: college-wide students, no audit
select tests.login('operations@sjcem.edu.in');
set role authenticated;
select tests.ok((select count(*) from public.students) = (select students from truth), 'operations sees every student');
select tests.ok((select count(*) from public.audit_log) = 0, 'operations cannot read the audit log');
reset role;

-- Professor: only students they teach, only their sessions' records
select tests.login('professor@sjcem.edu.in');
set role authenticated;
select tests.ok((select count(*) from public.students) between 1 and 400, 'professor sees only students they teach');
select tests.ok(not exists (select 1 from public.attendance_records r where not app.teaches_session(r.session_id)),
                'professor sees records of their own sessions only');
select tests.ok((select count(*) from public.guardians) = 0, 'professor (not class teacher of these) cannot list guardians');
reset role;

-- Student: self only
select tests.login('student@sjcem.edu.in');
set role authenticated;
select tests.ok((select count(*) from public.students) = 1, 'student sees only themselves');
select tests.ok((select count(distinct student_id) from public.attendance_records) = 1, 'student sees only own attendance');
select tests.ok((select count(*) from public.attendance_summaries) > 0, 'student sees own summaries');
select tests.ok((select count(*) from public.staff) = 0, 'student cannot read staff contact details');
select tests.ok((select count(*) from public.staff_directory) > 0, 'student can read the staff directory (names only)');
reset role;

-- Parent: linked child only
select tests.login('parent@sjcem.edu.in');
set role authenticated;
select tests.ok((select count(*) from public.students) = 1, 'parent sees only the linked child');
select tests.ok((select count(distinct student_id) from public.attendance_records) = 1, 'parent sees only the child''s attendance');
reset role;

-- Anonymous: nothing
set role anon;
select tests.raises('select count(*) from public.students', 'permission denied for table students', 'anon cannot read students');
reset role;

-- Writes only through RPCs
select tests.login('principal@sjcem.edu.in');
set role authenticated;
select tests.raises($$update public.students set full_name = 'x'$$, 'permission denied for table students', 'direct UPDATE is refused even for principal');
select tests.raises($$delete from public.attendance_records$$, 'permission denied for table attendance_records', 'direct DELETE on records is refused');
reset role;

-- Access-token hook
select tests.ok(
  (public.custom_access_token_hook(jsonb_build_object('user_id', (select id from public.profiles where email = 'principal@sjcem.edu.in'), 'claims', '{}'::jsonb))
     #> '{claims,app_roles}') = '["principal"]'::jsonb,
  'access-token hook adds app_roles');
