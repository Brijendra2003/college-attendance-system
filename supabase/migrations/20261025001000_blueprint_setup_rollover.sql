-- Blueprint versioning (§7.6), first-run setup (§11.1) and academic-year
-- rollover / promotion (§11.3).
--
-- Blueprint document (structure only, never people or timetables):
-- {
--   "departments": [{ "code": "COMP", "name": "...", "established": 1994, "active": true,
--                     "divisions": { "FE": { "count": 3, "batches": 3, "capacity": 60 }, "SE": {...}, ... } }],
--   "subjects":    [{ "code": "COMP301", "name": "...", "department": "COMP" | null, "semester": 3, "credits": 4,
--                     "elective": false, "components": [{ "kind": "TH", "hours": 3 }, { "kind": "PR", "hours": 2 }] }],
--   "periods":     [{ "label": "P1", "start": "09:00", "end": "10:00", "kind": "lecture" }],
--   "workingSaturdays": [1, 3],
--   "scheme": { "code": "MU-R2019-C", "name": "Mumbai University Rev-2019 C-Scheme" }
-- }

-- ── Archived years are read-only (§7.5) ─────────────────────────────────
create or replace function app.guard_archived() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text; v_row record;
begin
  if coalesce(current_setting('app.allow_archived_writes', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  v_row := coalesce(new, old);
  if tg_table_name in ('divisions', 'student_enrollments') then
    select status into v_status from public.academic_years where id = v_row.academic_year_id;
  else
    select status into v_status from public.academic_terms where id = v_row.term_id;
  end if;
  if v_status = 'archived' then
    raise exception 'ARCHIVED_YEAR' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger divisions_archived_guard before insert or update or delete on public.divisions
  for each row execute function app.guard_archived();
create trigger enrollments_archived_guard before insert or update or delete on public.student_enrollments
  for each row execute function app.guard_archived();
create trigger sessions_archived_guard before insert or update or delete on public.class_sessions
  for each row execute function app.guard_archived();
create trigger records_archived_guard before insert or update or delete on public.attendance_records
  for each row execute function app.guard_archived();

-- ── Validation ───────────────────────────────────────────────────────────
create or replace function public.validate_blueprint(p_doc jsonb) returns jsonb
language sql stable set search_path = '' as $$
  with d as (select x from jsonb_array_elements(coalesce(p_doc -> 'departments', '[]')) x),
       s as (select x from jsonb_array_elements(coalesce(p_doc -> 'subjects', '[]')) x),
  errors as (
    select format('Department code “%s” is invalid (2–8 capital letters)', x ->> 'code') as msg from d where coalesce(x ->> 'code', '') !~ '^[A-Z]{2,8}$'
    union all
    select format('Duplicate department code %s', x ->> 'code') from d group by x ->> 'code' having count(*) > 1
    union all
    select format('Duplicate subject code %s', x ->> 'code') from s group by x ->> 'code' having count(*) > 1
    union all
    select format('Subject %s has no components', x ->> 'code') from s where jsonb_array_length(coalesce(x -> 'components', '[]')) = 0
    union all
    select format('Subject %s belongs to unknown department %s', x ->> 'code', x ->> 'department') from s
    where x ->> 'department' is not null and not exists (select 1 from d where d.x ->> 'code' = s.x ->> 'department')
    union all
    select format('Subject %s has semester %s (must be 1–8)', x ->> 'code', x ->> 'semester') from s
    where coalesce((x ->> 'semester')::int, 0) not between 1 and 8
    union all
    select format('%s %s has %s divisions (0–10 allowed)', d.x ->> 'code', py.key, py.value ->> 'count')
    from d, jsonb_each(coalesce(d.x -> 'divisions', '{}')) py where coalesce((py.value ->> 'count')::int, 0) not between 0 and 10
    union all
    select 'At least one active department is required' where not exists (select 1 from d where coalesce((x ->> 'active')::boolean, true))
  ),
  warnings as (
    select format('%s %s has divisions without batches while practical subjects exist', d.x ->> 'code', py.key)
    from d, jsonb_each(coalesce(d.x -> 'divisions', '{}')) py
    where coalesce((py.value ->> 'count')::int, 0) > 0 and coalesce((py.value ->> 'batches')::int, 0) = 0
      and exists (select 1 from s, jsonb_array_elements(s.x -> 'components') c
                  where c ->> 'kind' = 'PR' and (s.x ->> 'department' = d.x ->> 'code' or s.x ->> 'department' is null))
    union all
    select format('%s semester %s schedules %s hours a week (more than 30)', coalesce(dep, 'FE common'), sem, hrs)
    from (
      select s.x ->> 'department' as dep, s.x ->> 'semester' as sem, sum((c ->> 'hours')::numeric) as hrs
      from s, jsonb_array_elements(s.x -> 'components') c group by 1, 2
    ) t where hrs > 30
    union all
    select format('%s %s has no subjects for its semesters', d.x ->> 'code', py.key)
    from d, jsonb_each(coalesce(d.x -> 'divisions', '{}')) py
    where coalesce((py.value ->> 'count')::int, 0) > 0
      and not exists (select 1 from s where (s.x ->> 'department' = d.x ->> 'code' or (py.key = 'FE' and s.x ->> 'department' is null))
                      and (s.x ->> 'semester')::int in (select number from public.semesters where program_year_code = py.key))
  )
  select jsonb_build_object(
    'errors', coalesce((select jsonb_agg(msg) from errors), '[]'),
    'warnings', coalesce((select jsonb_agg(msg) from (select * from warnings) w(msg)), '[]')
  )
$$;

-- ── Draft editing ────────────────────────────────────────────────────────
create or replace function public.save_blueprint_draft(p_doc jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_validation jsonb := public.validate_blueprint(p_doc); v_next integer;
begin
  perform app.require('blueprint.manage');
  select id into v_id from public.blueprint_versions where status = 'draft' for update;
  if v_id is null then
    select coalesce(max(version), 0) + 1 into v_next from public.blueprint_versions;
    insert into public.blueprint_versions (version, status, document, validation, created_by)
    values (v_next, 'draft', p_doc, v_validation, auth.uid()) returning id into v_id;
  else
    update public.blueprint_versions set document = p_doc, validation = v_validation where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'validation', v_validation);
end $$;

-- ── Activation: upsert by stable codes, deactivate, never delete ────────
create or replace function app.apply_blueprint(p_doc jsonb, p_year uuid, p_term uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb; py record; v_dept uuid; v_div uuid; v_scheme uuid; s jsonb; c jsonb; v_subject uuid;
  v_divs integer := 0; v_subjects integer := 0; v_offerings integer := 0; v_parity text; n integer;
begin
  select parity into v_parity from public.academic_terms where id = p_term;

  -- departments
  for d in select * from jsonb_array_elements(p_doc -> 'departments') loop
    insert into public.departments (code, name, established, intake, is_active, sort_order)
    values (d ->> 'code', d ->> 'name', (d ->> 'established')::smallint,
            (select coalesce(sum((v ->> 'count')::int * coalesce((v ->> 'capacity')::int, 60)), 0) from jsonb_each(d -> 'divisions') e(k, v) where k = 'FE'),
            coalesce((d ->> 'active')::boolean, true), coalesce((d ->> 'sortOrder')::smallint, 0))
    on conflict (code) do update set name = excluded.name, established = excluded.established, intake = excluded.intake,
      is_active = excluded.is_active
    returning id into v_dept;

    if coalesce((d ->> 'active')::boolean, true) and p_year is not null then
      for py in select key, value from jsonb_each(coalesce(d -> 'divisions', '{}')) loop
        for n in 1 .. coalesce((py.value ->> 'count')::int, 0) loop
          insert into public.divisions (academic_year_id, department_id, program_year, code, capacity)
          values (p_year, v_dept, py.key, chr(64 + n), coalesce((py.value ->> 'capacity')::smallint, 60))
          on conflict (academic_year_id, department_id, program_year, code) do update set capacity = excluded.capacity
          returning id into v_div;
          v_divs := v_divs + 1;
          insert into public.batches (division_id, code)
          select v_div, b::text from generate_series(1, coalesce((py.value ->> 'batches')::int, 0)) b
          on conflict do nothing;
        end loop;
      end loop;
    end if;
  end loop;
  update public.departments set is_active = false
  where code not in (select x ->> 'code' from jsonb_array_elements(p_doc -> 'departments') x);

  -- scheme + subjects + components
  insert into public.curriculum_schemes (code, name)
  values (coalesce(p_doc #>> '{scheme,code}', 'MU-R2019-C'), coalesce(p_doc #>> '{scheme,name}', 'Mumbai University Rev-2019 C-Scheme'))
  on conflict (code) do update set name = excluded.name
  returning id into v_scheme;

  for s in select * from jsonb_array_elements(coalesce(p_doc -> 'subjects', '[]')) loop
    insert into public.subjects (scheme_id, code, name, department_id, semester, credits, is_elective, is_active)
    values (v_scheme, s ->> 'code', s ->> 'name', (select id from public.departments where code = s ->> 'department'),
            (s ->> 'semester')::smallint, coalesce((s ->> 'credits')::numeric, 3), coalesce((s ->> 'elective')::boolean, false), true)
    on conflict (scheme_id, code) do update set name = excluded.name, department_id = excluded.department_id,
      semester = excluded.semester, credits = excluded.credits, is_elective = excluded.is_elective, is_active = true
    returning id into v_subject;
    delete from public.subject_components where subject_id = v_subject;
    insert into public.subject_components (subject_id, kind, weekly_hours)
    select v_subject, c2 ->> 'kind', (c2 ->> 'hours')::numeric from jsonb_array_elements(s -> 'components') c2;
    v_subjects := v_subjects + 1;
  end loop;
  update public.subjects set is_active = false
  where scheme_id = v_scheme and code not in (select x ->> 'code' from jsonb_array_elements(coalesce(p_doc -> 'subjects', '[]')) x);

  -- offerings + teaching groups for the active term
  if p_term is not null then
    insert into public.subject_offerings (subject_id, term_id, department_id, program_year)
    select sub.id, p_term, dep.id, sem.program_year_code
    from public.subjects sub
    join public.semesters sem on sem.number = sub.semester and sem.parity = v_parity
    join public.departments dep on dep.is_active and (sub.department_id = dep.id or (sub.department_id is null and sem.program_year_code = 'FE'))
    where sub.is_active and sub.scheme_id = v_scheme
      and exists (select 1 from public.divisions dv where dv.department_id = dep.id and dv.academic_year_id = p_year and dv.program_year = sem.program_year_code)
    on conflict (subject_id, term_id, department_id) do nothing;
    get diagnostics v_offerings = row_count;

    insert into public.teaching_groups (offering_id, component, kind, division_id)
    select o.id, sc.kind, 'division', dv.id
    from public.subject_offerings o
    join public.subject_components sc on sc.subject_id = o.subject_id and sc.kind = 'TH'
    join public.divisions dv on dv.department_id = o.department_id and dv.program_year = o.program_year and dv.academic_year_id = p_year
    where o.term_id = p_term
      and not exists (select 1 from public.teaching_groups g where g.offering_id = o.id and g.division_id = dv.id and g.component = sc.kind);

    insert into public.teaching_groups (offering_id, component, kind, division_id, batch_id)
    select o.id, sc.kind, 'batch', dv.id, b.id
    from public.subject_offerings o
    join public.subject_components sc on sc.subject_id = o.subject_id and sc.kind in ('PR', 'TUT')
    join public.divisions dv on dv.department_id = o.department_id and dv.program_year = o.program_year and dv.academic_year_id = p_year
    join public.batches b on b.division_id = dv.id
    where o.term_id = p_term
      and not exists (select 1 from public.teaching_groups g where g.offering_id = o.id and g.batch_id = b.id and g.component = sc.kind);
  end if;

  -- period template
  if p_doc ? 'periods' then
    insert into public.period_templates (name, is_default, periods, working_saturdays)
    values ('Default', true, p_doc -> 'periods',
            coalesce(array(select jsonb_array_elements_text(p_doc -> 'workingSaturdays'))::smallint[], '{1,3}'))
    on conflict ((true)) where is_default do update set periods = excluded.periods, working_saturdays = excluded.working_saturdays;
  end if;

  return jsonb_build_object('divisions', v_divs, 'subjects', v_subjects, 'offerings', v_offerings);
end $$;

create or replace function public.activate_blueprint(p_version uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.blueprint_versions; v_val jsonb; v_result jsonb; v_term public.academic_terms := app.active_term();
begin
  perform app.require('blueprint.activate');
  select * into v from public.blueprint_versions where id = p_version for update;
  if not found or v.status <> 'draft' then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_val := public.validate_blueprint(v.document);
  if jsonb_array_length(v_val -> 'errors') > 0 then
    raise exception 'BLUEPRINT_INVALID' using errcode = 'P0001', detail = v_val::text;
  end if;
  v_result := app.apply_blueprint(v.document, v_term.academic_year_id, v_term.id);
  update public.blueprint_versions set status = 'superseded' where status = 'active';
  update public.blueprint_versions set status = 'active', validation = v_val, activated_by = auth.uid(), activated_at = now() where id = p_version;
  perform app.audit('blueprint.activated', 'blueprint_versions', p_version::text, format('Activated blueprint v%s', v.version), null, v_result);
  return v_result;
end $$;

-- ── First-run setup wizard (§11.1) ───────────────────────────────────────
-- p: { college: {...}, year: { label, start, end, oddStart, oddEnd, evenStart, evenEnd },
--      blueprint: {...}, policy: { minPercent, warnPercent, editWindowHours, lockAfterHours, countMode } }
create or replace function public.complete_setup(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_year uuid; v_term uuid; v_val jsonb; v_result jsonb; v_bp uuid;
begin
  perform app.require('settings.manage');
  if exists (select 1 from public.college where setup_completed_at is not null) then
    raise exception 'SETUP_DONE' using errcode = 'P0001';
  end if;
  v_val := public.validate_blueprint(p -> 'blueprint');
  if jsonb_array_length(v_val -> 'errors') > 0 then
    raise exception 'BLUEPRINT_INVALID' using errcode = 'P0001', detail = v_val::text;
  end if;

  insert into public.college (id, name, short_name, address, phone, email, principal_name)
  values (1, p #>> '{college,name}', p #>> '{college,shortName}', p #>> '{college,address}', p #>> '{college,phone}',
          p #>> '{college,email}', p #>> '{college,principalName}')
  on conflict (id) do update set name = excluded.name, short_name = excluded.short_name, address = excluded.address,
    phone = excluded.phone, email = excluded.email, principal_name = excluded.principal_name;

  insert into public.academic_years (label, start_date, end_date, status)
  values (p #>> '{year,label}', (p #>> '{year,start}')::date, (p #>> '{year,end}')::date, 'active')
  returning id into v_year;
  insert into public.academic_terms (academic_year_id, parity, label, start_date, end_date, status)
  values (v_year, 'odd', 'Odd term ' || (p #>> '{year,label}'), (p #>> '{year,oddStart}')::date, (p #>> '{year,oddEnd}')::date, 'active')
  returning id into v_term;
  insert into public.academic_terms (academic_year_id, parity, label, start_date, end_date, status)
  values (v_year, 'even', 'Even term ' || (p #>> '{year,label}'), (p #>> '{year,evenStart}')::date, (p #>> '{year,evenEnd}')::date, 'planned');

  update public.attendance_policies set
    min_percent = coalesce((p #>> '{policy,minPercent}')::numeric, min_percent),
    warn_percent = coalesce((p #>> '{policy,warnPercent}')::numeric, warn_percent),
    edit_window_hours = coalesce((p #>> '{policy,editWindowHours}')::int, edit_window_hours),
    lock_after_hours = coalesce((p #>> '{policy,lockAfterHours}')::int, lock_after_hours),
    count_mode = coalesce(p #>> '{policy,countMode}', count_mode)
  where scope = 'college' and effective_to is null;

  insert into public.blueprint_versions (version, status, document, validation, created_by, activated_by, activated_at)
  values ((select coalesce(max(version), 0) + 1 from public.blueprint_versions), 'active', p -> 'blueprint', v_val, auth.uid(), auth.uid(), now())
  returning id into v_bp;
  v_result := app.apply_blueprint(p -> 'blueprint', v_year, v_term);

  update public.college set setup_completed_at = now() where id = 1;
  perform app.audit('setup.completed', 'college', '1', format('Completed setup for %s', p #>> '{college,name}'), null, v_result);
  return v_result;
end $$;

-- ── Rollover (§11.3) ─────────────────────────────────────────────────────
-- 1. Next year: clone the active blueprint into new divisions and batches.
create or replace function public.create_next_academic_year(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_year uuid; v_cur uuid;
begin
  perform app.require('year.rollover');
  select id into v_cur from public.academic_years where status = 'active';
  insert into public.academic_years (label, start_date, end_date, status)
  values (p ->> 'label', (p ->> 'start')::date, (p ->> 'end')::date, 'planned') returning id into v_year;
  insert into public.academic_terms (academic_year_id, parity, label, start_date, end_date, status) values
    (v_year, 'odd', 'Odd term ' || (p ->> 'label'), (p ->> 'oddStart')::date, (p ->> 'oddEnd')::date, 'planned'),
    (v_year, 'even', 'Even term ' || (p ->> 'label'), (p ->> 'evenStart')::date, (p ->> 'evenEnd')::date, 'planned');
  -- same structure as this year; renaming next year's "Div B" never touches this year's
  insert into public.divisions (academic_year_id, department_id, program_year, code, capacity, room_label)
  select v_year, department_id, program_year, code, capacity, room_label from public.divisions
  where academic_year_id = v_cur and archived_at is null;
  insert into public.batches (division_id, code)
  select nd.id, b.code from public.batches b
  join public.divisions od on od.id = b.division_id and od.academic_year_id = v_cur
  join public.divisions nd on nd.academic_year_id = v_year and nd.department_id = od.department_id and nd.program_year = od.program_year and nd.code = od.code;
  perform app.audit('year.created', 'academic_years', v_year::text, format('Created academic year %s (planned)', p ->> 'label'));
  return v_year;
end $$;

-- 2–4. Record outcomes and promote one program year in one transaction.
-- p_outcomes: [{ "student_id": "...", "outcome": "promoted" | "promoted_atkt" | "repeat_year" | "detained" | "left" }]
-- Students not listed are promoted.
create or replace function public.promote_students(p_to_year uuid, p_program_year text, p_outcomes jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_from uuid; v_odd uuid; v_odd_start date; v_odd_end date; r record; v_next text; v_counts jsonb := '{}'::jsonb;
  v_div uuid; v_batch uuid; v_target_py text; v_type text;
begin
  perform app.require('year.rollover');
  select id into v_from from public.academic_years where status = 'active';
  select id, start_date, end_date into v_odd, v_odd_start, v_odd_end from public.academic_terms where academic_year_id = p_to_year and parity = 'odd';
  if v_odd is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_next := case p_program_year when 'FE' then 'SE' when 'SE' then 'TE' when 'TE' then 'BE' else null end;

  for r in
    select distinct on (e.student_id) e.*, d.code as div_code, b.code as batch_code,
           coalesce(o ->> 'outcome', 'promoted') as outcome
    from public.student_enrollments e
    join public.students s on s.id = e.student_id and s.status = 'active'
    join public.divisions d on d.id = e.division_id
    left join public.batches b on b.id = e.batch_id
    left join jsonb_array_elements(p_outcomes) o on (o ->> 'student_id')::uuid = e.student_id
    where e.academic_year_id = v_from and e.program_year = p_program_year and e.is_primary
    order by e.student_id, lower(e.valid_during) desc
  loop
    if r.outcome in ('detained', 'left') then
      update public.students set status = case r.outcome when 'left' then 'withdrawn' else 'detained' end where id = r.student_id;
    elsif r.outcome in ('promoted', 'promoted_atkt') and v_next is null then
      update public.students set status = 'passed_out' where id = r.student_id;
    else
      v_target_py := case when r.outcome = 'repeat_year' then p_program_year else v_next end;
      v_type := case r.outcome when 'promoted_atkt' then 'atkt' when 'repeat_year' then 'repeat' else 'regular' end;
      -- same division letter and batch number by rule; fall back to division A
      select id into v_div from public.divisions
      where academic_year_id = p_to_year and department_id = r.department_id and program_year = v_target_py
      order by (code = r.div_code) desc, code limit 1;
      if v_div is null then raise exception 'NO_TARGET_DIVISION' using errcode = 'P0001', detail = v_target_py; end if;
      select id into v_batch from public.batches where division_id = v_div order by (code = r.batch_code) desc, code limit 1;
      insert into public.student_enrollments (student_id, academic_year_id, term_id, department_id, program_year, semester, division_id, batch_id,
        roll_no, enrollment_type, valid_during, reason, created_by)
      values (r.student_id, p_to_year, v_odd, r.department_id, v_target_py, app.semester_for(v_target_py, 'odd'), v_div, v_batch,
        r.roll_no, v_type, daterange(v_odd_start, v_odd_end, '[]'), 'Year-end ' || r.outcome, auth.uid())
      on conflict do nothing;
    end if;
    v_counts := jsonb_set(v_counts, array[r.outcome], to_jsonb(coalesce((v_counts ->> r.outcome)::int, 0) + 1));
  end loop;

  perform app.audit('students.promoted', 'student_enrollments', p_program_year,
    format('Year-end outcomes recorded for %s', p_program_year), null, v_counts);
  return v_counts;
end $$;

-- Between odd and even terms of the same year: same division and batch, semester + 1.
create or replace function public.advance_term() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_odd public.academic_terms; v_even public.academic_terms; v_count integer;
begin
  perform app.require('year.rollover');
  select * into v_odd from public.academic_terms where status = 'active' and parity = 'odd';
  if not found then raise exception 'NOT_ODD_TERM' using errcode = 'P0001'; end if;
  select * into v_even from public.academic_terms where academic_year_id = v_odd.academic_year_id and parity = 'even';
  insert into public.student_enrollments (student_id, academic_year_id, term_id, department_id, program_year, semester, division_id, batch_id,
    roll_no, enrollment_type, valid_during, reason, created_by)
  select e.student_id, e.academic_year_id, v_even.id, e.department_id, e.program_year, e.semester + 1, e.division_id, e.batch_id,
         e.roll_no, e.enrollment_type, daterange(v_even.start_date, v_even.end_date, '[]'), 'Advanced to even term', auth.uid()
  from public.student_enrollments e join public.students s on s.id = e.student_id and s.status = 'active'
  where e.term_id = v_odd.id and e.is_primary
  on conflict do nothing;
  get diagnostics v_count = row_count;
  update public.academic_terms set status = 'archived' where id = v_odd.id;
  update public.academic_terms set status = 'active' where id = v_even.id;
  perform app.audit('term.advanced', 'academic_terms', v_even.id::text, format('Advanced %s enrollments to %s', v_count, v_even.label));
  return v_count;
end $$;

-- 6. Switch to the new year; the previous one becomes read-only.
create or replace function public.activate_academic_year(p_year uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old uuid; v_label text;
begin
  perform app.require('year.rollover');
  select id into v_old from public.academic_years where status = 'active';
  update public.academic_terms set status = 'archived' where academic_year_id = v_old;
  update public.academic_years set status = 'archived' where id = v_old;
  update public.academic_years set status = 'active' where id = p_year returning label into v_label;
  update public.academic_terms set status = 'active' where academic_year_id = p_year and parity = 'odd';
  perform app.apply_blueprint((select document from public.blueprint_versions where status = 'active'), p_year,
                              (select id from public.academic_terms where academic_year_id = p_year and parity = 'odd'));
  perform app.audit('year.activated', 'academic_years', p_year::text, format('Activated academic year %s; previous year archived', v_label));
end $$;
