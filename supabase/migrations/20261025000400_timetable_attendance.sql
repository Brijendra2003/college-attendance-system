-- Timetable, sessions and attendance (§7.3, §8). Attendance always belongs to
-- a scheduled session; records snapshot their context so history never moves.

create table public.timetable_versions (
  id             uuid primary key default gen_random_uuid(),
  term_id        uuid not null references public.academic_terms (id) on delete restrict,
  department_id  uuid not null references public.departments (id) on delete restrict,
  program_year   text not null references public.program_years (code),
  revision       integer not null default 1,
  status         text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  effective_from date not null,
  notes          text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  published_by   uuid,
  published_at   timestamptz,
  unique (term_id, department_id, program_year, revision)
);
create unique index timetable_one_published on public.timetable_versions (term_id, department_id, program_year) where status = 'published';
create unique index timetable_one_draft on public.timetable_versions (term_id, department_id, program_year) where status = 'draft';

create table public.timetable_slots (
  id                uuid primary key default gen_random_uuid(),
  version_id        uuid not null references public.timetable_versions (id) on delete cascade,
  weekday           smallint not null check (weekday between 1 and 6),
  starts_at         time not null,
  ends_at           time not null,
  teaching_group_id uuid not null references public.teaching_groups (id) on delete restrict,
  room_label        text,
  session_type      text not null default 'theory' check (session_type in ('theory', 'practical', 'tutorial')),
  staff_id          uuid not null references public.staff (id) on delete restrict,
  check (ends_at > starts_at)
);
create index timetable_slots_version_idx on public.timetable_slots (version_id);

