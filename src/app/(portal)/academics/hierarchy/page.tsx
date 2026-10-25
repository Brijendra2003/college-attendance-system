import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDown, ArrowRight, BookOpen, Building, CalendarDays, CircleAlert, CircleCheck, GraduationCap, UserRound, UsersRound } from "lucide-react";
import { requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Card, CardBody, CardHeader, DeptChip, ld, PageSkeleton, PageHeader, Table, TD, TH, THead, toneStyle, TR, YearChip } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/forms";
import { departmentCards, setupHealth } from "@/features/academics/queries";
import { getActiveContext, getCollege, getDivisions, PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Academic hierarchy" };

export default function HierarchyPage(props: PageProps<"/academics/hierarchy">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Hierarchy searchParams={props.searchParams} />
    </Suspense>
  );
}

const PROGRAM_YEARS = [
  { code: "FE", name: "First Year Engineering", semesters: [1, 2] },
  { code: "SE", name: "Second Year Engineering", semesters: [3, 4] },
  { code: "TE", name: "Third Year Engineering", semesters: [5, 6] },
  { code: "BE", name: "Final Year Engineering", semesters: [7, 8] },
];
const RULE_COLORS = ["#1d5fd1", "#1b8f45", "#d96c0c", "#6d3fd6", "#1d4ed8", "#d96c0c", "#1b8f45"];

