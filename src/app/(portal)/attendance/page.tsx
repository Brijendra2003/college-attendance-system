import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChartColumn, FlaskConical, Gauge, Presentation, TriangleAlert, UsersRound } from "lucide-react";
import { formatDate, dayName } from "@/shared/dates";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Heatmap } from "@/components/charts/html-charts";
import { Card, CardBody, CardHeader, DeptChip, EmptyState, PageHeader, PageSkeleton, PercentText, Progress, Skeleton, StatCard, Table, TD, TH, THead, TR, YearChip } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/forms";
import { componentSplit, divisionStats, heatmap, shortageList } from "@/features/attendance/queries";
import { departmentOptions, getPolicy, PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Attendance overview" };

export default function AttendanceOverviewPage(props: PageProps<"/attendance">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("attendance.view");
  const sp = await searchParams;
  const scope = departmentScope(user, "attendance.view");
  const dept = scope ?? param(sp, "dept") ?? null;
  const py = param(sp, "py") ?? null;
  const options = await departmentOptions();

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Attendance overview"
        description="Term-to-date attendance from submitted registers. Cancelled sessions never count as held; missing registers don't count until submitted."
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!scope && <FilterSelect name="dept" label="Branch" options={options} allLabel="All branches" />}
          <FilterSelect name="py" label="Program year" options={PROGRAM_YEAR_OPTIONS} allLabel="All years" />
        </div>
      </Card>
      <Suspense key={`${dept}-${py}`} fallback={<OverviewSkeleton />}>
        <OverviewBody dept={dept} py={py} />
      </Suspense>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-96 xl:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

async function OverviewBody({ dept, py }: { dept: string | null; py: string | null }) {
  const policy = await getPolicy();
  const { min_percent: min, warn_percent: warn } = policy;
  // Heatmap rows: all divisions of one branch, or one year across branches.
  const hmYear = py ?? (dept ? null : "SE");
  const [divisions, shortage, warning, hm, split] = await Promise.all([
    divisionStats(dept, py),
    shortageList({ departmentId: dept, programYear: py ?? undefined, page: 1, pageSize: 1 }),
    shortageList({ departmentId: dept, programYear: py ?? undefined, band: "warning", page: 1, pageSize: 1 }),
    heatmap(10, dept, hmYear),
    componentSplit(10, dept),
  ]);
  const students = divisions.reduce((a, d) => a + d.students, 0);
  const avg = students ? divisions.reduce((a, d) => a + (d.percent ?? 0) * d.students, 0) / students : null;
  const pct = (x: { present: number; total: number }) => (x.total ? (x.present / x.total) * 100 : null);
  const qs = new URLSearchParams({ ...(dept ? { dept } : {}), ...(py ? { py } : {}) });

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Average attendance" value={<PercentText value={avg} min={min} warn={warn} />} hint={`${students.toLocaleString("en-IN")} students`} icon={<Gauge className="size-5" />} />
        <StatCard label={`Below ${min}% (shortage)`} value={shortage.total} hint="in at least one subject" icon={<TriangleAlert className="size-5" />} tone="bad" href={`/attendance/shortage?${qs}`} />
        <StatCard label={`${min}–${warn}% (warning)`} value={warning.total} hint="at risk" icon={<TriangleAlert className="size-5" />} tone="warn" href={`/attendance/shortage?band=warning&${qs}`} />
        <StatCard label="Divisions" value={divisions.length} hint="in this view" icon={<UsersRound className="size-5" />} tone="teal" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<ChartColumn className="size-5" />}
            title="Division × day heatmap"
            description={`Students present per division, last 10 teaching days${!dept && !py ? " · showing SE; pick a branch or year" : ""}`}
          />
          <CardBody>
            {hm.rows.length ? (
              <Heatmap rows={hm.rows} columns={hm.days.map((d) => ({ id: d, label: formatDate(d), sub: dayName(d) }))} values={hm.values} threshold={min} />
            ) : (
              <EmptyState title="No sessions in this period" />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Theory vs practical" description="Last 10 teaching days" />
          <CardBody className="space-y-5">
            {[
              { k: "TH" as const, label: "Theory lectures", icon: Presentation, tone: "var(--primary)" },
              { k: "PR" as const, label: "Practicals (batch-wise)", icon: FlaskConical, tone: "var(--ok)" },
            ].map(({ k, label, icon: Icon, tone }) => (
              <div key={k}>
                <div className="mb-1.5 flex items-center gap-2 text-sm">
                  <Icon className="size-4" style={{ color: tone }} />
                  <span className="font-medium">{label}</span>
                  <span className="ml-auto">
                    <PercentText value={pct(split[k])} min={min} warn={warn} />
                  </span>
                </div>
                <Progress value={pct(split[k]) ?? 0} tone={tone} />
                <div className="mt-1 text-[11px] text-muted">
                  {Number(split[k].present).toLocaleString("en-IN")} present of {Number(split[k].total).toLocaleString("en-IN")} marked
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Division comparison" description="Average of student term-to-date percentages" />
        <Table>
          <THead>
            <tr>
              <TH>Division</TH>
              <TH>Branch</TH>
              <TH>Year</TH>
              <TH className="text-right">Students</TH>
              <TH className="w-56">Average</TH>
              <TH className="text-right">Shortage</TH>
            </tr>
          </THead>
          <tbody>
            {divisions.map((d) => (
              <TR key={d.division_id}>
                <TD className="font-medium">{d.label}</TD>
                <TD>
                  <DeptChip code={d.department_code} soft />
                </TD>
                <TD>
                  <YearChip code={d.program_year} />
                </TD>
                <TD className="text-right tabular-nums">{d.students}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Progress value={d.percent ?? 0} />
                    <span className="w-14 text-right text-xs">
                      <PercentText value={d.percent} min={min} warn={warn} />
                    </span>
                  </div>
                </TD>
                <TD className="text-right">
                  <Link href={`/attendance/shortage?division=${d.division_id}`} className={d.shortage ? "font-semibold text-bad hover:underline" : "text-faint"}>
                    {d.shortage}
                  </Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
