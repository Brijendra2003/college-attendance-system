-- Leave, exams, communication and platform tables (§7.3, §11, §13).

create table public.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete restrict,
  leave_type  text not null check (leave_type in ('full_day', 'half_day', 'session', 'medical')),
  leave_period tstzrange not null,
  from_date   date not null,
  to_date     date not null,
  reason      text not null,
  document_asset_id uuid references public.media_assets (id) on delete set null,
  status      text not null default 'pending' check (status in ('pending', 'needs_info', 'approved', 'rejected', 'cancelled')),
  submitted_by uuid,
  decided_by  uuid,
  decided_at  timestamptz,
  decision_note text,
  created_at  timestamptz not null default now(),
  check (to_date >= from_date),
  constraint no_overlapping_leave exclude using gist (student_id with =, leave_period with &&)
    where (status in ('pending', 'needs_info', 'approved'))
);
create index leave_requests_status_idx on public.leave_requests (status);

create table public.leave_request_sessions (
  leave_request_id uuid not null references public.leave_requests (id) on delete cascade,
  session_id       uuid not null references public.class_sessions (id) on delete restrict,
  primary key (leave_request_id, session_id)
);

create table public.staff_leave_requests (
  id                  uuid primary key default gen_random_uuid(),
  staff_id            uuid not null references public.staff (id) on delete restrict,
  leave_type          text not null check (leave_type in ('casual', 'medical', 'duty', 'earned')),
  from_date           date not null,
  to_date             date not null,
  reason              text not null,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by          uuid,
  decided_at          timestamptz,
  substitute_arranged boolean not null default false,
  created_at          timestamptz not null default now(),
  check (to_date >= from_date)
);

create table public.exam_types (
  code       text primary key,
  name       text not null,
  sort_order smallint not null default 0
);

create table public.exams (
  id                 uuid primary key default gen_random_uuid(),
  exam_type          text not null references public.exam_types (code),
  title              text not null,
  term_id            uuid not null references public.academic_terms (id) on delete restrict,
  starts_on          date not null,
  ends_on            date not null,
  status             text not null default 'draft' check (status in ('draft', 'published', 'completed')),
  semesters          smallint[] not null default '{}',
  paper_count        integer not null default 0,
  conflict_count     integer not null default 0,
  attendance_marked  integer not null default 0,
  published_at       timestamptz,
  created_at         timestamptz not null default now()
);

create table public.exam_sessions (
  id            uuid primary key default gen_random_uuid(),
  exam_id       uuid not null references public.exams (id) on delete cascade,
  offering_id   uuid not null references public.subject_offerings (id) on delete restrict,
  teaching_group_id uuid references public.teaching_groups (id) on delete restrict,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  room_label    text
);

create table public.exam_attendance (
  exam_session_id uuid not null references public.exam_sessions (id) on delete cascade,
  student_id      uuid not null references public.students (id) on delete restrict,
  status          text not null check (status in ('present', 'absent', 'exempted')),
  reason          text,
  marked_by       uuid,
  marked_at       timestamptz not null default now(),
  primary key (exam_session_id, student_id)
);

create table public.exam_duties (
  exam_session_id uuid not null references public.exam_sessions (id) on delete cascade,
  staff_id        uuid not null references public.staff (id) on delete restrict,
  duty            text not null check (duty in ('invigilator', 'examiner', 'supervisor')),
  primary key (exam_session_id, staff_id, duty)
);

create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  priority      text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  audience      text not null check (audience in ('college', 'students', 'staff', 'parents', 'department')),
  department_id uuid references public.departments (id) on delete set null,
  channels      text[] not null default '{inapp,push}',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  publish_at    timestamptz not null default now(),
  expires_at    timestamptz,
  published     boolean not null default false,
  recipient_count integer not null default 0
);
create index announcements_publish_idx on public.announcements (publish_at desc);

create table public.announcement_recipients (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  delivered_at    timestamptz,
  read_at         timestamptz,
  primary key (announcement_id, user_id)
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.notification_outbox (
  id              bigint generated always as identity primary key,
  channel         text not null check (channel in ('push', 'email', 'sms', 'whatsapp')),
  recipient_id    uuid,
  recipient       text,
  template        text not null,
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text not null unique,
  status          text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'dead')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_id     text,
  last_error      text,
  created_at      timestamptz not null default now()
);
create index notification_outbox_due_idx on public.notification_outbox (next_attempt_at) where status in ('queued', 'failed');

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event   text not null,
  channel text not null,
  enabled boolean not null default true,
  mode    text not null default 'instant' check (mode in ('instant', 'digest')),
  primary key (user_id, event, channel)
);

create table public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('android', 'ios')),
  app_version text,
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table public.import_jobs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('students', 'staff', 'teaching_assignments', 'subjects', 'timetable', 'exam_timetable', 'results')),
  file_name   text not null,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  status      text not null default 'validated' check (status in ('validated', 'committed', 'failed')),
  total_rows  integer not null default 0,
  ok_rows     integer not null default 0,
  error_rows  integer not null default 0,
  committed_at timestamptz,
  result      jsonb
);

create table public.import_rows (
  job_id    uuid not null references public.import_jobs (id) on delete cascade,
  line      integer not null,
  raw       jsonb not null,
  errors    text[] not null default '{}',
  committed boolean not null default false,
  primary key (job_id, line)
);

create table public.report_jobs (
  id          uuid primary key default gen_random_uuid(),
  report_key  text not null,
  format      text not null check (format in ('csv', 'xlsx', 'pdf')),
  filters     jsonb not null default '{}'::jsonb,
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  asset_id    uuid references public.media_assets (id) on delete set null,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
