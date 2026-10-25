import "server-only";
import { db, rpc, unwrap } from "@/lib/db";
import { getActiveContext, getDepartments, getDivisions } from "@/features/common/lookups";

interface HodRow {
  id: string;
  department_id: string;
  staff_id: string;
  valid_during: string;
  staff: { full_name: string } | null;
}

/** "[2024-06-01,)" → { from, to } (to is exclusive, null = current). */
export function parseRange(r: string): { from: string; to: string | null } {
  const m = r.match(/^[[(]([^,]*),([^)\]]*)[)\]]$/);
  return { from: m?.[1] ?? "", to: m?.[2] ? m[2] : null };
}

export async function departmentCards(onlyId: string | null) {
  const s = await db();
  const [departments, divisions, hods, staffCounts, faculty] = await Promise.all([
    getDepartments(),
    getDivisions(onlyId),
    s.from("department_staff").select("id, department_id, staff_id, valid_during, staff:staff_directory(full_name)").eq("role", "hod"),
    s.from("staff_directory").select("home_department_id"),
    s.from("staff_directory").select("id, full_name, designation, home_department_id").neq("designation", "Lab Assistant").neq("status", "inactive").order("full_name"),
  ]);
  const hodRows = unwrap(hods) as unknown as HodRow[];
  const counts = new Map<string, number>();
  for (const r of unwrap(staffCounts) as { home_department_id: string }[]) counts.set(r.home_department_id, (counts.get(r.home_department_id) ?? 0) + 1);
  const facultyRows = unwrap(faculty) as { id: string; full_name: string; designation: string; home_department_id: string }[];

  return departments
    .filter((d) => !onlyId || d.id === onlyId)
    .map((d) => {
      const divs = divisions.filter((v) => v.department_id === d.id);
      const history = hodRows
        .filter((h) => h.department_id === d.id)
        .map((h) => ({ ...h, ...parseRange(h.valid_during), name: h.staff?.full_name ?? "—" }))
        .sort((a, b) => b.from.localeCompare(a.from));
      return {
        ...d,
        hod: history.find((h) => h.to === null) ?? null,
        history,
        staff: counts.get(d.id) ?? 0,
        divisions: divs.length,
        batches: divs.reduce((a, v) => a + (v.batches?.length ?? 0), 0),
        students: divs.reduce((a, v) => a + Number(v.students), 0),
        faculty: facultyRows.filter((f) => f.home_department_id === d.id),
      };
    });
}

export interface SubjectRow {
  id: string;
  code: string;
  name: string;
  department_id: string | null;
  semester: number;
  credits: number;
  is_elective: boolean;
  components: { kind: "TH" | "PR" | "TUT"; weekly_hours: number }[];
}

export async function subjectRows(departmentId: string | null, semester?: number): Promise<SubjectRow[]> {
  const s = await db();
  let q = s.from("subjects").select("id, code, name, department_id, semester, credits, is_elective, components:subject_components(kind, weekly_hours)").eq("is_active", true);
  if (semester) q = q.eq("semester", semester);
  if (departmentId) q = q.or(`department_id.eq.${departmentId},department_id.is.null`);
  return (unwrap(await q.order("semester").order("code")) as SubjectRow[]).filter((r) => !departmentId || r.department_id === departmentId || r.semester <= 2);
}

export async function teachingCounts(subjectIds: string[]) {
  if (!subjectIds.length) return new Map<string, { groups: number; professors: number }>();
  const s = await db();
  const { term } = await getActiveContext();
  const rows = unwrap(
    await s
      .from("teaching_groups")
      .select("id, offering:subject_offerings!inner(subject_id, term_id), assignments:teaching_assignments(staff_id)")
      .eq("offering.term_id", term?.id ?? "")
      .in("offering.subject_id", subjectIds),
  ) as unknown as { id: string; offering: { subject_id: string }; assignments: { staff_id: string }[] }[];
  const out = new Map<string, { groups: number; staff: Set<string> }>();
  for (const g of rows) {
    const e = out.get(g.offering.subject_id) ?? { groups: 0, staff: new Set<string>() };
    e.groups++;
    g.assignments.forEach((a) => e.staff.add(a.staff_id));
    out.set(g.offering.subject_id, e);
  }
  return new Map([...out].map(([k, v]) => [k, { groups: v.groups, professors: v.staff.size }]));
}

export async function calendarEvents() {
  const s = await db();
  return unwrap(await s.from("academic_calendar_events").select("id, title, kind, starts_on, ends_on").order("starts_on")) as {
    id: string;
    title: string;
    kind: "holiday" | "exam" | "event" | "working_override";
    starts_on: string;
    ends_on: string;
  }[];
}

export async function periodTemplate() {
  const s = await db();
  const rows = unwrap(await s.from("period_templates").select("periods, working_saturdays").eq("is_default", true).limit(1)) as {
    periods: { label: string; start: string; end: string; kind: string }[];
    working_saturdays: number[];
  }[];
  return rows[0] ?? { periods: [], working_saturdays: [] };
}

export const setupHealth = () => rpc<Record<string, number>>("setup_health");
