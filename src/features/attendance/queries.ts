import "server-only";
import { addDays, formatDate, istDate } from "@/shared/dates";
import { standing } from "@/shared/attendance";
import { db } from "@/lib/data/store";
import {
  activeTerm,
  allStandings,
  currentEnrollments,
  divisionDailyRates,
  getSessionById,
  isWorkingDay,
  lastWorkingDay,
  sessionsOn,
  workingDays,
} from "@/lib/data/engine";
import type { ClassSession, RegisterState } from "@/lib/data/types";
import { batchLabel, deptCode, divisionById, divisionLabel, staffById, subjectById } from "@/features/common/lookups";

export interface SessionRow {
  id: string;
  date: string;
  start: number;
  end: number;
  departmentId: string;
  deptCode: ReturnType<typeof deptCode>;
  divisionId: string;
  division: string;
  batch: string;
  subjectCode: string;
  subjectName: string;
  component: string;
  staffId: string;
  staffName: string;
  substituteName: string | null;
  room: string;
  status: ClassSession["status"];
  cancelReason: string | null;
  state: RegisterState | null;
  present: number;
  total: number;
  late: boolean;
  submittedAt: string | null;
  nudgedAt: string | null;
}

export function toRow(s: ClassSession): SessionRow {
  const div = divisionById(s.slot.divisionId)!;
  const subject = subjectById(s.slot.subjectId)!;
  return {
    id: s.id,
    date: s.date,
    start: s.slot.start,
    end: s.slot.end,
    departmentId: div.departmentId,
    deptCode: deptCode(div.departmentId),
    divisionId: div.id,
    division: divisionLabel(div),
    batch: batchLabel(s.slot.batchId),
    subjectCode: subject.code,
    subjectName: subject.name,
    component: s.slot.component,
    staffId: s.staffId,
    staffName: staffById(s.staffId)?.name ?? "—",
    substituteName: s.substituteId ? (staffById(s.substituteId)?.name ?? null) : null,
    room: s.slot.room,
    status: s.status,
    cancelReason: s.cancelReason,
    state: s.register?.state ?? null,
    present: s.register?.present ?? 0,
    total: s.register?.total ?? 0,
    late: s.register?.late ?? false,
    submittedAt: s.register?.submittedAt ?? null,
    nudgedAt: db().sessionOverrides.get(s.id)?.nudgedAt ?? null,
  };
}

/** Today if it is a working day, otherwise the most recent one. */
export function referenceDate() {
  const today = istDate();
  const date = isWorkingDay(today) ? today : lastWorkingDay(today);
  return { date, isToday: date === today, today };
}

export function sessionRows(date: string, departmentId: string | null): SessionRow[] {
  return sessionsOn(date)
    .map(toRow)
    .filter((r) => !departmentId || r.departmentId === departmentId);
}

export function sessionRow(id: string): SessionRow | null {
  const s = getSessionById(id);
  return s ? toRow(s) : null;
}

export function registerCounts(rows: SessionRow[]) {
  const c = { total: rows.length, held: 0, pending: 0, upcoming: 0, missing: 0, cancelled: 0, late: 0, reopened: 0, present: 0, roster: 0 };
  for (const r of rows) {
    if (r.status === "cancelled") c.cancelled++;
    else if (r.state === "submitted" || r.state === "locked") c.held++;
    else if (r.state === "reopened") c.reopened++;
    else if (r.state === "missing") c.missing++;
    else if (r.state === "upcoming") c.upcoming++;
    else c.pending++;
    if (r.late) c.late++;
    if (r.status === "held") {
      c.present += r.present;
      c.roster += r.total;
    }
  }
  return c;
}

export function recentWorkingDays(n: number, upTo?: string): string[] {
  const end = upTo ?? referenceDate().date;
  const term = activeTerm();
  const days = workingDays(term.startDate, end);
  return days.slice(-n);
}

export function dailyTrend(days: string[], departmentId: string | null) {
  return days.map((date) => {
    const c = registerCounts(sessionRows(date, departmentId));
    return {
      date,
      label: formatDate(date),
      percent: c.roster ? Math.round((c.present / c.roster) * 1000) / 10 : null,
    };
  });
}

export function branchStats() {
  const standings = allStandings();
  const enr = currentEnrollments();
  const min = db().policy.minPercent;
  const agg = new Map<string, { sum: number; n: number; shortage: number }>();
  for (const s of standings.values()) {
    const e = enr.get(s.studentId);
    if (!e || s.percent === null) continue;
    const a = agg.get(e.departmentId) ?? { sum: 0, n: 0, shortage: 0 };
    a.sum += s.percent;
    a.n++;
    if ((s.lowest ?? 100) < min) a.shortage++;
    agg.set(e.departmentId, a);
  }
  return db()
    .departments.filter((d) => d.isActive)
    .map((d) => {
      const a = agg.get(d.id) ?? { sum: 0, n: 0, shortage: 0 };
      return {
        departmentId: d.id,
        code: d.code,
        name: d.name,
        students: a.n,
        percent: a.n ? Math.round((a.sum / a.n) * 10) / 10 : 0,
        shortage: a.shortage,
      };
    });
}

