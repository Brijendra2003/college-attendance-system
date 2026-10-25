import "server-only";
import { db, rpc, unwrap } from "@/lib/db";

// All reads run as the signed-in user, so RLS scopes every row (§5).

export type DisplayState = "submitted" | "pending" | "upcoming" | "missing" | "cancelled" | "reopened" | "voided";

export interface SessionRow {
  id: string;
  session_date: string;
  starts_at: string;
  ends_at: string;
  start_time: string;
  end_time: string;
  department_id: string;
  department_code: string;
  division_id: string;
  division_label: string;
  program_year: string;
  batch_id: string | null;
  batch_code: string | null;
  component: "TH" | "PR" | "TUT";
  session_type: string;
  room_label: string | null;
  status: "scheduled" | "held" | "cancelled" | "rescheduled";
  cancel_reason: string | null;
  subject_code: string;
  subject_name: string;
  offering_id: string;
  staff_id: string | null;
  staff_name: string | null;
  substitute_id: string | null;
  substitute_name: string | null;
  register_state: string | null;
  submitted_at: string | null;
  is_late: boolean | null;
  present_count: number | null;
  total_count: number | null;
  nudged_at: string | null;
  display_state: DisplayState;
}

export const batchLabel = (code: string | null) => (code ? `Batch ${code}` : "");

export async function sessionRows(date: string, departmentId: string | null): Promise<SessionRow[]> {
  const s = await db();
  let q = s.from("v_sessions").select("*").eq("session_date", date);
  if (departmentId) q = q.eq("department_id", departmentId);
  return unwrap(await q.order("starts_at").order("division_label").limit(2000)) as SessionRow[];
}

export async function sessionsByIds(ids: string[]): Promise<Map<string, SessionRow>> {
  if (!ids.length) return new Map();
  const s = await db();
  const rows = unwrap(await s.from("v_sessions").select("*").in("id", ids)) as SessionRow[];
  return new Map(rows.map((r) => [r.id, r]));
}

export interface RegisterCounts {
  total: number;
  held: number;
  pending: number;
  upcoming: number;
  missing: number;
  cancelled: number;
  reopened: number;
  late: number;
  present: number;
  roster: number;
}

export const registerCounts = (date: string, departmentId: string | null) =>
  rpc<RegisterCounts>("register_counts", { p_date: date, p_department: departmentId });

/** Today if it has sessions, otherwise the most recent day that did. */
export async function referenceDate() {
  const date = await rpc<string>("reference_date");
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  return { date, today, isToday: date === today };
}

export async function recentWorkingDays(n: number): Promise<string[]> {
  return (await rpc<string[]>("recent_working_days", { p_n: n })) ?? [];
}

export async function dailyTrend(days: number, departmentId: string | null) {
  const rows = await rpc<{ day: string; present: number; total: number; percent: number | null }[]>("daily_trend", { p_days: days, p_department: departmentId });
  return rows.map((r) => ({ date: r.day, percent: r.percent === null ? null : Number(r.percent) }));
}

export interface BranchStat {
  department_id: string;
  code: string;
  name: string;
  students: number;
  percent: number | null;
  shortage: number;
}

export async function branchStats(): Promise<BranchStat[]> {
  const rows = await rpc<BranchStat[]>("branch_stats");
  return rows.map((r) => ({ ...r, percent: r.percent === null ? null : Number(r.percent) }));
}

export interface DivisionStat {
  division_id: string;
  label: string;
  department_code: string;
  program_year: string;
  students: number;
  percent: number | null;
  shortage: number;
}

export async function divisionStats(departmentId: string | null, programYear: string | null): Promise<DivisionStat[]> {
  const rows = await rpc<DivisionStat[]>("division_stats", { p_department: departmentId, p_program_year: programYear });
  return rows.map((r) => ({ ...r, percent: r.percent === null ? null : Number(r.percent) }));
}

