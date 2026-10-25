import "server-only";
import { db, rpc, unwrap } from "@/lib/db";
import { getActiveContext, getDepartments, getDivisions } from "@/features/common/lookups";

export interface VersionRow {
  id: string;
  department_id: string;
  program_year: string;
  revision: number;
  status: "draft" | "published" | "archived";
  effective_from: string;
  published_at: string | null;
  slots: { count: number }[];
}

export async function versionRows(departmentId: string | null, status?: string) {
  const s = await db();
  const { term } = await getActiveContext();
  let q = s.from("timetable_versions").select("id, department_id, program_year, revision, status, effective_from, published_at, slots:timetable_slots(count)").eq("term_id", term?.id ?? "");
  if (departmentId) q = q.eq("department_id", departmentId);
  if (status) q = q.eq("status", status);
  const [rows, departments, divisions] = await Promise.all([q.order("program_year").order("revision"), getDepartments(), getDivisions(departmentId)]);
  const order = new Map(departments.map((d) => [d.id, d]));
  return (unwrap(rows) as VersionRow[])
    .map((v) => ({
      ...v,
      department_code: order.get(v.department_id)?.code ?? "—",
      sort: order.get(v.department_id)?.sort_order ?? 0,
      slotCount: v.slots[0]?.count ?? 0,
      divisions: divisions.filter((d) => d.department_id === v.department_id && d.program_year === v.program_year).length,
    }))
    .sort((a, b) => a.sort - b.sort || ["FE", "SE", "TE", "BE"].indexOf(a.program_year) - ["FE", "SE", "TE", "BE"].indexOf(b.program_year) || a.revision - b.revision);
}

export interface SlotDetail {
  id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room_label: string | null;
  session_type: string;
  staff: { full_name: string } | null;
  group: { kind: string; component: string; division_id: string; batch: { code: string } | null; offering: { subject: { code: string; name: string } } };
}

export async function versionDetail(versionId: string) {
  const s = await db();
  const version = unwrap(
    await s.from("timetable_versions").select("id, term_id, department_id, program_year, revision, status, effective_from, published_at").eq("id", versionId).maybeSingle(),
  ) as Omit<VersionRow, "slots"> | null;
  if (!version) return null;
  const [slots, divisions, validation] = await Promise.all([
    s
      .from("timetable_slots")
      .select("id, weekday, starts_at, ends_at, room_label, session_type, staff:staff_directory(full_name), group:teaching_groups(kind, component, division_id, batch:batches(code), offering:subject_offerings(subject:subjects(code, name)))")
      .eq("version_id", versionId)
      .order("weekday")
      .order("starts_at"),
    getDivisions(version.department_id, version.program_year),
    rpc<{ severity: string; code: string; message: string }[]>("validate_timetable", { p_version: versionId }),
  ]);
  return { version, slots: unwrap(slots) as unknown as SlotDetail[], divisions, validation };
}
