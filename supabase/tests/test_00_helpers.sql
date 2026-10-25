-- Test helpers (LOCAL ONLY). Impersonation works like PostgREST: the role is
-- switched to `authenticated` and the JWT claims go into request.jwt.claims.

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;
grant execute on function tests.ok(boolean, text) to authenticated;

-- Sets JWT claims for a profile by email; call `set role authenticated` after.
create or replace function tests.login(p_email text, p_aal text default 'aal2') returns void language plpgsql as $$
declare v_id uuid; v_roles jsonb;
begin
  select id into v_id from public.profiles where email = p_email;
  if v_id is null then raise exception 'no profile %', p_email; end if;
  select coalesce(jsonb_agg(role), '[]') into v_roles from public.user_roles where user_id = v_id;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_id, 'role', 'authenticated', 'aal', p_aal, 'app_roles', v_roles)::text, false);
end $$;

-- Expect an RPC to fail with a given error code.
create or replace function tests.raises(p_sql text, p_code text, msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code then
      raise notice 'PASS: %', msg;
      return;
    end if;
    raise exception 'FAIL: % (expected %, got %)', msg, p_code, sqlerrm;
  end;
  raise exception 'FAIL: % (expected %, no error)', msg, p_code;
end $$;
grant execute on function tests.raises(text, text, text) to authenticated, anon;
