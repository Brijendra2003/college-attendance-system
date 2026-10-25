import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert, CircleCheck, Send } from "lucide-react";
import { formatDate } from "@/shared/dates";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Card, CardBody, CardHeader, PageHeader, PageSkeleton, toneStyle } from "@/components/ui/primitives";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { versionDetail } from "@/features/timetable/queries";
import { publishTimetable } from "@/features/timetable/actions";
import { periodTemplate } from "@/features/academics/queries";
import { deptCodeOf } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Timetable" };

export default function VersionPage(props: PageProps<"/timetable/[versionId]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Version params={props.params} />
    </Suspense>
  );
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function Version({ params }: { params: Promise<{ versionId: string }> }) {
  const user = await requirePermission("timetable.view");
  const { versionId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(versionId)) notFound();
  const [d, template] = await Promise.all([versionDetail(versionId), periodTemplate()]);
  if (!d) notFound();
  const scope = departmentScope(user, "timetable.view");
  if (scope && scope !== d.version.department_id) redirect("/denied?p=timetable.view");
  const code = await deptCodeOf(d.version.department_id);
  const errors = d.validation.filter((i) => i.severity === "error");
  const canPublish = d.version.status === "draft" && can(user, "timetable.publish");
  const days = d.slots.some((s) => s.weekday === 6) ? DAYS : DAYS.slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow={`Timetable · ${code} ${d.version.program_year}`}
        title={`${d.version.program_year} ${code} — revision ${d.version.revision}`}
        description={`Effective from ${formatDate(d.version.effective_from, { year: true })}. Theory runs division-wide; practical batches sit in parallel lanes.`}
        actions={
          <>
            <Badge tone={d.version.status === "published" ? "ok" : d.version.status === "draft" ? "warn" : "neutral"}>{d.version.status}</Badge>
            <ButtonLink href="/timetable" size="sm">
              All versions
            </ButtonLink>
            {canPublish && (
              <ActionForm action={publishTimetable} compact>
                <input type="hidden" name="versionId" value={d.version.id} />
                <SubmitButton disabled={errors.length > 0} pendingLabel="Publishing">
                  <Send className="size-4" /> Publish
                </SubmitButton>
              </ActionForm>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader title="Validation" description="validate_timetable(): professor, division/batch and room clashes, and unassigned professors. Hard conflicts block publishing." />
        <CardBody>
          {d.validation.length === 0 ? (
            <div className="flex items-center gap-2 text-sm font-medium text-ok">
              <CircleCheck className="size-4" /> No conflicts. Professors, divisions, batches and rooms are free for every slot.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {d.validation.slice(0, 20).map((i, k) => (
                <li key={k} className={`flex items-center gap-2 text-sm ${i.severity === "error" ? "text-bad" : "text-warn"}`}>
                  <CircleAlert className="size-4 shrink-0" /> {i.message}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="space-y-6">
        {d.divisions.map((div) => (
          <Card key={div.id}>
            <CardHeader title={`Division ${div.code}`} description={`${div.label} · room ${div.room_label ?? "—"}`} />
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th className="w-24" />
                    {template.periods.map((p) => (
                      <th key={p.start} className={`px-1 pb-1 text-center font-medium text-muted ${p.kind === "break" ? "w-10" : ""}`}>
                        {p.kind === "break" ? "" : p.label}
                        <div className="text-[10px] font-normal text-faint">{p.kind === "break" ? "" : p.start}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((day, i) => (
                    <tr key={day}>
                      <th className="pr-2 text-left font-semibold text-heading">{day}</th>
                      {template.periods.map((p) => {
                        if (p.kind === "break") return <td key={p.start} className="rounded-md bg-sunken" title={p.label} />;
                        const slots = d.slots
                          .filter((s) => s.group.division_id === div.id && s.weekday === i + 1 && s.starts_at.slice(0, 5) === p.start)
                          .sort((a, b) => (a.group.batch?.code ?? "").localeCompare(b.group.batch?.code ?? ""));
                        if (slots.length === 0) return <td key={p.start} className="h-16 rounded-lg bg-subtle" />;
                        return (
                          <td key={p.start} className="align-top">
                            <div className="flex flex-col gap-1">
                              {slots.map((s) => (
                                <div
                                  key={s.id}
                                  className="rounded-lg border px-2 py-1.5"
                                  style={toneStyle(s.group.component === "PR" ? "IT" : code)}
                                  title={`${s.group.offering.subject.name} · ${s.staff?.full_name} · ${s.room_label}`}
                                >
                                  <div className="flex items-center gap-1">
                                    {s.group.batch && <span className="rounded bg-surface/70 px-1 text-[10px] font-bold">B{s.group.batch.code}</span>}
                                    <span className="line-clamp-1 font-semibold text-ink">{s.group.offering.subject.name}</span>
                                  </div>
                                  <div className="line-clamp-1 text-[10.5px] text-muted">
                                    {s.staff?.full_name.replace(/^(Dr\.|Prof\.) /, "")} · {s.room_label}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
