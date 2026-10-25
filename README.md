# SJCEM Attendance — web app

Web portal for Principal, Admin, Operations, Exam Cell and HODs, built from
[webapp_Architecture.md](webapp_Architecture.md). Professors, students and parents use the mobile app.

Stack: Next.js 16 (App Router, Cache Components, `proxy.ts`), React 19, TypeScript, Tailwind CSS v4, Zod 4, Recharts, lucide-react.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Sign in with any demo account listed on the login page. The password is `demo1234` for all of them.

| Account | Sees |
|---|---|
| `principal@sjcem.edu.in` | Everything, college-wide |
| `admin@sjcem.edu.in` | Setup health, settings, roles, audit |
| `operations@sjcem.edu.in` | Students, staff, imports, timetables, registers, corrections, leave |
| `examcell@sjcem.edu.in` | Exams, eligibility, shortage lists |
| one HOD per branch | Their own department only |

## Data: demo mode

There is no Supabase project yet, so all reads and writes go through an in-memory store
(`src/lib/data`), seeded deterministically with a Mumbai University college: 12 branches, FE–BE, divisions A–C,
batches 1–3, about 4,200 students, 219 staff, published odd-term timetables, guardians, leave, corrections and exams.
Changes last until the server restarts.

Sessions and registers are derived from the published timetable for any date (`src/lib/data/engine.ts`), so
"today" always has live data. The derivation mirrors the attendance engine in §8 of the architecture document.

**Moving to Supabase:** pages and actions only touch `src/features/*/queries.ts` and `actions.ts`. Reimplement those
against the RPCs and RLS in the architecture doc, swap `src/lib/auth/session.ts` for `@supabase/ssr`, and the UI stays
unchanged.

## Layout

```
src/
├── app/(auth)/login          sign-in
├── app/(portal)/…            the authenticated portal (one folder per route in §10.2)
├── app/api/                  CSV exports, import template
├── features/<domain>/        queries.ts (server reads), actions.ts (Server Actions), components
├── components/ui|shell|charts
├── lib/auth/                 session, permission checks, action() wrapper (§10.4)
├── lib/data/                 demo store, seed, attendance engine
├── shared/                   pure TS shared with mobile: permissions, schemas, attendance maths, tokens, dates
└── proxy.ts                  redirects signed-out visitors to /login
```

`src/shared` is the source of truth the mobile app syncs from (§4). It only depends on `zod`.

## Security model (demo)

- Each page calls `requirePermission()`. Each Server Action goes through `action()`, which re-checks the session,
  permission, department scope and Zod input.
- The role → permission → scope matrix is editable under **Settings → Roles & permissions** and applies on the next request.
- The session is an HMAC-signed cookie. Set `SESSION_SECRET` in any shared environment.
