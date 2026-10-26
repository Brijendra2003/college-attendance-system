# SJCEM Attendance — web app

Web portal for St. John College of Engineering and Management: Principal, Admin, Operations, Exam Cell and HODs.
Professors, students and parents use the mobile app. Built from [webapp_Architecture.md](webapp_Architecture.md).

Stack: Next.js 16 (App Router, Cache Components, `proxy.ts`), React 19, TypeScript, Tailwind CSS v4, Supabase
(Postgres + RLS + Auth with TOTP MFA), Zod 4, Recharts, ExcelJS, @react-pdf/renderer.

## Production setup (hosted Supabase)

1. **Create a Supabase project.** Pick the region closest to the college (Mumbai, `ap-south-1`).
2. **Apply the schema.** Use `supabase link` then `supabase db push`, or run each file in `supabase/migrations/` in
   filename order in the SQL editor. Then run `supabase/seed.sql`. It loads reference data only (program years,
   semesters, status codes, default policy, the role-permission matrix) and no people.
3. **Dashboard settings:**
   - *Authentication → Hooks → Custom Access Token*: select `public.custom_access_token_hook`. Without the hook, nobody
     gets roles and every page redirects to `/login`.
   - *Authentication → Multi-Factor*: enable **TOTP**. MFA is required for Principal and Admin
     (`app_config.require_mfa_for_admins`).
   - *Authentication → Providers → Email*: disable public sign-ups. Accounts are only created by Admin/Operations.
   - *Authentication → SMTP*: configure a real sender (the built-in one is rate-limited). Staff and student invites are
     password-setup emails.
   - *Authentication → URL configuration*: set the Site URL to the deployed portal.
   - *Database → Extensions*: enable `pg_cron`, then re-run `…001200_jobs_and_grants.sql` if it was applied first. It
     schedules register locking, missing-register reminders, scheduled announcements, nightly summary reconciliation,
     weekly shortage alerts and cleanup.
4. **Environment.** Copy `.env.example` to `.env.local` (or set the variables on the host):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only) and
   `DATABASE_URL` (scripts only, session pooler string).
5. **First account.**
   ```bash
   npm run bootstrap:admin -- --email admin@sjcem.edu.in --name "Full Name" --role admin
   ```
   It prints a one-time password. Sign in, enrol an authenticator app, and the **setup wizard** opens. It covers college
   details, the academic year and terms, departments, the curriculum blueprint and the attendance policy.
   After importing people: staff and students get their logins from **Provision accounts** (a password-setup email).
   Parents get theirs from **People → Guardians**: verify the link, then **Create login**. Their email is the username,
   and the generated password is shown once for you to hand over. Parents never sign in with SMS or OTP.
6. **Deploy.** `npm run build && npm start`, or any Node host (Vercel works as-is). Security headers (CSP, HSTS,
   frame-ancestors) are set in `next.config.ts`.

Staging only: `npm run seed:demo` fills the database with a full demo college (12 branches, ~4,260 students,
219 staff, 48 timetables, about a million attendance records, plus 19 demo logins with password `demo1234`). Set
`NEXT_PUBLIC_SHOW_DEMO_LOGINS=1` to list those logins on the sign-in page. Never run the seed against production.

## Local development without Docker

`supabase start` needs Docker. Without it, run a throwaway Postgres cluster, PostgREST and a small gateway that speaks
the subset of Supabase Auth the app uses (`scripts/dev/local-supabase.ts`; it refuses to run against a real project):

```powershell
# 1. Postgres 18 on port 54329 (trust auth), build the database (schema + seed + demo data) and run the SQL tests
./supabase/tests/run-local.ps1 -Port 54329 -Database cas_dev -Demo -Tests

# 2. Gateway on :54321 (needs the PostgREST binary: https://github.com/PostgREST/postgrest/releases)
$env:DATABASE_URL = "postgres://postgres@localhost:54329/cas_dev"
$env:POSTGREST_BIN = "C:\tools\postgrest.exe"
npm run dev:supabase      # prints the URL and keys for .env.local

# 3. The app
npm run dev               # http://localhost:3000
```

`supabase/tests/00_supabase_stubs.sql` creates the roles, `auth.*` functions and tables that Supabase normally provides,
so the migrations apply unchanged to plain Postgres.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint, `tsc --noEmit` |
| `npm run dev:supabase` | Local gateway (see above) |
| `npm run seed:demo [-- --reset] [-- --weeks N]` | Demo college for staging/local |
| `npm run bootstrap:admin -- --email … --name …` | First Admin/Principal on a fresh project |
| `./supabase/tests/run-local.ps1 -Tests` | Rebuild a local database and run the RLS and engine tests |

## Layout

```
supabase/
├── migrations/               schema, RLS, attendance engine, admin RPCs, blueprint/rollover, reporting, jobs
├── seed.sql                  reference data and the role-permission matrix
└── tests/                    stubs for plain Postgres, RLS and engine tests
src/
├── app/(auth)/               sign-in, MFA enrol/verify, not-ready
├── app/(portal)/…            the authenticated portal (one folder per route in §10.2)
├── app/setup/                first-run setup wizard
├── app/api/                  report exports (CSV/XLSX/PDF), import templates, health check
├── features/<domain>/        queries.ts (server reads), actions.ts (Server Actions), components
├── components/ui|shell|charts
├── lib/supabase/             server client (user session) and admin client (service role, server only)
├── lib/auth/                 session, permission checks, action() wrapper (§10.4)
├── shared/                   pure TS shared with mobile: permissions, schemas, attendance maths, tokens, blueprint
└── proxy.ts                  session refresh; redirects signed-out visitors to /login
```

`src/shared` is the source of truth the mobile app syncs from (§4). It only depends on `zod`.

## Security model

- **The database enforces access.** Every table has RLS. Clients have no direct write grants: writes go through
  `SECURITY DEFINER` RPCs that call `app.require(permission, department)`. That function checks the live role matrix,
  department scope, account status and, for sensitive actions, `aal2` (MFA).
- Identity comes from verified JWT claims (`getClaims()`), never from `getSession()`.
- Pages call `requirePermission()` and Server Actions go through `action()` (session, MFA, permission, Zod). These
  checks are for a better user experience only. RLS still applies if they are bypassed.
- The role → permission → scope matrix is editable under **Settings → Roles & permissions** and applies on the next
  request. A guard stops you from removing the last way to manage roles.
- Every write and every export is recorded in the append-only `audit_log`.
- The service-role key is used in exactly one place; see [docs/service-role-usage.md](docs/service-role-usage.md).

## Not yet built

- The notification dispatcher. Events are queued in `notification_outbox`; an Edge Function or worker still has to send
  push, SMS and email.
- Exam marks entry (the Exams module currently shows exams and eligibility).
- Realtime updates. Pages refresh after each action and on navigation.
