-- Administrative RPCs used by the web app (§9: "if both apps need it, it is
-- an RPC"). Each one: app.require() first, effective-dated changes, audit.

create or replace function app.active_term() returns public.academic_terms
language sql stable security definer set search_path = '' as $$
  select * from public.academic_terms where status = 'active' limit 1
$$;

create or replace function app.semester_for(p_program_year text, p_parity text) returns smallint
language sql immutable as $$
  select (case p_program_year when 'FE' then 1 when 'SE' then 3 when 'TE' then 5 else 7 end
          + case p_parity when 'even' then 1 else 0 end)::smallint
$$;

-- ── Students ─────────────────────────────────────────────────────────────
-- p: { name, enrollmentNo, prn, gender, dob, email, phone, divisionId, batchId,
--      admissionType, guardianName, guardianRelation, guardianPhone }
create or replace function public.create_student(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_div public.divisions;
  v_term public.academic_terms := app.active_term();
  v_student uuid;
  v_guardian uuid;
  v_dup text;
  v_roll integer;
begin
  select * into v_div from public.divisions where id = (p ->> 'divisionId')::uuid;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('students.manage', v_div.department_id);
  if not exists (select 1 from public.batches where id = (p ->> 'batchId')::uuid and division_id = v_div.id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_term.id is null then raise exception 'NO_ACTIVE_TERM' using errcode = 'P0001'; end if;

  -- Duplicate detection (§11.4): enrollment no, PRN, email, phone + name + DOB.
  select format('%s (%s)', full_name, enrollment_no) into v_dup from public.students
  where enrollment_no = p ->> 'enrollmentNo'
     or (nullif(p ->> 'prn', '') is not null and prn = p ->> 'prn')
     or (nullif(p ->> 'email', '') is not null and lower(email) = lower(p ->> 'email'))
     or (phone = p ->> 'phone' and lower(full_name) = lower(p ->> 'name') and dob = (p ->> 'dob')::date)
  limit 1;
  if v_dup is not null then raise exception 'DUPLICATE' using errcode = 'P0001', detail = v_dup; end if;

  insert into public.students (enrollment_no, prn, full_name, dob, gender, email, phone, admission_year, admission_type,
                               admitted_department_id, created_by)
  values (p ->> 'enrollmentNo', nullif(p ->> 'prn', ''), p ->> 'name', (p ->> 'dob')::date, p ->> 'gender', nullif(p ->> 'email', ''),
          p ->> 'phone', extract(year from app.today())::smallint, coalesce(p ->> 'admissionType', 'fe_regular'), v_div.department_id, auth.uid())
  returning id into v_student;

  select coalesce(max(roll_no), 0) + 1 into v_roll from public.student_enrollments where division_id = v_div.id and term_id = v_term.id;
  insert into public.student_enrollments (student_id, academic_year_id, term_id, department_id, program_year, semester, division_id, batch_id,
                                          roll_no, enrollment_type, valid_during, reason, created_by)
  values (v_student, v_div.academic_year_id, v_term.id, v_div.department_id, v_div.program_year,
          app.semester_for(v_div.program_year, v_term.parity), v_div.id, (p ->> 'batchId')::uuid, v_roll,
          case when p ->> 'admissionType' = 'direct_second_year' then 'dse' else 'regular' end,
          daterange(app.today(), v_term.end_date, '[]'), 'New admission', auth.uid());

  if nullif(p ->> 'guardianPhone', '') is not null then
    insert into public.guardians (full_name, relation, phone)
    values (p ->> 'guardianName', coalesce(p ->> 'guardianRelation', 'Guardian'), p ->> 'guardianPhone')
    on conflict (phone) do update set full_name = public.guardians.full_name
    returning id into v_guardian;
    insert into public.guardian_links (student_id, guardian_id, status, is_primary) values (v_student, v_guardian, 'pending', true)
    on conflict do nothing;
  end if;

  perform app.audit('student.created', 'students', v_student::text,
    format('Admitted %s (%s), roll %s', p ->> 'name', p ->> 'enrollmentNo', v_roll), null,
    jsonb_build_object('division_id', v_div.id, 'batch_id', p ->> 'batchId'));
  return v_student;
end $$;

-- Effective-dated transfer: close the current enrollment, open a new one (§7.5).
create or replace function public.transfer_student(p_student uuid, p_division uuid, p_batch uuid, p_from date, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_cur public.student_enrollments; v_div public.divisions; v_roll integer; v_name text;
begin
  select * into v_cur from public.student_enrollments
  where student_id = p_student and is_primary and valid_during @> app.today()
  for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into v_div from public.divisions where id = p_division;
  if not found or not exists (select 1 from public.batches where id = p_batch and division_id = p_division) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform app.require('students.manage', v_cur.department_id);
  perform app.require('students.manage', v_div.department_id);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if v_cur.division_id = p_division and v_cur.batch_id = p_batch then raise exception 'NO_CHANGE' using errcode = 'P0001'; end if;
  if p_from <= lower(v_cur.valid_during) or p_from > upper(v_cur.valid_during) then raise exception 'BAD_EFFECTIVE_DATE' using errcode = 'P0001'; end if;

  update public.student_enrollments set valid_during = daterange(lower(valid_during), p_from, '[)') where id = v_cur.id;
  v_roll := case when v_cur.division_id = p_division then v_cur.roll_no
                 else (select coalesce(max(roll_no), 0) + 1 from public.student_enrollments where division_id = p_division and term_id = v_cur.term_id) end;
  insert into public.student_enrollments (student_id, academic_year_id, term_id, department_id, program_year, semester, division_id, batch_id,
                                          roll_no, enrollment_type, valid_during, reason, created_by)
  values (p_student, v_cur.academic_year_id, v_cur.term_id, v_div.department_id, v_div.program_year, v_cur.semester, p_division, p_batch,
          v_roll, v_cur.enrollment_type, daterange(p_from, upper(v_cur.valid_during), '[)'), p_reason, auth.uid());

  select full_name into v_name from public.students where id = p_student;
  perform app.audit('student.transferred', 'student_enrollments', p_student::text, format('Transferred %s', v_name),
    jsonb_build_object('division_id', v_cur.division_id, 'batch_id', v_cur.batch_id),
    jsonb_build_object('division_id', p_division, 'batch_id', p_batch, 'effective_from', p_from), p_reason);
end $$;

create or replace function public.set_student_status(p_student uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old text; v_name text;
begin
  perform app.require('students.manage', app.student_department(p_student));
  if p_status not in ('active', 'withdrawn', 'detained', 'passed_out') then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select status, full_name into v_old, v_name from public.students where id = p_student for update;
  update public.students set status = p_status where id = p_student;
  perform app.audit('student.status', 'students', p_student::text, format('%s: %s → %s', v_name, v_old, p_status),
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status), p_reason);
end $$;

-- ── Guardians (§11.5) ────────────────────────────────────────────────────
create or replace function public.set_guardian_link_status(p_link uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_link public.guardian_links; v_g public.guardians; v_s text;
begin
  perform app.require('guardians.manage');
  if p_status not in ('verified', 'revoked') then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  select * into v_link from public.guardian_links where id = p_link for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  update public.guardian_links set status = p_status,
    verified_by = case when p_status = 'verified' then auth.uid() else verified_by end,
    verified_at = case when p_status = 'verified' then now() else verified_at end
  where id = p_link;
  select * into v_g from public.guardians where id = v_link.guardian_id;
  select full_name into v_s from public.students where id = v_link.student_id;
  if p_status = 'verified' then
    perform app.enqueue('sms', null, 'guardian_invite', jsonb_build_object('phone', v_g.phone, 'student', v_s), format('ginv:%s', p_link));
  end if;
  perform app.audit('guardian_link.' || p_status, 'guardian_links', p_link::text,
    format('%s %s (%s) for %s', case when p_status = 'verified' then 'Verified' else 'Revoked' end, v_g.full_name, v_g.relation, v_s),
    jsonb_build_object('status', v_link.status), jsonb_build_object('status', p_status));
end $$;

-- ── Departments and classes ──────────────────────────────────────────────
create or replace function public.assign_hod(p_department uuid, p_staff uuid, p_from date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_cur public.department_staff; v_name text; v_code text; v_user uuid;
begin
  perform app.require('blueprint.manage');
  select full_name, user_id into v_name, v_user from public.staff where id = p_staff and home_department_id = p_department;
  if v_name is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select code into v_code from public.departments where id = p_department;
  select * into v_cur from public.department_staff
  where department_id = p_department and role = 'hod' and upper_inf(valid_during) for update;
  if found then
    if v_cur.staff_id = p_staff then return; end if;
    if p_from <= lower(v_cur.valid_during) then raise exception 'BAD_EFFECTIVE_DATE' using errcode = 'P0001'; end if;
    update public.department_staff set valid_during = daterange(lower(valid_during), p_from, '[)') where id = v_cur.id;
  end if;
  insert into public.department_staff (department_id, staff_id, role, valid_during) values (p_department, p_staff, 'hod', daterange(p_from, null));
  if v_user is not null then
    insert into public.user_roles (user_id, role) values (v_user, 'hod') on conflict do nothing;
  end if;
  perform app.audit('department.hod.assigned', 'department_staff', p_department::text,
    format('%s appointed HOD of %s from %s', v_name, v_code, p_from),
    case when v_cur.id is null then null else jsonb_build_object('staff_id', v_cur.staff_id) end, jsonb_build_object('staff_id', p_staff));
end $$;

create or replace function public.create_division(p_department uuid, p_program_year text, p_code text, p_capacity integer, p_batches integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_year uuid; v_id uuid; v_dept text;
begin
  perform app.require('blueprint.manage', p_department);
  select id into v_year from public.academic_years where status = 'active';
  if v_year is null then raise exception 'NO_ACTIVE_YEAR' using errcode = 'P0001'; end if;
  if p_batches not between 1 and 6 then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  begin
    insert into public.divisions (academic_year_id, department_id, program_year, code, capacity)
    values (v_year, p_department, p_program_year, upper(p_code), p_capacity) returning id into v_id;
  exception when unique_violation then
    raise exception 'DIVISION_EXISTS' using errcode = 'P0001';
  end;
  insert into public.batches (division_id, code) select v_id, n::text from generate_series(1, p_batches) n;
  select code into v_dept from public.departments where id = p_department;
  perform app.audit('division.created', 'divisions', v_id::text,
    format('Created %s %s-%s with %s batches', p_program_year, v_dept, upper(p_code), p_batches), null,
    jsonb_build_object('capacity', p_capacity, 'batches', p_batches));
  return v_id;
end $$;

create or replace function public.set_class_teacher(p_division uuid, p_staff uuid, p_from date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_div public.divisions;
begin
  select * into v_div from public.divisions where id = p_division;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('assignments.manage', v_div.department_id);
  update public.class_teacher_assignments set valid_during = daterange(lower(valid_during), p_from, '[)')
  where division_id = p_division and upper_inf(valid_during) and lower(valid_during) < p_from;
  insert into public.class_teacher_assignments (division_id, staff_id, valid_during) values (p_division, p_staff, daterange(p_from, null));
  perform app.audit('division.class_teacher', 'class_teacher_assignments', p_division::text, 'Assigned class teacher', null,
    jsonb_build_object('staff_id', p_staff, 'from', p_from));
end $$;

-- ── Settings ─────────────────────────────────────────────────────────────
create or replace function public.update_attendance_policy(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.attendance_policies;
begin
  perform app.require('attendance.policy.manage');
  select * into v_old from public.attendance_policies where scope = 'college' and effective_to is null for update;
  if (p ->> 'warnPercent')::numeric < (p ->> 'minPercent')::numeric then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  update public.attendance_policies set
    min_percent = (p ->> 'minPercent')::numeric,
    warn_percent = (p ->> 'warnPercent')::numeric,
    count_mode = p ->> 'countMode',
    eligibility_basis = p ->> 'eligibilityBasis',
    edit_window_hours = (p ->> 'editWindowHours')::integer,
    lock_after_hours = (p ->> 'lockAfterHours')::integer,
    default_unmarked_status = p ->> 'defaultUnmarkedStatus',
    leave_applies_retroactively = coalesce((p ->> 'leaveAppliesRetroactively')::boolean, false)
  where id = v_old.id;
  perform app.audit('policy.updated', 'attendance_policies', v_old.id::text, 'Updated college attendance policy',
    to_jsonb(v_old) - 'id' - 'created_at', p);
end $$;

create or replace function public.update_college(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.college;
begin
  perform app.require('settings.manage');
  select * into v_old from public.college where id = 1 for update;
  update public.college set name = p ->> 'name', short_name = p ->> 'shortName', address = p ->> 'address', phone = p ->> 'phone',
    email = p ->> 'email', principal_name = p ->> 'principalName'
  where id = 1;
  perform app.audit('college.updated', 'college', '1', 'Updated college profile', to_jsonb(v_old), p);
end $$;

create or replace function public.set_role_permission(p_role text, p_permission text, p_scope text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  perform app.require('roles.manage');
  if p_role = 'admin' and p_permission = 'roles.manage' and p_scope = 'none' then
    raise exception 'LOCKOUT' using errcode = 'P0001';
  end if;
  select scope into v_old from public.role_permissions where role = p_role and permission = p_permission;
  if p_scope = 'none' then
    delete from public.role_permissions where role = p_role and permission = p_permission;
  else
    insert into public.role_permissions (role, permission, scope) values (p_role, p_permission, p_scope)
    on conflict (role, permission) do update set scope = excluded.scope;
  end if;
  perform app.audit('role_permission.updated', 'role_permissions', p_role,
    format('%s: %s %s → %s', p_role, p_permission, coalesce(v_old, 'none'), p_scope),
    jsonb_build_object('scope', coalesce(v_old, 'none')), jsonb_build_object('scope', p_scope));
end $$;

-- ── Announcements (§11.12) ───────────────────────────────────────────────
create or replace function app.deliver_announcement(p_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare a public.announcements; v_count integer;
begin
  select * into a from public.announcements where id = p_id for update;
  if a.published then return a.recipient_count; end if;
  insert into public.announcement_recipients (announcement_id, user_id)
  select distinct p_id, u.user_id from (
    select s.user_id from public.students s
    join public.student_enrollments e on e.student_id = s.id and e.is_primary and e.valid_during @> app.today()
    where a.audience in ('college', 'students', 'department') and s.status = 'active'
      and (a.audience <> 'department' or e.department_id = a.department_id)
    union
    select g.user_id from public.guardians g
    join public.guardian_links gl on gl.guardian_id = g.id and gl.status = 'verified'
    join public.student_enrollments e on e.student_id = gl.student_id and e.is_primary and e.valid_during @> app.today()
    where a.audience in ('college', 'parents', 'department') and (a.audience <> 'department' or e.department_id = a.department_id)
    union
    select st.user_id from public.staff st
    where a.audience in ('college', 'staff', 'department') and st.status <> 'inactive'
      and (a.audience <> 'department' or st.home_department_id = a.department_id)
  ) u where u.user_id is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  insert into public.notifications (user_id, kind, title, body, data)
  select user_id, 'announcement', a.title, left(a.body, 280), jsonb_build_object('announcement_id', p_id)
  from public.announcement_recipients where announcement_id = p_id;
  perform app.enqueue('push', r.user_id, 'announcement', jsonb_build_object('announcement_id', p_id), format('ann:%s:%s', p_id, r.user_id))
  from public.announcement_recipients r where r.announcement_id = p_id and 'push' = any (a.channels);
  update public.announcements set published = true, recipient_count = v_count where id = p_id;
  return v_count;
end $$;

-- p: { title, body, priority, audience, departmentId, channels[], publishAt }
create or replace function public.publish_announcement(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_dept uuid := nullif(p ->> 'departmentId', '')::uuid; v_audience text := p ->> 'audience';
        v_at timestamptz := coalesce(nullif(p ->> 'publishAt', '')::timestamptz, now()); v_count integer := 0;
begin
  if app.scope_of('announcements.college') = 'all' then
    perform app.require('announcements.college');
  else
    -- HODs announce to their own department only.
    v_dept := (app.my_department_ids())[1];
    v_audience := 'department';
    perform app.require('announcements.class', v_dept);
  end if;
  if v_audience = 'department' and v_dept is null then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  insert into public.announcements (title, body, priority, audience, department_id, channels, created_by, publish_at)
  values (p ->> 'title', p ->> 'body', coalesce(p ->> 'priority', 'normal'), v_audience, v_dept,
          coalesce(array(select jsonb_array_elements_text(p -> 'channels')), '{inapp,push}'), auth.uid(), v_at)
  returning id into v_id;
  if v_at <= now() then v_count := app.deliver_announcement(v_id); end if;
  perform app.audit(case when v_at > now() then 'announcement.scheduled' else 'announcement.published' end, 'announcements', v_id::text,
    format('%s “%s”', case when v_at > now() then 'Scheduled' else 'Published' end, p ->> 'title'), null,
    jsonb_build_object('audience', v_audience, 'recipients', v_count));
  return jsonb_build_object('id', v_id, 'recipients', v_count, 'scheduled', v_at > now());
end $$;

create or replace function public.publish_due_announcements() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id from public.announcements where not published and publish_at <= now() loop
    perform app.deliver_announcement(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Imports (§12) ────────────────────────────────────────────────────────
-- Rows arrive parsed from the web route handler; validation runs here so the
-- same rules apply to every client.
create or replace function public.stage_student_import(p_file_name text, p_rows jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_job uuid; v_total integer; v_errors integer; v_year uuid;
begin
  perform app.require('students.import');
  select id into v_year from public.academic_years where status = 'active';
  insert into public.import_jobs (kind, file_name, created_by) values ('students', p_file_name, auth.uid()) returning id into v_job;

  insert into public.import_rows (job_id, line, raw, errors)
  select v_job, (r ->> 'line')::integer, r - 'line',
    array_remove(array[
      case when coalesce(r ->> 'name', '') !~ '^.{3,120}$' then 'name: enter the full name' end,
      case when coalesce(r ->> 'enrollmentNo', '') !~ '^[A-Z0-9]{6,15}$' then 'enrollmentNo: 6–15 capital letters or digits' end,
      case when coalesce(r ->> 'prn', '') <> '' and r ->> 'prn' !~ '^\d{16}$' then 'prn: 16 digits' end,
      case when coalesce(r ->> 'gender', '') not in ('M', 'F', 'O') then 'gender: M, F or O' end,
      case when coalesce(r ->> 'dob', '') !~ '^\d{4}-\d{2}-\d{2}$' then 'dob: use YYYY-MM-DD' end,
      case when coalesce(r ->> 'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then 'email: enter a valid email' end,
      case when coalesce(r ->> 'phone', '') !~ '^[6-9]\d{9}$' then 'phone: 10-digit Indian mobile number' end,
      case when coalesce(r ->> 'guardianPhone', '') !~ '^[6-9]\d{9}$' then 'guardianPhone: 10-digit Indian mobile number' end,
      case when coalesce(r ->> 'admissionType', '') not in ('fe_regular', 'direct_second_year') then 'admissionType: fe_regular or direct_second_year' end,
      case when not exists (select 1 from public.departments d where d.code = upper(r ->> 'department')) then format('department: unknown branch “%s”', r ->> 'department') end,
      case when exists (select 1 from public.departments d where d.code = upper(r ->> 'department'))
            and not exists (
              select 1 from public.divisions dv join public.departments d on d.id = dv.department_id
              join public.batches b on b.division_id = dv.id and b.code = r ->> 'batch'
              where dv.academic_year_id = v_year and d.code = upper(r ->> 'department')
                and dv.program_year = upper(r ->> 'programYear') and dv.code = upper(r ->> 'division'))
           then format('division: %s %s-%s batch %s does not exist', r ->> 'programYear', r ->> 'department', r ->> 'division', r ->> 'batch') end,
      case when exists (select 1 from public.students s where s.enrollment_no = r ->> 'enrollmentNo') then 'enrollmentNo: already exists (skipped on commit)' end,
      case when (select count(*) from jsonb_array_elements(p_rows) x where x ->> 'enrollmentNo' = r ->> 'enrollmentNo') > 1 then 'enrollmentNo: duplicated within this file' end
    ], null)
  from jsonb_array_elements(p_rows) r;

  select count(*), count(*) filter (where cardinality(errors) > 0) into v_total, v_errors from public.import_rows where job_id = v_job;
  update public.import_jobs set total_rows = v_total, error_rows = v_errors, ok_rows = v_total - v_errors,
    status = case when v_total = v_errors then 'failed' else 'validated' end
  where id = v_job;
  return v_job;
end $$;

-- commit_import(job): one transaction, idempotent on enrollment number.
create or replace function public.commit_student_import(p_job uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_job public.import_jobs; r record; v_created integer := 0; v_id uuid;
begin
  perform app.require('students.import');
  select * into v_job from public.import_jobs where id = p_job for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_job.status = 'committed' then return 0; end if;
  for r in
    select ir.line, ir.raw, dv.id as division_id, b.id as batch_id
    from public.import_rows ir
    join public.departments d on d.code = upper(ir.raw ->> 'department')
    join public.divisions dv on dv.department_id = d.id and dv.program_year = upper(ir.raw ->> 'programYear') and dv.code = upper(ir.raw ->> 'division')
      and dv.academic_year_id = (select id from public.academic_years where status = 'active')
    join public.batches b on b.division_id = dv.id and b.code = ir.raw ->> 'batch'
    where ir.job_id = p_job and cardinality(ir.errors) = 0 and not ir.committed
    order by ir.line
  loop
    if exists (select 1 from public.students where enrollment_no = r.raw ->> 'enrollmentNo') then continue; end if;
    v_id := public.create_student(r.raw || jsonb_build_object('divisionId', r.division_id, 'batchId', r.batch_id));
    update public.import_rows set committed = true where job_id = p_job and line = r.line;
    v_created := v_created + 1;
  end loop;
  update public.import_jobs set status = 'committed', committed_at = now(), result = jsonb_build_object('created', v_created) where id = p_job;
  perform app.audit('import.committed', 'import_jobs', p_job::text, format('Committed %s: %s students created', v_job.file_name, v_created));
  return v_created;
end $$;

-- ── Shortage warnings (§13) ──────────────────────────────────────────────
create or replace function public.notify_shortage(p_department uuid default null, p_program_year text default null, p_division uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_min numeric; v_week text := to_char(app.today(), 'IYYY-IW'); v_count integer;
begin
  -- HODs default to (and are limited to) their own department.
  if app.scope_of('attendance.view') = 'department' then p_department := coalesce(p_department, (app.my_department_ids())[1]); end if;
  perform app.require('attendance.view', p_department);
  v_min := (app.policy_for(p_department)).min_percent;

  drop table if exists _short;
  create temp table _short on commit drop as
  select distinct s.student_id
  from public.attendance_summaries s
  join public.student_enrollments e on e.student_id = s.student_id and e.is_primary and e.valid_during @> app.today()
  where s.percent < v_min
    and (p_department is null or e.department_id = p_department)
    and (p_program_year is null or e.program_year = p_program_year)
    and (p_division is null or e.division_id = p_division);
  select count(*) into v_count from _short;

  -- Students and their verified guardians; the weekly dedupe key stops repeats.
  perform app.enqueue('push', t.user_id, 'shortage_warning', jsonb_build_object('student_id', t.student_id),
                      format('short:%s:%s:%s', t.student_id, v_week, t.user_id))
  from (
    select st.id as student_id, st.user_id from _short join public.students st on st.id = _short.student_id
    union
    select gl.student_id, g.user_id from _short
    join public.guardian_links gl on gl.student_id = _short.student_id and gl.status = 'verified'
    join public.guardians g on g.id = gl.guardian_id
  ) t where t.user_id is not null;

  perform app.audit('shortage.notified', 'notification_outbox', 'shortage_warning',
    format('Queued shortage warnings for %s students and their guardians', v_count));
  return v_count;
end $$;
