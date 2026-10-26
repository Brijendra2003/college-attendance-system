-- Parent logins (20261026000200): email + admin-issued password, no SMS / OTP.

select tests.ok(to_regprocedure('public.link_guardian_account()') is null, 'phone-OTP linking function is gone');

create temp table g_case as
select gl.id as link_id, gl.guardian_id from public.guardian_links gl where gl.status = 'pending' limit 1;
grant select on g_case to authenticated;
select tests.ok((select count(*) from g_case) = 1, 'demo data has a pending guardian link');

-- Operations verifies a link: audited, and no SMS invite is queued.
select tests.login('operations@sjcem.edu.in');
set role authenticated;
select public.set_guardian_link_status((select link_id from g_case), 'verified');
select public.log_guardian_account((select guardian_id from g_case), 'created');
reset role;
select tests.ok((select status from public.guardian_links where id = (select link_id from g_case)) = 'verified', 'operations verified the link');
select tests.ok(not exists (select 1 from public.notification_outbox where template = 'guardian_invite'), 'verifying a link queues no SMS invite');
select tests.ok(exists (select 1 from public.audit_log where action = 'guardian_account.created' and entity_id = (select guardian_id::text from g_case)),
                'login creation is audited');

-- Without guardians.manage the audit RPC is refused, and bad events are rejected.
select tests.login('professor@sjcem.edu.in');
set role authenticated;
select tests.raises(format('select public.log_guardian_account(%L, %L)', (select guardian_id from g_case), 'created'), 'FORBIDDEN',
                    'professor cannot log guardian account events');
reset role;
select tests.login('operations@sjcem.edu.in');
set role authenticated;
select tests.raises(format('select public.log_guardian_account(%L, %L)', (select guardian_id from g_case), 'sms_sent'), 'VALIDATION',
                    'unknown guardian account events are rejected');
reset role;