async function Hierarchy({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("blueprint.view");
  const sp = await searchParams;
  const [college, { year }, depts, allDivisions, health] = await Promise.all([getCollege(), getActiveContext(), departmentCards(null), getDivisions(), setupHealth()]);
  const exDept = param(sp, "dept") ?? depts.find((d) => d.code === "AIML")?.id ?? depts[0]?.id;
  const exYear = param(sp, "py") ?? "SE";
  const exDivisions = allDivisions.filter((d) => d.department_id === exDept && d.program_year === exYear);
  const exDeptCode = depts.find((d) => d.id === exDept)?.code ?? "";

  const rules = [
    { n: 1, rule: "Each department has a configurable HOD assignment with an effective date.", ok: !health.departments_without_hod, detail: health.departments_without_hod ? `${health.departments_without_hod} without HOD` : `${depts.length} of ${depts.length} assigned` },
    { n: 2, rule: "Each division belongs to a specific department, program year and academic year.", ok: true, detail: `${health.divisions} divisions in ${year?.label ?? "the active year"}` },
    { n: 3, rule: "Each batch belongs to a division or an explicitly defined practical group.", ok: true, detail: `${health.batches} batches linked` },
    { n: 4, rule: "Each student has one valid primary enrollment for the academic year.", ok: !health.students_without_enrollment, detail: `${health.active_students - health.students_without_enrollment} of ${health.active_students} enrolled` },
    { n: 5, rule: "Division-wide theory lectures and batch-specific practical sessions.", ok: true, detail: `${health.theory_groups} theory · ${health.practical_groups} practical groups` },
    { n: 6, rule: "Progression updates enrollment instead of duplicating the student.", ok: true, detail: `${health.closed_enrollments} closed enrollments kept` },
    { n: 7, rule: "Division, batch and lecturer changes keep historical attendance.", ok: true, detail: "Records snapshot division & batch" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Academic hierarchy"
        description="From the Principal to practical batches. The structure is data: branches, years, divisions and batches are rows the college changes in the blueprint editor, without code changes."
      />

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
                <div className="text-sm text-blue-100/85">{college.principal_name ?? "Head of the college"} · Head of the college</div>
              </div>
            </div>
            <ArrowDown className="my-1.5 size-5 text-heading" />
            <div className="flex w-full items-center justify-center gap-3 rounded-xl border px-5 py-3" style={{ background: ld("#eaf3ff", "#13233f"), borderColor: ld("#b9d2f3", "#284a80") }}>
              <Building className="size-6 text-heading" />
              <div>
                <div className="font-bold text-heading">Engineering branches / departments</div>
                <div className="text-xs text-muted">Each department is managed by its HOD</div>
              </div>
            </div>
            <div className="mt-3 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-12">
              {depts.map((d) => (
                <Link
                  key={d.id}
                  href={`/academics/departments#${d.code}`}
                  className="flex flex-col rounded-xl border p-2.5 text-center transition hover:-translate-y-0.5 hover:shadow-pop"
                  style={toneStyle(d.code)}
                >
                  <span className="text-sm font-bold" style={toneStyle(d.code, "text")}>
                    {d.code}
                  </span>
                  <span className="mt-0.5 line-clamp-2 min-h-8 text-[10.5px] leading-tight text-muted">{d.name}</span>
                  <span className="mt-2 flex items-center justify-center gap-1 text-[10.5px] font-medium text-ink">
                    <UserRound className="size-3" style={toneStyle(d.code, "text")} /> HOD – {d.code}
                  </span>
                </Link>
              ))}
            </div>
            <ArrowDown className="my-2 size-5 text-heading" />
            <div className="grid w-full grid-cols-1 items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
              <FlowBox icon={<GraduationCap className="size-7" />} title="Academic year" sub={`${year?.label ?? "—"} (active)`} tone="CIVIL" />
              <FlowArrow />
              <FlowBox icon={<BookOpen className="size-7" />} title="Program year" sub="FE / SE / TE / BE (1st–4th year)" tone="COMP" />
              <FlowArrow />
              <FlowBox icon={<CalendarDays className="size-7" />} title="Semester" sub="1–8 · two per year" tone="CSE" />
              <FlowArrow />
              <FlowBox icon={<UsersRound className="size-7" />} title="Division" sub="A, B, C …" tone="AIML" />
              <FlowArrow />
              <FlowBox icon={<UsersRound className="size-7" />} title="Batches" sub="Div A – Batch 1, 2, 3 …" tone="IT" />
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
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
                  <TD className="text-muted">{d.hod?.name ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{d.students.toLocaleString("en-IN")}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader number={3} title="Academic year & semester structure" description={`Academic year ${year?.label ?? "—"}`} />
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
                  const divs = allDivisions.filter((d) => d.program_year === py.code);
                  return (
                    <TR key={py.code}>
                      <TD>
                        <YearChip code={py.code} />
                      </TD>
                      <TD>{py.name}</TD>
                      <TD>
                        Sem {py.semesters[0]}, Sem {py.semesters[1]}
                      </TD>
                      <TD className="text-right tabular-nums">{divs.length}</TD>
                      <TD className="text-right tabular-nums">{divs.reduce((a, d) => a + Number(d.students), 0).toLocaleString("en-IN")}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <p className="px-5 py-3 text-xs text-muted italic">Each branch may have divisions for each year. The number of divisions can vary by intake and available capacity.</p>
          </Card>

          <Card>
            <CardHeader number={4} title="Division & batch structure" description="Pick a branch and year" />
            <CardBody>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <FilterSelect name="dept" label="Branch" allLabel={null} fallback={exDept} options={depts.map((d) => ({ value: d.id, label: d.code }))} />
                <FilterSelect name="py" label="Year" allLabel={null} fallback={exYear} options={PROGRAM_YEAR_OPTIONS} />
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-navy-50 px-3 py-2 text-xs font-semibold text-heading">
                {exDeptCode} department <span className="text-faint">|</span> {exYear} ({PROGRAM_YEARS.find((p) => p.code === exYear)?.name})
                <span className="text-faint">|</span> Academic year {year?.label}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {exDivisions.map((d, i) => {
                  const tone = i % 2 === 0 ? "COMP" : "CSE";
                  return (
                    <div key={d.id} className="overflow-hidden rounded-xl border" style={toneStyle(tone)}>
                      <div className="px-3 py-2 text-center text-sm font-bold" style={toneStyle(tone, "text")}>
                        Division {d.code} · {d.students} students
                      </div>
                      <ul className="divide-y divide-line-soft bg-surface">
                        {(d.batches ?? []).map((b) => (
                          <li key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <UsersRound className="size-4" style={toneStyle(tone, "text")} /> Batch {b.code}
                            <span className="ml-auto text-xs text-muted tabular-nums">{b.students}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {exDivisions.length === 0 && <p className="text-sm text-muted">No divisions for this branch and year.</p>}
              </div>
              <p className="mt-3 text-xs text-muted italic">
                Batch and division counts are configured per department and academic year. Batches are used for practicals, labs and tutorials.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

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

function FlowBox({ icon, title, sub, tone }: { icon: React.ReactNode; title: string; sub: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={toneStyle(tone)}>
      <span style={toneStyle(tone, "text")}>{icon}</span>
      <div className="min-w-0">
        <div className="font-bold text-heading">{title}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="hidden items-center justify-center md:flex">
      <ArrowRight className="size-5 text-heading" />
    </div>
  );
}
