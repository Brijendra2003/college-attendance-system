-- Students, guardians, enrollment and teaching (§7.3, §7.4, §7.5).

create table public.media_assets (
  id            uuid primary key default gen_random_uuid(),
  public_id     text not null unique,
  resource_type text not null default 'image',
  delivery_type text not null default 'authenticated' check (delivery_type in ('upload', 'authenticated', 'private')),
  purpose       text not null,
  owner_entity  text,
  owner_id      uuid,
  bytes         bigint,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create table public.students (
  id                     uuid primary key default gen_random_uuid(),
  enrollment_no          text not null unique check (enrollment_no ~ '^[A-Z0-9]{6,15}$'),
  prn                    text unique check (prn ~ '^\d{16}$'),
  full_name              text not null,
  dob                    date,
  gender                 text check (gender in ('M', 'F', 'O')),
  email                  text,
  phone                  text,
  admission_year         smallint not null,
  admission_type         text not null default 'fe_regular' check (admission_type in ('fe_regular', 'direct_second_year')),
  admitted_department_id uuid not null references public.departments (id) on delete restrict,
  status                 text not null default 'active' check (status in ('active', 'withdrawn', 'detained', 'passed_out')),
  photo_asset_id         uuid references public.media_assets (id) on delete set null,
  user_id                uuid unique references public.profiles (id) on delete set null,
  created_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index students_email_key on public.students (lower(email)) where email is not null;
create index students_name_idx on public.students (lower(full_name));
create trigger students_touch before update on public.students for each row execute function app.touch_updated_at();

create table public.guardians (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  relation   text not null check (relation in ('Father', 'Mother', 'Guardian')),
  phone      text not null unique check (phone ~ '^[6-9]\d{9}$'),
  email      text,
  user_id    uuid unique references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Many guardians per student and many students per guardian (siblings).
-- No self-linking: links start pending and are verified by Operations.
create table public.guardian_links (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete restrict,
  guardian_id uuid not null references public.guardians (id) on delete restrict,
  status      text not null default 'pending' check (status in ('pending', 'verified', 'revoked')),
  is_primary  boolean not null default false,
  verified_by uuid,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (student_id, guardian_id)
);
create index guardian_links_guardian_idx on public.guardian_links (guardian_id);
create index guardian_links_status_idx on public.guardian_links (status);

create table public.student_documents (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students (id) on delete restrict,
  doc_type     text not null,
  asset_id     uuid not null references public.media_assets (id) on delete restrict,
  verification text not null default 'pending' check (verification in ('pending', 'verified', 'rejected')),
  created_at   timestamptz not null default now()
);

-- One row per student per term. Rule 4: never two overlapping primary enrollments.
-- Rule 6: progression adds rows; the student row is permanent.
create table public.student_enrollments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  term_id          uuid not null references public.academic_terms (id) on delete restrict,
  department_id    uuid not null references public.departments (id) on delete restrict,
  program_year     text not null references public.program_years (code),
  semester         smallint not null references public.semesters (number),
  division_id      uuid not null references public.divisions (id) on delete restrict,
  batch_id         uuid,
  roll_no          integer check (roll_no > 0),
  enrollment_type  text not null default 'regular' check (enrollment_type in ('regular', 'atkt', 'repeat', 'dse')),
  is_primary       boolean not null default true,
  valid_during     daterange not null check (not isempty(valid_during)),
  reason           text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  foreign key (batch_id, division_id) references public.batches (id, division_id),
  constraint one_primary_enrollment exclude using gist (student_id with =, valid_during with &&) where (is_primary)
);
create index student_enrollments_student_idx on public.student_enrollments (student_id);
create index student_enrollments_division_idx on public.student_enrollments (division_id);
create index student_enrollments_batch_idx on public.student_enrollments (batch_id);
create index student_enrollments_department_idx on public.student_enrollments (department_id, term_id);

-- What is taught (offering) vs who attends (teaching group) — §7.1.
create table public.subject_offerings (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references public.subjects (id) on delete restrict,
  term_id       uuid not null references public.academic_terms (id) on delete restrict,
  department_id uuid not null references public.departments (id) on delete restrict,
  program_year  text not null references public.program_years (code),
  unique (subject_id, term_id, department_id)
);

-- Rule 5: division-wide theory, batch-wise practicals, custom groups for electives.
create table public.teaching_groups (
  id          uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.subject_offerings (id) on delete restrict,
  component   text not null check (component in ('TH', 'PR', 'TUT')),
  kind        text not null check (kind in ('division', 'batch', 'custom')),
  division_id uuid references public.divisions (id) on delete restrict,
  batch_id    uuid references public.batches (id) on delete restrict,
  name        text,
  check (
    (kind = 'division' and division_id is not null and batch_id is null)
    or (kind = 'batch' and division_id is not null and batch_id is not null)
    or (kind = 'custom' and name is not null)
  )
);
create index teaching_groups_offering_idx on public.teaching_groups (offering_id);
create index teaching_groups_division_idx on public.teaching_groups (division_id);

create table public.student_subject_registrations (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete restrict,
  offering_id       uuid not null references public.subject_offerings (id) on delete restrict,
  teaching_group_id uuid not null references public.teaching_groups (id) on delete restrict,
  valid_during      daterange not null,
  reason            text,
  created_at        timestamptz not null default now()
);
create index registrations_group_idx on public.student_subject_registrations (teaching_group_id);

create table public.teaching_assignments (
  id                uuid primary key default gen_random_uuid(),
  teaching_group_id uuid not null references public.teaching_groups (id) on delete restrict,
  staff_id          uuid not null references public.staff (id) on delete restrict,
  role              text not null default 'primary' check (role in ('primary', 'co', 'substitute')),
  valid_during      daterange not null,
  created_at        timestamptz not null default now(),
  constraint one_primary_teacher exclude using gist (teaching_group_id with =, valid_during with &&) where (role = 'primary')
);
create index teaching_assignments_staff_idx on public.teaching_assignments (staff_id);

create table public.class_teacher_assignments (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references public.divisions (id) on delete restrict,
  staff_id     uuid not null references public.staff (id) on delete restrict,
  valid_during daterange not null,
  created_at   timestamptz not null default now(),
  constraint one_class_teacher exclude using gist (division_id with =, valid_during with &&)
);
create index class_teacher_staff_idx on public.class_teacher_assignments (staff_id);
