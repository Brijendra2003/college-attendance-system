import "server-only";
import { db } from "@/lib/data/store";
import type { TimetableSlot } from "@/lib/data/types";
import { activeDivisions, batchLabel, deptCode, divisionLabel, staffById, subjectById } from "@/features/common/lookups";

export function versionRows(departmentId: string | null) {
  const store = db();
  return store.timetableVersions
    .filter((v) => !departmentId || v.departmentId === departmentId)
    .map((v) => ({
      ...v,
      deptCode: deptCode(v.departmentId),
      slots: slotsForVersion(v.id).length,
      divisions: activeDivisions(v.departmentId).filter((d) => d.programYear === v.programYear).length,
    }))
    .sort((a, b) => a.departmentId.localeCompare(b.departmentId) || a.programYear.localeCompare(b.programYear) || a.revision - b.revision);
}

/** A draft revision starts as a copy of the published slots for the same scope. */
export function slotsForVersion(versionId: string): TimetableSlot[] {
  const store = db();
  const v = store.timetableVersions.find((x) => x.id === versionId);
  if (!v) return [];
  const own = store.timetableSlots.filter((s) => s.versionId === versionId);
  if (own.length || v.status !== "draft") return own;
  const base = store.timetableVersions.find((x) => x.departmentId === v.departmentId && x.programYear === v.programYear && x.status === "published");
  return base ? store.timetableSlots.filter((s) => s.versionId === base.id) : [];
}

export function versionDetail(versionId: string) {
  const store = db();
  const v = store.timetableVersions.find((x) => x.id === versionId);
  if (!v) return null;
  const divisions = activeDivisions(v.departmentId).filter((d) => d.programYear === v.programYear);
  const slots = slotsForVersion(versionId).map((s) => ({
    ...s,
    subject: subjectById(s.subjectId)!,
    staffName: staffById(s.staffId)?.name ?? "—",
    batch: batchLabel(s.batchId),
  }));
  return { version: v, divisions: divisions.map((d) => ({ ...d, label: divisionLabel(d) })), slots, validation: validateTimetable(slots) };
}

/** validate_timetable(version) — the hard conflicts that block publishing (§11.7). */
export function validateTimetable(slots: (TimetableSlot & { staffName: string })[]) {
  const issues: { severity: "error" | "warning"; message: string }[] = [];
  const store = db();
  const otherSlots = store.timetableSlots;
  const byKey = new Map<string, TimetableSlot[]>();
  for (const s of otherSlots) {
    const k = `${s.staffId}|${s.weekday}|${s.start}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(s);
  }
  for (const s of slots) {
    const clash = (byKey.get(`${s.staffId}|${s.weekday}|${s.start}`) ?? []).filter((o) => o.id !== s.id && o.teachingGroupId !== s.teachingGroupId);
    if (clash.length) issues.push({ severity: "error", message: `${s.staffName} is double-booked on day ${s.weekday} at ${Math.floor(s.start / 60)}:${String(s.start % 60).padStart(2, "0")}` });
    const assigned = store.teachingAssignments.some((a) => a.teachingGroupId === s.teachingGroupId && a.staffId === s.staffId);
    if (!assigned) issues.push({ severity: "error", message: `${s.staffName} is not assigned to the teaching group for ${subjectById(s.subjectId)?.code}` });
  }
  return issues;
}
