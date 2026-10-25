import "server-only";
// Demo attendance engine. In production these are Postgres functions (§8):
// class_sessions come from publish_timetable(), registers from submit_attendance(),
// and attendance_summaries are maintained incrementally. Here sessions are derived
// from the published timetable on demand and register outcomes are synthesised
// deterministically, so any date "just works" without storing millions of rows.
import { addDays, diffDays, istDate, istMinutes, parseISODate, weekday } from "@/shared/dates";
import { attendancePercent } from "@/shared/attendance";
import { hash01 } from "./random";
import { db } from "./store";
import type { ClassSession, ComponentKind, RegisterState, StudentEnrollment, TimetableSlot } from "./types";

// ── Cache keyed by a version counter that actions bump after writes ──────
let version = 0;
const cache = new Map<string, unknown>();
export function invalidate() {
  version++;
  cache.clear();
}
function memo<T>(key: string, fn: () => T): T {
  const k = `${version}|${key}`;
  if (!cache.has(k)) cache.set(k, fn());
  return cache.get(k) as T;
}

// ── Calendar ─────────────────────────────────────────────────────────────
export function activeTerm() {
  return db().terms.find((t) => t.status === "active")!;
}

export function holidayOn(date: string) {
  return db().calendar.find(
    (e) => e.kind === "holiday" && date >= e.date && date <= (e.endDate ?? e.date),
  );
}

export function isWorkingDay(date: string): boolean {
  const term = activeTerm();
  const wd = weekday(date);
  return date >= term.startDate && date <= term.endDate && wd >= 1 && wd <= 5 && !holidayOn(date);
}

export function lastWorkingDay(onOrBefore: string): string {
  let d = onOrBefore;
  for (let i = 0; i < 60 && !isWorkingDay(d); i++) d = addDays(d, -1);
  return d;
}

export function workingDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) out.push(d);
  return out;
}

// ── Indexes ──────────────────────────────────────────────────────────────
function publishedSlots(): TimetableSlot[] {
  return memo("publishedSlots", () => {
    const published = new Set(db().timetableVersions.filter((v) => v.status === "published").map((v) => v.id));
    return db().timetableSlots.filter((s) => published.has(s.versionId));
  });
}

function slotsByWeekday(): Map<number, TimetableSlot[]> {
  return memo("slotsByWeekday", () => {
    const m = new Map<number, TimetableSlot[]>();
    for (const s of publishedSlots()) {
      if (!m.has(s.weekday)) m.set(s.weekday, []);
      m.get(s.weekday)!.push(s);
    }
    for (const list of m.values()) list.sort((a, b) => a.start - b.start);
    return m;
  });
}

/** valid_during contains `date` (primary enrollments only) */
export function isCurrent(e: StudentEnrollment, date: string) {
  return e.isPrimary && e.validFrom <= date && (e.validTo === null || e.validTo >= date);
}

export function rosterSizes() {
  const today = istDate();
  return memo(`rosterSizes|${today}`, () => {
    const division = new Map<string, number>();
    const batch = new Map<string, number>();
    const activeStudents = new Set(db().students.filter((s) => s.status === "active").map((s) => s.id));
    for (const e of db().enrollments) {
      if (!isCurrent(e, today) || !activeStudents.has(e.studentId)) continue;
      division.set(e.divisionId, (division.get(e.divisionId) ?? 0) + 1);
      batch.set(e.batchId, (batch.get(e.batchId) ?? 0) + 1);
    }
    return { division, batch };
  });
}

function divisionPropensity(): Map<string, number> {
  return memo("divisionPropensity", () => {
    const sum = new Map<string, [number, number]>();
    for (const e of currentEnrollments().values()) {
      const p = db().propensity.get(e.studentId) ?? 0.85;
      const cur = sum.get(e.divisionId) ?? [0, 0];
      sum.set(e.divisionId, [cur[0] + p, cur[1] + 1]);
    }
    return new Map([...sum].map(([k, [a, n]]) => [k, a / n]));
  });
}

