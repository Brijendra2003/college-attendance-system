-- The attendance engine (§8). All of it runs in Postgres so web and mobile
-- behave identically. Errors use stable codes mapped in src/shared/errors.ts.

-- ── Policy resolution: subject → program year → department → college ────
create or replace function app.policy_for(p_department uuid, p_program_year text default null, p_subject uuid default null)
returns public.attendance_policies
language sql stable security definer set search_path = '' as $$
  select p.* from public.attendance_policies p
  where p.effective_from <= app.today() and (p.effective_to is null or p.effective_to >= app.today())
    and (
      (p.scope = 'subject' and p.subject_id = p_subject)
      or (p.scope = 'program_year' and p.department_id = p_department and p.program_year = p_program_year)
      or (p.scope = 'department' and p.department_id = p_department)
      or p.scope = 'college'
    )
  order by case p.scope when 'subject' then 1 when 'program_year' then 2 when 'department' then 3 else 4 end
  limit 1
$$;

-- ── Working days (calendar + Saturday pattern) ───────────────────────────
create or replace function app.is_working_day(p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.academic_terms t where t.status in ('active', 'planned') and p_date between t.start_date and t.end_date)
    and (
      exists (select 1 from public.academic_calendar_events e where e.kind = 'working_override' and p_date between e.starts_on and e.ends_on)
      or (
        not exists (select 1 from public.academic_calendar_events e where e.kind = 'holiday' and p_date between e.starts_on and e.ends_on)
        and (
          extract(isodow from p_date) between 1 and 5
          or (extract(isodow from p_date) = 6 and ((extract(day from p_date)::int - 1) / 7 + 1) = any (
                coalesce((select working_saturdays from public.period_templates where is_default), '{}')))
        )
      )
    )
$$;

-- ── Roster (§8.2) ────────────────────────────────────────────────────────
create or replace function app.roster(p_session uuid)
returns table (student_id uuid, full_name text, roll_no integer, division_id uuid, batch_id uuid, suggested_status text)
language sql stable security definer set search_path = '' as $$
  with s as (
    select cs.*, g.kind as group_kind, g.division_id as g_division, g.batch_id as g_batch
    from public.class_sessions cs join public.teaching_groups g on g.id = cs.teaching_group_id
    where cs.id = p_session
  ),
  members as (
    select e.student_id, e.roll_no, e.division_id, e.batch_id
    from s join public.student_enrollments e
      on e.is_primary and e.valid_during @> s.session_date
     and ((s.group_kind = 'division' and e.division_id = s.g_division)
       or (s.group_kind = 'batch' and e.batch_id = s.g_batch))
    union
    select r.student_id, e.roll_no, e.division_id, e.batch_id
    from s
    join public.student_subject_registrations r on s.group_kind = 'custom' and r.teaching_group_id = s.teaching_group_id and r.valid_during @> s.session_date
    left join public.student_enrollments e on e.student_id = r.student_id and e.is_primary and e.valid_during @> s.session_date
  )
  select m.student_id, st.full_name, m.roll_no, m.division_id, m.batch_id,
         case when exists (
           select 1 from public.leave_requests l, s
           where l.student_id = m.student_id and l.status = 'approved' and l.leave_period && tstzrange(s.starts_at, s.ends_at)
         ) then 'L' end
  from members m
  join public.students st on st.id = m.student_id and st.status = 'active'
  order by m.roll_no nulls last, st.full_name
$$;

create or replace function public.session_roster(p_session uuid)
returns table (student_id uuid, full_name text, roll_no integer, division_id uuid, batch_id uuid, suggested_status text)
language plpgsql stable security definer set search_path = '' as $$
declare v_department uuid;
begin
  select department_id into v_department from public.class_sessions where id = p_session;
  if v_department is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not (app.teaches_session(p_session) or app.in_scope('attendance.view', v_department)) then
    raise exception 'ATT_NOT_ASSIGNED' using errcode = 'P0001';
  end if;
  return query select * from app.roster(p_session);
end $$;

