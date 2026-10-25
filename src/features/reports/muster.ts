import "server-only";
import { db, unwrap } from "@/lib/db";
import type { ReportData } from "./catalogue";

/**
 * Muster register: roll no × session dates for one division (or batch), one
 * subject offering and one month. Codes come from the records; cancelled
 * sessions are excluded; totals use the status rules (counts as attended).
 */
export async function buildMuster(f: Record<string, string | undefined>): Promise<ReportData> {
  const { division, offering, month, batch } = f;
  if (!division || !offering || !month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Choose a division, a subject and a month for the muster register.");
  }
  const s = await db();
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  let sq = s
    .from("class_sessions")
    .select("id, session_date, starts_at, component, batch_id, status")
    .eq("division_id", division)
    .eq("offering_id", offering)
    .gte("session_date", from)
    .lte("session_date", to)
    .neq("status", "cancelled")
    .neq("status", "rescheduled");
  if (batch) sq = sq.eq("batch_id", batch);
  const [sessionsRes, codesRes, divRes, subjectRes] = await Promise.all([
    sq.order("starts_at"),
    s.from("attendance_status_codes").select("code, counts_as_attended, counts_in_held"),
    s.from("v_divisions").select("label").eq("id", division).maybeSingle(),
    s.from("subject_offerings").select("subject:subjects(code, name)").eq("id", offering).maybeSingle(),
  ]);
  const sessions = unwrap(sessionsRes) as { id: string; session_date: string; starts_at: string; component: string; batch_id: string | null }[];
  const codes = new Map((unwrap(codesRes) as { code: string; counts_as_attended: boolean; counts_in_held: boolean }[]).map((c) => [c.code, c]));
  const div = unwrap(divRes) as { label: string } | null;
  const subject = (unwrap(subjectRes) as unknown as { subject: { code: string; name: string } } | null)?.subject;

  const records: { session_id: string; student_id: string; status_code: string }[] = [];
  const ids = sessions.map((x) => x.id);
  for (let i = 0; i < ids.length; i += 40) {
    records.push(...(unwrap(await s.from("attendance_records").select("session_id, student_id, status_code").in("session_id", ids.slice(i, i + 40)).limit(5000)) as typeof records));
  }
  const studentIds = [...new Set(records.map((r) => r.student_id))];
  const students: { id: string; full_name: string; roll_no: number | null; enrollment_no: string }[] = [];
  for (let i = 0; i < studentIds.length; i += 100) {
    students.push(...(unwrap(await s.from("v_students").select("id, full_name, roll_no, enrollment_no").in("id", studentIds.slice(i, i + 100))) as typeof students));
  }
  students.sort((a, b) => (a.roll_no ?? 999) - (b.roll_no ?? 999) || a.full_name.localeCompare(b.full_name));

  const mark = new Map(records.map((r) => [`${r.session_id}|${r.student_id}`, r.status_code]));
  const heldSessions = sessions.filter((x) => records.some((r) => r.session_id === x.id));
  const dateLabel = (x: (typeof sessions)[number]) => `${x.session_date.slice(8)}/${x.session_date.slice(5, 7)}`;

  return {
    title: `Muster register — ${subject ? `${subject.code} ${subject.name}` : "subject"}`,
    subtitle: `${div?.label ?? ""}${batch ? " · batch" : ""} · ${new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })} · ${heldSessions.length} sessions`,
    columns: [
      { label: "Roll", width: 0.8, align: "right" },
      { label: "Name", width: 4 },
      ...heldSessions.map((x) => ({ label: dateLabel(x), width: 0.9 })),
      { label: "Att.", width: 1, align: "right" as const },
      { label: "Held", width: 1, align: "right" as const },
      { label: "%", width: 1.1, align: "right" as const },
    ],
    rows: students.map((st) => {
      let held = 0;
      let attended = 0;
      const cells = heldSessions.map((x) => {
        const code = mark.get(`${x.id}|${st.id}`) ?? "";
        const rule = codes.get(code);
        if (rule?.counts_in_held) held++;
        if (rule?.counts_in_held && rule.counts_as_attended) attended++;
        return code;
      });
      return [st.roll_no, st.full_name, ...cells, attended, held, held ? Math.round((attended / held) * 1000) / 10 : null];
    }),
  };
}