export async function heatmap(days: number, departmentId: string | null, programYear: string | null) {
  const rows = await rpc<{ division_id: string; label: string; day: string; percent: number | null }[]>("division_daily_rates", {
    p_days: days,
    p_department: departmentId,
    p_program_year: programYear,
  });
  const dayList = [...new Set(rows.map((r) => r.day))].sort();
  const divs = new Map<string, string>();
  const values = new Map<string, Map<string, number | null>>();
  for (const r of rows) {
    divs.set(r.division_id, r.label);
    if (!values.has(r.division_id)) values.set(r.division_id, new Map());
    values.get(r.division_id)!.set(r.day, r.percent === null ? null : Number(r.percent));
  }
  return { rows: [...divs].map(([id, label]) => ({ id, label })), days: dayList, values };
}

export async function componentSplit(days: number, departmentId: string | null) {
  const rows = await rpc<{ component: string; present: number; total: number }[]>("component_split", { p_days: days, p_department: departmentId });
  const of = (k: string) => rows.find((r) => r.component === k) ?? { present: 0, total: 0 };
  return { TH: of("TH"), PR: of("PR") };
}

export interface FacultyRow {
  staff_id: string;
  full_name: string;
  designation: string;
  department_code: string;
  on_time: number;
  late: number;
  missing: number;
  pending: number;
  total: number;
  on_time_percent: number | null;
}

export async function facultySubmission(days: number, departmentId: string | null): Promise<FacultyRow[]> {
  const rows = await rpc<FacultyRow[]>("faculty_submission", { p_days: days, p_department: departmentId });
  return rows.map((r) => ({ ...r, on_time_percent: r.on_time_percent === null ? null : Number(r.on_time_percent) }));
}

export interface StudentListRow {
  id: string;
  enrollment_no: string;
  prn: string | null;
  full_name: string;
  status: string;
  department_id: string;
  department_code: string;
  program_year: string | null;
  division_id: string | null;
  division_label: string | null;
  batch_code: string | null;
  roll_no: number | null;
  enrollment_type: string | null;
  guardian_status: string | null;
  percent: number | null;
  lowest: number | null;
  short_subjects: number | null;
}

export async function shortageList(opts: {
  band?: string;
  departmentId: string | null;
  programYear?: string;
  divisionId?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: StudentListRow[]; total: number }> {
  const s = await db();
  const from = (opts.page - 1) * opts.pageSize;
  const res = await s
    .rpc("shortage_list", { p_band: opts.band ?? "shortage", p_department: opts.departmentId, p_program_year: opts.programYear ?? null, p_division: opts.divisionId ?? null }, { count: "exact" })
    .range(from, from + opts.pageSize - 1);
  return { rows: unwrap(res) as StudentListRow[], total: res.count ?? 0 };
}

export async function termProgress() {
  return rpc<{ label: string; done: number; total: number } | null>("term_progress");
}

export interface CorrectionRow {
  id: string;
  session_id: string;
  student_id: string;
  from_status: string;
  to_status: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  student: { full_name: string; enrollment_no: string } | null;
  requester: { full_name: string } | null;
  decider: { display_name: string } | null;
  session?: SessionRow;
}

export async function correctionRows(status: string): Promise<CorrectionRow[]> {
  const s = await db();
  let q = s
    .from("attendance_correction_requests")
    .select("id, session_id, student_id, from_status, to_status, reason, status, created_at, decided_at, decision_note, student:students(full_name, enrollment_no), requester:staff(full_name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (status !== "all") q = q.eq("status", status);
  const rows = unwrap(await q) as unknown as CorrectionRow[];
  const sessions = await sessionsByIds([...new Set(rows.map((r) => r.session_id))]);
  return rows.map((r) => ({ ...r, session: sessions.get(r.session_id) }));
}

export async function correctionCounts() {
  const s = await db();
  const count = async (st: string) => (await s.from("attendance_correction_requests").select("id", { count: "exact", head: true }).eq("status", st)).count ?? 0;
  const [pending, approved, rejected] = await Promise.all([count("pending"), count("approved"), count("rejected")]);
  return { pending, approved, rejected };
}