-- ── Summaries (§8.5): recompute student × offering × component ──────────
create or replace function app.recompute_summaries(p_students uuid[], p_offering uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.attendance_summaries where offering_id = p_offering and student_id = any (p_students);
  insert into public.attendance_summaries (student_id, offering_id, component, held, attended, excused, percent, updated_at)
  select r.student_id, r.offering_id, r.component,
         sum(case when c.counts_in_held then r.weight else 0 end),
         sum(case when c.counts_in_held and c.counts_as_attended then r.weight else 0 end),
         sum(case when not c.counts_in_held then r.weight else 0 end),
         case when sum(case when c.counts_in_held then r.weight else 0 end) > 0 then
           round(100 * sum(case when c.counts_in_held and c.counts_as_attended then r.weight else 0 end)
                 / sum(case when c.counts_in_held then r.weight else 0 end), 2) end,
         now()
  from public.attendance_records r
  join public.attendance_registers g on g.session_id = r.session_id and g.state in ('submitted', 'locked', 'reopened')
  join public.class_sessions s on s.id = r.session_id and s.status <> 'cancelled'
  join public.attendance_status_codes c on c.code = r.status_code
  where r.offering_id = p_offering and r.student_id = any (p_students)
  group by r.student_id, r.offering_id, r.component;
end $$;

-- Nightly full recompute; returns the number of summary rows that drifted.
create or replace function public.reconcile_attendance_summaries() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_drift integer;
begin
  drop table if exists _fresh;
  create temp table _fresh on commit drop as
  select r.student_id, r.offering_id, r.component,
         sum(case when c.counts_in_held then r.weight else 0 end) as held,
         sum(case when c.counts_in_held and c.counts_as_attended then r.weight else 0 end) as attended,
         sum(case when not c.counts_in_held then r.weight else 0 end) as excused
  from public.attendance_records r
  join public.attendance_registers g on g.session_id = r.session_id and g.state in ('submitted', 'locked', 'reopened')
  join public.class_sessions s on s.id = r.session_id and s.status <> 'cancelled'
  join public.attendance_status_codes c on c.code = r.status_code
  group by 1, 2, 3;

  select count(*) into v_drift from _fresh f
  full join public.attendance_summaries a using (student_id, offering_id, component)
  where f.held is distinct from a.held or f.attended is distinct from a.attended;

  delete from public.attendance_summaries;
  insert into public.attendance_summaries (student_id, offering_id, component, held, attended, excused, percent, updated_at)
  select student_id, offering_id, component, held, attended, excused,
         case when held > 0 then round(100 * attended / held, 2) end, now()
  from _fresh;
  if v_drift > 0 then
    perform app.audit('summaries.reconciled', 'attendance_summaries', null, format('Nightly reconcile corrected %s summary rows', v_drift));
  end if;
  return v_drift;
end $$;

-- ── Outbox helper (dedupe_key makes every enqueue idempotent, §13) ──────
create or replace function app.enqueue(p_channel text, p_recipient uuid, p_template text, p_payload jsonb, p_dedupe text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notification_outbox (channel, recipient_id, template, payload, dedupe_key)
  values (p_channel, p_recipient, p_template, p_payload, p_dedupe)
  on conflict (dedupe_key) do nothing
$$;

-- ── submit_attendance (§8.3) ─────────────────────────────────────────────
create or replace function public.submit_attendance(
  p_session_id uuid,
  p_client_submission_id uuid,
  p_base_version integer,
  p_records jsonb,
  p_client_marked_at timestamptz default null,
  p_device_id text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reg       public.attendance_registers;
  v_session   public.class_sessions;
  v_policy    public.attendance_policies;
  v_staff     uuid := app.my_staff_id();
  v_weight    numeric;
  v_defaulted jsonb;
  v_result    jsonb;
  v_first     boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not app.is_active_user() then raise exception 'ACCOUNT_INACTIVE' using errcode = 'P0001'; end if;

  -- 1. serialise concurrent submissions from co-teachers
  select * into v_reg from public.attendance_registers where session_id = p_session_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

  -- 2. idempotent retries
  if v_reg.client_submission_id = p_client_submission_id then
    return coalesce(v_reg.last_result, '{}'::jsonb) || jsonb_build_object('result', 'duplicate');
  end if;

  -- 3. authorise
  select * into v_session from public.class_sessions where id = p_session_id;
  if v_session.status = 'cancelled' then
    return jsonb_build_object('result', 'cancelled');
  end if;
  if v_staff is null or not exists (select 1 from public.session_staff where session_id = p_session_id and staff_id = v_staff) then
    raise exception 'ATT_NOT_ASSIGNED' using errcode = 'P0001';
  end if;
  if now() < v_session.starts_at - interval '15 minutes' then
    raise exception 'ATT_TOO_EARLY' using errcode = 'P0001';
  end if;
  v_policy := app.policy_for(v_session.department_id);
  if v_reg.state in ('locked', 'voided')
     or (v_reg.state = 'reopened' and v_reg.reopen_until < now())
     or (v_reg.state = 'submitted' and now() > v_reg.submitted_at + make_interval(hours => v_policy.edit_window_hours)) then
    return jsonb_build_object('result', 'locked', 'register', to_jsonb(v_reg));
  end if;

  -- 4. optimistic concurrency for edits
  if v_reg.state in ('submitted', 'reopened') and v_reg.version > 0 and p_base_version is distinct from v_reg.version then
    return jsonb_build_object(
      'result', 'conflict',
      'register', to_jsonb(v_reg),
      'records', (select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'status', status_code)), '[]')
                  from public.attendance_records where session_id = p_session_id)
    );
  end if;

  -- 5. validate the submitted student set and statuses
  drop table if exists _input, _roster, _merged;
  create temp table _input on commit drop as
  select (x ->> 'student_id')::uuid as student_id, x ->> 'status' as status,
         coalesce((x ->> 'marked_at')::timestamptz, now()) as marked_at
  from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) x;
  create temp table _roster on commit drop as select * from app.roster(p_session_id);

  if exists (select 1 from _input i where not exists (select 1 from _roster r where r.student_id = i.student_id)) then
    raise exception 'ATT_UNKNOWN_STUDENT' using errcode = 'P0001';
  end if;
  if exists (select 1 from _input i left join public.attendance_status_codes c on c.code = i.status
             where c.code is null or not c.professor_can_set or not c.is_active) then
    raise exception 'ATT_INVALID_STATUS' using errcode = 'P0001';
  end if;

  v_weight := v_session.attendance_weight * case v_policy.count_mode
    when 'hours' then round((extract(epoch from v_session.ends_at - v_session.starts_at) / 3600)::numeric, 2) else 1 end;

  create temp table _merged on commit drop as
  select r.student_id, r.division_id, r.batch_id,
         coalesce(i.status, r.suggested_status, v_policy.default_unmarked_status) as status,
         i.student_id is null as defaulted,
         coalesce(i.marked_at, now()) as marked_at
  from _roster r left join _input i on i.student_id = r.student_id;

  select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'status', status)), '[]') into v_defaulted
  from _merged where defaulted;

  -- 6. history for changed records, then upsert with context snapshots
  insert into public.attendance_record_history (record_id, session_id, student_id, old_status, new_status, source, changed_by)
  select ar.id, ar.session_id, ar.student_id, ar.status_code, m.status, 'manual', auth.uid()
  from _merged m join public.attendance_records ar on ar.session_id = p_session_id and ar.student_id = m.student_id
  where ar.status_code <> m.status;

  insert into public.attendance_records (session_id, student_id, status_code, source, marked_by, marked_at,
    division_id, batch_id, department_id, term_id, session_date, offering_id, component, weight)
  select p_session_id, m.student_id, m.status, case when m.defaulted then 'default' else 'manual' end, auth.uid(), m.marked_at,
         coalesce(m.division_id, v_session.division_id), m.batch_id, v_session.department_id, v_session.term_id,
         v_session.session_date, v_session.offering_id, v_session.component, v_weight
  from _merged m
  on conflict (session_id, student_id) do update
    set status_code = excluded.status_code, source = excluded.source, marked_by = excluded.marked_by, marked_at = excluded.marked_at
    where public.attendance_records.status_code is distinct from excluded.status_code;

  v_first := v_reg.submitted_at is null;
  update public.attendance_registers set
    state = 'submitted',
    version = version + 1,
    submitted_by = v_staff,
    submitted_at = now(),
    client_submission_id = p_client_submission_id,
    client_marked_at = p_client_marked_at,
    device_id = p_device_id,
    present_count = (select count(*) from _merged m join public.attendance_status_codes c on c.code = m.status where c.counts_as_attended),
    total_count = (select count(*) from _merged),
    is_late = case when v_first then now() > v_session.ends_at + make_interval(mins => v_policy.missing_grace_minutes) else is_late end
  where session_id = p_session_id
  returning * into v_reg;

  update public.class_sessions set status = 'held' where id = p_session_id and status = 'scheduled';

  -- 7. summaries
  perform app.recompute_summaries(array(select student_id from _merged), v_session.offering_id);

  -- 8. events: absence alerts to verified guardians, silent publish to students
  perform app.enqueue('push', g.user_id, 'student_marked_absent',
            jsonb_build_object('session_id', p_session_id, 'student_id', m.student_id),
            format('absent:%s:%s:%s', p_session_id, m.student_id, g.user_id))
  from _merged m
  join public.guardian_links gl on gl.student_id = m.student_id and gl.status = 'verified'
  join public.guardians g on g.id = gl.guardian_id and g.user_id is not null
  where m.status = 'A';

  v_result := jsonb_build_object('result', 'ok', 'register', to_jsonb(v_reg), 'defaulted_students', v_defaulted);
  update public.attendance_registers set last_result = v_result where session_id = p_session_id;
  return v_result;
