import "server-only";
import { formatDate, formatDateTime } from "@/shared/dates";
import { db, unwrap } from "@/lib/db";
import { divisionStats, facultySubmission, referenceDate, sessionRows } from "@/features/attendance/queries";
import { listStudents } from "@/features/students/queries";

export type Cell = string | number | null;
export interface ReportData {
  title: string;
  subtitle?: string;
  columns: { label: string; width?: number; align?: "left" | "right" }[];
  rows: Cell[][];
}

type Filters = Record<string, string | undefined>;
export type Format = "csv" | "xlsx" | "pdf";

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  grouping: string;
  formats: Format[];
  /** RLS scopes every query to the caller (an HOD gets only their department). */
  build(f: Filters): Promise<ReportData>;
}

/** PostgREST returns at most ~1000 rows per request; walk the pages. */
async function all<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = unwrap(await fetchPage(from, from + 999)) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

const pct = (v: number | string | null) => (v === null || v === undefined ? null : Number(v));

export const REPORTS: ReportDef[] = [
  {
    key: "attendance-summary",
    title: "Attendance summary",
    description: "Average term-to-date attendance and shortage count per division.",
    grouping: "Branch / year / division",
    formats: ["xlsx", "csv", "pdf"],
    async build(f) {
      const rows = await divisionStats(f.dept ?? null, f.py ?? null);
      return {
        title: "Attendance summary by division",
        columns: [{ label: "Division" }, { label: "Branch" }, { label: "Year" }, { label: "Students", align: "right" }, { label: "Average %", align: "right" }, { label: "Shortage", align: "right" }],
        rows: rows.map((d) => [d.label, d.department_code, d.program_year, d.students, d.percent, d.shortage]),
      };
    },
  },
  {
    key: "student-wise",
    title: "Student-wise report",
    description: "Every student × subject × component with held, attended and percentage.",
    grouping: "Student × subject × component",
    formats: ["xlsx", "csv"],
    async build(f) {
      const s = await db();
      const rows = await all<{
        held: number;
        attended: number;
        percent: number | null;
        component: string;
        student: { enrollment_no: string; full_name: string };
        offering: { department_id: string; subject: { code: string; name: string } };
      }>((from, to) => {
        let q = s
          .from("attendance_summaries")
          .select("held, attended, percent, component, student:students!inner(enrollment_no, full_name), offering:subject_offerings!inner(department_id, subject:subjects(code, name))");
        if (f.dept) q = q.eq("offering.department_id", f.dept);
        return q.order("student_id").range(from, to) as never;
      });
      return {
        title: "Student-wise attendance",
        columns: [{ label: "Enrollment no" }, { label: "Name" }, { label: "Subject code" }, { label: "Subject" }, { label: "Component" }, { label: "Held", align: "right" }, { label: "Attended", align: "right" }, { label: "Percent", align: "right" }],
        rows: rows.map((r) => [r.student.enrollment_no, r.student.full_name, r.offering.subject.code, r.offering.subject.name, r.component, Number(r.held), Number(r.attended), pct(r.percent)]),
      };
    },
  },
  {
    key: "shortage",
    title: "Shortage / detention list",
    description: "Students below the policy threshold in at least one subject; feeds exam eligibility.",
    grouping: "Policy threshold, term",
    formats: ["xlsx", "pdf", "csv"],
    async build(f) {
      const s = await db();
      const rows = await all<{ enrollment_no: string; full_name: string; department_code: string; division_label: string; roll_no: number; percent: number; lowest: number; short_subjects: number }>(
        (from, to) =>
          s
            .rpc("shortage_list", { p_band: f.band ?? "shortage", p_department: f.dept ?? null, p_program_year: f.py ?? null, p_division: f.division ?? null })
            .range(from, to) as never,
      );
      return {
        title: f.band === "warning" ? "At-risk students (warning band)" : "Shortage / detention list",
        columns: [{ label: "Enrollment no" }, { label: "Name" }, { label: "Branch" }, { label: "Division" }, { label: "Roll", align: "right" }, { label: "Overall %", align: "right" }, { label: "Lowest %", align: "right" }, { label: "Subjects short", align: "right" }],
        rows: rows.map((r) => [r.enrollment_no, r.full_name, r.department_code, r.division_label, r.roll_no, pct(r.percent), pct(r.lowest), r.short_subjects]),
      };
    },
  },
  {
    key: "professor-submission",
    title: "Professor submission report",
    description: "On-time, late and missing registers per professor over the last 20 teaching days.",
    grouping: "Professor × period",
    formats: ["xlsx", "csv"],
    async build(f) {
      const rows = await facultySubmission(20, f.dept ?? null);
      return {
        title: "Professor submission report (last 20 teaching days)",
        columns: [{ label: "Professor" }, { label: "Branch" }, { label: "Designation" }, { label: "On time", align: "right" }, { label: "Late", align: "right" }, { label: "Missing", align: "right" }, { label: "Pending", align: "right" }, { label: "On-time %", align: "right" }],
        rows: rows.map((r) => [r.full_name, r.department_code, r.designation, r.on_time, r.late, r.missing, r.pending, r.on_time_percent]),
      };
    },
  },
  {
    key: "registers",
    title: "Daily registers",
    description: "Every session on a day with its register state and counts.",
    grouping: "Session",
    formats: ["xlsx", "csv", "pdf"],
    async build(f) {
      const date = f.date ?? (await referenceDate()).date;
      const rows = await sessionRows(date, f.dept ?? null);
      return {
        title: `Registers — ${formatDate(date, { weekday: true, year: true })}`,
        columns: [{ label: "Start" }, { label: "Division" }, { label: "Batch" }, { label: "Subject" }, { label: "Type" }, { label: "Professor" }, { label: "State" }, { label: "Present", align: "right" }, { label: "Total", align: "right" }, { label: "Submitted" }],
        rows: rows.map((r) => [r.start_time, r.division_label, r.batch_code, r.subject_name, r.component, r.substitute_name ?? r.staff_name, r.display_state, r.submitted_at ? r.present_count : null, r.submitted_at ? r.total_count : null, r.submitted_at ? formatDateTime(r.submitted_at) : null]),
      };
    },
  },
  {
    key: "students",
    title: "Student register",
    description: "Student master list with division, batch, PRN and guardian status.",
    grouping: "Student",
    formats: ["xlsx", "csv"],
    async build(f) {
      const { rows } = await listStudents({ dept: f.dept ?? null, py: f.py, division: f.division, status: f.status, q: f.q, flag: f.flag, page: 1, pageSize: Infinity });
      return {
        title: "Student register",
        columns: [{ label: "Enrollment no" }, { label: "PRN" }, { label: "Name" }, { label: "Branch" }, { label: "Division" }, { label: "Batch" }, { label: "Roll", align: "right" }, { label: "Status" }, { label: "Overall %", align: "right" }, { label: "Guardian" }],
        rows: rows.map((s) => [s.enrollment_no, s.prn, s.full_name, s.department_code, s.division_label, s.batch_code, s.roll_no, s.status, pct(s.percent), s.guardian_status]),
      };
    },
  },
  {
    key: "audit",
    title: "Audit log",
    description: "Audited changes with actor, action, entity and reason.",
    grouping: "Event",
    formats: ["xlsx", "csv"],
    async build(f) {
      const s = await db();
      const rows = await all<{ at: string; actor_name: string; action: string; entity: string; entity_id: string; summary: string; reason: string | null }>((from, to) => {
        let q = s.from("audit_log").select("at, actor_name, action, entity, entity_id, summary, reason");
        if (f.entity) q = q.eq("entity", f.entity);
        if (f.days) q = q.gte("at", new Date(Date.now() - Number(f.days) * 86_400_000).toISOString());
        return q.order("at", { ascending: false }).range(from, to) as never;
      });
      return {
        title: "Audit log",
        columns: [{ label: "When" }, { label: "Actor" }, { label: "Action" }, { label: "Entity" }, { label: "Entity id" }, { label: "Summary" }, { label: "Reason" }],
        rows: rows.map((r) => [formatDateTime(r.at), r.actor_name, r.action, r.entity, r.entity_id, r.summary, r.reason]),
      };
    },
  },
];

export const reportByKey = (key: string) => REPORTS.find((r) => r.key === key);
