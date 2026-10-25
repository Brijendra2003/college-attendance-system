/**
 * Demo / staging dataset for SJCEM: 12 branches, FE–BE, ~4,300 students,
 * ~220 staff, clash-free published timetables, term-to-date attendance,
 * leave, corrections, exams, announcements and demo sign-in accounts.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/seed-demo.ts [--reset] [--weeks 6]
 *
 * Against hosted Supabase also set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * so the demo accounts are created through the Auth admin API.
 * NEVER run against production: it refuses if real setup has been completed
 * unless --reset is given.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { muEngineeringBlueprint, MU_PERIODS } from "../src/shared/blueprint";
import { digits, FIRST_NAMES_F, FIRST_NAMES_M, intBetween, mulberry32, pick, SURNAMES } from "./demo/data";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const DATABASE_URL = option("db") ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Set DATABASE_URL (or pass --db postgres://…)");
  process.exit(1);
}
const WEEKS = Number(option("weeks") ?? 0); // 0 = whole term to date
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234";
const DOMAIN = "sjcem.edu.in";

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
const rng = mulberry32(20262027);

// ── Dates ───────────────────────────────────────────────────────────────
const istNow = new Date(Date.now() + 330 * 60_000);
const todayIso = istNow.toISOString().slice(0, 10);
const Y = istNow.getUTCMonth() >= 5 ? istNow.getUTCFullYear() : istNow.getUTCFullYear() - 1;
const yearLabel = `${Y}-${String((Y + 1) % 100).padStart(2, "0")}`;
const ODD = { start: `${Y}-07-13`, end: `${Y}-11-21` };
const EVEN = { start: `${Y + 1}-01-04`, end: `${Y + 1}-05-08` };
const activeParity: "odd" | "even" = todayIso >= EVEN.start ? "even" : "odd";
const TERM = activeParity === "odd" ? ODD : EVEN;
const SEM = (py: string) => ({ FE: 1, SE: 3, TE: 5, BE: 7 })[py as "FE"]! + (activeParity === "even" ? 1 : 0);
const ADMISSION_YEAR = { FE: Y, SE: Y - 1, TE: Y - 2, BE: Y - 3 } as Record<string, number>;

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

async function bulk(tx: postgres.TransactionSql, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    await tx`insert into ${tx(table)} ${tx(chunk as never)}`;
  }
}

async function main() {
  const existing = await sql`select setup_completed_at from public.college where id = 1`;
  if (existing.length && !flag("reset")) {
    console.error("This database already has a college. Re-run with --reset to wipe domain data (never on production).");
    process.exit(1);
  }

  await sql.begin(async (tx) => {
    await tx`set local app.allow_archived_writes = 'on'`;
    if (flag("reset")) {
      console.log("Resetting domain data…");
      await tx.unsafe(`
        truncate public.audit_log, public.notification_outbox, public.notifications, public.announcement_recipients, public.announcements,
          public.exam_attendance, public.exam_duties, public.exam_sessions, public.exams, public.staff_leave_requests,
          public.leave_request_sessions, public.leave_requests, public.attendance_disputes, public.attendance_correction_requests,
          public.attendance_summaries, public.attendance_record_history, public.attendance_records, public.attendance_registers,
          public.session_staff, public.class_sessions, public.timetable_slots, public.timetable_versions,
          public.class_teacher_assignments, public.teaching_assignments, public.student_subject_registrations, public.teaching_groups,
          public.subject_offerings, public.student_enrollments, public.student_documents, public.guardian_links, public.guardians,
          public.students, public.department_staff, public.staff, public.batches, public.divisions, public.subject_components,
          public.subjects, public.elective_baskets, public.curriculum_schemes, public.blueprint_versions, public.academic_calendar_events,
          public.period_templates, public.academic_terms, public.academic_years, public.rooms, public.departments,
          public.import_rows, public.import_jobs, public.report_jobs, public.user_roles, public.college cascade`);
    }

    // ── College, year, calendar ───────────────────────────────────────────
    console.log(`Academic year ${yearLabel}, active ${activeParity} term ${TERM.start} → ${TERM.end}`);
    await tx`insert into public.college (id, name, short_name, address, phone, email, principal_name, setup_completed_at)
             values (1, 'St. John College of Engineering and Management', 'SJCEM', 'Palghar, Maharashtra', null,
                     ${"office@" + DOMAIN}, 'Dr. Shalini Deshmukh', now())`;
    const [year] = await tx`insert into public.academic_years (label, start_date, end_date, status)
                            values (${yearLabel}, ${`${Y}-07-01`}, ${`${Y + 1}-06-30`}, 'active') returning id`;
    const terms = await tx`insert into public.academic_terms (academic_year_id, parity, label, start_date, end_date, status) values
      (${year.id}, 'odd', ${"Odd term " + yearLabel}, ${ODD.start}, ${ODD.end}, ${activeParity === "odd" ? "active" : "archived"}),
      (${year.id}, 'even', ${"Even term " + yearLabel}, ${EVEN.start}, ${EVEN.end}, ${activeParity === "even" ? "active" : "planned"})
      returning id, parity`;
    const termId = terms.find((t) => t.parity === activeParity)!.id as string;

    const events: [string, string, string, string][] = [
      ["Independence Day", "holiday", `${Y}-08-15`, `${Y}-08-15`],
      ["IAET-1 (Internal Assessment)", "exam", `${Y}-08-24`, `${Y}-08-26`],
      ["Ganesh Chaturthi", "holiday", `${Y}-09-14`, `${Y}-09-14`],
      ["Annual tech fest", "event", `${Y}-09-26`, `${Y}-09-26`],
      ["Gandhi Jayanti", "holiday", `${Y}-10-02`, `${Y}-10-02`],
      ["IAET-2 (Internal Assessment)", "exam", `${Y}-10-12`, `${Y}-10-14`],
      ["Dussehra", "holiday", `${Y}-10-20`, `${Y}-10-20`],
      ["Practical & oral examinations", "exam", `${Y}-11-02`, `${Y}-11-06`],
      ["Diwali vacation", "holiday", `${Y}-11-07`, `${Y}-11-11`],
      ["End-semester examinations (University)", "exam", `${Y}-11-23`, `${Y}-12-15`],
      ["Republic Day", "holiday", `${Y + 1}-01-26`, `${Y + 1}-01-26`],
      ["Holi", "holiday", `${Y + 1}-03-22`, `${Y + 1}-03-22`],
      ["Maharashtra Day", "holiday", `${Y + 1}-05-01`, `${Y + 1}-05-01`],
    ];
    await bulk(tx, "academic_calendar_events", events.map(([title, kind, s, e]) => ({ academic_year_id: year.id, title, kind, starts_on: s, ends_on: e })));

    // ── Blueprint → departments, divisions, batches, subjects, offerings, groups ──
    const doc = muEngineeringBlueprint();
    await tx`insert into public.blueprint_versions (version, status, document, validation, activated_at)
             values (1, 'active', ${tx.json(doc as never)}, public.validate_blueprint(${tx.json(doc as never)}), now())`;
    const applied = await tx`select app.apply_blueprint(${tx.json(doc as never)}, ${year.id}, ${termId}) as r`;
    console.log("Blueprint applied:", applied[0].r);

    const departments = await tx`select id, code from public.departments order by sort_order, code`;
    const divisions = await tx`select dv.id, dv.code, dv.program_year, dv.department_id, d.code as dept
                               from public.divisions dv join public.departments d on d.id = dv.department_id
                               where dv.academic_year_id = ${year.id} order by d.code, dv.program_year, dv.code`;
    const batches = await tx`select id, division_id, code from public.batches order by code`;
    const groups = await tx`select g.id, g.kind, g.component, g.division_id, g.batch_id, s.code as subject_code
                            from public.teaching_groups g join public.subject_offerings o on o.id = g.offering_id
                            join public.subjects s on s.id = o.subject_id where o.term_id = ${termId} order by s.code`;

    // ── Staff ─────────────────────────────────────────────────────────────
    const staffRows: Record<string, unknown>[] = [];
    const membership: Record<string, unknown>[] = [];
    const staffByDept = new Map<string, { id: string; name: string; designation: string; email: string }[]>();
    const usedEmails = new Set<string>();
    let emp = 1001;
    for (const d of departments) {
      const divCount = divisions.filter((v) => v.department_id === d.id && v.program_year === "FE").length || 1;
      const count = divCount * 9 + 4;
      const list: { id: string; name: string; designation: string; email: string }[] = [];
      for (let k = 0; k < count; k++) {
        const female = rng() < 0.45;
        const first = pick(rng, female ? FIRST_NAMES_F : FIRST_NAMES_M);
        const last = pick(rng, SURNAMES);
        const designation = k === 0 ? "Professor" : k < 3 ? "Associate Professor" : k === count - 1 ? "Lab Assistant" : "Assistant Professor";
        const title = designation === "Lab Assistant" ? "" : k < 3 || rng() < 0.3 ? "Dr. " : "Prof. ";
        let email = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + `@${DOMAIN}`;
        if (usedEmails.has(email)) email = email.replace("@", `${emp}@`);
        usedEmails.add(email);
        const id = randomUUID();
        const joined = `${intBetween(rng, 2001, 2024)}-0${intBetween(rng, 6, 8)}-01`;
        staffRows.push({ id, employee_id: `SJ${emp++}`, full_name: `${title}${first} ${last}`, designation, home_department_id: d.id,
          email, phone: `9${digits(rng, 9)}`, joined_on: joined, status: rng() < 0.03 ? "on_leave" : "active" });
        membership.push({ department_id: d.id, staff_id: id, role: designation === "Lab Assistant" ? "lab_staff" : "faculty",
          valid_during: `[${joined},)` });
        list.push({ id, name: `${title}${first} ${last}`, designation, email });
      }
      membership.push({ department_id: d.id, staff_id: list[1].id, role: "hod", valid_during: `[2020-06-01,2024-06-01)` });
      membership.push({ department_id: d.id, staff_id: list[0].id, role: "hod", valid_during: `[2024-06-01,)` });
      staffByDept.set(d.id, list);
    }
    await bulk(tx, "staff", staffRows);
    await bulk(tx, "department_staff", membership);
    console.log(`Staff: ${staffRows.length}`);

    // ── Timetables: clash-free per department ─────────────────────────────
    const lectures = MU_PERIODS.filter((p) => p.kind === "lecture");
    const practical = MU_PERIODS.find((p) => p.kind === "practical")!;
    const versions: Record<string, unknown>[] = [];
    const slots: Record<string, unknown>[] = [];
    const assignments: Record<string, unknown>[] = [];
    const classTeachers: Record<string, unknown>[] = [];

    for (const d of departments) {
      const pool = staffByDept.get(d.id)!.filter((s) => s.designation !== "Lab Assistant");
      const load = new Map(pool.map((s, i) => [s.id, i === 0 ? 6 : 0])); // HOD teaches less
      const busy = new Map(pool.map((s) => [s.id, new Set<string>()]));
      const pickStaff = (times: string[]) => {
        const ordered = [...pool].sort((a, b) => load.get(a.id)! - load.get(b.id)!);
        const free = ordered.find((s) => times.every((t) => !busy.get(s.id)!.has(t)));
        if (!free) throw new Error(`No free professor in ${d.code} for ${times.join(",")}`);
        times.forEach((t) => busy.get(free.id)!.add(t));
        load.set(free.id, load.get(free.id)! + times.length);
        return free.id;
      };
      const deptDivs = divisions.filter((v) => v.department_id === d.id);
      for (const py of ["FE", "SE", "TE", "BE"]) {
        const pyDivs = deptDivs.filter((v) => v.program_year === py);
        if (!pyDivs.length) continue;
        const versionId = randomUUID();
        versions.push({ id: versionId, term_id: termId, department_id: d.id, program_year: py, revision: py === "SE" ? 2 : 1,
          status: "published", effective_from: TERM.start, published_at: new Date(`${TERM.start}T05:30:00Z`).toISOString() });
        for (const div of pyDivs) {
          const k = deptDivs.indexOf(div);
          const room = `${String.fromCharCode(65 + (departments.indexOf(d) % 4))}-${["FE", "SE", "TE", "BE"].indexOf(py) + 1}${String(k + 1).padStart(2, "0")}`;
          await tx`update public.divisions set room_label = ${room} where id = ${div.id}`;
          const offset = Math.floor(rng() * 5);

          // Theory: 3 lectures a day; each subject 3 times a week, never twice a day.
          const th = groups.filter((g) => g.kind === "division" && g.division_id === div.id && g.component === "TH");
          const remaining = new Map(th.map((g) => [g.id as string, 3]));
          const thTimes = new Map<string, { day: number; start: number; end: number }[]>();
          for (let day = 1; day <= 5; day++) {
            const freePeriod = (day - 1 + offset) % lectures.length;
            const usedToday = new Set<string>();
            lectures.forEach((p, i) => {
              if (i === freePeriod) return;
              const next = th
                .filter((g) => remaining.get(g.id)! > 0 && !usedToday.has(g.id))
                .sort((a, b) => remaining.get(b.id)! - remaining.get(a.id)!)[0];
              if (!next) return;
              remaining.set(next.id, remaining.get(next.id)! - 1);
              usedToday.add(next.id);
              (thTimes.get(next.id) ?? thTimes.set(next.id, []).get(next.id)!).push({ day, start: toMin(p.start), end: toMin(p.end) });
            });
          }
          for (const g of th) {
            const times = thTimes.get(g.id) ?? [];
            const staff = pickStaff(times.map((t) => `${t.day}-${t.start}`));
            assignments.push({ teaching_group_id: g.id, staff_id: staff, role: "primary", valid_during: `[${TERM.start},)` });
            for (const t of times) {
              slots.push({ version_id: versionId, weekday: t.day, starts_at: toTime(t.start), ends_at: toTime(t.end), teaching_group_id: g.id,
                room_label: room, session_type: "theory", staff_id: staff });
            }
          }

          // Practicals: three 2-hour lab blocks a week; batches run the labs in parallel.
          const blockDays = [0, 2, 4].map((j) => ((j + k) % 5) + 1);
          const divBatches = batches.filter((b) => b.division_id === div.id);
          divBatches.forEach((b, bi) => {
            const pr = groups.filter((g) => g.kind === "batch" && g.batch_id === b.id && g.component === "PR");
            if (!pr.length) return;
            const perGroup = new Map<string, number[]>();
            blockDays.forEach((day, j) => {
              const g = pr[(j + bi) % pr.length];
              (perGroup.get(g.id) ?? perGroup.set(g.id, []).get(g.id)!).push(day);
            });
            for (const g of pr) {
              const days = perGroup.get(g.id) ?? [];
              if (!days.length) continue;
              const staff = pickStaff(days.map((day) => `${day}-${toMin(practical.start)}`));
              assignments.push({ teaching_group_id: g.id, staff_id: staff, role: "primary", valid_during: `[${TERM.start},)` });
              for (const day of days) {
                slots.push({ version_id: versionId, weekday: day, starts_at: practical.start, ends_at: practical.end, teaching_group_id: g.id,
                  room_label: `${d.code} Lab ${k * 3 + bi + 1}`, session_type: "practical", staff_id: staff });
              }
            }
          });
        }
      }
      const teachers = pool.slice(1).sort((a, b) => load.get(a.id)! - load.get(b.id)!);
      deptDivs.forEach((div, i) => classTeachers.push({ division_id: div.id, staff_id: teachers[i % teachers.length].id, valid_during: `[${TERM.start},)` }));
    }
    await bulk(tx, "timetable_versions", versions);
    await bulk(tx, "timetable_slots", slots);
    await bulk(tx, "teaching_assignments", assignments);
    await bulk(tx, "class_teacher_assignments", classTeachers);

    // Two draft revisions in progress (copies of the published slots).
    for (const [code, py] of [["IT", "TE"], ["CHEM", "BE"]]) {
      const dep = departments.find((x) => x.code === code)!;
      const v = versions.find((x) => x.department_id === dep.id && x.program_year === py)!;
      const draftId = randomUUID();
      await tx`insert into public.timetable_versions (id, term_id, department_id, program_year, revision, status, effective_from)
               values (${draftId}, ${termId}, ${dep.id}, ${py}, ${(v.revision as number) + 1}, 'draft', ${todayIso})`;
      await tx`insert into public.timetable_slots (version_id, weekday, starts_at, ends_at, teaching_group_id, room_label, session_type, staff_id)
               select ${draftId}, weekday, starts_at, ends_at, teaching_group_id, room_label, session_type, staff_id
               from public.timetable_slots where version_id = ${v.id as string}`;
    }
    console.log(`Timetables: ${versions.length} published, ${slots.length} weekly slots`);

    // ── Students, enrollments, guardians ──────────────────────────────────
    const students: Record<string, unknown>[] = [];
    const enrollments: Record<string, unknown>[] = [];
    const guardians: Record<string, unknown>[] = [];
    const links: Record<string, unknown>[] = [];
    const propensity: { student_id: string; p: number }[] = [];
    const phones = new Set<string>();
    const serials = new Map<string, number>();
    const phone = () => {
      let p: string;
      do p = `${pick(rng, ["7", "8", "9"])}${digits(rng, 9)}`; while (phones.has(p));
      phones.add(p);
      return p;
    };
    for (const div of divisions) {
      const size = intBetween(rng, 52, 60);
      const roster = Array.from({ length: size }, () => {
        const gender = rng() < 0.42 ? "F" : "M";
        const first = pick(rng, gender === "F" ? FIRST_NAMES_F : FIRST_NAMES_M);
        const last = pick(rng, SURNAMES);
        return { first, last, gender };
      }).sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
      const divBatches = batches.filter((b) => b.division_id === div.id);
      const per = Math.ceil(size / divBatches.length);
      roster.forEach((r, i) => {
        const id = randomUUID();
        const dse = div.program_year !== "FE" && rng() < 0.1;
        const admissionYear = ADMISSION_YEAR[div.program_year] + (dse ? 1 : 0);
        const key = `${admissionYear}${div.dept}`;
        const serial = (serials.get(key) ?? 0) + 1;
        serials.set(key, serial);
        const roll = rng();
        const enrollmentNo = `${String(admissionYear).slice(2)}${div.dept}${String(serial).padStart(4, "0")}`;
        students.push({
          id,
          enrollment_no: enrollmentNo,
          prn: div.program_year === "FE" && rng() < 0.6 ? null : `${admissionYear}0160${digits(rng, 8)}`,
          full_name: `${r.first} ${r.last}`,
          dob: `${Y - 18 - ["FE", "SE", "TE", "BE"].indexOf(div.program_year)}-${String(intBetween(rng, 1, 12)).padStart(2, "0")}-${String(intBetween(rng, 1, 28)).padStart(2, "0")}`,
          gender: r.gender,
          email: `${r.first}.${r.last}.${enrollmentNo}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + `@student.${DOMAIN}`,
          phone: phone(),
          admission_year: admissionYear,
          admission_type: dse ? "direct_second_year" : "fe_regular",
          admitted_department_id: div.department_id,
          status: roll < 0.01 ? "withdrawn" : roll < 0.02 ? "detained" : "active",
        });
        enrollments.push({
          student_id: id, academic_year_id: year.id, term_id: termId, department_id: div.department_id, program_year: div.program_year,
          semester: SEM(div.program_year), division_id: div.id, batch_id: divBatches[Math.min(divBatches.length - 1, Math.floor(i / per))].id,
          roll_no: i + 1, enrollment_type: dse ? "dse" : rng() < 0.04 ? "atkt" : "regular",
          valid_during: `[${TERM.start},${TERM.end}]`, reason: div.program_year === "FE" ? "New admission" : "Promoted at year-end",
        });
        propensity.push({ student_id: id, p: Math.max(0.35, 0.995 - 0.38 * rng() ** 4 - (roll < 0.02 && roll >= 0.01 ? 0.3 : 0)) });
        const relation = rng() < 0.7 ? "Father" : "Mother";
        const gid = randomUUID();
        guardians.push({ id: gid, full_name: `${pick(rng, relation === "Father" ? FIRST_NAMES_M : FIRST_NAMES_F)} ${r.last}`, relation, phone: phone() });
        const v = rng();
        const status = v < 0.07 ? "pending" : v < 0.08 ? "revoked" : "verified";
        links.push({ student_id: id, guardian_id: gid, status, is_primary: true, verified_at: status === "verified" ? new Date().toISOString() : null });
      });
    }
    await bulk(tx, "students", students);
    await bulk(tx, "student_enrollments", enrollments);
    await bulk(tx, "guardians", guardians);
    await bulk(tx, "guardian_links", links);
    console.log(`Students: ${students.length}`);

    // ── Sessions, then term-to-date attendance (set-based SQL) ────────────
    const [{ n: sessions }] = await tx`select sum(app.generate_sessions(id, ${TERM.start}))::int as n from public.timetable_versions where status = 'published'`;
    console.log(`Sessions generated: ${sessions}`);

    await tx`create temp table _prop (student_id uuid primary key, p numeric) on commit drop`;
    for (let i = 0; i < propensity.length; i += 2000) await tx`insert into _prop ${tx(propensity.slice(i, i + 2000) as never)}`;
    const historyFrom = WEEKS > 0 ? new Date(Date.now() - WEEKS * 7 * 86_400_000).toISOString().slice(0, 10) : TERM.start;

    await tx`
      with past as (
        select s.id, s.ends_at, (abs(hashtext(s.id::text)) % 100000) / 100000.0 as h
        from public.class_sessions s where s.ends_at < now() and s.status = 'scheduled' and s.session_date >= ${historyFrom}
      )
      update public.attendance_registers g set
        state = case when now() > p.ends_at + interval '48 hours' then 'locked' when p.h < 0.035 then 'pending' else 'submitted' end,
        submitted_at = case when p.h >= 0.035 then p.ends_at + case when p.h < 0.13 then interval '150 minutes' + p.h * interval '600 minutes'
                                                                   else interval '4 minutes' + p.h * interval '25 minutes' end end,
        submitted_by = case when p.h >= 0.035 then (select staff_id from public.session_staff ss where ss.session_id = p.id and ss.role = 'primary') end,
        is_late = p.h >= 0.035 and p.h < 0.13,
        version = case when p.h >= 0.035 then 1 else 0 end,
        locked_at = case when now() > p.ends_at + interval '48 hours' then p.ends_at + interval '48 hours' end
      from past p where g.session_id = p.id`;
    // Older sessions outside the history window: cancel quietly so they don't show as missing.
    if (WEEKS > 0) {
      await tx`update public.class_sessions set status = 'cancelled', cancel_reason = 'Outside demo history window'
               where session_date < ${historyFrom}`;
    }

    await tx`
      insert into public.attendance_records (session_id, student_id, status_code, source, marked_at, division_id, batch_id, department_id,
                                             term_id, session_date, offering_id, component, weight)
      select s.id, e.student_id,
             case when x.r > 0.997 then 'OD'
                  when x.r < least(0.99, greatest(0, pr.p + ((abs(hashtext(e.student_id::text || s.offering_id::text || s.component)) % 1000) / 1000.0 - 0.5) * 0.12
                                                          + case when s.component = 'PR' then 0.03 else 0 end)) then 'P'
                  else 'A' end,
             'manual', g.submitted_at, e.division_id, e.batch_id, s.department_id, s.term_id, s.session_date, s.offering_id, s.component, 1
      from public.class_sessions s
      join public.attendance_registers g on g.session_id = s.id and g.submitted_at is not null
      join public.teaching_groups tg on tg.id = s.teaching_group_id
      join public.student_enrollments e on e.is_primary and e.valid_during @> s.session_date
        and ((tg.kind = 'division' and e.division_id = tg.division_id) or (tg.kind = 'batch' and e.batch_id = tg.batch_id))
      join public.students st on st.id = e.student_id and st.status = 'active'
      join _prop pr on pr.student_id = e.student_id
      cross join lateral (select (abs(hashtext(s.id::text || e.student_id::text)) % 100000) / 100000.0 as r) x`;
    await tx`
      update public.attendance_registers g set present_count = c.present, total_count = c.total
      from (select session_id, count(*) filter (where status_code in ('P', 'OD')) as present, count(*) as total
            from public.attendance_records group by session_id) c
      where g.session_id = c.session_id`;
    await tx`update public.class_sessions s set status = 'held'
             where exists (select 1 from public.attendance_registers g where g.session_id = s.id and g.submitted_at is not null)`;
    const [{ n: records }] = await tx`select count(*)::int as n from public.attendance_records`;
    await tx`select public.reconcile_attendance_summaries()`;
    console.log(`Attendance records: ${records}`);

    // ── Demo accounts ─────────────────────────────────────────────────────
    const hods = await tx`select s.id, s.full_name, s.email from public.department_staff ds join public.staff s on s.id = ds.staff_id
                          where ds.role = 'hod' and upper_inf(ds.valid_during)`;
    const [prof] = await tx`select s.id, s.full_name from public.staff s join public.departments d on d.id = s.home_department_id
                            where d.code = 'COMP' and s.designation = 'Assistant Professor' order by s.employee_id limit 1`;
    const [stu] = await tx`select s.id, s.full_name from public.students s join public.student_enrollments e on e.student_id = s.id
                           join public.divisions dv on dv.id = e.division_id join public.departments d on d.id = dv.department_id
                           where d.code = 'COMP' and dv.program_year = 'SE' and dv.code = 'A' and s.status = 'active' order by e.roll_no limit 1`;
    const [par] = await tx`select g.id, g.full_name from public.guardian_links gl join public.guardians g on g.id = gl.guardian_id
                           where gl.student_id = ${stu.id}`;
    await tx`update public.guardian_links set status = 'verified' where student_id = ${stu.id}`;

    const accounts: { email: string; name: string; roles: string[]; staffId?: string; studentId?: string; guardianId?: string }[] = [
      { email: `principal@${DOMAIN}`, name: "Dr. Shalini Deshmukh", roles: ["principal"] },
      { email: `admin@${DOMAIN}`, name: "Rohan Kulkarni", roles: ["admin"] },
      { email: `operations@${DOMAIN}`, name: "Neha Patil", roles: ["operations"] },
      { email: `examcell@${DOMAIN}`, name: "Prakash Joshi", roles: ["exam_cell"] },
      ...hods.map((h) => ({ email: h.email as string, name: h.full_name as string, roles: ["hod", "professor"], staffId: h.id as string })),
      { email: `professor@${DOMAIN}`, name: prof.full_name, roles: ["professor"], staffId: prof.id },
      { email: `student@${DOMAIN}`, name: stu.full_name, roles: ["student"], studentId: stu.id },
      { email: `parent@${DOMAIN}`, name: par.full_name, roles: ["parent"], guardianId: par.id },
    ];

    const hosted = (await tx`select to_regclass('auth.identities') is not null as yes`)[0].yes as boolean;
    const admin =
      hosted && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
        : null;
    if (hosted && !admin) throw new Error("Hosted Supabase detected: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to create demo accounts.");

    for (const a of accounts) {
      let uid: string;
      if (admin) {
        const created = await admin.auth.admin.createUser({ email: a.email, password: PASSWORD, email_confirm: true, user_metadata: { name: a.name } });
        if (created.error) {
          const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
          const found = data.users.find((u) => u.email === a.email);
          if (!found) throw created.error;
          uid = found.id;
        } else uid = created.data.user.id;
      } else {
        const [u] = await tx`insert into auth.users (email, encrypted_password) values (${a.email}, crypt(${PASSWORD}, gen_salt('bf')))
                             on conflict (email) do update set email = excluded.email returning id`;
        uid = u.id;
      }
      await tx`insert into public.profiles (id, display_name, email) values (${uid}, ${a.name}, ${a.email})
               on conflict (id) do update set display_name = excluded.display_name, is_active = true`;
      for (const role of a.roles) await tx`insert into public.user_roles (user_id, role) values (${uid}, ${role}) on conflict do nothing`;
      if (a.staffId) await tx`update public.staff set user_id = ${uid} where id = ${a.staffId}`;
      if (a.studentId) await tx`update public.students set user_id = ${uid} where id = ${a.studentId}`;
      if (a.guardianId) await tx`update public.guardians set user_id = ${uid} where id = ${a.guardianId}`;
    }
    console.log(`Demo accounts: ${accounts.length} (password ${PASSWORD})`);
    const userOf = async (email: string) => (await tx`select id from public.profiles where email = ${email}`)[0]?.id as string;
    const ops = await userOf(`operations@${DOMAIN}`);
    const principal = await userOf(`principal@${DOMAIN}`);

    // ── Workflows: leave, staff leave, corrections, exams, announcements ──
    const activeStudents = students.filter((s) => s.status === "active");
    const leaveReasons = ["Fever and doctor's advice to rest", "Family function out of town", "Representing the college at inter-collegiate sports meet",
      "Sister's wedding", "Viral infection, medical certificate attached", "Attending a hackathon at IIT Bombay", "Hospitalised — dengue"];
    const leaveStatuses = [...Array(12).fill("pending"), ...Array(3).fill("needs_info"), ...Array(20).fill("approved"), ...Array(5).fill("rejected")];
    const leaveStudents = new Set<string>();
    const leaves: Record<string, unknown>[] = [];
    for (const status of leaveStatuses) {
      let s;
      do s = pick(rng, activeStudents); while (leaveStudents.has(s.id as string));
      leaveStudents.add(s.id as string);
      const start = new Date(Date.now() - intBetween(rng, -4, 18) * 86_400_000).toISOString().slice(0, 10);
      const len = intBetween(rng, 0, 2);
      const end = new Date(new Date(start).getTime() + len * 86_400_000).toISOString().slice(0, 10);
      const reason = pick(rng, leaveReasons);
      leaves.push({ student_id: s.id, leave_type: /Fever|infection|Hospital/.test(reason) ? "medical" : "full_day",
        leave_period: `["${start} 00:00+05:30","${end} 23:59+05:30")`, from_date: start, to_date: end, reason, status,
        decided_by: ["approved", "rejected"].includes(status) ? ops : null, decided_at: ["approved", "rejected"].includes(status) ? new Date().toISOString() : null });
    }
    await bulk(tx, "leave_requests", leaves);

    const staffLeave: Record<string, unknown>[] = [];
    for (let i = 0; i < 9; i++) {
      const s = pick(rng, staffRows.filter((x) => x.designation !== "Lab Assistant"));
      const day = new Date(Date.now() + intBetween(rng, -3, 10) * 86_400_000).toISOString().slice(0, 10);
      const status = i < 5 ? "pending" : i < 8 ? "approved" : "rejected";
      staffLeave.push({ staff_id: s.id, leave_type: pick(rng, ["casual", "medical", "duty", "earned"]), from_date: day, to_date: day,
        reason: pick(rng, ["Medical appointment", "Paper presentation at IEEE conference", "Family emergency", "Faculty development programme", "University paper-setting duty"]),
        status, decided_by: status === "pending" ? null : principal, decided_at: status === "pending" ? null : new Date().toISOString(),
        substitute_arranged: status === "approved" });
    }
    await bulk(tx, "staff_leave_requests", staffLeave);

    const absences = await tx`
      select r.session_id, r.student_id, ss.staff_id from public.attendance_records r
      join public.attendance_registers g on g.session_id = r.session_id and g.state = 'locked'
      join public.session_staff ss on ss.session_id = r.session_id and ss.role = 'primary'
      where r.status_code = 'A' and r.session_date >= current_date - 14
      order by hashtext(r.session_id::text || r.student_id::text) limit 14`;
    const corrReasons = ["Student was present; marked absent by mistake while scrolling the roster", "Student arrived 5 minutes late after a lab viva",
      "On duty for NSS blood donation camp — OD letter attached", "Roll numbers 23 and 32 were swapped", "Attending the IEEE student branch event with permission"];
    await bulk(tx, "attendance_correction_requests", absences.map((a, i) => ({
      session_id: a.session_id, student_id: a.student_id, requested_by: a.staff_id, from_status: "A",
      to_status: /OD|NSS|IEEE/.test(corrReasons[i % 5]) ? "OD" : "P", reason: corrReasons[i % 5], status: "pending",
    })));

    const exams = [
      ["IAET-1", "Internal Assessment Test 1", `${Y}-08-24`, `${Y}-08-26`, "completed", 196, 0, 196],
      ["IAET-2", "Internal Assessment Test 2", `${Y}-10-12`, `${Y}-10-14`, "completed", 196, 0, 189],
      ["Practical", "Term-work practical & oral examinations", `${Y}-11-02`, `${Y}-11-06`, "published", 684, 0, 0],
      ["End-Sem", "University end-semester theory examinations", `${Y}-11-23`, `${Y}-12-15`, "draft", 228, 3, 0],
    ] as const;
    await bulk(tx, "exams", exams.map(([t, title, s, e, status, papers, conflicts, marked]) => ({
      exam_type: t, title, term_id: termId, starts_on: s, ends_on: e, status, semesters: `{${[1, 3, 5, 7].map((n) => n + (activeParity === "even" ? 1 : 0))}}`,
      paper_count: papers, conflict_count: conflicts, attendance_marked: marked,
    })));

    await bulk(tx, "announcements", [
      { title: "Diwali vacation: 7–11 November", body: "The college will remain closed for Diwali from 7 to 11 November. Lectures resume on 12 November as per the regular timetable.", priority: "important", audience: "college", channels: "{inapp,push,email}", created_by: principal, published: true, recipient_count: 0 },
      { title: "Practical & oral exam schedule published", body: "The term-work practical and oral examination schedule is now available in the app. Check your batch and examiner allocation.", priority: "important", audience: "students", channels: "{inapp,push}", created_by: principal, published: true, recipient_count: 0 },
      { title: "Faculty meeting — submission discipline", body: "All faculty are requested to submit attendance within the period. Registers still pending 30 minutes after the session trigger reminders.", priority: "normal", audience: "staff", channels: "{inapp,email}", created_by: principal, published: true, recipient_count: 0 },
    ]);

    await bulk(tx, "import_jobs", [
      { kind: "students", file_name: `FE_${Y}_admissions_round3.xlsx`, created_by: ops, status: "committed", total_rows: 1140, ok_rows: 1140, error_rows: 0 },
      { kind: "students", file_name: `DSE_${Y}_admissions.xlsx`, created_by: ops, status: "committed", total_rows: 118, ok_rows: 116, error_rows: 2 },
      { kind: "timetable", file_name: "SE_odd_term_timetable_rev2.xlsx", created_by: ops, status: "committed", total_rows: 912, ok_rows: 912, error_rows: 0 },
    ]);
    await tx`insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary)
             values (${principal}, 'Dr. Shalini Deshmukh', 'setup.completed', 'college', '1', 'Demo dataset loaded')`;
  });

  console.log("Done.");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
