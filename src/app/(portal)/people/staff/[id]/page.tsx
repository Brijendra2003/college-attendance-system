import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookOpen, CalendarDays, ClipboardCheck } from "lucide-react";
import { toneOf } from "@/shared/tokens";
import { addDays, formatDate } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { Avatar, Badge, Card, CardBody, CardHeader, DeptChip, EmptyState, KeyValue, ld, PageSkeleton, Progress, Table, TD, TH, THead, toneStyle, TR } from "@/components/ui/primitives";
import { staffDetail } from "@/features/staff/queries";
import { parseRange, periodTemplate } from "@/features/academics/queries";

export const metadata: Metadata = { title: "Staff profile" };

export default function StaffDetailPage(props: PageProps<"/people/staff/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <StaffDetail params={props.params} />
    </Suspense>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function StaffDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("staff.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await staffDetail(id); // RLS: HODs only see their department's staff
  if (!d) notFound();
  const template = await periodTemplate();
  const periods = template.periods.filter((p) => p.kind !== "break");
  const t = toneOf(d.staff.department_code);
  const days = d.slots.some((s) => s.weekday === 6) ? DAYS : DAYS.slice(0, 5);
  const current = d.assignments.filter((a) => parseRange(a.valid_during).to === null);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={d.staff.full_name} size={64} tone={ld(t.fg, t.border)} />
        <div>
          <div className="text-xs font-semibold tracking-wide text-primary uppercase">Staff</div>
          <h1 className="text-2xl font-bold text-heading">{d.staff.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <DeptChip code={d.staff.department_code} />
            {d.staff.designation} · <span className="font-mono">{d.staff.employee_id}</span>
            {d.staff.is_hod && <Badge tone="navy">HOD</Badge>}
            {d.staff.class_teacher_of && <Badge tone="info">Class teacher · {d.staff.class_teacher_of}</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<CalendarDays className="size-5" />} title="Weekly timetable" description="Published timetables for the active term" />
            {d.slots.length === 0 ? (
              <EmptyState title="No timetable slots" />
            ) : (
              <div className="overflow-x-auto p-4">
                <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1 text-xs">
                  <thead>
                    <tr>
                      <th className="w-12" />
                      {periods.map((p) => (
                        <th key={p.start} className="px-1 pb-1 text-center font-medium text-muted">
                          {p.label}
                          <div className="text-[10px] font-normal text-faint">{p.start}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day, i) => (
                      <tr key={day}>
                        <th className="pr-2 text-left font-semibold text-heading">{day}</th>
                        {periods.map((p) => {
                          const slot = d.slots.find((s) => s.weekday === i + 1 && s.starts_at.slice(0, 5) === p.start);
                          return (
                            <td key={p.start} className="h-14 align-top">
                              {slot ? (
                                <div className="h-full rounded-lg border px-2 py-1.5" style={toneStyle(slot.group.component === "PR" ? "IT" : d.staff.department_code)}>
                                  <div className="line-clamp-1 font-semibold text-ink">{slot.group.offering.subject.name}</div>
                                  <div className="line-clamp-1 text-[10.5px] text-muted">
                                    {slot.group.division?.label}
                                    {slot.group.batch && ` · B${slot.group.batch.code}`} · {slot.room_label}
                                  </div>
                                </div>
                              ) : (
                                <div className="h-full rounded-lg bg-subtle" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader icon={<BookOpen className="size-5" />} title="Teaching assignments" description="Professor ↔ teaching group, effective-dated" />
            {current.length === 0 ? (
              <EmptyState title="No current assignments" />
            ) : (
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
                  {current.map((a) => (
                    <TR key={a.id}>
                      <TD>
                        <div className="font-medium">{a.group.offering.subject.name}</div>
                        <div className="font-mono text-[11px] text-muted">{a.group.offering.subject.code}</div>
                      </TD>
                      <TD>
                        {a.group.division?.label}
                        {a.group.batch && <span className="text-muted"> · Batch {a.group.batch.code}</span>}
                      </TD>
                      <TD>
                        <Badge tone={a.group.component === "TH" ? "info" : "ok"}>{a.group.component === "TH" ? "Theory" : a.group.component === "PR" ? "Practical" : "Tutorial"}</Badge>
                      </TD>
                      <TD className="capitalize">{a.role}</TD>
                      <TD className="text-muted">{formatDate(parseRange(a.valid_during).from, { year: true })}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<ClipboardCheck className="size-5" />} title="Register submissions" description="Last 20 teaching days" />
            <CardBody>
              {d.submission ? (
                <>
                  <div className="mb-2 flex items-end justify-between">
                    <span className="text-3xl font-bold text-heading tabular-nums">{(d.submission.on_time_percent ?? 0).toFixed(0)}%</span>
                    <span className="text-xs text-muted">on time</span>
                  </div>
                  <Progress value={d.submission.on_time_percent ?? 0} tone={(d.submission.on_time_percent ?? 0) < 80 ? "var(--warn)" : "var(--ok)"} />
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {(
                      [
                        ["On time", d.submission.on_time, "text-ok"],
                        ["Late", d.submission.late, "text-warn"],
                        ["Missing", d.submission.missing, "text-bad"],
                      ] as const
                    ).map(([k, v, c]) => (
                      <div key={k} className="rounded-lg bg-subtle py-2">
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
                  ["Email", d.staff.email ?? "—"],
                  ["Mobile", d.staff.phone ?? "—"],
                  ["Joined", d.staff.joined_on ? formatDate(d.staff.joined_on, { year: true }) : "—"],
                  ["App account", d.staff.user_id ? "Active" : "Not provisioned"],
                ]}
              />
              <div className="mt-4 border-t border-line-soft pt-3">
                <div className="mb-2 text-xs font-semibold text-heading">Department membership</div>
                <ul className="space-y-1 text-xs">
                  {d.memberships.map((m) => {
                    const r = parseRange(m.valid_during);
                    return (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span className="capitalize">{m.role === "hod" ? "HOD" : m.role.replace("_", " ")}</span>
                        <span className="text-muted">
                          {formatDate(r.from, { year: true })} – {r.to ? formatDate(addDays(r.to, -1), { year: true }) : "present"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
