-- Foundation: extensions, private `app` schema, organisation, identity, staff, audit.
-- See webapp_Architecture.md §5–§7.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create or replace function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── College (single tenant: exactly one row) ──────────────────────────────
create table public.college (
  id                 smallint primary key default 1 check (id = 1),
  name               text not null,
  short_name         text not null,
  address            text,
  phone              text,
  email              text,
  university         text not null default 'University of Mumbai',
  timezone           text not null default 'Asia/Kolkata',
  principal_name     text,
  logo_asset_id      uuid,
  setup_completed_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger college_touch before update on public.college for each row execute function app.touch_updated_at();

-- ── Identity ─────────────────────────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email        text,
  phone        text,
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();

create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('principal', 'admin', 'operations', 'exam_cell', 'hod', 'professor', 'student', 'parent')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.permissions (
  key         text primary key,
  description text not null default ''
);

-- One scope per role × permission; Admin edits this matrix (§5.2).
create table public.role_permissions (
  role       text not null check (role in ('principal', 'admin', 'operations', 'exam_cell', 'hod', 'professor', 'student', 'parent')),
  permission text not null references public.permissions (key) on delete cascade,
  scope      text not null check (scope in ('all', 'department', 'assigned', 'self', 'linked')),
  primary key (role, permission)
);

-- ── Departments and staff ────────────────────────────────────────────────
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z]{2,8}$'),
  name        text not null,
  established smallint,
  intake      smallint,
  is_active   boolean not null default true,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger departments_touch before update on public.departments for each row execute function app.touch_updated_at();

create table public.staff (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        text not null unique,
  full_name          text not null,
  designation        text not null,
  home_department_id uuid references public.departments (id) on delete restrict,
  email              text,
  phone              text,
  joined_on          date,
  status             text not null default 'active' check (status in ('active', 'on_leave', 'inactive')),
  user_id            uuid unique references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index staff_email_key on public.staff (lower(email)) where email is not null;
create index staff_department_idx on public.staff (home_department_id);
create trigger staff_touch before update on public.staff for each row execute function app.touch_updated_at();

-- Effective-dated membership. Rule 1: one HOD per department at any moment.
create table public.department_staff (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  staff_id      uuid not null references public.staff (id) on delete restrict,
  role          text not null check (role in ('hod', 'faculty', 'lab_staff')),
  valid_during  daterange not null check (not isempty(valid_during)),
  created_at    timestamptz not null default now(),
  constraint one_hod_per_department exclude using gist (department_id with =, valid_during with &&) where (role = 'hod')
);
create index department_staff_staff_idx on public.department_staff (staff_id);

-- ── Audit (append-only) ──────────────────────────────────────────────────
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid,
  actor_name text,
  action     text not null,
  entity     text not null,
  entity_id  text,
  summary    text not null,
  before     jsonb,
  after      jsonb,
  reason     text,
  ip         text,
  user_agent text
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id);

create or replace function app.reject_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'P0001';
end $$;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function app.reject_audit_change();
