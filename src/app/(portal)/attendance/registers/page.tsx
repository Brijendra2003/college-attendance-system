import type { Metadata } from "next";
import { Suspense } from "react";
import { BellRing, ClipboardCheck, LockOpen } from "lucide-react";
import { formatDateTime, formatTime, istDate } from "@/shared/dates";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param, relativeTime } from "@/lib/utils";
import { Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, FilterSelect, RowAction, SubmitButton, Textarea } from "@/components/ui/forms";
import { SegmentedBar } from "@/components/charts/html-charts";
import { referenceDate, registerCounts, sessionRows } from "@/features/attendance/queries";
import { DayStepper, RegisterBadge } from "@/features/attendance/components";
import { nudgeProfessor, reopenRegister } from "@/features/attendance/actions";
import { departmentOptions } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Registers" };

export default function RegistersPage(props: PageProps<"/attendance/registers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Registers searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Registers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("attendance.view");
  const sp = await searchParams;
  const scope = departmentScope(user, "attendance.view");
  const dept = scope ?? param(sp, "dept") ?? null;
  const date = param(sp, "date") ?? referenceDate().date;
  const state = param(sp, "state");
  const all = sessionRows(date, dept);
  const c = registerCounts(all);
  const rows = all
    .filter((r) => {
      if (!state) return true;
      if (state === "late") return r.late;
      if (state === "cancelled") return r.status === "cancelled";
      if (state === "submitted") return r.state === "submitted" || r.state === "locked";
      return r.state === state && r.status !== "cancelled";
    })
    .sort((a, b) => a.start - b.start || a.division.localeCompare(b.division));
  const canReopen = can(user, "attendance.reopen");
  const isPast = date < istDate();
  const keep: Record<string, string> = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "date" ? [[k, v]] : [])));

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Registers"
        description="Submission status for every session. A register still pending 30 minutes after the session is missing; registers lock 48 hours after the session."
        actions={<DayStepper date={date} basePath="/attendance/registers" params={keep} />}
      />
      <Card className="mb-5 p-5">
        <SegmentedBar
          segments={[
            { label: "Submitted / locked", value: c.held, color: "#16a34a" },
            { label: "Pending", value: c.pending, color: "#d97706" },
            { label: "Missing", value: c.missing, color: "#dc2626" },
            { label: "Upcoming", value: c.upcoming, color: "#94a3b8" },
            { label: "Reopened", value: c.reopened, color: "#7c3aed" },
            { label: "Cancelled", value: c.cancelled, color: "#475569" },
          ]}
        />
      </Card>
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!scope && <FilterSelect name="dept" label="Branch" options={departmentOptions()} allLabel="All branches" />}
          <FilterSelect
            name="state"
            label="Register state"
            allLabel="All"
            options={[
              { value: "missing", label: "Missing" },
              { value: "pending", label: "Pending" },
              { value: "late", label: "Submitted late" },
              { value: "submitted", label: "Submitted / locked" },
              { value: "reopened", label: "Reopened" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </div>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="size-6" />} title="No registers match">
            Try another state filter or day.
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Time</TH>
                <TH>Class</TH>
                <TH>Subject</TH>
                <TH>Professor</TH>
                <TH>State</TH>
                <TH className="text-right">Present</TH>
                <TH>Submitted</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap tabular-nums">{formatTime(r.start)}</TD>
                  <TD className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <DeptChip code={r.deptCode} soft />
                      {r.division}
                    </div>
                    {r.batch && <div className="text-xs text-muted">{r.batch}</div>}
                  </TD>
                  <TD>
                    <div className="font-medium">{r.subjectName}</div>
                    <div className="text-[11px] text-muted">{r.component === "PR" ? "Practical" : "Theory"}</div>
                  </TD>
                  <TD>{r.substituteName ?? r.staffName}</TD>
                  <TD>
                    <RegisterBadge row={r} />
                  </TD>
                  <TD className="text-right tabular-nums">{r.status === "held" ? `${r.present}/${r.total}` : "—"}</TD>
                  <TD className="text-xs text-muted">{r.submittedAt ? formatDateTime(r.submittedAt) : r.nudgedAt ? `Reminder sent ${relativeTime(r.nudgedAt)}` : "—"}</TD>
                  <TD>
                    <div className="flex justify-end gap-1.5">
                      {(r.state === "missing" || r.state === "pending") && r.status !== "cancelled" && !r.nudgedAt && (
                        <RowAction action={nudgeProfessor} fields={{ sessionId: r.id }} label="Nudge" icon={<BellRing className="size-3.5" />} />
                      )}
                      {canReopen && isPast && r.state === "missing" && r.status !== "cancelled" && (
                        <Dialog trigger={<><LockOpen className="size-3.5" /> Reopen</>} triggerVariant="secondary" triggerSize="sm" title="Reopen register" description={`${r.division} ${r.batch} · ${r.subjectName}`}>
                          <ActionForm action={reopenRegister} className="space-y-4">
                            <input type="hidden" name="sessionId" value={r.id} />
                            <Field name="reason" label="Reason" hint="Recorded in the audit log">
                              <Textarea name="reason" placeholder="e.g. Professor's phone was lost; allow late marking until tomorrow" />
                            </Field>
                            <div className="flex justify-end">
                              <SubmitButton>Reopen</SubmitButton>
                            </div>
                          </ActionForm>
                        </Dialog>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
