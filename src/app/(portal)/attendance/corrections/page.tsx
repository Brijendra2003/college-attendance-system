import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Check, FilePenLine } from "lucide-react";
import { formatDate, formatDateTime } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, Skeleton, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, RowAction, SubmitButton, Textarea } from "@/components/ui/forms";
import { correctionCounts, correctionRows } from "@/features/attendance/queries";
import { decideCorrection } from "@/features/attendance/actions";

export const metadata: Metadata = { title: "Corrections" };

export default function CorrectionsPage(props: PageProps<"/attendance/corrections">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Corrections searchParams={props.searchParams} />
    </Suspense>
  );
}

const STATUS_TONE = { pending: "warn", approved: "ok", rejected: "bad" } as const;

async function Corrections({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("attendance.correct.approve");
  const sp = await searchParams;
  const status = param(sp, "status") ?? "pending";
  const counts = await correctionCounts();

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
      <Suspense key={status} fallback={<Skeleton className="h-96" />}>
        <CorrectionTable status={status} />
      </Suspense>
    </>
  );
}

async function CorrectionTable({ status }: { status: string }) {
  const rows = await correctionRows(status);
  return (
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
                  <Link href={`/people/students/${c.student_id}`} className="font-medium hover:text-primary">
                    {c.student?.full_name}
                  </Link>
                  <div className="font-mono text-[11px] text-muted">{c.student?.enrollment_no}</div>
                </TD>
                <TD>
                  {c.session ? (
                    <>
                      <div className="font-medium">{c.session.subject_name}</div>
                      <div className="text-xs text-muted">
                        {c.session.division_label} · {formatDate(c.session.session_date, { weekday: true })} {c.session.start_time}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold">
                    <Badge tone="bad">{c.from_status}</Badge>
                    <ArrowRight className="size-3 text-faint" />
                    <Badge tone={c.to_status === "OD" ? "info" : "ok"}>{c.to_status}</Badge>
                  </span>
                </TD>
                <TD className="max-w-72 text-xs">{c.reason}</TD>
                <TD className="text-xs text-muted">
                  {c.requester?.full_name ?? "—"}
                  <div>{formatDateTime(c.created_at)}</div>
                </TD>
                <TD>
                  {c.status === "pending" ? (
                    <div className="flex justify-end gap-1.5">
                      <RowAction action={decideCorrection} fields={{ id: c.id, decision: "approved" }} label="Approve" variant="success" icon={<Check className="size-3.5" />} />
                      <Dialog trigger="Reject" triggerVariant="secondary" triggerSize="sm" title="Reject correction" description={`${c.student?.full_name} · ${c.from_status} → ${c.to_status}`}>
                        <ActionForm action={decideCorrection} className="space-y-4">
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="decision" value="rejected" />
                          <Field name="note" label="Note to the professor">
                            <Textarea name="note" placeholder="What evidence is missing?" />
                          </Field>
                          <div className="flex justify-end">
                            <SubmitButton variant="danger" pendingLabel="Rejecting">
                              Reject
                            </SubmitButton>
                          </div>
                        </ActionForm>
                      </Dialog>
                    </div>
                  ) : (
                    <div className="text-right">
                      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                      {c.decided_at && <div className="mt-0.5 text-[11px] text-muted">{formatDateTime(c.decided_at)}</div>}
                      {c.decision_note && <div className="text-[11px] text-muted italic">“{c.decision_note}”</div>}
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
