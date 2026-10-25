import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRightLeft, BookOpen, CalendarX, Mail, Phone, ShieldCheck, UserCog } from "lucide-react";
import { isRecoverable, sessionsNeeded } from "@/shared/attendance";
import { formatDate, formatDateTime, istDate } from "@/shared/dates";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { Avatar, Badge, ButtonLink, Card, CardBody, CardHeader, DeptChip, EmptyState, KeyValue, PageSkeleton, PercentText, Progress, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, Select, SubmitButton, Textarea } from "@/components/ui/forms";
import { batchOptionsByDivision, student360 } from "@/features/students/queries";
import { TransferForm } from "@/features/students/components";
import { setStudentStatus } from "@/features/students/actions";
import { deptCode } from "@/features/common/lookups";
import { departmentTones } from "@/shared/tokens";

export const metadata: Metadata = { title: "Student 360" };

export default function StudentPage(props: PageProps<"/people/students/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Student360 params={props.params} />
    </Suspense>
  );
}

const COMPONENT = { TH: "Theory", PR: "Practical", TUT: "Tutorial" } as const;
const LEAVE_TONE = { pending: "warn", needs_info: "info", approved: "ok", rejected: "bad", cancelled: "neutral" } as const;

async function Student360({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("students.view");
  const { id } = await params;
  const data = student360(id);
  if (!data) notFound();
  const { student: s, current, history, tallies, standing, guardians, leave, corrections, auditTrail } = data;
  const scope = departmentScope(user, "students.view");
  if (scope && scope !== s.departmentId) redirect("/denied?p=students.view");
  const { minPercent, warnPercent } = db().policy;
  const canManage = can(user, "students.manage");
  const code = deptCode(s.departmentId);
  const t = departmentTones[code];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <Avatar name={s.name} size={64} tone={t.fg} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold tracking-wide text-primary uppercase">Student 360</div>
          <h1 className="text-2xl font-bold text-navy">{s.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <DeptChip code={code} />
            <span className="font-mono">{s.enrollmentNo}</span>
            {current && (
              <span>
                · {current.division} · {current.batch} · Roll {current.rollNo} · Sem {current.semester}
              </span>
            )}
            <Badge tone={s.status === "active" ? "ok" : s.status === "detained" ? "bad" : "neutral"}>{s.status}</Badge>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {current && (
              <Dialog trigger={<><ArrowRightLeft className="size-4" /> Transfer</>} triggerVariant="secondary" title="Change division or batch" description="Closes the current enrollment and opens a new one. Past attendance keeps its original division and batch." wide>
                <TransferForm studentId={s.id} divisions={batchOptionsByDivision(s.departmentId)} current={{ divisionId: current.divisionId, batchId: current.batchId }} today={istDate()} />
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
            <CardHeader
              icon={<BookOpen className="size-5" />}
              title="Attendance by subject"
              description={`Eligibility is per subject × component at ${minPercent}%. “Needed” is consecutive sessions to reach the threshold.`}
            />
            <div className="grid grid-cols-3 gap-4 border-b border-line-soft px-5 py-4">
              <div>
                <div className="text-xs text-muted">Overall</div>
                <div className="text-2xl font-bold">
                  <PercentText value={standing?.percent ?? null} min={minPercent} warn={warnPercent} />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Sessions attended</div>
                <div className="text-2xl font-bold text-navy tabular-nums">
                  {standing?.attended ?? 0}
                  <span className="text-base font-medium text-muted">/{standing?.held ?? 0}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Subjects below {minPercent}%</div>
                <div className={`text-2xl font-bold tabular-nums ${standing?.shortSubjects ? "text-bad" : "text-ok"}`}>{standing?.shortSubjects ?? 0}</div>
              </div>
            </div>
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
                  const needed = sessionsNeeded(r, minPercent);
                  const recoverable = isRecoverable(r, minPercent, r.remaining);
                  return (
                    <TR key={r.teachingGroupId}>
                      <TD>
                        <div className="font-medium">{r.subject.name}</div>
                        <div className="font-mono text-[11px] text-muted">{r.subject.code}</div>
                      </TD>
                      <TD>
                        <Badge tone={r.component === "TH" ? "info" : "ok"}>{COMPONENT[r.component]}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {r.attended}/{r.held}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Progress value={r.percent ?? 0} />
                          <span className="w-14 text-right text-xs">
                            <PercentText value={r.percent} min={minPercent} warn={warnPercent} />
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
          </Card>

          <Card>
            <CardHeader icon={<ArrowRightLeft className="size-5" />} title="Enrollment history" description="One row per student per term; changes close a row and open a new one" />
            <ol className="relative mx-5 my-4 border-l-2 border-line">
              {history.map((e) => (
                <li key={e.id} className="mb-4 ml-5 last:mb-0">
                  <span className={`absolute -left-[7px] mt-1.5 size-3 rounded-full ring-4 ring-white ${e.validTo === null ? "bg-ok" : "bg-faint"}`} />
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {e.division} · {e.batch} · Sem {e.semester}
                    <Badge tone={e.validTo === null ? "ok" : "neutral"}>{e.validTo === null ? "current" : e.year}</Badge>
                    {e.enrollmentType !== "regular" && <Badge tone="violet">{e.enrollmentType.toUpperCase()}</Badge>}
                  </div>
                  <div className="text-xs text-muted">
                    {formatDate(e.validFrom, { year: true })} – {e.validTo ? formatDate(e.validTo, { year: true }) : "present"} · Roll {e.rollNo}
                    {e.reason && ` · ${e.reason}`}
                  </div>
                </li>
              ))}
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
                  ["Date of birth", formatDate(s.dob, { year: true })],
                  ["Admission", `${s.admissionYear} · ${s.admissionType === "direct_second_year" ? "DSE" : "FE regular"}`],
                  ["Gender", { M: "Male", F: "Female", O: "Other" }[s.gender]],
                  [<span key="e" className="inline-flex items-center gap-1"><Mail className="size-3" /> Email</span>, s.email],
                  [<span key="p" className="inline-flex items-center gap-1"><Phone className="size-3" /> Mobile</span>, s.phone],
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<ShieldCheck className="size-5" />} title="Guardians" description="Links are verified by Operations; parents never self-link" />
            <ul className="divide-y divide-line-soft">
              {guardians.map(({ link, guardian }) => (
                <li key={link.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={guardian.name} size={32} tone="#5b6b85" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{guardian.name}</div>
                    <div className="text-xs text-muted">
                      {guardian.relation} · {guardian.phone} {guardian.activated && "· app active"}
                    </div>
                  </div>
                  <Badge tone={link.status === "verified" ? "ok" : link.status === "pending" ? "warn" : "bad"}>{link.status}</Badge>
                </li>
              ))}
            </ul>
            <div className="border-t border-line-soft px-5 py-2.5">
              <ButtonLink href={`/people/guardians?q=${encodeURIComponent(s.enrollmentNo)}`} size="sm" variant="ghost">
                Manage guardians
              </ButtonLink>
            </div>
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
                      <span className="font-medium">Leave · {formatDate(l.fromDate)}{l.toDate !== l.fromDate && ` – ${formatDate(l.toDate)}`}</span>
                      <Badge tone={LEAVE_TONE[l.status]} className="ml-auto">
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
                        Correction {c.fromStatus} → {c.toStatus}
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

          {auditTrail.length > 0 && (
            <Card>
              <CardHeader title="Audit trail" />
              <ul className="divide-y divide-line-soft">
                {auditTrail.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="text-sm">{a.summary}</div>
                    <div className="text-xs text-muted">
                      {a.actorName} · {formatDateTime(a.at)}
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