end $$;

-- ── Locking (pg_cron every 15 min) ───────────────────────────────────────
create or replace function public.lock_registers() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.attendance_registers g set state = 'locked', locked_at = now()
  from public.class_sessions s
  where s.id = g.session_id
    and (
      (g.state in ('pending', 'submitted')
        and now() > s.ends_at + make_interval(hours => (app.policy_for(s.department_id)).lock_after_hours))
      or (g.state = 'reopened' and g.reopen_until < now())
    );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Missing = still pending after the grace period, or locked without a submission.
create or replace function app.register_is_missing(p_state text, p_submitted_at timestamptz, p_ends_at timestamptz) returns boolean
language sql immutable as $$
  select (p_state = 'pending' and now() > p_ends_at + interval '30 minutes')
      or (p_state = 'locked' and p_submitted_at is null)
$$;

-- ── Reopen, nudge (§8.6) ─────────────────────────────────────────────────
create or replace function public.reopen_register(p_session uuid, p_reason text, p_hours integer default 24) returns void
language plpgsql security definer set search_path = '' as $$
declare v_session public.class_sessions; v_reg public.attendance_registers;
begin
  select * into v_session from public.class_sessions where id = p_session;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('attendance.reopen', v_session.department_id);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into v_reg from public.attendance_registers where session_id = p_session for update;
  if v_reg.state not in ('locked', 'pending') then raise exception 'ATT_NOT_REOPENABLE' using errcode = 'P0001'; end if;
  update public.attendance_registers
     set state = 'reopened', reopened_by = auth.uid(), reopened_at = now(), reopen_reason = p_reason,
         reopen_until = now() + make_interval(hours => greatest(1, least(p_hours, 168)))
   where session_id = p_session;
  perform app.enqueue('push', st.user_id, 'register_reopened', jsonb_build_object('session_id', p_session), format('reopen:%s:%s', p_session, now()::date))
  from public.session_staff ss join public.staff st on st.id = ss.staff_id where ss.session_id = p_session and st.user_id is not null;
  perform app.audit('attendance.register.reopened', 'attendance_registers', p_session::text,
    format('Reopened register for %s', v_session.session_date), jsonb_build_object('state', v_reg.state), jsonb_build_object('state', 'reopened'), p_reason);
