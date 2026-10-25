import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarPlus, GraduationCap, Repeat, Rocket, Upload } from "lucide-react";
import { formatDate } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { Badge, ButtonLink, Card, CardBody, CardHeader, PageHeader, PageSkeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/ui/forms";
import { activateYear, advanceTerm, createNextYear, promoteProgramYear } from "@/features/rollover/actions";
import { getActiveContext } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Years & rollover" };

export default function YearsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Years />
    </Suspense>
  );
}

const TONE = { active: "ok", planned: "info", archived: "neutral" } as const;

async function Years() {
  await requirePermission("year.rollover");
  const { years, terms, year, term } = await getActiveContext();
  const s = await db();
  const next = years.find((y) => y.status === "planned");
  const counts = await Promise.all(
    years.map(async (y) => ({
      id: y.id,
      n: (await s.from("student_enrollments").select("id", { count: "exact", head: true }).eq("academic_year_id", y.id)).count ?? 0,
    })),
  );
  const nextCounts = next
    ? await Promise.all(
        ["SE", "TE", "BE"].map(async (py) => ({
          py,
          n: (await s.from("student_enrollments").select("id", { count: "exact", head: true }).eq("academic_year_id", next.id).eq("program_year", py)).count ?? 0,
        })),
      )
    : [];
  const ny = year ? Number(year.label.slice(0, 4)) + 1 : new Date().getFullYear();

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Academic years & rollover"
        description="Students are permanent; progression adds enrollment rows. Each step runs in one transaction and is audited. Archived years become read-only."
      />

      <Card className="mb-6">
        <CardHeader icon={<GraduationCap className="size-5" />} title="Years and terms" />
        <Table>
          <THead>
            <tr>
              <TH>Year</TH>
              <TH>Dates</TH>
              <TH>Terms</TH>
              <TH className="text-right">Enrollment rows</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {[...years].reverse().map((y) => (
              <TR key={y.id}>
                <TD className="font-semibold">{y.label}</TD>
                <TD className="text-muted">
                  {formatDate(y.start_date, { year: true })} – {formatDate(y.end_date, { year: true })}
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1.5">
                    {terms
                      .filter((t) => t.academic_year_id === y.id)
                      .map((t) => (
                        <Badge key={t.id} tone={TONE[t.status as keyof typeof TONE] ?? "neutral"}>
                          {t.parity} · {t.status}
                        </Badge>
                      ))}
                  </div>
                </TD>
                <TD className="text-right tabular-nums">{counts.find((c) => c.id === y.id)?.n.toLocaleString("en-IN")}</TD>
                <TD>
                  <Badge tone={TONE[y.status as keyof typeof TONE] ?? "neutral"}>{y.status}</Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      {term?.parity === "odd" && term.status === "active" && (
        <Card className="mb-6">
          <CardHeader icon={<Repeat className="size-5" />} title="Start the even term" description="Copies every active enrollment to the even term with the same division and batch and semester + 1." />
          <CardBody>
            <ActionForm action={advanceTerm} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="confirm" value="yes" />
              <SubmitButton variant="secondary" pendingLabel="Advancing">
                Advance {year?.label} to the even term
              </SubmitButton>
              <span className="text-xs text-muted">Do this once the odd-term exams are over.</span>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader number={1} icon={<CalendarPlus className="size-5" />} title="Create the next academic year" description="Clones this year's divisions and batches; renaming next year's “Div B” never touches this year's." />
          <CardBody>
            {next ? (
              <p className="text-sm">
                <Badge tone="info">{next.label}</Badge> is planned. Continue with step 2.
              </p>
            ) : (
              <ActionForm action={createNextYear} className="grid grid-cols-2 gap-3">
                <Field name="label" label="Label" className="col-span-2">
                  <Input name="label" defaultValue={`${ny}-${String((ny + 1) % 100).padStart(2, "0")}`} />
                </Field>
                <Field name="start" label="Year starts">
                  <Input type="date" name="start" defaultValue={`${ny}-07-01`} />
                </Field>
                <Field name="end" label="Year ends">
                  <Input type="date" name="end" defaultValue={`${ny + 1}-06-30`} />
                </Field>
                <Field name="oddStart" label="Odd term starts">
                  <Input type="date" name="oddStart" defaultValue={`${ny}-07-12`} />
                </Field>
                <Field name="oddEnd" label="Odd term ends">
                  <Input type="date" name="oddEnd" defaultValue={`${ny}-11-20`} />
                </Field>
                <Field name="evenStart" label="Even term starts">
                  <Input type="date" name="evenStart" defaultValue={`${ny + 1}-01-03`} />
                </Field>
                <Field name="evenEnd" label="Even term ends">
                  <Input type="date" name="evenEnd" defaultValue={`${ny + 1}-05-06`} />
                </Field>
                <div className="col-span-2 flex justify-end">
                  <SubmitButton pendingLabel="Creating">Create next year</SubmitButton>
                </div>
              </ActionForm>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader number={2} icon={<Repeat className="size-5" />} title="Record outcomes and promote" description="Same division letter and batch by rule. BE graduates become “passed out”." />
          <CardBody className="space-y-4">
            {!next ? (
              <p className="text-sm text-muted">Create the next academic year first.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  {nextCounts.map((c) => (
                    <Badge key={c.py} tone={c.n ? "ok" : "neutral"}>
                      {c.py} {next.label}: {c.n} enrolled
                    </Badge>
                  ))}
                </div>
                {(["BE", "TE", "SE", "FE"] as const).map((py) => (
                  <details key={py} className="rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-heading">Promote {py} → {py === "BE" ? "passed out" : { FE: "SE", SE: "TE", TE: "BE" }[py]}</summary>
                    <ActionForm action={promoteProgramYear} className="mt-3 space-y-3">
                      <input type="hidden" name="toYear" value={next.id} />
                      <input type="hidden" name="programYear" value={py} />
                      <Field name="outcomes" label="Exceptions (optional)" hint="One per line: enrollment_no,outcome — promoted_atkt, repeat_year, detained or left. Everyone else is promoted.">
                        <Textarea name="outcomes" rows={4} placeholder={"24COMP0012,promoted_atkt\n24COMP0057,repeat_year"} className="font-mono text-xs" />
                      </Field>
                      <SubmitButton pendingLabel="Promoting">Promote {py}</SubmitButton>
                    </ActionForm>
                  </details>
                ))}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader number={3} icon={<Upload className="size-5" />} title="Admit new FE and Direct Second Year students" description="Use the student import with next year's divisions." />
          <CardBody>
            <ButtonLink href="/people/imports">Open imports</ButtonLink>
          </CardBody>
        </Card>

        <Card>
          <CardHeader number={4} icon={<Rocket className="size-5" />} title="Activate the next year" description="Archives the current year (read-only), activates the new year's odd term and applies the blueprint to it." />
          <CardBody>
            {next ? (
              <ActionForm action={activateYear} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="yearId" value={next.id} />
                <input type="hidden" name="confirm" value="yes" />
                <SubmitButton variant="danger" pendingLabel="Activating">
                  Activate {next.label} and archive {year?.label}
                </SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">Available once the next year exists and students are promoted.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
