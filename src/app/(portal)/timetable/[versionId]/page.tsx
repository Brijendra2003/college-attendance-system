import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert, CircleCheck, Send } from "lucide-react";
import { departmentTones } from "@/shared/tokens";
import { formatDate, formatTime } from "@/shared/dates";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { PERIODS } from "@/lib/data/catalogue";
import { Badge, ButtonLink, Card, CardBody, CardHeader, PageHeader, PageSkeleton } from "@/components/ui/primitives";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { versionDetail } from "@/features/timetable/queries";
import { publishTimetable } from "@/features/timetable/actions";
import { deptCode } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Timetable" };

export default function VersionPage(props: PageProps<"/timetable/[versionId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Version params={props.params} />
    </Suspense>
  );
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

async function Version({ params }: { params: Promise<{ versionId: string }> }) {
  const user = await requirePermission("timetable.view");
  const { versionId } = await params;
  const d = versionDetail(versionId);
  if (!d) notFound();
  const scope = departmentScope(user, "timetable.view");
  if (scope && scope !== d.version.departmentId) redirect("/denied?p=timetable.view");
  const code = deptCode(d.version.departmentId);
  const t = departmentTones[code];
  const errors = d.validation.filter((i) => i.severity === "error");
  const canPublish = d.version.status === "draft" && can(user, "timetable.publish");
  const cols = PERIODS;

  return (
    <>
      <PageHeader
        eyebrow={`Timetable · ${code} ${d.version.programYear}`}
        title={`${d.version.programYear} ${code} — revision ${d.version.revision}`}
        description={`Effective from ${formatDate(d.version.effectiveFrom, { year: true })}. Theory runs division-wide; practical batches sit in parallel lanes.`}
        actions={
          <>
            <Badge tone={d.version.status === "published" ? "ok" : d.version.status === "draft" ? "warn" : "neutral"}>{d.version.status}</Badge>
            <ButtonLink href="/timetable" size="sm">
              All versions
            </ButtonLink>
            {canPublish && (
              <ActionForm action={publishTimetable} compact>
                <input type="hidden" name="versionId" value={d.version.id} />
                <SubmitButton disabled={errors.length > 0} pendingLabel="Publishing…">
                  <Send className="size-4" /> Publish
                </SubmitButton>
              </ActionForm>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader title="Validation" description="validate_timetable(): hard conflicts block publishing" />
        <CardBody>
          {d.validation.length === 0 ? (
            <div className="flex items-center gap-2 text-sm font-medium text-ok">
              <CircleCheck className="size-4" /> No conflicts. Professors, divisions, batches and rooms are free for every slot.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {d.validation.slice(0, 12).map((i, k) => (
                <li key={k} className={`flex items-center gap-2 text-sm ${i.severity === "error" ? "text-bad" : "text-warn"}`}>
                  <CircleAlert className="size-4" /> {i.message}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="space-y-6">
        {d.divisions.map((div) => (
          <Card key={div.id}>
            <CardHeader title={`Division ${div.code}`} description={`${div.label} · room ${div.room}`} />
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th className="w-24" />
                    {cols.map((p) => (
                      <th key={p.start} className={`px-1 pb-1 text-center font-medium text-muted ${p.kind === "break" ? "w-10" : ""}`}>
                        {p.kind === "break" ? "" : p.label}
                        <div className="text-[10px] font-normal text-faint">{p.kind === "break" ? "" : `${formatTime(p.start)}`}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day, i) => (
                    <tr key={day}>
                      <th className="pr-2 text-left font-semibold text-navy">{day}</th>
                      {cols.map((p) => {
                        if (p.kind === "break") return <td key={p.start} className="rounded-md bg-[#f3f6fa]" title={p.label} />;
                        const slots = d.slots.filter((s) => s.divisionId === div.id && s.weekday === i + 1 && s.start === p.start).sort((a, b) => a.batch.localeCompare(b.batch));
                        if (slots.length === 0) return <td key={p.start} className="h-16 rounded-lg bg-[#f8fafd]" />;
                        return (
                          <td key={p.start} className="align-top">
                            <div className="flex flex-col gap-1">
                              {slots.map((s) => (
                                <div
                                  key={s.id}
                                  className="rounded-lg border px-2 py-1.5"
                                  style={s.component === "PR" ? { background: "#e5f6f3", borderColor: "#9fd9cf" } : { background: t.bg, borderColor: t.border }}
                                  title={`${s.subject.name} · ${s.staffName} · ${s.room}`}
                                >
                                  <div className="flex items-center gap-1">
                                    {s.batch && <span className="rounded bg-white/70 px-1 text-[10px] font-bold text-[#0e6d64]">{s.batch.replace("Batch ", "B")}</span>}
                                    <span className="line-clamp-1 font-semibold text-ink">{s.subject.name}</span>
                                  </div>
                                  <div className="line-clamp-1 text-[10.5px] text-muted">
                                    {s.staffName.replace(/^(Dr\.|Prof\.) /, "")} · {s.room}
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
