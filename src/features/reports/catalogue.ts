import "server-only";
import { formatDateTime } from "@/shared/dates";
import { db } from "@/lib/data/store";
import { currentEnrollments, studentTallies } from "@/lib/data/engine";
import { divisionStats, facultySubmission, recentWorkingDays, sessionRows, shortageRows, referenceDate } from "@/features/attendance/queries";
import { listStudents } from "@/features/students/queries";
import { deptCode, divisionById, divisionLabel, subjectById } from "@/features/common/lookups";

type Filters = Record<string, string | undefined>;
type Rows = (string | number | null)[][];

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  grouping: string;
  build(scopeDept: string | null, f: Filters): Rows;
}

// Each report mirrors a `report_<name>(filters)` SQL function declared
// security invoker, so RLS scopes rows; here the caller's department scope
// is passed in explicitly (§11.13).
export const REPORTS: ReportDef[] = [
  {
    key: "attendance-summary",
    title: "Attendance summary",
    description: "Average term-to-date attendance and shortage count per division.",
    grouping: "Branch / year / division",
    build: (scope, f) => [
      ["Division", "Branch", "Year", "Students", "Average %", "Shortage"],
      ...divisionStats(scope ?? f.dept ?? null).map((d) => [d.label, d.deptCode, d.programYear, d.students, d.percent, d.shortage]),
    ],
  },
  {
    key: "student-wise",
    title: "Student-wise report",
    description: "Every student × subject × component with held, attended and percentage.",
    grouping: "Student × subject × component",
    build: (scope, f) => {
      const enr = currentEnrollments();
      const rows: Rows = [["Enrollment no", "Name", "Division", "Roll", "Subject code", "Subject", "Component", "Held", "Attended", "Percent"]];
      for (const s of db().students) {
        const e = enr.get(s.id);
        if (!e || s.status !== "active" || ((scope ?? f.dept) && e.departmentId !== (scope ?? f.dept)) || (f.division && e.divisionId !== f.division)) continue;
        const div = divisionLabel(divisionById(e.divisionId)!);
        for (const t of studentTallies(s.id)) {
          const sub = subjectById(t.subjectId)!;
          rows.push([s.enrollmentNo, s.name, div, e.rollNo, sub.code, sub.name, t.component, t.held, t.attended, t.percent]);
        }
      }
      return rows;
    },
  },
  {
    key: "shortage",
    title: "Shortage / detention list",
    description: "Students below the policy threshold in at least one subject; feeds exam eligibility.",
    grouping: "Policy threshold, term",
    build: (scope, f) => [
      ["Enrollment no", "Name", "Branch", "Division", "Roll", "Overall %", "Lowest subject %", "Subjects short", "Eligibility"],
      ...shortageRows({ departmentId: scope ?? f.dept ?? null, programYear: f.py, divisionId: f.division, band: f.band }).map((r) => [
        r.enrollmentNo,
        r.name,
        r.deptCode,
        r.division,
        r.rollNo,
        r.percent,
        r.lowest,
        r.shortSubjects,
        r.standing === "shortage" ? "Not eligible" : "At risk",
      ]),
    ],
  },
  {
    key: "professor-submission",
    title: "Professor submission report",
    description: "On-time, late and missing registers per professor over the last 20 working days.",
    grouping: "Professor × period",
    build: (scope, f) => [
      ["Professor", "Branch", "Designation", "On time", "Late", "Missing", "Pending", "On-time %"],
      ...facultySubmission(scope ?? f.dept ?? null, recentWorkingDays(20)).map((r) => [r.name, r.deptCode, r.designation, r.onTime, r.late, r.missing, r.pending, r.onTimePercent]),
    ],
  },
  {
    key: "registers",
    title: "Daily registers",
    description: "Every session on the latest working day with its register state and counts.",
    grouping: "Session",
    build: (scope, f) => {
      const date = f.date ?? referenceDate().date;
      return [
        ["Date", "Start", "Division", "Batch", "Subject", "Component", "Professor", "State", "Present", "Total", "Submitted at"],
        ...sessionRows(date, scope ?? f.dept ?? null).map((r) => [r.date, `${Math.floor(r.start / 60)}:${String(r.start % 60).padStart(2, "0")}`, r.division, r.batch, r.subjectName, r.component, r.staffName, r.status === "cancelled" ? "cancelled" : r.state, r.present, r.total, r.submittedAt ? formatDateTime(r.submittedAt) : ""]),
      ];
    },
  },
  {
    key: "students",
    title: "Student register",
    description: "Student master list with division, batch, PRN and guardian status.",
    grouping: "Student",
    build: (scope, f) => {
      const { rows } = listStudents({ scopeDept: scope, dept: f.dept, py: f.py, division: f.division, status: f.status, q: f.q, flag: f.flag, page: 1, pageSize: Infinity });
      return [
        ["Enrollment no", "PRN", "Name", "Branch", "Division", "Batch", "Roll", "Status", "Overall %", "Guardian"],
        ...rows.map((s) => [s.enrollmentNo, s.prn, s.name, deptCode(s.departmentId), s.division, s.batch, s.rollNo, s.status, s.standing?.percent ?? null, s.guardian]),
      ];
    },
  },
];