// ── Sessions and registers ───────────────────────────────────────────────
function isoAt(date: string, minutes: number): string {
  // date + IST minutes → UTC ISO instant
  const ms = parseISODate(date).getTime() + (minutes - 330) * 60_000;
  return new Date(ms).toISOString();
}

export function buildSession(date: string, slot: TimetableSlot, now = new Date()): ClassSession {
  const id = `${date}~${slot.id}`;
  const o = db().sessionOverrides.get(id);
  const base: ClassSession = {
    id,
    date,
    slot,
    status: "scheduled",
    staffId: slot.staffId,
    substituteId: o?.substituteId ?? null,
    cancelReason: o?.cancelled?.reason ?? null,
    register: null,
  };
  if (o?.cancelled) return { ...base, status: "cancelled" };

  const sizes = rosterSizes();
  const total = (slot.batchId ? sizes.batch.get(slot.batchId) : sizes.division.get(slot.divisionId)) ?? 0;
  const today = istDate(now);
  const nowMin = istMinutes(now);
  const h = hash01(id);
  let state: RegisterState;
  let late = false;

  if (date > today || (date === today && nowMin < slot.start)) {
    state = "upcoming";
  } else if (date === today && nowMin < slot.end) {
    state = "pending";
  } else if (date === today) {
    const since = nowMin - slot.end;
    if (h < Math.min(0.93, 0.55 + since / 120)) {
      state = "submitted";
      late = since > 30 && h > 0.8;
    } else state = since > 30 ? "missing" : "pending";
  } else if (h < 0.035) {
    state = "missing";
  } else {
    late = h < 0.13;
    state = diffDays(today, date) * 24 >= db().policy.lockAfterHours ? "locked" : "submitted";
  }
  if (o?.reopened && (state === "locked" || state === "missing")) state = "reopened";

  const marked = state === "submitted" || state === "locked" || state === "reopened";
  const rate = Math.min(1, (divisionPropensity().get(slot.divisionId) ?? 0.85) * (0.9 + 0.14 * hash01(`${id}|p`)) + (slot.component === "PR" ? 0.04 : 0));
  return {
    ...base,
    status: marked ? "held" : "scheduled",
    register: {
      state,
      late,
      total,
      present: marked ? Math.round(total * rate) : 0,
      submittedAt: marked ? isoAt(date, slot.end + (late ? 150 + Math.floor(h * 600) : 4 + Math.floor(h * 25))) : null,
    },
  };
}

export function sessionsOn(date: string, now = new Date()): ClassSession[] {
  if (!isWorkingDay(date)) return [];
  return (slotsByWeekday().get(weekday(date)) ?? []).map((s) => buildSession(date, s, now));
}

export function getSessionById(id: string, now = new Date()): ClassSession | null {
  const [date, slotId] = id.split("~");
  const slot = db().timetableSlots.find((s) => s.id === slotId);
  if (!slot || !date) return null;
  return buildSession(date, slot, now);
}

// ── Summaries ────────────────────────────────────────────────────────────
/** held sessions per teaching group, from term start up to (not including) today */
function heldByGroup(): Map<string, number> {
  const today = istDate();
  return memo(`held|${today}`, () => {
    const term = activeTerm();
    const held = new Map<string, number>();
    const end = today > term.endDate ? term.endDate : addDays(today, -1);
    for (const date of workingDays(term.startDate, end)) {
      for (const slot of slotsByWeekday().get(weekday(date)) ?? []) {
        const s = buildSession(date, slot);
        if (s.status === "held") held.set(slot.teachingGroupId, (held.get(slot.teachingGroupId) ?? 0) + 1);
      }
    }
    return held;
  });
}

/** scheduled sessions left in the term per teaching group, from today on */
function remainingByGroup(): Map<string, number> {
  const today = istDate();
  return memo(`remaining|${today}`, () => {
    const term = activeTerm();
    const rem = new Map<string, number>();
    for (const date of workingDays(today, term.endDate)) {
      for (const slot of slotsByWeekday().get(weekday(date)) ?? []) {
        rem.set(slot.teachingGroupId, (rem.get(slot.teachingGroupId) ?? 0) + 1);
      }
    }
    return rem;
  });
}

