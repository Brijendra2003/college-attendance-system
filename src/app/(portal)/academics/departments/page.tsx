import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarClock as History, UserRound } from "lucide-react";
import { departmentTones } from "@/shared/tokens";
import { formatDate, istDate } from "@/shared/dates";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { Avatar, Badge, Card, PageHeader, PageSkeleton } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, Input, Select, SubmitButton } from "@/components/ui/forms";
import { departmentCards } from "@/features/academics/queries";
import { assignHod } from "@/features/academics/actions";

export const metadata: Metadata = { title: "Departments" };

export default function DepartmentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Departments />
    </Suspense>
  );
}

async function Departments() {
  const user = await requirePermission("blueprint.view");
  const cards = departmentCards(departmentScope(user, "blueprint.view"));
  const canManage = can(user, "blueprint.manage");
  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Departments"
        description="Each branch is managed by its HOD. HOD assignments are effective-dated: a change closes the current assignment and keeps it in history."
      />
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {cards.map((d) => {
          const t = departmentTones[d.code];
          return (
            <Card key={d.id} id={d.code} className="scroll-mt-24 overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ background: t.bg, borderColor: t.border }}>
                <div className="min-w-0">
                  <div className="text-xl font-bold" style={{ color: t.fg }}>
                    {d.code}
                  </div>
                  <div className="truncate text-sm text-ink">{d.name}</div>
                  <div className="mt-0.5 text-xs text-muted">Est. {d.established} · intake {d.intake}/year</div>
                </div>
                {canManage && (
                  <Dialog trigger="Change HOD" triggerVariant="secondary" triggerSize="sm" title={`Assign HOD — ${d.code}`} description="The current HOD's assignment ends the day before the new one starts.">
                    <ActionForm action={assignHod} className="space-y-4">
                      <input type="hidden" name="departmentId" value={d.id} />
                      <Field name="staffId" label="Faculty member">
                        <Select name="staffId" defaultValue={d.hod?.staff.id}>
                          {d.faculty.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} — {s.designation}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field name="effectiveFrom" label="Effective from">
                        <Input type="date" name="effectiveFrom" defaultValue={istDate()} />
                      </Field>
                      <div className="flex justify-end">
                        <SubmitButton>Assign HOD</SubmitButton>
                      </div>
                    </ActionForm>
                  </Dialog>
                )}
              </div>
              <div className="flex items-center gap-3 px-5 py-4">
                <Avatar name={d.hod?.staff.name ?? "?"} size={40} tone={t.fg} />
                <div className="min-w-0">
                  <div className="text-xs text-muted">Head of department</div>
                  <div className="truncate font-semibold">{d.hod?.staff.name ?? "Not assigned"}</div>
                  {d.hod && <div className="text-xs text-muted">since {formatDate(d.hod.row.validFrom, { year: true })}</div>}
                </div>
              </div>
              <div className="grid grid-cols-4 border-y border-line-soft text-center">
                {[
                  ["Staff", d.staff],
                  ["Divisions", d.divisions],
                  ["Batches", d.batches],
                  ["Students", d.students],
                ].map(([k, v]) => (
                  <div key={k} className="border-r border-line-soft py-3 last:border-r-0">
                    <div className="text-lg font-bold text-navy tabular-nums">{v}</div>
                    <div className="text-[11px] text-muted">{k}</div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy">
                  <History className="size-3.5" /> HOD history
                </div>
                <ul className="space-y-1.5">
                  {d.history.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 text-xs">
                      <UserRound className="size-3.5 text-faint" />
                      <span className="truncate text-ink">{h.staff.name}</span>
                      <span className="ml-auto whitespace-nowrap text-muted">
                        {formatDate(h.validFrom, { year: true })} – {h.validTo ? formatDate(h.validTo, { year: true }) : <Badge tone="ok">current</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
