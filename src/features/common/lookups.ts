import "server-only";
import type { DepartmentCode } from "@/shared/tokens";
import { db, ACTIVE_YEAR_ID } from "@/lib/data/store";
import type { Department, Division, ProgramYearCode } from "@/lib/data/types";

// Small read helpers shared by the feature query modules.

export function departments(): Department[] {
  return db().departments.filter((d) => d.isActive);
}

export function departmentById(id: string): Department | undefined {
  return db().departments.find((d) => d.id === id);
}

export function deptCode(id: string): DepartmentCode {
  return departmentById(id)?.code ?? "COMP";
}

export function activeDivisions(departmentId?: string | null): Division[] {
  return db().divisions.filter(
    (d) => d.academicYearId === ACTIVE_YEAR_ID && (!departmentId || d.departmentId === departmentId),
  );
}

export function divisionById(id: string): Division | undefined {
  return db().divisions.find((d) => d.id === id);
}

/** "SE COMP-A" */
export function divisionLabel(d: Pick<Division, "departmentId" | "programYear" | "code">): string {
  return `${d.programYear} ${deptCode(d.departmentId)}-${d.code}`;
}

export function batchLabel(batchId: string | null): string {
  if (!batchId) return "";
  return `Batch ${batchId.slice(batchId.lastIndexOf("-b") + 2)}`;
}

export function staffById(id: string | null | undefined) {
  return id ? db().staff.find((s) => s.id === id) : undefined;
}

/** Resolves a profile id or a staff id to a display name. */
export function actorName(id: string | null | undefined): string {
  if (!id) return "—";
  const store = db();
  return store.profiles.find((p) => p.id === id)?.name ?? store.staff.find((s) => s.id === id)?.name ?? id;
}

export function subjectById(id: string) {
  return db().subjects.find((s) => s.id === id);
}

export function currentHod(departmentId: string) {
  const row = db().departmentStaff.find((d) => d.departmentId === departmentId && d.role === "hod" && d.validTo === null);
  return row ? { row, staff: staffById(row.staffId)! } : null;
}

export const PROGRAM_YEAR_OPTIONS: { value: ProgramYearCode; label: string }[] = [
  { value: "FE", label: "FE — First Year" },
  { value: "SE", label: "SE — Second Year" },
  { value: "TE", label: "TE — Third Year" },
  { value: "BE", label: "BE — Final Year" },
];

export function departmentOptions(only?: string | null) {
  return departments()
    .filter((d) => !only || d.id === only)
    .map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }));
}