export interface SubjectTally {
  teachingGroupId: string;
  subjectId: string;
  component: ComponentKind;
  held: number;
  attended: number;
  percent: number | null;
  remaining: number;
}

function groupsForEnrollment(divisionId: string, batchId: string) {
  return memo(`groups|${divisionId}|${batchId}`, () =>
    db().teachingGroups.filter(
      (g) => g.divisionId === divisionId && (g.kind === "division" || g.batchId === batchId),
    ),
  );
}

/** student → current primary enrollment */
export function currentEnrollments() {
  const today = istDate();
  return memo(`currentEnrollments|${today}`, () => {
    const m = new Map<string, StudentEnrollment>();
    for (const e of db().enrollments) if (isCurrent(e, today)) m.set(e.studentId, e);
    return m;
  });
}

export function studentTallies(studentId: string): SubjectTally[] {
  const e = currentEnrollments().get(studentId);
  if (!e) return [];
  const held = heldByGroup();
  const remaining = remainingByGroup();
  const prop = db().propensity.get(studentId) ?? 0.85;
  return groupsForEnrollment(e.divisionId, e.batchId).map((g) => {
    const h = held.get(g.id) ?? 0;
    const noise = (hash01(`${studentId}|${g.subjectId}|${g.component}`) - 0.5) * 0.12 + (g.component === "PR" ? 0.03 : 0);
    const adj = db().attendedAdjustments.get(`${studentId}|${g.id}`) ?? 0;
    const attended = Math.max(0, Math.min(h, Math.round(h * Math.min(1, Math.max(0, prop + noise))) + adj));
    return {
      teachingGroupId: g.id,
      subjectId: g.subjectId,
      component: g.component,
      held: h,
      attended,
      percent: attendancePercent({ held: h, attended }),
      remaining: remaining.get(g.id) ?? 0,
    };
  });
}

export interface StudentStanding {
  studentId: string;
  held: number;
  attended: number;
  percent: number | null;
  /** lowest subject × component percentage (eligibility basis per_subject_component) */
  lowest: number | null;
  shortSubjects: number;
}

export function allStandings(): Map<string, StudentStanding> {
  const today = istDate();
  return memo(`standings|${today}`, () => {
    const out = new Map<string, StudentStanding>();
    const min = db().policy.minPercent;
    for (const s of db().students) {
      if (s.status !== "active") continue;
      const tallies = studentTallies(s.id);
      const held = tallies.reduce((a, t) => a + t.held, 0);
      const attended = tallies.reduce((a, t) => a + t.attended, 0);
      const pcts = tallies.map((t) => t.percent).filter((p): p is number => p !== null);
      out.set(s.id, {
        studentId: s.id,
        held,
        attended,
        percent: attendancePercent({ held, attended }),
        lowest: pcts.length ? Math.min(...pcts) : null,
        shortSubjects: pcts.filter((p) => p < min).length,
      });
    }
    return out;
  });
}

/** Attendance % per division per working day (heatmap), from submitted registers. */
export function divisionDailyRates(days: string[], divisionIds: Set<string>) {
  const out = new Map<string, Map<string, number | null>>();
  for (const date of days) {
    const agg = new Map<string, [number, number]>();
    for (const s of sessionsOn(date)) {
      if (!divisionIds.has(s.slot.divisionId) || !s.register || s.status !== "held") continue;
      const cur = agg.get(s.slot.divisionId) ?? [0, 0];
      agg.set(s.slot.divisionId, [cur[0] + s.register.present, cur[1] + s.register.total]);
    }
    for (const id of divisionIds) {
      if (!out.has(id)) out.set(id, new Map());
      const a = agg.get(id);
      out.get(id)!.set(date, a && a[1] ? Math.round((a[0] / a[1]) * 1000) / 10 : null);
    }
  }
  return out;
}
