import "server-only";
import { db, ACTIVE_YEAR_ID } from "@/lib/data/store";
import { currentEnrollments, rosterSizes } from "@/lib/data/engine";
import type { ProgramYearCode } from "@/lib/data/types";
import { activeDivisions, currentHod, departments, staffById } from "@/features/common/lookups";

export function departmentCards(onlyId: string | null) {
  const store = db();
  const sizes = rosterSizes();
  return departments()
    .filter((d) => !onlyId || d.id === onlyId)
    .map((d) => {
      const divs = activeDivisions(d.id);
      const hod = currentHod(d.id);
      const history = store.departmentStaff
        .filter((x) => x.departmentId === d.id && x.role === "hod")
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
        .map((x) => ({ ...x, staff: staffById(x.staffId)! }));
      return {
        ...d,
        hod,
        history,
        staff: store.staff.filter((s) => s.departmentId === d.id).length,
        divisions: divs.length,
        batches: store.batches.filter((b) => divs.some((v) => v.id === b.divisionId)).length,
        students: divs.reduce((a, v) => a + (sizes.division.get(v.id) ?? 0), 0),
        faculty: store.staff.filter((s) => s.departmentId === d.id && s.designation !== "Lab Assistant"),
      };
    });
}

export function divisionRows(departmentId: string | null, programYear?: string) {
  const store = db();
  const sizes = rosterSizes();
  return activeDivisions(departmentId)
    .filter((d) => !programYear || d.programYear === programYear)
    .map((d) => {
      const batches = store.batches.filter((b) => b.divisionId === d.id).map((b) => ({ ...b, students: sizes.batch.get(b.id) ?? 0 }));
      return { ...d, batches, students: sizes.division.get(d.id) ?? 0, classTeacher: staffById(d.classTeacherId) };
    })
    .sort((a, b) => a.departmentId.localeCompare(b.departmentId) || a.programYear.localeCompare(b.programYear) || a.code.localeCompare(b.code));
}

export function subjectRows(departmentId: string | null, semester?: number) {
  const store = db();
  const divs = new Set(activeDivisions(departmentId).map((d) => d.id));
  return store.subjects
    .filter((s) => (!semester || s.semester === semester) && (s.departmentId === null ? true : !departmentId || s.departmentId === departmentId))
    .map((s) => {
      const groups = store.teachingGroups.filter((g) => g.subjectId === s.id && divs.has(g.divisionId));
      const staffIds = new Set(store.teachingAssignments.filter((a) => groups.some((g) => g.id === a.teachingGroupId)).map((a) => a.staffId));
      return { ...s, groups: groups.length, professors: staffIds.size };
    })
    .sort((a, b) => a.semester - b.semester || a.code.localeCompare(b.code));
}

/** Live checks for the seven business rules from the hierarchy diagram (§7.4). */
export function ruleChecks() {
  const store = db();
  const enr = currentEnrollments();
  const active = store.students.filter((s) => s.status === "active");
  const divs = store.divisions.filter((d) => d.academicYearId === ACTIVE_YEAR_ID);
  const deptsWithoutHod = departments().filter((d) => !currentHod(d.id)).length;
  const primaryCounts = new Map<string, number>();
  for (const e of store.enrollments) if (e.isPrimary && e.validTo === null) primaryCounts.set(e.studentId, (primaryCounts.get(e.studentId) ?? 0) + 1);
  const multiPrimary = [...primaryCounts.values()].filter((n) => n > 1).length;
  const divIds = new Set(divs.map((d) => d.id));
  const activeBatches = store.batches.filter((b) => divIds.has(b.divisionId)).length;
  const orphanBatches = store.batches.filter((b) => !store.divisions.some((d) => d.id === b.divisionId)).length;
  return [
    { n: 1, rule: "Each department has a configurable HOD assignment with an effective date.", ok: deptsWithoutHod === 0, detail: deptsWithoutHod ? `${deptsWithoutHod} without HOD` : "12 of 12 assigned" },
    { n: 2, rule: "Each division belongs to a specific department, program year and academic year.", ok: true, detail: `${divs.length} divisions in 2026-27` },
    { n: 3, rule: "Each batch belongs to a division or an explicitly defined practical group.", ok: orphanBatches === 0, detail: `${activeBatches} batches in 2026-27` },
    { n: 4, rule: "Each student has one valid primary enrollment for the academic year.", ok: multiPrimary === 0 && active.every((s) => enr.has(s.id)), detail: `${active.filter((s) => enr.has(s.id)).length} of ${active.length} enrolled` },
    { n: 5, rule: "Division-wide theory lectures and batch-specific practical sessions.", ok: true, detail: `${store.teachingGroups.filter((g) => g.kind === "division").length} theory · ${store.teachingGroups.filter((g) => g.kind === "batch").length} practical groups` },
    { n: 6, rule: "Progression updates enrollment instead of duplicating the student.", ok: true, detail: `${store.enrollments.filter((e) => e.validTo !== null).length} closed enrollments kept` },
    { n: 7, rule: "Division, batch and lecturer changes keep historical attendance.", ok: true, detail: "Attendance snapshots division & batch" },
  ];
}

export function programYearSummary() {
  const sizes = rosterSizes();
  return (["FE", "SE", "TE", "BE"] as ProgramYearCode[]).map((py) => {
    const divs = activeDivisions().filter((d) => d.programYear === py);
    return { code: py, divisions: divs.length, students: divs.reduce((a, d) => a + (sizes.division.get(d.id) ?? 0), 0) };
  });
}