end $$;

create or replace function public.nudge_register(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_session public.class_sessions;
begin
  select * into v_session from public.class_sessions where id = p_session;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('attendance.view', v_session.department_id);
  update public.attendance_registers set nudged_at = now() where session_id = p_session and state = 'pending';
  perform app.enqueue('push', st.user_id, 'register_missing', jsonb_build_object('session_id', p_session), format('miss:%s', p_session))
  from public.session_staff ss join public.staff st on st.id = ss.staff_id where ss.session_id = p_session and st.user_id is not null;
end $$;

-- ── Corrections and overrides (§8.6) ────────────────────────────────────
create or replace function app.apply_status_change(p_session uuid, p_student uuid, p_status text, p_source text, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_old text; v_record uuid; v_session public.class_sessions;
begin
  select * into v_session from public.class_sessions where id = p_session;
  select id, status_code into v_record, v_old from public.attendance_records where session_id = p_session and student_id = p_student for update;
  if v_record is null then raise exception 'ATT_NO_RECORD' using errcode = 'P0001'; end if;
  if v_old = p_status then return v_old; end if;
  update public.attendance_records set status_code = p_status, source = p_source, marked_by = auth.uid(), marked_at = now() where id = v_record;
  insert into public.attendance_record_history (record_id, session_id, student_id, old_status, new_status, source, changed_by, reason)
  values (v_record, p_session, p_student, v_old, p_status, p_source, auth.uid(), p_reason);
  update public.attendance_registers set
    present_count = (select count(*) from public.attendance_records r join public.attendance_status_codes c on c.code = r.status_code
                     where r.session_id = p_session and c.counts_as_attended)
  where session_id = p_session;
  perform app.recompute_summaries(array[p_student], v_session.offering_id);
  perform app.enqueue('push', g.user_id, 'attendance_corrected', jsonb_build_object('session_id', p_session, 'student_id', p_student, 'status', p_status),
                      format('corr:%s:%s:%s', v_record, now(), g.user_id))
  from public.guardian_links gl join public.guardians g on g.id = gl.guardian_id
  where gl.student_id = p_student and gl.status = 'verified' and g.user_id is not null;
  return v_old;
end $$;

create or replace function public.decide_correction(p_request uuid, p_decision text, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_req public.attendance_correction_requests; v_name text;
begin
  select * into v_req from public.attendance_correction_requests where id = p_request for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('attendance.correct.approve', app.student_department(v_req.student_id));
  if v_req.status <> 'pending' then raise exception 'ALREADY_DECIDED' using errcode = 'P0001'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  if p_decision = 'approved' then
    perform app.apply_status_change(v_req.session_id, v_req.student_id, v_req.to_status, 'correction', v_req.reason);
  end if;
  update public.attendance_correction_requests
     set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = p_request;
  select full_name into v_name from public.students where id = v_req.student_id;
  perform app.audit('attendance.correction.' || p_decision, 'attendance_records', p_request::text,
    format('%s correction %s → %s for %s', initcap(p_decision), v_req.from_status, v_req.to_status, v_name),
    jsonb_build_object('status', v_req.from_status),
    jsonb_build_object('status', case when p_decision = 'approved' then v_req.to_status else v_req.from_status end),
    coalesce(nullif(trim(p_note), ''), v_req.reason));
  return p_decision;
end $$;

create or replace function public.override_attendance(p_session uuid, p_student uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_department uuid; v_old text;
begin
  select department_id into v_department from public.class_sessions where id = p_session;
  if v_department is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('attendance.override', v_department);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  v_old := app.apply_status_change(p_session, p_student, p_status, 'override', p_reason);
  perform app.audit('attendance.override', 'attendance_records', p_session::text || ':' || p_student::text,
    format('Override %s → %s', v_old, p_status), jsonb_build_object('status', v_old), jsonb_build_object('status', p_status), p_reason);
end $$;

-- ── Session changes (§8.8) ───────────────────────────────────────────────
create or replace function public.cancel_session(p_session uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_session public.class_sessions; v_reg public.attendance_registers;
begin
  select * into v_session from public.class_sessions where id = p_session for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('sessions.manage', v_session.department_id);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if v_session.status = 'cancelled' then return; end if;
  if v_session.session_date < app.today() then raise exception 'SESSION_PAST' using errcode = 'P0001'; end if;

  select * into v_reg from public.attendance_registers where session_id = p_session for update;
  update public.class_sessions set status = 'cancelled', cancel_reason = p_reason where id = p_session;
  if v_reg.state in ('submitted', 'locked', 'reopened') then
    -- marked already: void the register so its records stop counting
    update public.attendance_registers set state = 'voided' where session_id = p_session;
    perform app.recompute_summaries(array(select student_id from public.attendance_records where session_id = p_session), v_session.offering_id);
  end if;

  perform app.enqueue('push', p.user_id, 'session_cancelled', jsonb_build_object('session_id', p_session, 'reason', p_reason),
                      format('tt:%s:%s', p_session, p.user_id))
  from (
    select st.user_id from public.session_staff ss join public.staff st on st.id = ss.staff_id where ss.session_id = p_session
    union
    select s.user_id from app.roster(p_session) r join public.students s on s.id = r.student_id
  ) p where p.user_id is not null;

  perform app.audit('session.cancelled', 'class_sessions', p_session::text,
    format('Cancelled session on %s', v_session.session_date), jsonb_build_object('status', v_session.status),
    jsonb_build_object('status', 'cancelled'), p_reason);
end $$;

create or replace function public.assign_substitute(p_session uuid, p_staff uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_session public.class_sessions; v_name text;
begin
  select * into v_session from public.class_sessions where id = p_session;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('sessions.manage', v_session.department_id);
  if v_session.status = 'cancelled' then raise exception 'ATT_CANCELLED' using errcode = 'P0001'; end if;
  select full_name into v_name from public.staff where id = p_staff and status = 'active';
  if v_name is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  delete from public.session_staff where session_id = p_session and role = 'substitute';
  insert into public.session_staff (session_id, staff_id, role) values (p_session, p_staff, 'substitute')
  on conflict (session_id, staff_id) do update set role = 'substitute';
  perform app.enqueue('push', st.user_id, 'substitute_assigned', jsonb_build_object('session_id', p_session), format('sub:%s:%s', p_session, p_staff))
  from public.staff st where st.id = p_staff and st.user_id is not null;
  perform app.audit('session.substitute.assigned', 'session_staff', p_session::text,
    format('%s substitutes on %s', v_name, v_session.session_date), null, jsonb_build_object('substitute', v_name), null);
end $$;

create or replace function public.reschedule_session(p_session uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_session public.class_sessions; v_new uuid;
begin
  select * into v_session from public.class_sessions where id = p_session for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('sessions.manage', v_session.department_id);
  if v_session.status <> 'scheduled' then raise exception 'ATT_NOT_RESCHEDULABLE' using errcode = 'P0001'; end if;
  if p_ends_at <= p_starts_at or p_starts_at < now() then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  update public.class_sessions set status = 'rescheduled', cancel_reason = p_reason where id = p_session;
  insert into public.class_sessions (session_date, starts_at, ends_at, teaching_group_id, offering_id, component, session_type, room_label,
    rescheduled_from_id, attendance_weight, department_id, term_id, division_id, batch_id)
  values ((p_starts_at at time zone 'Asia/Kolkata')::date, p_starts_at, p_ends_at, v_session.teaching_group_id, v_session.offering_id,
    v_session.component, v_session.session_type, v_session.room_label, p_session, v_session.attendance_weight,
    v_session.department_id, v_session.term_id, v_session.division_id, v_session.batch_id)
  returning id into v_new;
  insert into public.session_staff (session_id, staff_id, role) select v_new, staff_id, role from public.session_staff where session_id = p_session;
  insert into public.attendance_registers (session_id) values (v_new);
  perform app.audit('session.rescheduled', 'class_sessions', p_session::text,
    format('Rescheduled session from %s to %s', v_session.starts_at, p_starts_at), null, jsonb_build_object('new_session', v_new), p_reason);
  return v_new;
end $$;

-- ── Timetable validation and publishing (§11.7) ─────────────────────────
create or replace function public.validate_timetable(p_version uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with v as (select * from public.timetable_versions where id = p_version),
  mine as (
    select sl.*, g.kind, g.division_id, g.batch_id, st.full_name as staff_name
    from public.timetable_slots sl
    join public.teaching_groups g on g.id = sl.teaching_group_id
    join public.staff st on st.id = sl.staff_id
    where sl.version_id = p_version
  ),
  others as (
    -- slots of every other live version in the same term
    select sl.*, g.kind, g.division_id, g.batch_id
    from public.timetable_slots sl
    join public.timetable_versions tv on tv.id = sl.version_id
    join public.teaching_groups g on g.id = sl.teaching_group_id
    join v on tv.term_id = v.term_id
    where tv.status = 'published' and not (tv.department_id = v.department_id and tv.program_year = v.program_year)
  ),
  everything as (select id, weekday, starts_at, ends_at, staff_id, room_label, teaching_group_id, kind, division_id, batch_id from mine
                 union all select id, weekday, starts_at, ends_at, staff_id, room_label, teaching_group_id, kind, division_id, batch_id from others),
  issues as (
    select 'error' as severity, 'professor_double_booked' as code,
           format('%s is double-booked on day %s at %s', a.staff_name, a.weekday, to_char(a.starts_at, 'HH24:MI')) as message
    from mine a join everything b on b.id <> a.id and b.staff_id = a.staff_id and b.weekday = a.weekday
      and b.starts_at < a.ends_at and a.starts_at < b.ends_at and b.teaching_group_id <> a.teaching_group_id
    union
    select 'error', 'group_double_booked',
           format('Division or batch has two sessions on day %s at %s', a.weekday, to_char(a.starts_at, 'HH24:MI'))
    from mine a join mine b on b.id < a.id and b.weekday = a.weekday and b.starts_at < a.ends_at and a.starts_at < b.ends_at
      and b.division_id = a.division_id
      and (a.kind = 'division' or b.kind = 'division' or a.batch_id = b.batch_id)
    union
    select 'error', 'room_double_booked',
           format('Room %s is double-booked on day %s at %s', a.room_label, a.weekday, to_char(a.starts_at, 'HH24:MI'))
    from mine a join everything b on b.id <> a.id and b.room_label = a.room_label and b.weekday = a.weekday
      and b.starts_at < a.ends_at and a.starts_at < b.ends_at and b.teaching_group_id <> a.teaching_group_id
    where a.room_label is not null
    union
    select 'error', 'professor_not_assigned',
           format('%s is not assigned to the teaching group on day %s at %s', a.staff_name, a.weekday, to_char(a.starts_at, 'HH24:MI'))
    from mine a
    where not exists (select 1 from public.teaching_assignments ta where ta.teaching_group_id = a.teaching_group_id and ta.staff_id = a.staff_id
                      and ta.valid_during && daterange((select effective_from from v), null))
  )
  select coalesce(jsonb_agg(jsonb_build_object('severity', severity, 'code', code, 'message', message) order by message), '[]') from issues
$$;

-- Generates class_sessions + session_staff + pending registers for a version
-- from p_from to the end of its term, skipping non-working days.
create or replace function app.generate_sessions(p_version uuid, p_from date) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_term public.academic_terms; v_count integer;
begin
  select t.* into v_term from public.academic_terms t join public.timetable_versions v on v.term_id = t.id where v.id = p_version;
  with days as (
    select d::date as day from generate_series(greatest(p_from, v_term.start_date), v_term.end_date, interval '1 day') d
    where app.is_working_day(d::date)
  ),
  ins as (
    insert into public.class_sessions (session_date, starts_at, ends_at, teaching_group_id, offering_id, component, session_type,
      room_label, source_slot_id, source_version_id, department_id, term_id, division_id, batch_id)
    select days.day,
           (days.day + sl.starts_at) at time zone 'Asia/Kolkata',
           (days.day + sl.ends_at) at time zone 'Asia/Kolkata',
           sl.teaching_group_id, g.offering_id, g.component, sl.session_type, sl.room_label, sl.id, p_version,
           o.department_id, o.term_id, g.division_id, g.batch_id
    from public.timetable_slots sl
    join days on extract(isodow from days.day) = sl.weekday
    join public.teaching_groups g on g.id = sl.teaching_group_id
    join public.subject_offerings o on o.id = g.offering_id
    where sl.version_id = p_version
    returning id, source_slot_id
  ),
  staffed as (
    insert into public.session_staff (session_id, staff_id, role)
    select ins.id, sl.staff_id, 'primary' from ins join public.timetable_slots sl on sl.id = ins.source_slot_id
    returning session_id
  )
  insert into public.attendance_registers (session_id) select session_id from staffed;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.publish_timetable(p_version uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.timetable_versions;
  v_prev public.timetable_versions;
  v_from date;
  v_removed integer := 0;
  v_created integer;
  v_issues jsonb;
  v_code text;
begin
  select * into v from public.timetable_versions where id = p_version for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.require('timetable.publish', v.department_id);
  if v.status <> 'draft' then raise exception 'TT_NOT_DRAFT' using errcode = 'P0001'; end if;
  v_issues := public.validate_timetable(p_version);
  if exists (select 1 from jsonb_array_elements(v_issues) i where i ->> 'severity' = 'error') then
    raise exception 'TT_CONFLICTS' using errcode = 'P0001', detail = v_issues::text;
  end if;

  v_from := greatest(v.effective_from, app.today());
  select * into v_prev from public.timetable_versions
  where term_id = v.term_id and department_id = v.department_id and program_year = v.program_year and status = 'published' for update;

  if found then
    -- Republish rule (§8.8): only future sessions that are still pending and untouched are regenerated.
    with doomed as (
      select s.id from public.class_sessions s
      join public.attendance_registers g on g.session_id = s.id and g.state = 'pending' and g.version = 0
      where s.source_version_id = v_prev.id and s.session_date >= v_from and s.status = 'scheduled'
        and not exists (select 1 from public.session_staff ss where ss.session_id = s.id and ss.role <> 'primary')
        and not exists (select 1 from public.attendance_records r where r.session_id = s.id)
    ),
    d1 as (delete from public.attendance_registers where session_id in (select id from doomed)),
    d2 as (delete from public.session_staff where session_id in (select id from doomed))
    delete from public.class_sessions where id in (select id from doomed);
    get diagnostics v_removed = row_count;
    update public.timetable_versions set status = 'archived' where id = v_prev.id;
  end if;

  update public.timetable_versions set status = 'published', published_by = auth.uid(), published_at = now() where id = p_version;
  v_created := app.generate_sessions(p_version, v_from);

  select code into v_code from public.departments where id = v.department_id;
  perform app.enqueue('push', s.user_id, 'timetable_changed', jsonb_build_object('version_id', p_version), format('tt:%s:%s', p_version, s.user_id))
  from public.student_enrollments e join public.students s on s.id = e.student_id
  where e.department_id = v.department_id and e.program_year = v.program_year and e.term_id = v.term_id
    and e.valid_during @> app.today() and s.user_id is not null;

  perform app.audit('timetable.published', 'timetable_versions', p_version::text,
    format('Published %s %s timetable revision %s: %s sessions generated, %s replaced', v.program_year, v_code, v.revision, v_created, v_removed),
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'published', 'effective_from', v_from));
  return jsonb_build_object('created', v_created, 'replaced', v_removed);
end $$;

-- ── Leave decisions (§8.7) ───────────────────────────────────────────────
create or replace function public.decide_leave(p_request uuid, p_decision text, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_req public.leave_requests; v_policy public.attendance_policies; v_name text; v_changed integer := 0; r record;
begin
  select * into v_req from public.leave_requests where id = p_request for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not app.is_class_teacher_of(v_req.student_id) then
    perform app.require('leave.student.decide', app.student_department(v_req.student_id));
  end if;
  if v_req.status not in ('pending', 'needs_info') then raise exception 'ALREADY_DECIDED' using errcode = 'P0001'; end if;
  if p_decision not in ('approved', 'rejected', 'needs_info') then raise exception 'VALIDATION' using errcode = 'P0001'; end if;

  update public.leave_requests set status = p_decision,
    decided_by = case when p_decision = 'needs_info' then decided_by else auth.uid() end,
    decided_at = case when p_decision = 'needs_info' then decided_at else now() end,
    decision_note = nullif(trim(p_note), '')
  where id = p_request;

  if p_decision = 'approved' then
    insert into public.leave_request_sessions (leave_request_id, session_id)
    select p_request, s.id from public.class_sessions s
    where s.session_date between v_req.from_date and v_req.to_date
      and tstzrange(s.starts_at, s.ends_at) && v_req.leave_period
      and s.status <> 'cancelled'
      and exists (select 1 from app.roster(s.id) ro where ro.student_id = v_req.student_id)
    on conflict do nothing;

    v_policy := app.policy_for(app.student_department(v_req.student_id));
    if v_policy.leave_applies_retroactively then
      for r in
        select ar.session_id from public.attendance_records ar
        join public.leave_request_sessions ls on ls.session_id = ar.session_id and ls.leave_request_id = p_request
        where ar.student_id = v_req.student_id and ar.status_code = 'A'
      loop
        perform app.apply_status_change(r.session_id, v_req.student_id, 'L', 'leave', 'Approved leave');
        v_changed := v_changed + 1;
      end loop;
    end if;
  end if;

  perform app.enqueue('push', g.user_id, 'leave_decided', jsonb_build_object('leave_id', p_request, 'decision', p_decision),
                      format('leave:%s:%s:%s', p_request, p_decision, g.user_id))
  from public.guardian_links gl join public.guardians g on g.id = gl.guardian_id
  where gl.student_id = v_req.student_id and gl.status = 'verified' and g.user_id is not null;

  select full_name into v_name from public.students where id = v_req.student_id;
  perform app.audit('leave.' || p_decision, 'leave_requests', p_request::text,
    format('%s leave for %s (%s – %s)%s', case p_decision when 'approved' then 'Approved' when 'rejected' then 'Rejected' else 'Asked for more information on' end,
           v_name, v_req.from_date, v_req.to_date, case when v_changed > 0 then format(', %s past A → L', v_changed) else '' end),
    jsonb_build_object('status', v_req.status), jsonb_build_object('status', p_decision), p_note);
  return p_decision;
end $$;

create or replace function public.decide_staff_leave(p_request uuid, p_decision text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_req public.staff_leave_requests; v_staff public.staff;
begin
  select * into v_req from public.staff_leave_requests where id = p_request for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into v_staff from public.staff where id = v_req.staff_id;
  perform app.require('leave.staff.decide', v_staff.home_department_id);
  if v_req.staff_id = app.my_staff_id() then raise exception 'OWN_LEAVE' using errcode = 'P0001'; end if;
  if v_req.status <> 'pending' then raise exception 'ALREADY_DECIDED' using errcode = 'P0001'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  update public.staff_leave_requests set status = p_decision, decided_by = auth.uid(), decided_at = now() where id = p_request;
  perform app.audit('staff_leave.' || p_decision, 'staff_leave_requests', p_request::text,
    format('%s %s leave for %s', initcap(p_decision), v_req.leave_type, v_staff.full_name),
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', p_decision));
  return p_decision;
end $$;
