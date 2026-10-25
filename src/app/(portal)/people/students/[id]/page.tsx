import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRightLeft, BookOpen, CalendarX, Mail, Phone, ShieldCheck, UserCog } from "lucide-react";
import { isRecoverable, sessionsNeeded } from "@/shared/attendance";
import { addDays, formatDate, formatDateTime, istDate } from "@/shared/dates";
import { toneOf } from "@/shared/tokens";
import { can, requirePermission } from "@/lib/auth/permissions";
import { Avatar, Badge, ButtonLink, Card, CardBody, CardHeader, DeptChip, EmptyState, KeyValue, ld, PageSkeleton, PercentText, Progress, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, Select, SubmitButton, Textarea } from "@/components/ui/forms";
import { auditTrailFor, student360 } from "@/features/students/queries";
import { TransferForm } from "@/features/students/components";
import { setStudentStatus } from "@/features/students/actions";
import { parseRange } from "@/features/academics/queries";
import { batchOptionsByDivision, getPolicy } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Student 360" };

export default function StudentPage(props: PageProps<"/people/students/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Student360 params={props.params} />
    </Suspense>
  );
}

const COMPONENT = { TH: "Theory", PR: "Practical", TUT: "Tutorial" } as Record<string, string>;
const LEAVE_TONE = { pending: "warn", needs_info: "info", approved: "ok", rejected: "bad", cancelled: "neutral" } as const;