export function divisionStats(departmentId: string | null) {
  const standings = allStandings();
  const enr = currentEnrollments();
  const min = db().policy.minPercent;
  const agg = new Map<string, { sum: number; n: number; shortage: number }>();
  for (const s of standings.values()) {
    const e = enr.get(s.studentId);
    if (!e || s.percent === null || (departmentId && e.departmentId !== departmentId)) continue;
    const a = agg.get(e.divisionId) ?? { sum: 0, n: 0, shortage: 0 };
    a.sum += s.percent;
    a.n++;
    if ((s.lowest ?? 100) < min) a.shortage++;
    agg.set(e.divisionId, a);
  }
  return [...agg.entries()]
    .map(([divisionId, a]) => {
      const div = divisionById(divisionId)!;
      return { divisionId, label: divisionLabel(div), programYear: div.programYear, deptCode: deptCode(div.departmentId), students: a.n, percent: Math.round((a.sum / a.n) * 10) / 10, shortage: a.shortage };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function heatmap(departmentId: string | null, programYear: string | null, days: string[]) {
  const divs = db().divisions.filter(
    (d) => d.academicYearId === "ay-2026" && (!departmentId || d.departmentId === departmentId) && (!programYear || d.programYear === programYear),
  );
  const values = divisionDailyRates(days, new Set(divs.map((d) => d.id)));
  return {
    rows: divs.map((d) => ({ id: d.id, label: divisionLabel(d) })),
    columns: days.map((d) => ({ id: d, label: formatDate(d), sub: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d).getUTCDay()] })),
    values,
  };
}

export interface ShortageRow {
  studentId: string;
  name: string;
  enrollmentNo: string;
  rollNo: number;
  division: string;
  divisionId: string;
  deptCode: ReturnType<typeof deptCode>;
  departmentId: string;
  programYear: string;
  percent: number | null;
  lowest: number | null;
  shortSubjects: number;
  standing: ReturnType<typeof standing>;
}

export function shortageRows(opts: { departmentId: string | null; programYear?: string; divisionId?: string; band?: string }): ShortageRow[] {
  const { minPercent, warnPercent } = db().policy;
  const enr = currentEnrollments();
  const students = new Map(db().students.map((x) => [x.id, x]));
  const out: ShortageRow[] = [];
  for (const s of allStandings().values()) {
    const e = enr.get(s.studentId);
    if (!e) continue;
    if (opts.departmentId && e.departmentId !== opts.departmentId) continue;
    if (opts.programYear && e.programYear !== opts.programYear) continue;
    if (opts.divisionId && e.divisionId !== opts.divisionId) continue;
    const st = standing(s.lowest, minPercent, warnPercent);
    if (opts.band === "warning" ? st !== "warning" : opts.band === "all" ? st === "safe" || st === "na" : st !== "shortage") continue;
    const student = students.get(s.studentId)!;
    const div = divisionById(e.divisionId)!;
    out.push({
      studentId: s.studentId,
      name: student.name,
      enrollmentNo: student.enrollmentNo,
      rollNo: e.rollNo,
      division: divisionLabel(div),
      divisionId: div.id,
      deptCode: deptCode(e.departmentId),
      departmentId: e.departmentId,
      programYear: e.programYear,
      percent: s.percent,
      lowest: s.lowest,
      shortSubjects: s.shortSubjects,
      standing: st,
    });
  }
  return out.sort((a, b) => (a.lowest ?? 0) - (b.lowest ?? 0));
}

export function facultySubmission(departmentId: string | null, days: string[]) {
  const agg = new Map<string, { onTime: number; late: number; missing: number; pending: number }>();
  for (const date of days) {
    for (const r of sessionRows(date, departmentId)) {
      if (r.status === "cancelled" || r.state === "upcoming") continue;
      const a = agg.get(r.staffId) ?? { onTime: 0, late: 0, missing: 0, pending: 0 };
      if (r.state === "missing") a.missing++;
      else if (r.state === "pending") a.pending++;
      else if (r.late) a.late++;
      else a.onTime++;
      agg.set(r.staffId, a);
    }
  }
  return [...agg.entries()]
    .map(([staffId, a]) => {
      const total = a.onTime + a.late + a.missing + a.pending;
      const s = staffById(staffId)!;
      return { staffId, name: s.name, designation: s.designation, deptCode: deptCode(s.departmentId), ...a, total, onTimePercent: total ? Math.round((a.onTime / total) * 1000) / 10 : 0 };
    })
    .sort((a, b) => a.onTimePercent - b.onTimePercent);
}

export function correctionRows(departmentId: string | null, status?: string) {
  const store = db();
  return store.corrections
    .filter((c) => !status || status === "all" || c.status === status)
    .map((c) => {
      const student = store.students.find((s) => s.id === c.studentId)!;
      const session = sessionRow(c.sessionId);
      return { ...c, student, session };
    })
    .filter((c) => !departmentId || c.student.departmentId === departmentId)
    .sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || b.createdAt.localeCompare(a.createdAt));
}

export function termProgress() {
  const term = activeTerm();
  const today = istDate();
  const total = workingDays(term.startDate, term.endDate).length;
  const done = workingDays(term.startDate, today < term.endDate ? addDays(today, -1) : term.endDate).length;
  return { term, total, done, percent: Math.round((done / total) * 100) };
}
