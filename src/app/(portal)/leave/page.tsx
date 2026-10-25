import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarX, Check, FileText, X } from "lucide-react";
import { formatDate, formatDateTime } from "@/shared/dates";
import { can, requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { param } from "@/lib/utils";
import { Badge, ButtonLink, Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Skeleton, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/primitives";
import { RowAction } from "@/components/ui/forms";
import { decideLeave, decideStaffLeave } from "@/features/leave/actions";
import { getDepartments } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Leave" };

export default function LeavePage(props: PageProps<"/leave">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Leave searchParams={props.searchParams} />
    </Suspense>
  );
}

const TONE = { pending: "warn", needs_info: "info", approved: "ok", rejected: "bad", cancelled: "neutral" } as const;
const TYPE: Record<string, string> = { full_day: "Full day", half_day: "Half day", session: "Sessions", medical: "Medical", casual: "Casual", duty: "On duty", earned: "Earned" };

async function Leave({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("leave.student.decide");
  const sp = await searchParams;
  const canStaff = can(user, "leave.staff.decide");
  const tab = param(sp, "tab") === "staff" && canStaff ? "staff" : "students";
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Leave"
        description="Day-to-day student approvals happen in the class teacher's app; this is the oversight queue. Requests escalate to the HOD after the policy SLA."
      />
      <Tabs active={tab} items={[{ key: "students", label: "Student leave", href: "/leave" }, ...(canStaff ? [{ key: "staff", label: "Staff leave", href: "/leave?tab=staff" }] : [])]} />
      <Suspense key={tab} fallback={<Skeleton className="h-96" />}>
        {tab === "students" ? <StudentLeave /> : <StaffLeave selfStaffId={user.staffId} />}
      </Suspense>
    </>
  );
}

interface StudentLeaveRow {
  id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: keyof typeof TONE;
  created_at: string;
  document_asset_id: string | null;
  student: { id: string; full_name: string; division_label: string | null; department_code: string } | null;
}

async function StudentLeave() {
  const s = await db();
  // RLS limits rows to the user's scope (department, or class teacher).
  const raw = unwrap(
    await s
      .from("leave_requests")
      .select("id, leave_type, from_date, to_date, reason, status, created_at, document_asset_id, student_id")
      .order("created_at", { ascending: false })
      .limit(300),
  ) as (Omit<StudentLeaveRow, "student"> & { student_id: string })[];
  const ids = [...new Set(raw.map((r) => r.student_id))];
  const students = ids.length
    ? (unwrap(await s.from("v_students").select("id, full_name, division_label, department_code").in("id", ids)) as NonNullable<StudentLeaveRow["student"]>[])
    : [];
  const byId = new Map(students.map((x) => [x.id, x]));
  const rows: StudentLeaveRow[] = raw
    .map((r) => ({ ...r, student: byId.get(r.student_id) ?? null }))
    .sort((a, b) => Number(["pending", "needs_info"].includes(b.status)) - Number(["pending", "needs_info"].includes(a.status)));

  if (!rows.length) return <Card><EmptyState icon={<CalendarX className="size-6" />} title="No leave requests" /></Card>;
  return (
    <Card>
      <Table>
        <THead>
          <tr>
            <TH>Student</TH>
            <TH>Division</TH>
            <TH>Type</TH>
            <TH>Dates</TH>
            <TH>Reason</TH>
            <TH>Status</TH>
            <TH className="text-right">Decision</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((l) => {
            const open = l.status === "pending" || l.status === "needs_info";
            return (
              <TR key={l.id}>
                <TD>
                  <Link href={`/people/students/${l.student?.id}`} className="font-medium hover:text-primary">
                    {l.student?.full_name ?? "—"}
                  </Link>
                  <div className="text-[11px] text-muted">Submitted {formatDateTime(l.created_at)}</div>
                </TD>
                <TD className="whitespace-nowrap">
                  {l.student && <DeptChip code={l.student.department_code} soft />} <span className="ml-1">{l.student?.division_label ?? "—"}</span>
                </TD>
                <TD>{TYPE[l.leave_type] ?? l.leave_type}</TD>
                <TD className="whitespace-nowrap">
                  {formatDate(l.from_date)}
                  {l.to_date !== l.from_date && ` – ${formatDate(l.to_date)}`}
                </TD>
                <TD className="max-w-64 text-xs">
                  {l.reason}
                  {l.document_asset_id && (
                    <span className="mt-0.5 flex items-center gap-1 text-primary">
                      <FileText className="size-3" /> document attached
                    </span>
                  )}
                </TD>
                <TD>
                  <Badge tone={TONE[l.status]}>{l.status.replace("_", " ")}</Badge>
                </TD>
                <TD>
                  {open && (
                    <div className="flex justify-end gap-1.5">
                      <RowAction action={decideLeave} fields={{ id: l.id, decision: "approved" }} label="Approve" variant="success" icon={<Check className="size-3.5" />} />
                      {l.status !== "needs_info" && <RowAction action={decideLeave} fields={{ id: l.id, decision: "needs_info" }} label="Ask info" />}
                      <RowAction action={decideLeave} fields={{ id: l.id, decision: "rejected" }} label="Reject" icon={<X className="size-3.5" />} confirm="Reject this leave request?" />
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

interface StaffLeaveRow {
  id: string;
  staff_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  substitute_arranged: boolean;
  staff: { full_name: string; home_department_id: string } | null;
}

async function StaffLeave({ selfStaffId }: { selfStaffId: string | null }) {
  const s = await db();
  const [res, departments] = await Promise.all([
    s.from("staff_leave_requests").select("id, staff_id, leave_type, from_date, to_date, reason, status, substitute_arranged, staff:staff_directory(full_name, home_department_id)").order("from_date", { ascending: false }).limit(200),
    getDepartments(),
  ]);
  const rows = unwrap(res) as unknown as StaffLeaveRow[];
  const code = (id?: string) => departments.find((d) => d.id === id)?.code ?? "—";
  if (!rows.length) return <Card><EmptyState icon={<CalendarX className="size-6" />} title="No staff leave requests" /></Card>;
  return (
    <Card>
      <Table>
        <THead>
          <tr>
            <TH>Staff</TH>
            <TH>Type</TH>
            <TH>Dates</TH>
            <TH>Reason</TH>
            <TH>Status</TH>
            <TH className="text-right">Decision</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((l) => (
            <TR key={l.id}>
              <TD>
                <Link href={`/people/staff/${l.staff_id}`} className="font-medium hover:text-primary">
                  {l.staff?.full_name}
                </Link>
                <div className="mt-0.5">
                  <DeptChip code={code(l.staff?.home_department_id)} soft />
                </div>
              </TD>
              <TD>{TYPE[l.leave_type] ?? l.leave_type}</TD>
              <TD className="whitespace-nowrap">
                {formatDate(l.from_date)}
                {l.to_date !== l.from_date && ` – ${formatDate(l.to_date)}`}
              </TD>
              <TD className="max-w-64 text-xs">{l.reason}</TD>
              <TD>
                <Badge tone={TONE[l.status]}>{l.status}</Badge>
                {l.status === "approved" && <div className="mt-0.5 text-[11px] text-muted">{l.substitute_arranged ? "Substitutes arranged" : "Substitutes needed"}</div>}
              </TD>
              <TD>
                {l.status === "pending" && l.staff_id !== selfStaffId && (
                  <div className="flex justify-end gap-1.5">
                    <RowAction action={decideStaffLeave} fields={{ id: l.id, decision: "approved" }} label="Approve" variant="success" icon={<Check className="size-3.5" />} />
                    <RowAction action={decideStaffLeave} fields={{ id: l.id, decision: "rejected" }} label="Reject" icon={<X className="size-3.5" />} confirm="Reject this leave request?" />
                  </div>
                )}
                {l.status === "approved" && !l.substitute_arranged && (
                  <div className="text-right">
                    <ButtonLink href={`/timetable/sessions?date=${l.from_date}&dept=${l.staff?.home_department_id}`} size="sm" variant="soft">
                      Arrange substitutes
                    </ButtonLink>
                  </div>
                )}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