async function Student360({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("students.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  // RLS returns nothing for a student outside the user's scope → 404, never a leak.
  const data = await student360(id);
  if (!data) notFound();
  const { student: s, history, tallies, guardians, leave, corrections } = data;
  const [policy, trail] = await Promise.all([getPolicy(), can(user, "audit.view") ? auditTrailFor(id) : Promise.resolve([])]);
  const min = policy.min_percent;
  const canManage = can(user, "students.manage");
  const t = toneOf(s.department_code);
  const current = history.find((h) => parseRange(h.valid_during).to === null || parseRange(h.valid_during).to! > istDate());

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <Avatar name={s.full_name} size={64} tone={ld(t.fg, t.border)} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold tracking-wide text-primary uppercase">Student 360</div>
          <h1 className="text-2xl font-bold text-heading">{s.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <DeptChip code={s.department_code} />
            <span className="font-mono">{s.enrollment_no}</span>
            {s.division_label && (
              <span>
                · {s.division_label} · Batch {s.batch_code} · Roll {s.roll_no} · Sem {s.semester}
              </span>
            )}
            <Badge tone={s.status === "active" ? "ok" : s.status === "detained" ? "bad" : "neutral"}>{s.status.replace("_", " ")}</Badge>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {s.division_id && s.batch_id && (
              <Dialog
                trigger={<><ArrowRightLeft className="size-4" /> Transfer</>}
                triggerVariant="secondary"
                title="Change division or batch"
                description="Closes the current enrollment and opens a new one. Past attendance keeps its original division and batch."
                wide
              >
                <TransferForm studentId={s.id} divisions={await batchOptionsByDivision(s.department_id)} current={{ divisionId: s.division_id, batchId: s.batch_id }} today={addDays(istDate(), 1)} />
              </Dialog>
            )}
            <Dialog trigger={<><UserCog className="size-4" /> Status</>} triggerVariant="secondary" title="Change student status">
              <ActionForm action={setStudentStatus} className="space-y-4">
                <input type="hidden" name="studentId" value={s.id} />
                <Field name="status" label="Status">
                  <Select name="status" defaultValue={s.status}>
                    <option value="active">Active</option>
                    <option value="detained">Detained</option>
                    <option value="withdrawn">Withdrawn</option>
                    <option value="passed_out">Passed out</option>
                  </Select>
                </Field>
                <Field name="reason" label="Reason">
                  <Textarea name="reason" />
                </Field>
                <div className="flex justify-end">
                  <SubmitButton>Save</SubmitButton>
                </div>
              </ActionForm>
            </Dialog>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<BookOpen className="size-5" />} title="Attendance by subject" description={`Eligibility is per subject × component at ${min}%. “Needed” is consecutive sessions to reach the threshold.`} />
            <div className="grid grid-cols-3 gap-4 border-b border-line-soft px-5 py-4">
              <div>
                <div className="text-xs text-muted">Overall</div>
                <div className="text-2xl font-bold">
                  <PercentText value={s.percent} min={min} warn={policy.warn_percent} />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Sessions attended</div>
                <div className="text-2xl font-bold text-heading tabular-nums">
                  {Number(s.attended ?? 0)}
                  <span className="text-base font-medium text-muted">/{Number(s.held ?? 0)}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Subjects below {min}%</div>
                <div className={`text-2xl font-bold tabular-nums ${s.short_subjects ? "text-bad" : "text-ok"}`}>{s.short_subjects ?? 0}</div>
              </div>
            </div>
            {tallies.length === 0 ? (
              <EmptyState title="No attendance recorded yet this term" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Subject</TH>
                    <TH>Component</TH>
                    <TH className="text-right">Attended / held</TH>
                    <TH className="w-48">Percentage</TH>
                    <TH className="text-right">Needed</TH>
                    <TH className="text-right">Left in term</TH>
                  </tr>
                </THead>
                <tbody>
                  {tallies.map((r) => {
                    const tally = { held: Number(r.held), attended: Number(r.attended) };
                    const needed = sessionsNeeded(tally, min);
                    const recoverable = isRecoverable(tally, min, Number(r.remaining));
                    return (
                      <TR key={`${r.offering_id}-${r.component}`}>
                        <TD>
                          <div className="font-medium">{r.subject_name}</div>
                          <div className="font-mono text-[11px] text-muted">{r.subject_code}</div>
                        </TD>
                        <TD>
                          <Badge tone={r.component === "TH" ? "info" : "ok"}>{COMPONENT[r.component] ?? r.component}</Badge>
                        </TD>
                        <TD className="text-right tabular-nums">
                          {tally.attended}/{tally.held}
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <Progress value={Number(r.percent ?? 0)} />
                            <span className="w-14 text-right text-xs">
                              <PercentText value={r.percent} min={min} warn={policy.warn_percent} />
                            </span>
                          </div>
                        </TD>
                        <TD className="text-right tabular-nums">
                          {needed === 0 ? <span className="text-faint">—</span> : <span className={recoverable ? "font-semibold text-warn" : "font-semibold text-bad"}>{needed}</span>}
                        </TD>
                        <TD className="text-right text-muted tabular-nums">
                          {r.remaining}
                          {needed > 0 && !recoverable && (
                            <Badge tone="bad" className="ml-1.5">
                              not reachable
                            </Badge>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader icon={<ArrowRightLeft className="size-5" />} title="Enrollment history" description="One row per student per term; changes close a row and open a new one" />
            <ol className="relative mx-5 my-4 border-l-2 border-line">
              {history.map((e) => {
                const r = parseRange(e.valid_during);
                const isCurrent = e === current;
                return (
                  <li key={e.id} className="mb-4 ml-5 last:mb-0">
                    <span className={`absolute -left-[7px] mt-1.5 size-3 rounded-full ring-4 ring-surface ${isCurrent ? "bg-ok" : "bg-faint"}`} />
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      {e.division?.label} · Batch {e.batch?.code} · Sem {e.semester}
                      <Badge tone={isCurrent ? "ok" : "neutral"}>{isCurrent ? "current" : e.year?.label}</Badge>
                      {e.enrollment_type !== "regular" && <Badge tone="violet">{e.enrollment_type.toUpperCase()}</Badge>}
                    </div>
                    <div className="text-xs text-muted">
                      {formatDate(r.from, { year: true })} – {r.to ? formatDate(addDays(r.to, -1), { year: true }) : "present"} · Roll {e.roll_no}
                      {e.reason && ` · ${e.reason}`}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <KeyValue
                items={[
                  ["MU PRN", s.prn ?? <Badge tone="warn">Not issued</Badge>],
                  ["Date of birth", s.dob ? formatDate(s.dob, { year: true }) : "—"],
                  ["Admission", `${s.admission_year} · ${s.admission_type === "direct_second_year" ? "DSE" : "FE regular"}`],
                  ["Gender", { M: "Male", F: "Female", O: "Other" }[s.gender ?? ""] ?? "—"],
                  [<span key="e" className="inline-flex items-center gap-1"><Mail className="size-3" /> Email</span>, s.email ?? "—"],
                  [<span key="p" className="inline-flex items-center gap-1"><Phone className="size-3" /> Mobile</span>, s.phone ?? "—"],
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<ShieldCheck className="size-5" />} title="Guardians" description="Links are verified by Operations; parents never self-link" />
            {guardians.length === 0 ? (
              <EmptyState title="No guardians on record" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {guardians.map(({ id: linkId, status, guardian }) => (
                  <li key={linkId} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={guardian?.full_name ?? "?"} size={32} tone="var(--muted)" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{guardian?.full_name}</div>
                      <div className="text-xs text-muted">
                        {guardian?.relation} · {guardian?.phone} {guardian?.user_id && "· app active"}
                      </div>
                    </div>
                    <Badge tone={status === "verified" ? "ok" : status === "pending" ? "warn" : "bad"}>{status}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {can(user, "guardians.manage") && (
              <div className="border-t border-line-soft px-5 py-2.5">
                <ButtonLink href={`/people/guardians?q=${encodeURIComponent(s.enrollment_no)}&status=all`} size="sm" variant="ghost">
                  Manage guardians
                </ButtonLink>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader icon={<CalendarX className="size-5" />} title="Leave & corrections" />
            {leave.length + corrections.length === 0 ? (
              <EmptyState title="Nothing on record this term" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {leave.map((l) => (
                  <li key={l.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        Leave · {formatDate(l.from_date)}
                        {l.to_date !== l.from_date && ` – ${formatDate(l.to_date)}`}
                      </span>
                      <Badge tone={LEAVE_TONE[l.status as keyof typeof LEAVE_TONE] ?? "neutral"} className="ml-auto">
                        {l.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted">{l.reason}</div>
                  </li>
                ))}
                {corrections.map((c) => (
                  <li key={c.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        Correction {c.from_status} → {c.to_status}
                      </span>
                      <Badge tone={c.status === "approved" ? "ok" : c.status === "pending" ? "warn" : "bad"} className="ml-auto">
                        {c.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted">{c.reason}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {trail.length > 0 && (
            <Card>
              <CardHeader title="Audit trail" />
              <ul className="divide-y divide-line-soft">
                {trail.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="text-sm">{a.summary}</div>
                    <div className="text-xs text-muted">
                      {a.actor_name} · {formatDateTime(a.at)}
                      {a.reason && ` · “${a.reason}”`}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
