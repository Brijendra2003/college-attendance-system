import "server-only";
import { db, rpc, unwrap } from "@/lib/db";
import type { StudentListRow } from "@/features/attendance/queries";

export const PAGE_SIZE = 25;

export interface StudentFilters {
  dept?: string | null;
  py?: string;
  division?: string;
  status?: string;
  q?: string;
  flag?: string;
  page: number;
  /** Infinity for exports (fetched in pages of 1000) */
  pageSize?: number;
}

/** The subset of the PostgREST filter builder these filters use. */
interface Filterable {
  eq(column: string, value: unknown): Filterable;
  neq(column: string, value: unknown): Filterable;
  is(column: string, value: null): Filterable;
  or(filters: string): Filterable;
}

/** Applies the list filters; typed structurally to keep the builder's generics out of it. */
function applyFilters<T>(query: T, f: StudentFilters): T {
  let q = query as unknown as Filterable;
  if (f.dept) q = q.eq("department_id", f.dept);
  if (f.py) q = q.eq("program_year", f.py);
  if (f.division) q = q.eq("division_id", f.division);
  q = f.status ? q.eq("status", f.status) : q.neq("status", "withdrawn");
  if (f.flag === "no_prn") q = q.is("prn", null);
  if (f.flag === "guardian_pending") q = q.eq("guardian_status", "pending");
  const term = f.q?.trim().replace(/[%,()]/g, " ");
  if (term) q = q.or(`full_name.ilike.%${term}%,enrollment_no.ilike.%${term}%,prn.ilike.%${term}%,phone.ilike.%${term}%`);
  return q as unknown as T;
}

export async function listStudents(f: StudentFilters): Promise<{ rows: StudentListRow[]; total: number }> {
  const s = await db();
  const cols = "id, enrollment_no, prn, full_name, status, department_id, department_code, program_year, division_id, division_label, batch_code, roll_no, enrollment_type, guardian_status, percent, lowest, short_subjects";
  const size = f.pageSize ?? PAGE_SIZE;
  if (size === Infinity) {
    const rows: StudentListRow[] = [];
    for (let from = 0; ; from += 1000) {
      const res = await applyFilters(s.from("v_students").select(cols), f).order("department_code").order("division_label").order("roll_no").range(from, from + 999);
      const chunk = unwrap(res) as StudentListRow[];
      rows.push(...chunk);
      if (chunk.length < 1000) break;
    }
    return { rows, total: rows.length };
  }
  const from = (f.page - 1) * size;
  const res = await applyFilters(s.from("v_students").select(cols, { count: "exact" }), f)
    .order("department_code")
    .order("division_label")
    .order("roll_no")
    .range(from, from + size - 1);
  return { rows: unwrap(res) as StudentListRow[], total: res.count ?? 0 };
}

export interface StudentDetail extends StudentListRow {
  dob: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  admission_year: number;
  admission_type: string;
  semester: number | null;
  batch_id: string | null;
  enrollment_id: string | null;
  held: number | null;
  attended: number | null;
}

export async function student360(id: string) {
  const s = await db();
  const detail = unwrap(await s.from("v_students").select("*").eq("id", id).maybeSingle()) as StudentDetail | null;
  if (!detail) return null;
  const [history, tallies, guardians, leave, corrections] = await Promise.all([
    s
      .from("student_enrollments")
      .select("id, program_year, semester, roll_no, enrollment_type, valid_during, reason, division:v_divisions(label), batch:batches(code), year:academic_years(label)")
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
    rpc<{ offering_id: string; subject_code: string; subject_name: string; component: string; held: number; attended: number; percent: number | null; remaining: number }[]>(
      "student_tallies",
      { p_student: id },
    ),
    s.from("guardian_links").select("id, status, is_primary, guardian:guardians(full_name, relation, phone, user_id)").eq("student_id", id),
    s.from("leave_requests").select("id, leave_type, from_date, to_date, reason, status").eq("student_id", id).order("from_date", { ascending: false }),
    s.from("attendance_correction_requests").select("id, from_status, to_status, reason, status, created_at").eq("student_id", id).order("created_at", { ascending: false }),
  ]);
  return {
    student: detail,
    history: unwrap(history) as unknown as {
      id: string;
      program_year: string;
      semester: number;
      roll_no: number;
      enrollment_type: string;
      valid_during: string;
      reason: string | null;
      division: { label: string } | null;
      batch: { code: string } | null;
      year: { label: string } | null;
    }[],
    tallies,
    guardians: unwrap(guardians) as unknown as {
      id: string;
      status: string;
      is_primary: boolean;
      guardian: { full_name: string; relation: string; phone: string; user_id: string | null } | null;
    }[],
    leave: unwrap(leave) as { id: string; leave_type: string; from_date: string; to_date: string; reason: string; status: string }[],
    corrections: unwrap(corrections) as { id: string; from_status: string; to_status: string; reason: string; status: string; created_at: string }[],
  };
}

export async function auditTrailFor(entityId: string) {
  const s = await db();
  return unwrap(await s.from("audit_log").select("id, at, actor_name, summary, reason").eq("entity_id", entityId).order("at", { ascending: false }).limit(20)) as {
    id: number;
    at: string;
    actor_name: string;
    summary: string;
    reason: string | null;
  }[];
}
