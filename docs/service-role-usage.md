# Service-role key usage (§17)

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is read only by `src/lib/supabase/admin.ts` (marked `server-only`) and by
command-line scripts. It must never be exposed to the browser or prefixed with `NEXT_PUBLIC_`.

Every use must be listed here. Review this list whenever `createAdminClient()` gains a new caller.

| Where | Why the service role is needed | Guard |
|---|---|---|
| `src/features/accounts/actions.ts` → `provisionAccounts` | The Auth admin API (`auth.admin.createUser`) creates staff and student accounts, then links `profiles` / `user_roles` / `staff.user_id` / `students.user_id`, which have no client write grants. | Runs inside `action()` with `staff.manage` or `students.manage`. The rows to provision are read with the user's own client, so RLS and department scope decide who gets an account. Each run is audited through `log_account_provisioning`. |
| `src/features/guardians/actions.ts` → `createGuardianLogin`, `resetGuardianPassword` | Parents sign in with their email and a password issued by the college. The Auth admin API creates the login (or sets a new password), and the service role links `guardians.user_id`, `profiles` and the `parent` role, which have no client write grants. A login shared with a staff/student account is never reset from here. | Runs inside `action()` with `guardians.manage`. The guardian is read with the user's own client (RLS), a login is only created for a guardian with a verified link, and every change is audited through `log_guardian_account`. Passwords are shown once and never stored or logged. |
| `scripts/bootstrap-admin.ts` | Creates the first Admin/Principal on a fresh project, before anyone can sign in. | Run by an operator from a trusted machine. |

The scripts `scripts/seed-demo.ts` and `supabase/tests/*` connect with `DATABASE_URL` (database owner), not the
service-role key. They are for local development and staging only.

## Rotating the key

1. Generate a new key in the Supabase dashboard (Settings → API).
2. Update the host's environment variable and redeploy.
3. Revoke the old key.
