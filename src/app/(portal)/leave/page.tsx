import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarX, Check, FileText, X } from "lucide-react";
import { formatDate, formatDateTime } from "@/shared/dates";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { currentEnrollments } from "@/lib/data/engine";
import { param } from "@/lib/utils";
import { Badge, ButtonLink, Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/primitives";
import { RowAction } from "@/components/ui/forms";
import { decideLeave, decideStaffLeave } from "@/features/leave/actions";
import { actorName, deptCode, divisionById, divisionLabel, staffById } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Leave" };

export default function LeavePage(props: PageProps<"/leave">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Leave searchParams={props.searchParams} />
    </Suspense>
  );
}

const TONE = { pending: "warn", needs_info: "info", approved: "ok", rejected: "bad", cancelled: "neutral" } as const;
const TYPE = { full_day: "Full day", half_day: "Half day", session: "Sessions", medical: "Medical", casual: "Casual", duty: "On duty", earned: "Earned" } as const;

async function Leave({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("leave.student.decide");
  const sp = await searchParams;
  const tab = param(sp, "tab") === "staff" && can(user, "leave.staff.decide") ? "staff" : "students";
  const store = db();

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Leave"
        description="Day-to-day student approvals happen in the class teacher's app; this is the oversight queue. Requests escalate to the HOD after the policy SLA."
      />
      <Tabs
        active={tab}
        items={[
          { key: "students", label: "Student leave", href: "/leave" },
          ...(can(user, "leave.staff.decide") ? [{ key: "staff", label: "Staff leave", href: "/leave?tab=staff" }] : []),
        ]}
      />
      {tab === "students" ? <StudentLeave scope={departmentScope(user, "leave.student.decide")} /> : <StaffLeave scope={departmentScope(user, "leave.staff.decide")} selfStaffId={user.staffId} />}
    </>
  );

  function StudentLeave({ scope }: { scope: string | null }) {
    const enr = currentEnrollments();
    const rows = store.leaveRequests
      .map((l) => ({ l, s: store.students.find((x) => x.id === l.studentId)! }))
      .filter(({ s }) => !scope || s.departmentId === scope)
      .sort((a, b) => Number(b.l.status === "pending" || b.l.status === "needs_info") - Number(a.l.status === "pending" || a.l.status === "needs_info") || b.l.createdAt.localeCompare(a.l.createdAt));
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
            {rows.map(({ l, s }) => {
              const e = enr.get(s.id);
              const open = l.status === "pending" || l.status === "needs_info";
              return (
                <TR key={l.id}>
                  <TD>
                    <Link href={`/people/students/${s.id}`} className="font-medium hover:text-primary">
                      {s.name}
                    </Link>
                    <div className="text-[11px] text-muted">Submitted {formatDateTime(l.createdAt)}</div>
                  </TD>
                  <TD className="whitespace-nowrap">
                    <DeptChip code={deptCode(s.departmentId)} soft /> <span className="ml-1">{e ? divisionLabel(divisionById(e.divisionId)!) : "—"}</span>
                  </TD>
                  <TD>{TYPE[l.type]}</TD>
                  <TD className="whitespace-nowrap">
                    {formatDate(l.fromDate)}
                    {l.toDate !== l.fromDate && ` – ${formatDate(l.toDate)}`}
                  </TD>
                  <TD className="max-w-64 text-xs">
                    {l.reason}
                    {l.hasDocument && (
                      <span className="mt-0.5 flex items-center gap-1 text-primary">
                        <FileText className="size-3" /> document attached
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={TONE[l.status]}>{l.status.replace("_", " ")}</Badge>
                    {l.decidedBy && <div className="mt-0.5 text-[11px] text-muted">{actorName(l.decidedBy)}</div>}
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

  function StaffLeave({ scope, selfStaffId }: { scope: string | null; selfStaffId: string | null }) {
    const rows = store.staffLeave.filter((l) => !scope || staffById(l.staffId)?.departmentId === scope);
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
            {rows.map((l) => {
              const s = staffById(l.staffId)!;
              return (
                <TR key={l.id}>
                  <TD>
                    <Link href={`/people/staff/${s.id}`} className="font-medium hover:text-primary">
                      {s.name}
                    </Link>
                    <div className="mt-0.5">
                      <DeptChip code={deptCode(s.departmentId)} soft />
                    </div>
                  </TD>
                  <TD>{TYPE[l.type]}</TD>
                  <TD className="whitespace-nowrap">
                    {formatDate(l.fromDate)}
                    {l.toDate !== l.fromDate && ` – ${formatDate(l.toDate)}`}
                  </TD>
                  <TD className="max-w-64 text-xs">{l.reason}</TD>
                  <TD>
                    <Badge tone={TONE[l.status]}>{l.status}</Badge>
                    {l.status === "approved" && <div className="mt-0.5 text-[11px] text-muted">{l.substituteArranged ? "Substitutes arranged" : "Substitutes needed"}</div>}
                  </TD>
                  <TD>
                    {l.status === "pending" && l.staffId !== selfStaffId && (
                      <div className="flex justify-end gap-1.5">
                        <RowAction action={decideStaffLeave} fields={{ id: l.id, decision: "approved" }} label="Approve" variant="success" icon={<Check className="size-3.5" />} />
                        <RowAction action={decideStaffLeave} fields={{ id: l.id, decision: "rejected" }} label="Reject" icon={<X className="size-3.5" />} confirm="Reject this leave request?" />
                      </div>
                    )}
                    {l.status === "approved" && !l.substituteArranged && (
                      <div className="text-right">
                        <ButtonLink href={`/timetable/sessions?date=${l.fromDate}&dept=${s.departmentId}`} size="sm" variant="soft">
                          Arrange substitutes
                        </ButtonLink>
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
}