create table public.class_sessions (
  id                  uuid primary key default gen_random_uuid(),
  session_date        date not null,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  teaching_group_id   uuid not null references public.teaching_groups (id) on delete restrict,
  offering_id         uuid not null references public.subject_offerings (id) on delete restrict,
  component           text not null check (component in ('TH', 'PR', 'TUT')),
  session_type        text not null check (session_type in ('theory', 'practical', 'tutorial', 'seminar', 'extra', 'remedial')),
  room_label          text,
  status              text not null default 'scheduled' check (status in ('scheduled', 'held', 'cancelled', 'rescheduled')),
  cancel_reason       text,
  rescheduled_from_id uuid references public.class_sessions (id) on delete restrict,
  source_slot_id      uuid references public.timetable_slots (id) on delete set null,
  source_version_id   uuid references public.timetable_versions (id) on delete set null,
  attendance_weight   numeric(4, 2) not null default 1,
  department_id       uuid not null references public.departments (id) on delete restrict,
  term_id             uuid not null references public.academic_terms (id) on delete restrict,
  division_id         uuid not null references public.divisions (id) on delete restrict,
  batch_id            uuid references public.batches (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index class_sessions_date_department_idx on public.class_sessions (session_date, department_id);
create index class_sessions_group_date_idx on public.class_sessions (teaching_group_id, session_date);
create index class_sessions_division_date_idx on public.class_sessions (division_id, session_date);
create trigger class_sessions_touch before update on public.class_sessions for each row execute function app.touch_updated_at();

create table public.session_staff (
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  staff_id   uuid not null references public.staff (id) on delete restrict,
  role       text not null default 'primary' check (role in ('primary', 'co', 'substitute')),
  primary key (session_id, staff_id)
);
create index session_staff_staff_idx on public.session_staff (staff_id);

create table public.attendance_status_codes (
  code               text primary key check (code ~ '^[A-Z]{1,3}$'),
  label              text not null,
  color              text not null,
  counts_as_attended boolean not null,
  counts_in_held     boolean not null,
  professor_can_set  boolean not null default false,
  requires_reason    boolean not null default false,
  sort_order         smallint not null default 0,
  is_active          boolean not null default true
);

create table public.attendance_policies (
  id                          uuid primary key default gen_random_uuid(),
  scope                       text not null check (scope in ('college', 'department', 'program_year', 'subject')),
  department_id               uuid references public.departments (id) on delete cascade,
  program_year                text references public.program_years (code),
  subject_id                  uuid references public.subjects (id) on delete cascade,
  min_percent                 numeric(5, 2) not null default 75 check (min_percent between 0 and 100),
  warn_percent                numeric(5, 2) not null default 80 check (warn_percent between 0 and 100),
  count_mode                  text not null default 'session' check (count_mode in ('session', 'hours')),
  eligibility_basis           text not null default 'per_subject_component' check (eligibility_basis in ('per_subject_component', 'per_subject', 'aggregate')),
  default_unmarked_status     text not null default 'A' references public.attendance_status_codes (code),
  edit_window_hours           integer not null default 24 check (edit_window_hours between 0 and 168),
  lock_after_hours            integer not null default 48 check (lock_after_hours between 1 and 336),
  missing_grace_minutes       integer not null default 30,
  leave_applies_retroactively boolean not null default true,
  effective_from              date not null default current_date,
  effective_to                date,
  created_by                  uuid,
  created_at                  timestamptz not null default now(),
  check (warn_percent >= min_percent),
  check ((scope = 'college') = (department_id is null and program_year is null and subject_id is null))
);
create unique index attendance_policies_one_college on public.attendance_policies ((true)) where scope = 'college' and effective_to is null;

create table public.attendance_registers (
  session_id           uuid primary key references public.class_sessions (id) on delete restrict,
  state                text not null default 'pending' check (state in ('pending', 'submitted', 'locked', 'reopened', 'voided')),
  version              integer not null default 0,
  submitted_by         uuid references public.staff (id) on delete restrict,
  submitted_at         timestamptz,
  client_submission_id uuid unique,
  client_marked_at     timestamptz,
  device_id            text,
  last_result          jsonb,
  locked_at            timestamptz,
  reopened_by          uuid,
  reopened_at          timestamptz,
  reopen_reason        text,
  reopen_until         timestamptz,
  present_count        integer not null default 0,
  total_count          integer not null default 0,
  is_late              boolean not null default false,
  nudged_at            timestamptz,
  updated_at           timestamptz not null default now()
);
create index attendance_registers_pending_idx on public.attendance_registers (state) where state = 'pending';
create trigger attendance_registers_touch before update on public.attendance_registers for each row execute function app.touch_updated_at();

create table public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.class_sessions (id) on delete restrict,
  student_id    uuid not null references public.students (id) on delete restrict,
  status_code   text not null references public.attendance_status_codes (code),
  source        text not null default 'manual' check (source in ('manual', 'bulk', 'leave', 'correction', 'override', 'qr', 'default')),
  marked_by     uuid,
  marked_at     timestamptz not null default now(),
  -- snapshot of context at marking time (§7.5)
  division_id   uuid not null,
  batch_id      uuid,
  department_id uuid not null,
  term_id       uuid not null,
  session_date  date not null,
  offering_id   uuid not null,
  component     text not null,
  weight        numeric(4, 2) not null default 1,
  constraint uq_attendance_record unique (session_id, student_id)
);
create index attendance_records_student_date_idx on public.attendance_records (student_id, session_date);
create index attendance_records_department_date_idx on public.attendance_records (department_id, session_date);

create table public.attendance_record_history (
  id         bigint generated always as identity primary key,
  record_id  uuid not null references public.attendance_records (id) on delete restrict,
  session_id uuid not null,
  student_id uuid not null,
  old_status text,
  new_status text not null,
  source     text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  reason     text
);
create index attendance_history_record_idx on public.attendance_record_history (record_id);

create table public.attendance_summaries (
  student_id  uuid not null references public.students (id) on delete cascade,
  offering_id uuid not null references public.subject_offerings (id) on delete cascade,
  component   text not null,
  held        numeric(8, 2) not null default 0,
  attended    numeric(8, 2) not null default 0,
  excused     numeric(8, 2) not null default 0,
  percent     numeric(5, 2),
  updated_at  timestamptz not null default now(),
  primary key (student_id, offering_id, component)
);
create index attendance_summaries_offering_idx on public.attendance_summaries (offering_id);

create table public.attendance_correction_requests (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.class_sessions (id) on delete restrict,
  student_id        uuid not null references public.students (id) on delete restrict,
  requested_by      uuid not null references public.staff (id) on delete restrict,
  from_status       text not null references public.attendance_status_codes (code),
  to_status         text not null references public.attendance_status_codes (code),
  reason            text not null,
  evidence_asset_id uuid references public.media_assets (id) on delete set null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text,
  created_at        timestamptz not null default now()
);
create index correction_requests_status_idx on public.attendance_correction_requests (status);

create table public.attendance_disputes (
  id          uuid primary key default gen_random_uuid(),
  record_id   uuid not null references public.attendance_records (id) on delete restrict,
  raised_by   uuid not null,
  message     text not null,
  status      text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  resolved_by uuid,
  resolved_at timestamptz,
  thread      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
