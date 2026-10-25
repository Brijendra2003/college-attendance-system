import "server-only";
import { db, unwrap } from "@/lib/db";
import { facultySubmission } from "@/features/attendance/queries";

export interface StaffRow {
  id: string;
  employee_id: string;
  full_name: string;
  designation: string;
  department_id: string;
  department_code: string;
  email: string | null;
  phone: string | null;
  joined_on: string | null;
  status: string;
  user_id: string | null;
  is_hod: boolean;
  weekly_hours: number;
  class_teacher_of: string | null;
}

export async function listStaff(opts: { departmentId: string | null; q?: string; designation?: string }): Promise<StaffRow[]> {
  const s = await db();
  let q = s.from("v_staff").select("*");
  if (opts.departmentId) q = q.eq("department_id", opts.departmentId);
  if (opts.designation) q = q.eq("designation", opts.designation);
  const term = opts.q?.trim().replace(/[%,()]/g, " ");
  if (term) q = q.or(`full_name.ilike.%${term}%,employee_id.ilike.%${term}%`);
  const rows = unwrap(await q.order("department_code").order("is_hod", { ascending: false }).order("full_name").limit(1000)) as StaffRow[];
  return rows;
}

interface SlotRow {
  id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room_label: string | null;
  session_type: string;
  group: { component: string; division: { label: string } | null; batch: { code: string } | null; offering: { subject: { code: string; name: string } } };
}

export async function staffDetail(id: string) {
  const s = await db();
  const staff = unwrap(await s.from("v_staff").select("*").eq("id", id).maybeSingle()) as StaffRow | null;
  if (!staff) return null;
  const [memberships, slots, assignments, submission] = await Promise.all([
    s.from("department_staff").select("id, role, valid_during").eq("staff_id", id).order("valid_during", { ascending: false }),
    s
      .from("timetable_slots")
      .select(
        "id, weekday, starts_at, ends_at, room_label, session_type, version:timetable_versions!inner(status), group:teaching_groups(component, division:v_divisions(label), batch:batches(code), offering:subject_offerings(subject:subjects(code, name)))",
      )
      .eq("staff_id", id)
      .eq("version.status", "published"),
    s
      .from("teaching_assignments")
      .select("id, role, valid_during, group:teaching_groups(component, division:v_divisions(label), batch:batches(code), offering:subject_offerings(subject:subjects(code, name)))")
      .eq("staff_id", id),
    facultySubmission(20, staff.department_id),
  ]);
  return {
    staff,
    memberships: unwrap(memberships) as { id: string; role: string; valid_during: string }[],
    slots: unwrap(slots) as unknown as SlotRow[],
    assignments: unwrap(assignments) as unknown as { id: string; role: string; valid_during: string; group: SlotRow["group"] }[],
    submission: submission.find((r) => r.staff_id === id) ?? null,
  };
}
