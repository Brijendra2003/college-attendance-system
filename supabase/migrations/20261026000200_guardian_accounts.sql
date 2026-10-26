-- Parent accounts (§11.5, revised 2026-10-26): parents sign in to the mobile
-- app with their email and a password issued by the college, like staff and
-- students. There is no phone OTP sign-in and no SMS invite. Accounts are
-- created from People → Guardians (src/features/guardians/actions.ts); the
-- Auth calls use the service role there, this file only audits them.

drop function if exists public.link_guardian_account();

-- Same as 20261025000900 minus the SMS invite.
create or replace function public.set_guardian_link_status(p_link uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_link public.guardian_links; v_g public.guardians; v_s text;
begin
  perform app.require('guardians.manage');
  if p_status not in ('verified', 'revoked') then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  select * into v_link from public.guardian_links where id = p_link for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  update public.guardian_links set status = p_status,
    verified_by = case when p_status = 'verified' then auth.uid() else verified_by end,
    verified_at = case when p_status = 'verified' then now() else verified_at end
  where id = p_link;
  select * into v_g from public.guardians where id = v_link.guardian_id;
  select full_name into v_s from public.students where id = v_link.student_id;
  perform app.audit('guardian_link.' || p_status, 'guardian_links', p_link::text,
    format('%s %s (%s) for %s', case when p_status = 'verified' then 'Verified' else 'Revoked' end, v_g.full_name, v_g.relation, v_s),
    jsonb_build_object('status', v_link.status), jsonb_build_object('status', p_status));
end $$;

-- Audit trail for parent logins. Called by the web app after the Auth admin
-- call succeeded; the password itself is never stored or logged.
create or replace function public.log_guardian_account(p_guardian uuid, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_g public.guardians;
begin
  perform app.require('guardians.manage');
  if p_event not in ('created', 'linked', 'password_reset') then raise exception 'VALIDATION' using errcode = 'P0001'; end if;
  select * into v_g from public.guardians where id = p_guardian;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform app.audit('guardian_account.' || p_event, 'guardians', p_guardian::text,
    format('%s for %s (%s)',
      case p_event when 'created' then 'Created app login' when 'linked' then 'Linked existing login' else 'Issued new password' end,
      v_g.full_name, v_g.relation),
    null, jsonb_build_object('email', v_g.email));
end $$;

grant execute on function public.log_guardian_account(uuid, text) to authenticated;
revoke execute on function public.log_guardian_account(uuid, text) from anon, public;
