import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { BookOpen, CalendarDays, ClipboardCheck } from "lucide-react";
import { departmentTones } from "@/shared/tokens";
import { formatDate, formatTime } from "@/shared/dates";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { PERIODS } from "@/lib/data/catalogue";
import { Avatar, Badge, Card, CardBody, CardHeader, DeptChip, KeyValue, PageSkeleton, Progress, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { staffDetail } from "@/features/staff/queries";
import { deptCode } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Staff profile" };

export default function StaffDetailPage(props: PageProps<"/people/staff/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StaffDetail params={props.params} />
    </Suspense>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

async function StaffDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("staff.view");
  const { id } = await params;
  const d = staffDetail(id);
  if (!d) notFound();
  const scope = departmentScope(user, "staff.view");
  if (scope && scope !== d.staff.departmentId) redirect("/denied?p=staff.view");
  const code = deptCode(d.staff.departmentId);
  const t = departmentTones[code];
  const periods = PERIODS.filter((p) => p.kind !== "break");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={d.staff.name} size={64} tone={t.fg} />
        <div>
          <div className="text-xs font-semibold tracking-wide text-primary uppercase">Staff</div>
          <h1 className="text-2xl font-bold text-navy">{d.staff.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <DeptChip code={code} />
            {d.staff.designation} · <span className="font-mono">{d.staff.employeeId}</span>
            {d.isHod && <Badge tone="navy">HOD</Badge>}
            {d.classTeacherOf.map((c) => (
              <Badge key={c} tone="info">
                Class teacher · {c}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<CalendarDays className="size-5" />} title="Weekly timetable" description="Published odd-term timetable" />
            <div className="overflow-x-auto p-4">
              <table className="w-full border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th />
                    {periods.map((p) => (
                      <th key={p.start} className="px-1 pb-1 text-center font-medium text-muted">
                        {p.label}
                        <div className="text-[10px] font-normal text-faint">{formatTime(p.start)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day, i) => (
                    <tr key={day}>
                      <th className="pr-2 text-left font-semibold text-navy">{day}</th>
                      {periods.map((p) => {
                        const slot = d.slots.find((s) => s.weekday === i + 1 && s.start === p.start);
                        return (
                          <td key={p.start} className="h-14 min-w-28 rounded-lg align-top">
                            {slot ? (
                              <div className="h-full rounded-lg border px-2 py-1.5" style={{ background: slot.component === "PR" ? "#e5f6f3" : t.bg, borderColor: slot.component === "PR" ? "#9fd9cf" : t.border }}>
                                <div className="line-clamp-1 font-semibold text-ink">{slot.subject.name}</div>
                                <div className="text-[10.5px] text-muted">
                                  {slot.division}
                                  {slot.batch && ` · ${slot.batch}`} · {slot.room}
                                </div>
                              </div>
                            ) : (
                              <div className="h-full rounded-lg bg-[#f8fafd]" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader icon={<BookOpen className="size-5" />} title="Teaching assignments" description="Professor ↔ teaching group, effective-dated" />
            <Table>
              <THead>
                <tr>
                  <TH>Subject</TH>
                  <TH>Group</TH>
                  <TH>Component</TH>
                  <TH>Role</TH>
                  <TH>Since</TH>
                </tr>
              </THead>
              <tbody>
                {d.assignments.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <div className="font-medium">{a.subject.name}</div>
                      <div className="font-mono text-[11px] text-muted">{a.subject.code}</div>
                    </TD>
                    <TD>
                      {a.division}
                      {a.batch && <span className="text-muted"> · {a.batch}</span>}
                    </TD>
                    <TD>
                      <Badge tone={a.group.component === "TH" ? "info" : "ok"}>{a.group.component === "TH" ? "Theory" : "Practical"}</Badge>
                    </TD>
                    <TD className="capitalize">{a.role}</TD>
                    <TD className="text-muted">{formatDate(a.validFrom, { year: true })}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<ClipboardCheck className="size-5" />} title="Register submissions" description="Last 20 working days" />
            <CardBody>
              {d.submission ? (
                <>
                  <div className="mb-2 flex items-end justify-between">
                    <span className="text-3xl font-bold text-navy tabular-nums">{d.submission.onTimePercent.toFixed(0)}%</span>
                    <span className="text-xs text-muted">on time</span>
                  </div>
                  <Progress value={d.submission.onTimePercent} tone={d.submission.onTimePercent < 80 ? "var(--color-warn)" : "var(--color-ok)"} />
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["On time", d.submission.onTime, "text-ok"],
                      ["Late", d.submission.late, "text-warn"],
                      ["Missing", d.submission.missing, "text-bad"],
                    ].map(([k, v, c]) => (
                      <div key={k as string} className="rounded-lg bg-[#f8fafd] py-2">
                        <div className={`text-lg font-bold tabular-nums ${c}`}>{v}</div>
                        <div className="text-[11px] text-muted">{k}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">No sessions in this period.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <KeyValue
                items={[
                  ["Email", d.staff.email],
                  ["Mobile", d.staff.phone],
                  ["Joined", formatDate(d.staff.joinedOn, { year: true })],
                  ["Status", d.staff.status.replace("_", " ")],
                ]}
              />
              <div className="mt-4 border-t border-line-soft pt-3">
                <div className="mb-2 text-xs font-semibold text-navy">Department membership</div>
                <ul className="space-y-1 text-xs">
                  {d.memberships.map((m) => (
                    <li key={m.id} className="flex justify-between gap-2">
                      <span className="capitalize">{m.role === "hod" ? "HOD" : m.role.replace("_", " ")}</span>
                      <span className="text-muted">
                        {formatDate(m.validFrom, { year: true })} – {m.validTo ? formatDate(m.validTo, { year: true }) : "present"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
