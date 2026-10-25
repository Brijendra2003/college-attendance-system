-- Read models for dashboards, grids and reports (§10.3, §11.10, §11.13).
-- Views use security_invoker and functions are SECURITY INVOKER, so the
-- caller's RLS scopes every row: an HOD only ever aggregates their department.

create or replace function app.division_label(p_program_year text, p_department_code text, p_code text) returns text
language sql immutable as $$ select p_program_year || ' ' || p_department_code || '-' || p_code $$;

-- ── Divisions with counts ────────────────────────────────────────────────
create or replace view public.v_divisions with (security_invoker = true) as
select dv.id, dv.academic_year_id, dv.department_id, d.code as department_code, dv.program_year, dv.code, dv.capacity, dv.room_label,
       app.division_label(dv.program_year, d.code, dv.code) as label,
       (select count(*) from public.student_enrollments e join public.students s on s.id = e.student_id and s.status = 'active'
         where e.division_id = dv.id and e.is_primary and e.valid_during @> app.today()) as students,
       (select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code,
                 'students', (select count(*) from public.student_enrollments e join public.students s on s.id = e.student_id and s.status = 'active'
                              where e.batch_id = b.id and e.is_primary and e.valid_during @> app.today())) order by b.code)
        from public.batches b where b.division_id = dv.id) as batches,
       ct.staff_id as class_teacher_id, st.full_name as class_teacher_name
from public.divisions dv
join public.departments d on d.id = dv.department_id
left join public.class_teacher_assignments ct on ct.division_id = dv.id and ct.valid_during @> app.today()
left join public.staff_directory st on st.id = ct.staff_id
where dv.archived_at is null;

-- ── Sessions with register state ─────────────────────────────────────────
create or replace view public.v_sessions with (security_invoker = true) as
select s.id, s.session_date, s.starts_at, s.ends_at,
       to_char(s.starts_at at time zone 'Asia/Kolkata', 'HH24:MI') as start_time,
       to_char(s.ends_at at time zone 'Asia/Kolkata', 'HH24:MI') as end_time,
       s.department_id, d.code as department_code, s.division_id,
       app.division_label(dv.program_year, d.code, dv.code) as division_label, dv.program_year,
       s.batch_id, b.code as batch_code, s.component, s.session_type, s.room_label, s.status, s.cancel_reason,
       sub.code as subject_code, sub.name as subject_name, s.offering_id, s.teaching_group_id,
       ps.staff_id as staff_id, pst.full_name as staff_name, ss.staff_id as substitute_id, sst.full_name as substitute_name,
       g.state as register_state, g.version as register_version, g.submitted_at, g.is_late, g.present_count, g.total_count,
       g.nudged_at, g.reopen_until,
       case
         when s.status = 'cancelled' then 'cancelled'
         when g.state in ('submitted', 'locked') and g.submitted_at is not null then 'submitted'
         when g.state = 'reopened' then 'reopened'
         when g.state = 'voided' then 'voided'
         when app.register_is_missing(g.state, g.submitted_at, s.ends_at) then 'missing'
         when now() < s.starts_at then 'upcoming'
         else 'pending'
       end as display_state
from public.class_sessions s
join public.departments d on d.id = s.department_id
join public.divisions dv on dv.id = s.division_id
left join public.batches b on b.id = s.batch_id
join public.subject_offerings o on o.id = s.offering_id
join public.subjects sub on sub.id = o.subject_id
left join public.attendance_registers g on g.session_id = s.id
left join public.session_staff ps on ps.session_id = s.id and ps.role = 'primary'
left join public.staff_directory pst on pst.id = ps.staff_id
left join public.session_staff ss on ss.session_id = s.id and ss.role = 'substitute'
left join public.staff_directory sst on sst.id = ss.staff_id
where s.status <> 'rescheduled';

