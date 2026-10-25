import "server-only";
import { cache } from "react";
import { db, unwrap } from "@/lib/db";

// Request-scoped reference reads shared by the feature modules. Each is
// memoised for the request with React cache(); nothing is cached across users.

export interface Department {
  id: string;
  code: string;
  name: string;
  established: number | null;
  intake: number | null;
  is_active: boolean;
  sort_order: number;
}

export const getDepartments = cache(async (): Promise<Department[]> => {
  const s = await db();
  return unwrap(await s.from("departments").select("id, code, name, established, intake, is_active, sort_order").eq("is_active", true).order("sort_order").order("code"));
});

export async function departmentById(id: string | null | undefined) {
  if (!id) return undefined;
  return (await getDepartments()).find((d) => d.id === id);
}

export async function deptCodeOf(id: string | null | undefined) {
  return (await departmentById(id))?.code ?? "—";
}

export async function departmentOptions(only?: string | null) {
  return (await getDepartments()).filter((d) => !only || d.id === only).map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }));
}

export interface College {
  name: string;
  short_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  university: string;
  timezone: string;
  principal_name: string | null;
}

export const getCollege = cache(async (): Promise<College> => {
  const s = await db();
  const rows = unwrap(await s.from("college").select("name, short_name, address, phone, email, university, timezone, principal_name").limit(1));
  return (
    (rows as College[])[0] ?? { name: "College", short_name: "", address: null, phone: null, email: null, university: "University of Mumbai", timezone: "Asia/Kolkata", principal_name: null }
  );
});

export interface Term {
  id: string;
  academic_year_id: string;
  parity: "odd" | "even";
  label: string;
  start_date: string;
  end_date: string;
  status: string;
}

export const getActiveContext = cache(async () => {
  const s = await db();
  const [years, terms] = await Promise.all([
    s.from("academic_years").select("id, label, start_date, end_date, status").order("start_date"),
    s.from("academic_terms").select("id, academic_year_id, parity, label, start_date, end_date, status").order("start_date"),
  ]);
  const allYears = unwrap(years) as { id: string; label: string; start_date: string; end_date: string; status: string }[];
  const allTerms = unwrap(terms) as Term[];
  const year = allYears.find((y) => y.status === "active") ?? allYears.at(-1) ?? null;
  const term = allTerms.find((t) => t.status === "active") ?? allTerms.find((t) => t.academic_year_id === year?.id) ?? null;
  return { year, term, years: allYears, terms: allTerms };
});

export interface Policy {
  min_percent: number;
  warn_percent: number;
  count_mode: "session" | "hours";
  eligibility_basis: "per_subject_component" | "per_subject" | "aggregate";
  default_unmarked_status: string;
  edit_window_hours: number;
  lock_after_hours: number;
  missing_grace_minutes: number;
  leave_applies_retroactively: boolean;
  effective_from: string;
}

export const getPolicy = cache(async (): Promise<Policy> => {
  const s = await db();
  const rows = unwrap(
    await s
      .from("attendance_policies")
      .select("min_percent, warn_percent, count_mode, eligibility_basis, default_unmarked_status, edit_window_hours, lock_after_hours, missing_grace_minutes, leave_applies_retroactively, effective_from")
      .eq("scope", "college")
      .is("effective_to", null)
      .limit(1),
  ) as Policy[];
  const p = rows[0];
  return p
    ? { ...p, min_percent: Number(p.min_percent), warn_percent: Number(p.warn_percent) }
    : { min_percent: 75, warn_percent: 80, count_mode: "session", eligibility_basis: "per_subject_component", default_unmarked_status: "A", edit_window_hours: 24, lock_after_hours: 48, missing_grace_minutes: 30, leave_applies_retroactively: true, effective_from: "2020-01-01" };
});

export const PROGRAM_YEAR_OPTIONS = [
  { value: "FE", label: "FE — First Year" },
  { value: "SE", label: "SE — Second Year" },
  { value: "TE", label: "TE — Third Year" },
  { value: "BE", label: "BE — Final Year" },
];

export interface DivisionRow {
  id: string;
  academic_year_id: string;
  department_id: string;
  department_code: string;
  program_year: string;
  code: string;
  capacity: number;
  room_label: string | null;
  label: string;
  students: number;
  batches: { id: string; code: string; students: number }[] | null;
  class_teacher_id: string | null;
  class_teacher_name: string | null;
}

/** Divisions of the active academic year, with live counts. */
export const getDivisions = cache(async (departmentId: string | null = null, programYear: string | null = null): Promise<DivisionRow[]> => {
  const s = await db();
  const { year } = await getActiveContext();
  if (!year) return [];
  let q = s.from("v_divisions").select("*").eq("academic_year_id", year.id);
  if (departmentId) q = q.eq("department_id", departmentId);
  if (programYear) q = q.eq("program_year", programYear);
  const rows = unwrap(await q.order("label")) as DivisionRow[];
  const order = new Map((await getDepartments()).map((d) => [d.id, d.sort_order]));
  const py = ["FE", "SE", "TE", "BE"];
  return rows.sort(
    (a, b) => (order.get(a.department_id) ?? 0) - (order.get(b.department_id) ?? 0) || py.indexOf(a.program_year) - py.indexOf(b.program_year) || a.code.localeCompare(b.code),
  );
});

export async function divisionOptions(departmentId: string | null) {
  return (await getDivisions(departmentId)).map((d) => ({ value: d.id, label: d.label }));
}

export async function batchOptionsByDivision(departmentId: string | null) {
  return (await getDivisions(departmentId)).map((d) => ({
    value: d.id,
    label: d.label,
    batches: (d.batches ?? []).map((b) => ({ value: b.id, label: `Batch ${b.code}` })),
  }));
}
