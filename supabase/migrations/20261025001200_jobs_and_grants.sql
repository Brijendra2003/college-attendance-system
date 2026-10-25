-- Background jobs (§16) and function privileges.

create or replace function public.missing_register_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform app.enqueue('push', st.user_id, 'register_missing', jsonb_build_object('session_id', s.id), format('miss:%s', s.id))
  from public.class_sessions s
  join public.attendance_registers g on g.session_id = s.id and g.state = 'pending'
  join public.session_staff ss on ss.session_id = s.id
  join public.staff st on st.id = ss.staff_id and st.user_id is not null
  where s.session_date = app.today() and s.status = 'scheduled' and now() > s.ends_at + interval '30 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.weekly_shortage_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_min numeric := (select min_percent from public.attendance_policies where scope = 'college' and effective_to is null);
        v_week text := to_char(app.today(), 'IYYY-IW'); v_count integer;
begin
  perform app.enqueue('push', t.user_id, 'shortage_warning', jsonb_build_object('student_id', t.student_id),
                      format('short:%s:%s:%s', t.student_id, v_week, t.user_id))
  from (
    select s.id as student_id, s.user_id from public.students s
    where s.status = 'active' and exists (select 1 from public.attendance_summaries a where a.student_id = s.id and a.percent < v_min)
    union
    select gl.student_id, g.user_id from public.guardian_links gl join public.guardians g on g.id = gl.guardian_id
    where gl.status = 'verified' and exists (select 1 from public.attendance_summaries a where a.student_id = gl.student_id and a.percent < v_min)
  ) t where t.user_id is not null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.cleanup_old_rows() returns void
language sql security definer set search_path = '' as $$
  delete from public.notification_outbox where status in ('sent', 'dead') and created_at < now() - interval '90 days';
  delete from public.import_rows r using public.import_jobs j where j.id = r.job_id and j.created_at < now() - interval '30 days' and j.status <> 'validated';
  update public.device_tokens set disabled_at = now() where disabled_at is null and last_seen_at < now() - interval '60 days';
$$;

-- RPCs: signed-in users only (each checks permissions itself).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'custom_access_token_hook'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- Jobs run as the database owner via pg_cron, never from clients.
revoke execute on function public.lock_registers(), public.reconcile_attendance_summaries(), public.publish_due_announcements(),
  public.missing_register_reminders(), public.weekly_shortage_alerts(), public.cleanup_old_rows() from authenticated;

-- pg_cron schedules are in UTC; the IST times are in comments.
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('lock-registers', '*/15 * * * *', 'select public.lock_registers()');
    perform cron.schedule('missing-register-reminders', '*/15 2-13 * * 1-6', 'select public.missing_register_reminders()'); -- 08:00–19:00 IST
    perform cron.schedule('publish-scheduled-announcements', '* * * * *', 'select public.publish_due_announcements()');
    perform cron.schedule('reconcile-summaries', '30 20 * * *', 'select public.reconcile_attendance_summaries()');       -- 02:00 IST
    perform cron.schedule('shortage-alerts', '30 2 * * 1', 'select public.weekly_shortage_alerts()');                    -- Mon 08:00 IST
    perform cron.schedule('cleanup', '30 21 * * *', 'select public.cleanup_old_rows()');                                 -- 03:00 IST
  else
    raise notice 'pg_cron not available: schedule the jobs in supabase/migrations/…_jobs_and_grants.sql manually';
  end if;
end
$outer$;