-- ── Student standing (from summaries) ────────────────────────────────────
create or replace view public.v_student_standing with (security_invoker = true) as
select a.student_id,
       sum(a.held) as held, sum(a.attended) as attended,
       case when sum(a.held) > 0 then round(100 * sum(a.attended) / sum(a.held), 2) end as percent,
       min(a.percent) as lowest,
       count(*) filter (where a.percent < (select min_percent from public.attendance_policies where scope = 'college' and effective_to is null)) as short_subjects
from public.attendance_summaries a
group by a.student_id;

create or replace view public.v_students with (security_invoker = true) as
select s.id, s.enrollment_no, s.prn, s.full_name, s.gender, s.dob, s.email, s.phone, s.admission_year, s.admission_type, s.status,
       coalesce(e.department_id, s.admitted_department_id) as department_id, d.code as department_code,
       e.id as enrollment_id, e.program_year, e.semester, e.division_id, e.batch_id, e.roll_no, e.enrollment_type,
       app.division_label(dv.program_year, d.code, dv.code) as division_label, b.code as batch_code,
       (select gl.status from public.guardian_links gl where gl.student_id = s.id order by gl.is_primary desc, gl.created_at limit 1) as guardian_status,
       st.percent, st.lowest, st.short_subjects, st.held, st.attended
from public.students s
left join public.student_enrollments e on e.student_id = s.id and e.is_primary and e.valid_during @> app.today()
left join public.departments d on d.id = coalesce(e.department_id, s.admitted_department_id)
left join public.divisions dv on dv.id = e.division_id
left join public.batches b on b.id = e.batch_id
left join public.v_student_standing st on st.student_id = s.id;

-- ── Staff ────────────────────────────────────────────────────────────────
create or replace view public.v_staff with (security_invoker = true) as
select st.id, st.employee_id, st.full_name, st.designation, st.home_department_id as department_id, d.code as department_code,
       st.email, st.phone, st.joined_on, st.status, st.user_id,
       exists (select 1 from public.department_staff ds where ds.staff_id = st.id and ds.role = 'hod' and ds.valid_during @> app.today()) as is_hod,
       coalesce((select sum(extract(epoch from sl.ends_at - sl.starts_at) / 3600)
                 from public.timetable_slots sl join public.timetable_versions v on v.id = sl.version_id and v.status = 'published'
                 where sl.staff_id = st.id), 0)::numeric(5, 1) as weekly_hours,
       (select string_agg(app.division_label(dv.program_year, dd.code, dv.code), ', ')
          from public.class_teacher_assignments ct join public.divisions dv on dv.id = ct.division_id join public.departments dd on dd.id = dv.department_id
         where ct.staff_id = st.id and ct.valid_during @> app.today()) as class_teacher_of
from public.staff st
left join public.departments d on d.id = st.home_department_id;

-- ── Dashboard functions ──────────────────────────────────────────────────
create or replace function public.recent_working_days(p_n integer, p_upto date default null) returns setof date
language sql stable set search_path = '' as $$
  select d from (
    select d::date as d from generate_series(coalesce(p_upto, app.today()) - (p_n * 3 + 14), coalesce(p_upto, app.today()), interval '1 day') d
    where app.is_working_day(d::date) and exists (select 1 from public.class_sessions s where s.session_date = d::date)
    order by d desc limit p_n
  ) x order by d
$$;

create or replace function public.reference_date() returns date
language sql stable set search_path = '' as $$
  select coalesce((select max(x.d) from public.recent_working_days(1) x(d)), app.today())
$$;

create or replace function public.register_counts(p_date date, p_department uuid default null) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'total', count(*),
    'held', count(*) filter (where display_state = 'submitted'),
    'pending', count(*) filter (where display_state = 'pending'),
    'upcoming', count(*) filter (where display_state = 'upcoming'),
    'missing', count(*) filter (where display_state = 'missing'),
    'cancelled', count(*) filter (where display_state = 'cancelled'),
    'reopened', count(*) filter (where display_state = 'reopened'),
    'late', count(*) filter (where is_late),
    'present', coalesce(sum(present_count) filter (where display_state in ('submitted', 'reopened')), 0),
    'roster', coalesce(sum(total_count) filter (where display_state in ('submitted', 'reopened')), 0)
  )
  from public.v_sessions where session_date = p_date and (p_department is null or department_id = p_department)
