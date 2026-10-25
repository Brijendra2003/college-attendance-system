import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Check, FilePenLine } from "lucide-react";
import { formatDate, formatDateTime, formatTime } from "@/shared/dates";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, RowAction, SubmitButton, Textarea } from "@/components/ui/forms";
import { correctionRows } from "@/features/attendance/queries";
import { decideCorrection } from "@/features/attendance/actions";
import { actorName } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Corrections" };

export default function CorrectionsPage(props: PageProps<"/attendance/corrections">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Corrections searchParams={props.searchParams} />
    </Suspense>
  );
}

const STATUS_TONE = { pending: "warn", approved: "ok", rejected: "bad" } as const;

async function Corrections({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("attendance.correct.approve");
  const sp = await searchParams;
  const scope = departmentScope(user, "attendance.correct.approve");
  const status = param(sp, "status") ?? "pending";
  const rows = correctionRows(scope, status);
  const counts = Object.fromEntries(["pending", "approved", "rejected"].map((s) => [s, correctionRows(scope, s).length]));

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Correction requests"
        description="Raised by professors after a register locks. Approving updates the record, keeps the original value, reason, requester and approver, recomputes summaries and notifies the student and guardians."
      />
      <Tabs
        active={status}
        items={[
          { key: "pending", label: `Pending (${counts.pending})`, href: "/attendance/corrections?status=pending" },
          { key: "approved", label: `Approved (${counts.approved})`, href: "/attendance/corrections?status=approved" },
          { key: "rejected", label: `Rejected (${counts.rejected})`, href: "/attendance/corrections?status=rejected" },
          { key: "all", label: "All", href: "/attendance/corrections?status=all" },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<FilePenLine className="size-6" />} title="Nothing here">
            No {status === "all" ? "" : status} correction requests.
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Session</TH>
                <TH>Change</TH>
                <TH>Reason</TH>
                <TH>Requested</TH>
                <TH className="text-right">{status === "pending" ? "Decision" : "Outcome"}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/people/students/${c.student.id}`} className="font-medium hover:text-primary">
                      {c.student.name}
                    </Link>
                    <div className="font-mono text-[11px] text-muted">{c.student.enrollmentNo}</div>
                  </TD>
                  <TD>
                    {c.session ? (
                      <>
                        <div className="font-medium">{c.session.subjectName}</div>
                        <div className="text-xs text-muted">
                          {c.session.division} · {formatDate(c.session.date, { weekday: true })} {formatTime(c.session.start)}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold">
                      <Badge tone="bad">{c.fromStatus}</Badge>
                      <ArrowRight className="size-3 text-faint" />
                      <Badge tone={c.toStatus === "OD" ? "info" : "ok"}>{c.toStatus}</Badge>
                    </span>
                  </TD>
                  <TD className="max-w-72 text-xs">{c.reason}</TD>
                  <TD className="text-xs text-muted">
                    {actorName(c.requestedBy)}
                    <div>{formatDateTime(c.createdAt)}</div>
                  </TD>
                  <TD>
                    {c.status === "pending" ? (
                      <div className="flex justify-end gap-1.5">
                        <RowAction action={decideCorrection} fields={{ id: c.id, decision: "approved" }} label="Approve" variant="success" icon={<Check className="size-3.5" />} />
                        <Dialog trigger="Reject" triggerVariant="secondary" triggerSize="sm" title="Reject correction" description={`${c.student.name} · ${c.fromStatus} → ${c.toStatus}`}>
                          <ActionForm action={decideCorrection} className="space-y-4">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="decision" value="rejected" />
                            <Field name="note" label="Note to the professor">
                              <Textarea name="note" placeholder="What evidence is missing?" />
                            </Field>
                            <div className="flex justify-end">
                              <SubmitButton variant="danger">Reject</SubmitButton>
                            </div>
                          </ActionForm>
                        </Dialog>
                      </div>
                    ) : (
                      <div className="text-right">
                        <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                        <div className="mt-0.5 text-[11px] text-muted">{actorName(c.decidedBy)}</div>
                        {c.note && <div className="text-[11px] text-muted italic">“{c.note}”</div>}
                      </div>
                    )}
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
