import "server-only";
import { db } from "@/lib/data/store";
import { batchLabel, currentHod, deptCode, divisionById, divisionLabel, subjectById } from "@/features/common/lookups";
import { facultySubmission, recentWorkingDays } from "@/features/attendance/queries";

export function listStaff(opts: { departmentId: string | null; q?: string; designation?: string }) {
  const store = db();
  const q = opts.q?.toLowerCase();
  const load = new Map<string, number>();
  for (const s of store.timetableSlots) load.set(s.staffId, (load.get(s.staffId) ?? 0) + (s.end - s.start) / 60);
  const classTeacherOf = new Map(store.divisions.filter((d) => d.academicYearId === "ay-2026" && d.classTeacherId).map((d) => [d.classTeacherId!, divisionLabel(d)]));
  return store.staff
    .filter((s) => (!opts.departmentId || s.departmentId === opts.departmentId) && (!opts.designation || s.designation === opts.designation))
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.employeeId.toLowerCase().includes(q))
    .map((s) => ({
      ...s,
      deptCode: deptCode(s.departmentId),
      isHod: currentHod(s.departmentId)?.staff.id === s.id,
      weeklyHours: load.get(s.id) ?? 0,
      classTeacherOf: classTeacherOf.get(s.id) ?? null,
    }))
    .sort((a, b) => a.departmentId.localeCompare(b.departmentId) || Number(b.isHod) - Number(a.isHod) || a.name.localeCompare(b.name));
}

export function staffDetail(id: string) {
  const store = db();
  const s = store.staff.find((x) => x.id === id);
  if (!s) return null;
  const memberships = store.departmentStaff.filter((d) => d.staffId === id).sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const assignments = store.teachingAssignments
    .filter((a) => a.staffId === id && a.validTo === null)
    .map((a) => {
      const g = store.teachingGroups.find((x) => x.id === a.teachingGroupId)!;
      const div = divisionById(g.divisionId)!;
      return { ...a, group: g, subject: subjectById(g.subjectId)!, division: divisionLabel(div), batch: batchLabel(g.batchId) };
    })
    .sort((a, b) => a.division.localeCompare(b.division));
  const slots = store.timetableSlots
    .filter((x) => x.staffId === id && !x.versionId.includes("-r"))
    .map((x) => ({ ...x, subject: subjectById(x.subjectId)!, division: divisionLabel(divisionById(x.divisionId)!), batch: batchLabel(x.batchId) }));
  const submission = facultySubmission(s.departmentId, recentWorkingDays(20)).find((r) => r.staffId === id) ?? null;
  const classTeacherOf = store.divisions.filter((d) => d.classTeacherId === id && d.academicYearId === "ay-2026").map(divisionLabel);
  return { staff: s, memberships, assignments, slots, submission, classTeacherOf, isHod: currentHod(s.departmentId)?.staff.id === id };
}
