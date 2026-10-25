import "server-only";
import { db } from "@/lib/data/store";
import { allStandings, currentEnrollments, studentTallies } from "@/lib/data/engine";
import { batchLabel, deptCode, divisionById, divisionLabel, subjectById } from "@/features/common/lookups";

export const PAGE_SIZE = 25;

export interface StudentFilters {
  scopeDept: string | null;
  dept?: string;
  py?: string;
  division?: string;
  status?: string;
  q?: string;
  flag?: string;
  page: number;
  /** defaults to PAGE_SIZE; pass Infinity for exports */
  pageSize?: number;
}

export function listStudents(f: StudentFilters) {
  const store = db();
  const enr = currentEnrollments();
  const standings = allStandings();
  const linkStatus = new Map<string, string>();
  for (const l of store.guardianLinks) if (l.isPrimary) linkStatus.set(l.studentId, l.status);
  const q = f.q?.toLowerCase().trim();
  const dept = f.scopeDept ?? f.dept;

  const rows = store.students
    .map((s) => ({ s, e: enr.get(s.id) }))
    .filter(({ s, e }) => {
      if (dept && (e?.departmentId ?? s.departmentId) !== dept) return false;
      if (f.py && e?.programYear !== f.py) return false;
      if (f.division && e?.divisionId !== f.division) return false;
      if (f.status ? s.status !== f.status : s.status === "withdrawn") return false;
      if (f.flag === "no_prn" && s.prn) return false;
      if (f.flag === "guardian_pending" && linkStatus.get(s.id) !== "pending") return false;
      if (q && !(s.name.toLowerCase().includes(q) || s.enrollmentNo.toLowerCase().includes(q) || (s.prn ?? "").includes(q) || s.phone.includes(q))) return false;
      return true;
    })
    .sort((a, b) => (a.e?.divisionId ?? "").localeCompare(b.e?.divisionId ?? "") || (a.e?.rollNo ?? 0) - (b.e?.rollNo ?? 0));

  const total = rows.length;
  const size = f.pageSize ?? PAGE_SIZE;
  const page = (size === Infinity ? rows : rows.slice((f.page - 1) * size, f.page * size)).map(({ s, e }) => {
    const div = e ? divisionById(e.divisionId) : undefined;
    return {
      ...s,
      deptCode: deptCode(s.departmentId),
      division: div ? divisionLabel(div) : "—",
      batch: e ? batchLabel(e.batchId) : "",
      rollNo: e?.rollNo ?? null,
      enrollmentType: e?.enrollmentType ?? null,
      standing: standings.get(s.id) ?? null,
      guardian: linkStatus.get(s.id) ?? "none",
      incomplete: !s.prn || linkStatus.get(s.id) !== "verified",
    };
  });
  return { total, rows: page };
}

export function student360(id: string) {
  const store = db();
  const s = store.students.find((x) => x.id === id);
  if (!s) return null;
  const history = store.enrollments
    .filter((e) => e.studentId === id)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
    .map((e) => {
      const div = divisionById(e.divisionId);
      return { ...e, division: div ? divisionLabel(div) : "—", batch: batchLabel(e.batchId), year: store.academicYears.find((y) => y.id === e.academicYearId)?.label ?? "" };
    });
  const current = history.find((e) => e.validTo === null) ?? null;
  const tallies = studentTallies(id).map((t) => ({ ...t, subject: subjectById(t.subjectId)! }));
  const guardians = store.guardianLinks
    .filter((l) => l.studentId === id)
    .map((l) => ({ link: l, guardian: store.guardians.find((g) => g.id === l.guardianId)! }));
  const leave = store.leaveRequests.filter((l) => l.studentId === id);
  const corrections = store.corrections.filter((c) => c.studentId === id);
  const auditTrail = store.audit.filter((a) => a.entityId === id || (a.after as { studentId?: string } | null)?.studentId === id);
  return { student: s, current, history, tallies, standing: allStandings().get(id) ?? null, guardians, leave, corrections, auditTrail };
}

export function divisionOptions(departmentId: string | null) {
  return db()
    .divisions.filter((d) => d.academicYearId === "ay-2026" && (!departmentId || d.departmentId === departmentId))
    .map((d) => ({ value: d.id, label: divisionLabel(d) }));
}

export function batchOptionsByDivision(departmentId: string | null) {
  const store = db();
  return divisionOptions(departmentId).map((d) => ({
    ...d,
    batches: store.batches.filter((b) => b.divisionId === d.value).map((b) => ({ value: b.id, label: `Batch ${b.code}` })),
  }));
}
