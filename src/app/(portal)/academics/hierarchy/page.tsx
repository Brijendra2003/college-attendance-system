import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDown, ArrowRight, BookOpen, Building, CalendarDays, CircleCheck, CircleAlert, GraduationCap, UserRound, UsersRound } from "lucide-react";
import { departmentTones } from "@/shared/tokens";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { param } from "@/lib/utils";
import { PROGRAM_YEARS } from "@/lib/data/catalogue";
import { Card, CardBody, CardHeader, DeptChip, PageHeader, PageSkeleton, Table, TD, TH, THead, TR, YearChip } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/forms";
import { departmentCards, divisionRows, programYearSummary, ruleChecks } from "@/features/academics/queries";
import { PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Academic hierarchy" };

export default function HierarchyPage(props: PageProps<"/academics/hierarchy">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Hierarchy searchParams={props.searchParams} />
    </Suspense>
  );
}

const RULE_COLORS = ["#1d5fd1", "#1b8f45", "#d96c0c", "#6d3fd6", "#1d4ed8", "#d96c0c", "#1b8f45"];

async function Hierarchy({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("blueprint.view");
  const sp = await searchParams;
  const store = db();
  const depts = departmentCards(null);
  const year = store.academicYears.find((y) => y.status === "active")!;
  const pySummary = programYearSummary();
  const exDept = param(sp, "dept") ?? "dep-aiml";
  const exYear = param(sp, "py") ?? "SE";
  const exDivisions = divisionRows(exDept, exYear);
  const exDeptCode = depts.find((d) => d.id === exDept)?.code ?? "AIML";
  const rules = ruleChecks();

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Academic hierarchy"
        description="From the Principal to practical batches. The structure is data: branches, years, divisions and batches are rows the college can change without code changes."
      />

      {/* 1. Hierarchy */}
      <Card className="mb-6">
        <CardHeader number={1} title="Academic hierarchy" description="From Principal to batches" />
        <CardBody>
          <div className="flex flex-col items-center">
            <div className="flex w-full max-w-md items-center gap-4 rounded-xl bg-navy px-6 py-4 text-white shadow-card">
              <span className="grid size-12 place-items-center rounded-full bg-white/15">
                <UserRound className="size-7" />
              </span>
              <div>
                <div className="text-lg font-bold">Principal</div>
                <div className="text-sm text-blue-100/85">{store.college.principalName} · Head of the college</div>
              </div>
            </div>
            <ArrowDown className="my-1.5 size-5 text-navy" />
            <div className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#b9d2f3] bg-[#eaf3ff] px-5 py-3">
              <Building className="size-6 text-navy" />
              <div>
                <div className="font-bold text-navy">Engineering branches / departments</div>
                <div className="text-xs text-muted">Each department is managed by its HOD</div>
              </div>
            </div>
            <div className="mt-3 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-12">
              {depts.map((d) => {
                const t = departmentTones[d.code];
                return (
                  <Link
                    key={d.id}
                    href={`/academics/departments#${d.code}`}
                    className="flex flex-col rounded-xl border p-2.5 text-center transition hover:-translate-y-0.5 hover:shadow-pop"
                    style={{ background: t.bg, borderColor: t.border }}
                  >
                    <span className="text-sm font-bold" style={{ color: t.fg }}>
                      {d.code}
                    </span>
                    <span className="mt-0.5 line-clamp-2 min-h-8 text-[10.5px] leading-tight text-muted">{d.name}</span>
                    <span className="mt-2 flex items-center justify-center gap-1 text-[10.5px] font-medium text-ink">
                      <UserRound className="size-3" style={{ color: t.fg }} /> HOD – {d.code}
                    </span>
                  </Link>
                );
              })}
            </div>
            <ArrowDown className="my-2 size-5 text-navy" />
            <div className="grid w-full grid-cols-1 items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
              <FlowBox icon={<GraduationCap className="size-7" />} title="Academic year" sub={`${year.label} (active)`} color="#1b8f45" bg="#e9f8ee" border="#a6dcb7" />
              <FlowArrow />
              <FlowBox icon={<BookOpen className="size-7" />} title="Program year" sub="FE / SE / TE / BE (1st–4th year)" color="#1d5fd1" bg="#eaf2ff" border="#a9c8f5" />
              <FlowArrow />
              <FlowBox icon={<CalendarDays className="size-7" />} title="Semester" sub="1–8 · odd term: 1, 3, 5, 7" color="#6d3fd6" bg="#f2edff" border="#c9b8f2" />
              <FlowArrow />
              <FlowBox icon={<UsersRound className="size-7" />} title="Division" sub="A, B, C …" color="#d96c0c" bg="#fff3e3" border="#f5c98f" />
              <FlowArrow />
              <FlowBox icon={<UsersRound className="size-7" />} title="Batches" sub="Div A – Batch 1, 2, 3 …" color="#0e8a7e" bg="#e5f6f3" border="#9fd9cf" />
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        {/* 2. Branches */}
        <Card>
          <CardHeader number={2} title="Engineering branches / departments" />
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Branch / department</TH>
                <TH>HOD (head of department)</TH>
                <TH className="text-right">Students</TH>
              </tr>
            </THead>
            <tbody>
              {depts.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <DeptChip code={d.code} />
                  </TD>
                  <TD className="font-medium">{d.name}</TD>
                  <TD className="text-muted">{d.hod?.staff.name ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{d.students.toLocaleString("en-IN")}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="space-y-6">
          {/* 3. Years & semesters */}
          <Card>
            <CardHeader number={3} title="Academic year & semester structure" description={`Academic year ${year.label}`} />
            <Table>
              <THead>
                <tr>
                  <TH>Year code</TH>
                  <TH>Academic year</TH>
                  <TH>Semesters</TH>
                  <TH className="text-right">Divisions</TH>
                  <TH className="text-right">Students</TH>
                </tr>
              </THead>
              <tbody>
                {PROGRAM_YEARS.map((py) => {
                  const s = pySummary.find((x) => x.code === py.code)!;
                  return (
                    <TR key={py.code}>
                      <TD>
                        <YearChip code={py.code} />
                      </TD>
                      <TD>{py.name}</TD>
                      <TD>
                        Sem {py.semesters[0]}, Sem {py.semesters[1]}
                      </TD>
                      <TD className="text-right tabular-nums">{s.divisions}</TD>
                      <TD className="text-right tabular-nums">{s.students.toLocaleString("en-IN")}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <p className="px-5 py-3 text-xs text-muted italic">
              Each branch may have divisions for each year. The number of divisions can vary by intake and available capacity.
            </p>
          </Card>

          {/* 4. Division & batches example */}
          <Card>
            <CardHeader number={4} title="Division & batch structure" description="Pick a branch and year" />
            <CardBody>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <FilterSelect name="dept" label="Branch" allLabel={null} fallback={exDept} options={depts.map((d) => ({ value: d.id, label: d.code }))} />
                <FilterSelect name="py" label="Year" allLabel={null} fallback={exYear} options={PROGRAM_YEAR_OPTIONS} />
              </div>
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-navy-50 px-3 py-2 text-xs font-semibold text-navy">
                {exDeptCode} department <span className="text-faint">|</span> {exYear} ({PROGRAM_YEARS.find((p) => p.code === exYear)?.name})
                <span className="text-faint">|</span> Academic year {year.label}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {exDivisions.map((d, i) => {
                  const tone = i % 2 === 0 ? { fg: "#1d5fd1", bg: "#eaf2ff", border: "#a9c8f5" } : { fg: "#6d3fd6", bg: "#f2edff", border: "#c9b8f2" };
                  return (
                    <div key={d.id} className="overflow-hidden rounded-xl border" style={{ borderColor: tone.border }}>
                      <div className="px-3 py-2 text-center text-sm font-bold" style={{ background: tone.bg, color: tone.fg }}>
                        Division {d.code} · {d.students} students
                      </div>
                      <ul className="divide-y divide-line-soft bg-white">
                        {d.batches.map((b) => (
                          <li key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <UsersRound className="size-4" style={{ color: tone.fg }} /> Batch {b.code}
                            <span className="ml-auto text-xs text-muted tabular-nums">{b.students}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted italic">
                Batch and division counts are configured per department and academic year. Batches are used for practicals, labs and tutorials.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* 5. Rules */}
      <Card className="mt-6">
        <CardHeader number={5} title="Key rules / business logic" description="Checked live against the data" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {rules.map((r) => (
            <div key={r.n} className="flex flex-col rounded-xl border border-line p-3">
              <div className="flex items-start gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: RULE_COLORS[r.n - 1] }}>
                  {r.n}
                </span>
                <p className="text-xs leading-snug text-ink">{r.rule}</p>
              </div>
              <div className={`mt-auto flex items-center gap-1.5 pt-3 text-[11px] font-semibold ${r.ok ? "text-ok" : "text-bad"}`}>
                {r.ok ? <CircleCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}
                {r.detail}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}

function FlowBox({ icon, title, sub, color, bg, border }: { icon: React.ReactNode; title: string; sub: string; color: string; bg: string; border: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ background: bg, borderColor: border }}>
      <span style={{ color }}>{icon}</span>
      <div className="min-w-0">
        <div className="font-bold text-navy">{title}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="hidden items-center justify-center md:flex">
      <ArrowRight className="size-5 text-navy" />
    </div>
  );
}
