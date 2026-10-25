-- Account provisioning helpers (§6, §11.5, §12).

create or replace function public.log_account_provisioning(p_kind text, p_created integer, p_failed integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(app.scope_of(case p_kind when 'staff' then 'staff.manage' else 'students.manage' end), '') not in ('all', 'department') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  perform app.audit('accounts.provisioned', 'profiles', p_kind,
    format('Provisioned %s %s accounts (%s failed)', p_created, p_kind, p_failed), null,
    jsonb_build_object('created', p_created, 'failed', p_failed));
end $$;

-- Called by the mobile app after a parent signs in with phone OTP. Links the
-- caller to guardian records with the same verified phone number whose links
-- Operations has already verified. Knowing an enrollment number never grants
-- access: only the phone the college verified does (§11.5).
create or replace function public.link_guardian_account() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_phone text; v_count integer; v_name text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select regexp_replace(coalesce(phone, ''), '^(\+?91)', '') into v_phone from auth.users where id = auth.uid();
  if v_phone is null or v_phone = '' then raise exception 'NO_PHONE' using errcode = 'P0001'; end if;

  update public.guardians g set user_id = auth.uid()
  where g.phone = v_phone and g.user_id is null
    and exists (select 1 from public.guardian_links gl where gl.guardian_id = g.id and gl.status = 'verified');
  select count(*), min(g.full_name) into v_count, v_name
  from public.guardians g join public.guardian_links gl on gl.guardian_id = g.id and gl.status = 'verified'
  where g.user_id = auth.uid();

  if v_count > 0 then
    insert into public.profiles (id, display_name, phone) values (auth.uid(), v_name, v_phone) on conflict (id) do nothing;
    insert into public.user_roles (user_id, role) values (auth.uid(), 'parent') on conflict do nothing;
  end if;
  return v_count;
end $$;

grant execute on function public.log_account_provisioning(text, integer, integer), public.link_guardian_account() to authenticated;
revoke execute on function public.log_account_provisioning(text, integer, integer), public.link_guardian_account() from anon, public;