$$;

create or replace function public.daily_trend(p_days integer, p_department uuid default null)
returns table (day date, present bigint, total bigint, percent numeric)
language sql stable set search_path = '' as $$
  select d.d, coalesce(sum(g.present_count), 0), coalesce(sum(g.total_count), 0),
         case when sum(g.total_count) > 0 then round(100.0 * sum(g.present_count) / sum(g.total_count), 1) end
  from public.recent_working_days(p_days) d(d)
  left join public.class_sessions s on s.session_date = d.d and s.status <> 'cancelled' and (p_department is null or s.department_id = p_department)
  left join public.attendance_registers g on g.session_id = s.id and g.submitted_at is not null and g.state in ('submitted', 'locked', 'reopened')
  group by d.d order by d.d
$$;

create or replace function public.branch_stats()
returns table (department_id uuid, code text, name text, students bigint, percent numeric, shortage bigint)
language sql stable set search_path = '' as $$
  select d.id, d.code, d.name, count(st.student_id), round(avg(st.percent), 1),
         count(*) filter (where st.lowest < (select min_percent from public.attendance_policies where scope = 'college' and effective_to is null))
  from public.departments d
  left join public.student_enrollments e on e.department_id = d.id and e.is_primary and e.valid_during @> app.today()
  left join public.v_student_standing st on st.student_id = e.student_id
  where d.is_active
  group by d.id, d.code, d.name, d.sort_order order by d.sort_order, d.code
$$;

create or replace function public.division_stats(p_department uuid default null, p_program_year text default null)
returns table (division_id uuid, label text, department_code text, program_year text, students bigint, percent numeric, shortage bigint)
language sql stable set search_path = '' as $$
  select dv.id, dv.label, dv.department_code, dv.program_year, count(st.student_id), round(avg(st.percent), 1),
         count(*) filter (where st.lowest < (select min_percent from public.attendance_policies where scope = 'college' and effective_to is null))
  from public.v_divisions dv
  join public.academic_years y on y.id = dv.academic_year_id and y.status = 'active'
  left join public.student_enrollments e on e.division_id = dv.id and e.is_primary and e.valid_during @> app.today()
  left join public.v_student_standing st on st.student_id = e.student_id
  where (p_department is null or dv.department_id = p_department) and (p_program_year is null or dv.program_year = p_program_year)
  group by dv.id, dv.label, dv.department_code, dv.program_year
  order by dv.label
$$;

create or replace function public.division_daily_rates(p_days integer, p_department uuid default null, p_program_year text default null)
returns table (division_id uuid, label text, day date, percent numeric)
language sql stable set search_path = '' as $$
  select dv.id, dv.label, d.d,
         case when sum(g.total_count) > 0 then round(100.0 * sum(g.present_count) / sum(g.total_count), 1) end
  from public.v_divisions dv
  join public.academic_years y on y.id = dv.academic_year_id and y.status = 'active'
  cross join public.recent_working_days(p_days) d(d)
  left join public.class_sessions s on s.division_id = dv.id and s.session_date = d.d and s.status <> 'cancelled'
  left join public.attendance_registers g on g.session_id = s.id and g.submitted_at is not null and g.state in ('submitted', 'locked', 'reopened')
  where (p_department is null or dv.department_id = p_department) and (p_program_year is null or dv.program_year = p_program_year)
  group by dv.id, dv.label, d.d order by dv.label, d.d
$$;

