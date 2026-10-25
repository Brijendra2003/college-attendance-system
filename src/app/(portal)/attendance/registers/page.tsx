import type { Metadata } from "next";
import { Suspense } from "react";
import { BellRing, ClipboardCheck, LockOpen } from "lucide-react";
import { formatDateTime, istDate } from "@/shared/dates";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param, relativeTime } from "@/lib/utils";
import { Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Skeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, FilterSelect, RowAction, SubmitButton, Textarea } from "@/components/ui/forms";
import { SegmentedBar } from "@/components/charts/html-charts";
import { batchLabel, referenceDate, registerCounts, sessionRows } from "@/features/attendance/queries";
import { DayStepper, RegisterBadge } from "@/features/attendance/components";
import { nudgeProfessor, reopenRegister } from "@/features/attendance/actions";
import { departmentOptions } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Registers" };

export default function RegistersPage(props: PageProps<"/attendance/registers">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Registers searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Registers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("attendance.view");
  const sp = await searchParams;
  const scope = departmentScope(user, "attendance.view");
  const dept = scope ?? param(sp, "dept") ?? null;
  const date = param(sp, "date") ?? (await referenceDate()).date;
  const state = param(sp, "state");
  const keep: Record<string, string> = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "date" ? [[k, v]] : [])));

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Registers"
        description="Submission status for every session. A register still pending 30 minutes after the session is missing; registers lock 48 hours after the session."
        actions={<DayStepper date={date} basePath="/attendance/registers" params={keep} />}
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!scope && <FilterSelect name="dept" label="Branch" options={await departmentOptions()} allLabel="All branches" />}
          <FilterSelect
            name="state"
            label="Register state"
            allLabel="All"
            options={[
              { value: "missing", label: "Missing" },
              { value: "pending", label: "Pending" },
              { value: "late", label: "Submitted late" },
              { value: "submitted", label: "Submitted" },
              { value: "reopened", label: "Reopened" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </div>
      </Card>
      <Suspense key={`${date}-${dept}-${state}`} fallback={<Skeleton className="h-96" />}>
        <RegisterTable date={date} dept={dept} state={state} canReopen={can(user, "attendance.reopen")} />
      </Suspense>
    </>
  );
}

async function RegisterTable({ date, dept, state, canReopen }: { date: string; dept: string | null; state?: string; canReopen: boolean }) {
  const [all, c] = await Promise.all([sessionRows(date, dept), registerCounts(date, dept)]);
  const rows = all.filter((r) => !state || (state === "late" ? r.is_late && r.display_state === "submitted" : r.display_state === state));
  const isPast = date < istDate();
  return (
    <>
      <Card className="mb-5 p-5">
        <SegmentedBar
          segments={[
            { label: "Submitted", value: c.held, color: "var(--ok)" },
            { label: "Pending", value: c.pending, color: "var(--warn)" },
            { label: "Missing", value: c.missing, color: "var(--bad)" },
            { label: "Upcoming", value: c.upcoming, color: "var(--faint)" },
            { label: "Reopened", value: c.reopened, color: "var(--violet)" },
            { label: "Cancelled", value: c.cancelled, color: "var(--muted)" },
          ]}
        />
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
                  <TD className="whitespace-nowrap tabular-nums">{r.start_time}</TD>
                  <TD className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <DeptChip code={r.department_code} soft />
                      {r.division_label}
                    </div>
                    {r.batch_code && <div className="text-xs text-muted">{batchLabel(r.batch_code)}</div>}
                  </TD>
                  <TD>
                    <div className="font-medium">{r.subject_name}</div>
                    <div className="text-[11px] text-muted">{r.component === "PR" ? "Practical" : "Theory"}</div>
                  </TD>
                  <TD>{r.substitute_name ?? r.staff_name}</TD>
                  <TD>
                    <RegisterBadge state={r.display_state} late={r.is_late} locked={r.register_state === "locked"} />
                  </TD>
                  <TD className="text-right tabular-nums">{r.submitted_at ? `${r.present_count}/${r.total_count}` : "—"}</TD>
                  <TD className="text-xs text-muted">
                    {r.submitted_at ? formatDateTime(r.submitted_at) : r.nudged_at ? `Reminder sent ${relativeTime(r.nudged_at)}` : "—"}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1.5">
                      {(r.display_state === "missing" || r.display_state === "pending") && !r.nudged_at && r.register_state === "pending" && (
                        <RowAction action={nudgeProfessor} fields={{ sessionId: r.id }} label="Nudge" icon={<BellRing className="size-3.5" />} />
                      )}
                      {canReopen && isPast && r.display_state === "missing" && (
                        <Dialog
                          trigger={<><LockOpen className="size-3.5" /> Reopen</>}
                          triggerVariant="secondary"
                          triggerSize="sm"
                          title="Reopen register"
                          description={`${r.division_label} ${batchLabel(r.batch_code)} · ${r.subject_name}`}
                        >
                          <ActionForm action={reopenRegister} className="space-y-4">
                            <input type="hidden" name="sessionId" value={r.id} />
                            <Field name="reason" label="Reason" hint="Recorded in the audit log">
                              <Textarea name="reason" placeholder="e.g. Professor's phone was lost; allow late marking until tomorrow" />
                            </Field>
                            <div className="flex justify-end">
                              <SubmitButton pendingLabel="Reopening">Reopen for 24 hours</SubmitButton>
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
