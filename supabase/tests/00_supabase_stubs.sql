-- LOCAL TESTING ONLY. Recreates the parts of a Supabase database the
-- migrations rely on (roles, auth schema, extensions schema) so they can be
-- applied to a plain PostgreSQL server. Never run this against Supabase.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'authenticator'; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text unique,
  encrypted_password text,
  banned_until timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Used by the local dev gateway (scripts/dev/local-supabase.ts) for TOTP factors.
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text,
  secret text not null,
  status text not null default 'unverified',
  created_at timestamptz default now()
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon')
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Supabase sets this for the postgres role; exclusion constraints need btree_gist's opclasses.
do $$ begin execute format('alter database %I set search_path = "$user", public, extensions', current_database()); end $$;
set search_path = "$user", public, extensions;