create or replace function public.component_split(p_days integer, p_department uuid default null)
returns table (component text, present bigint, total bigint)
language sql stable set search_path = '' as $$
  select case when s.component = 'PR' then 'PR' else 'TH' end, sum(g.present_count), sum(g.total_count)
  from public.class_sessions s
  join public.attendance_registers g on g.session_id = s.id and g.submitted_at is not null and g.state in ('submitted', 'locked', 'reopened')
  where s.session_date in (select * from public.recent_working_days(p_days)) and s.status <> 'cancelled'
    and (p_department is null or s.department_id = p_department)
  group by 1
$$;

create or replace function public.faculty_submission(p_days integer, p_department uuid default null)
returns table (staff_id uuid, full_name text, designation text, department_code text,
               on_time bigint, late bigint, missing bigint, pending bigint, total bigint, on_time_percent numeric)
language sql stable set search_path = '' as $$
  select v.staff_id, st.full_name, st.designation, v.department_code,
         count(*) filter (where v.display_state = 'submitted' and not v.is_late),
         count(*) filter (where v.display_state = 'submitted' and v.is_late),
         count(*) filter (where v.display_state = 'missing'),
         count(*) filter (where v.display_state = 'pending'),
         count(*),
         round(100.0 * count(*) filter (where v.display_state = 'submitted' and not v.is_late) / nullif(count(*), 0), 1)
  from public.v_sessions v
  join public.staff_directory st on st.id = v.staff_id
  where v.session_date in (select * from public.recent_working_days(p_days))
    and v.display_state not in ('cancelled', 'upcoming', 'voided')
    and (p_department is null or v.department_id = p_department)
  group by v.staff_id, st.full_name, st.designation, v.department_code
  order by 10 nulls first, 2
$$;

-- Shortage / warning list (eligibility basis per subject × component).
create or replace function public.shortage_list(p_band text default 'shortage', p_department uuid default null,
                                                p_program_year text default null, p_division uuid default null)
returns setof public.v_students
language sql stable set search_path = '' as $$
  select v.* from public.v_students v,
    (select min_percent, warn_percent from public.attendance_policies where scope = 'college' and effective_to is null) p
  where v.status = 'active' and v.lowest is not null
    and case p_band
          when 'warning' then v.lowest >= p.min_percent and v.lowest < p.warn_percent
          when 'all' then v.lowest < p.warn_percent
          else v.lowest < p.min_percent
        end
    and (p_department is null or v.department_id = p_department)
    and (p_program_year is null or v.program_year = p_program_year)
    and (p_division is null or v.division_id = p_division)
  order by v.lowest, v.full_name
$$;

-- Student 360: per offering × component tallies with sessions left in the term.
create or replace function public.student_tallies(p_student uuid)
returns table (offering_id uuid, subject_code text, subject_name text, component text, held numeric, attended numeric,
               percent numeric, remaining bigint)
language sql stable set search_path = '' as $$
  select a.offering_id, sub.code, sub.name, a.component, a.held, a.attended, a.percent,
         (select count(*) from public.class_sessions s
          join public.teaching_groups g on g.id = s.teaching_group_id
          join public.student_enrollments e on e.student_id = p_student and e.is_primary and e.valid_during @> app.today()
          where s.offering_id = a.offering_id and s.component = a.component and s.session_date >= app.today() and s.status = 'scheduled'
            and ((g.kind = 'division' and g.division_id = e.division_id) or (g.kind = 'batch' and g.batch_id = e.batch_id)))
  from public.attendance_summaries a
  join public.subject_offerings o on o.id = a.offering_id
  join public.subjects sub on sub.id = o.subject_id
  where a.student_id = p_student
  order by sub.code, a.component desc
$$;

grant select on public.v_divisions, public.v_sessions, public.v_student_standing, public.v_students, public.v_staff to authenticated;
grant execute on function public.recent_working_days, public.reference_date, public.register_counts, public.daily_trend,
  public.branch_stats, public.division_stats, public.division_daily_rates, public.component_split, public.faculty_submission,
  public.shortage_list, public.student_tallies to authenticated;
