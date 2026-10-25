-- Academic structure and calendar (§7.1, §7.3). The blueprint is data:
-- branches, years, divisions, batches and subjects are rows, not code.

create table public.academic_years (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique check (label ~ '^\d{4}-\d{2}$'),
  start_date date not null,
  end_date   date not null check (end_date > start_date),
  status     text not null default 'planned' check (status in ('planned', 'active', 'archived')),
  created_at timestamptz not null default now()
);
create unique index academic_years_one_active on public.academic_years ((true)) where status = 'active';

create table public.academic_terms (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  parity           text not null check (parity in ('odd', 'even')),
  label            text not null,
  start_date       date not null,
  end_date         date not null check (end_date > start_date),
  status           text not null default 'planned' check (status in ('planned', 'active', 'archived')),
  created_at       timestamptz not null default now(),
  unique (academic_year_id, parity)
);
create unique index academic_terms_one_active on public.academic_terms ((true)) where status = 'active';

create table public.program_years (
  code text primary key check (code in ('FE', 'SE', 'TE', 'BE')),
  name text not null,
  ord  smallint not null unique
);

create table public.semesters (
  number            smallint primary key check (number between 1 and 8),
  program_year_code text not null references public.program_years (code),
  parity            text not null check (parity in ('odd', 'even'))
);

create table public.rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  kind          text not null default 'classroom' check (kind in ('classroom', 'lab', 'seminar_hall')),
  capacity      smallint,
  department_id uuid references public.departments (id) on delete set null
);

-- Rule 2: every division belongs to a department, program year and academic year.
create table public.divisions (
  id                uuid primary key default gen_random_uuid(),
  academic_year_id  uuid not null references public.academic_years (id) on delete restrict,
  department_id     uuid not null references public.departments (id) on delete restrict,
  program_year      text not null references public.program_years (code),
  code              text not null check (code ~ '^[A-Z]$'),
  capacity          smallint not null default 60 check (capacity between 1 and 240),
  room_label        text,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (academic_year_id, department_id, program_year, code)
);
create index divisions_department_idx on public.divisions (department_id, academic_year_id);

-- Rule 3: every batch belongs to a division.
create table public.batches (
  id          uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete restrict,
  code        text not null check (code ~ '^[0-9]{1,2}$'),
  unique (division_id, code),
  unique (id, division_id)
);

create table public.period_templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  is_default        boolean not null default false,
  -- [{ "label": "P1", "start": "09:00", "end": "10:00", "kind": "lecture" | "practical" | "break" }]
  periods           jsonb not null,
  working_saturdays smallint[] not null default '{1,3}'
);
create unique index period_templates_one_default on public.period_templates ((true)) where is_default;

create table public.academic_calendar_events (
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  title            text not null,
  kind             text not null check (kind in ('holiday', 'exam', 'event', 'working_override')),
  starts_on        date not null,
  ends_on          date not null,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index calendar_dates_idx on public.academic_calendar_events (starts_on, ends_on);

create table public.blueprint_versions (
  id           uuid primary key default gen_random_uuid(),
  version      integer not null unique,
  status       text not null default 'draft' check (status in ('draft', 'active', 'superseded')),
  document     jsonb not null,
  validation   jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  activated_by uuid,
  activated_at timestamptz
);
create unique index blueprint_one_active on public.blueprint_versions ((true)) where status = 'active';
create unique index blueprint_one_draft on public.blueprint_versions ((true)) where status = 'draft';

create table public.curriculum_schemes (
  id        uuid primary key default gen_random_uuid(),
  code      text not null unique,
  name      text not null,
  is_active boolean not null default true
);

create table public.elective_baskets (
  id            uuid primary key default gen_random_uuid(),
  scheme_id     uuid not null references public.curriculum_schemes (id) on delete restrict,
  code          text not null,
  name          text not null,
  semester      smallint not null references public.semesters (number),
  department_id uuid references public.departments (id) on delete restrict,
  unique (scheme_id, code)
);

create table public.subjects (
  id                 uuid primary key default gen_random_uuid(),
  scheme_id          uuid not null references public.curriculum_schemes (id) on delete restrict,
  code               text not null,
  name               text not null,
  department_id      uuid references public.departments (id) on delete restrict, -- null = FE common
  semester           smallint not null references public.semesters (number),
  credits            numeric(3, 1) not null default 3,
  is_elective        boolean not null default false,
  elective_basket_id uuid references public.elective_baskets (id) on delete set null,
  is_active          boolean not null default true,
  unique (scheme_id, code)
);
create index subjects_department_semester_idx on public.subjects (department_id, semester);

create table public.subject_components (
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  kind         text not null check (kind in ('TH', 'PR', 'TUT')),
  weekly_hours numeric(3, 1) not null check (weekly_hours > 0),
  primary key (subject_id, kind)
);
