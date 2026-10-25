import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChartColumn, FlaskConical, Gauge, Presentation, TriangleAlert, UsersRound } from "lucide-react";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { param } from "@/lib/utils";
import { Heatmap } from "@/components/charts/html-charts";
import { Card, CardBody, CardHeader, DeptChip, PageHeader, PageSkeleton, PercentText, Progress, StatCard, Table, TD, TH, THead, TR, YearChip } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/forms";
import { divisionStats, heatmap, recentWorkingDays, sessionRows, shortageRows } from "@/features/attendance/queries";
import { departmentOptions, PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";

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
  const { minPercent, warnPercent } = db().policy;

  const divisions = divisionStats(dept).filter((d) => !py || d.programYear === py);
  const students = divisions.reduce((a, d) => a + d.students, 0);
  const avg = students ? divisions.reduce((a, d) => a + d.percent * d.students, 0) / students : null;
  const shortage = shortageRows({ departmentId: dept, programYear: py ?? undefined }).length;
  const warning = shortageRows({ departmentId: dept, programYear: py ?? undefined, band: "warning" }).length;

  const days = recentWorkingDays(10);
  // Heatmap rows: all divisions of one branch, or one year across branches.
  const hm = heatmap(dept, py ?? (dept ? null : "SE"), days);

  const split = { TH: [0, 0], PR: [0, 0] } as Record<"TH" | "PR", [number, number]>;
  for (const day of days) {
    for (const r of sessionRows(day, dept)) {
      if (r.status !== "held" || (py && !r.division.startsWith(py))) continue;
      const k = r.component === "PR" ? "PR" : "TH";
      split[k][0] += r.present;
      split[k][1] += r.total;
    }
  }
  const pct = ([p, t]: [number, number]) => (t ? (p / t) * 100 : null);

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Attendance overview"
        description="Term-to-date attendance from submitted registers. Cancelled sessions never count as held; missing registers don't count until submitted."
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!scope && <FilterSelect name="dept" label="Branch" options={departmentOptions()} allLabel="All branches" />}
          <FilterSelect name="py" label="Program year" options={PROGRAM_YEAR_OPTIONS} allLabel="All years" />
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Average attendance" value={<PercentText value={avg} min={minPercent} warn={warnPercent} />} hint={`${students.toLocaleString("en-IN")} students`} icon={<Gauge className="size-5" />} />
        <StatCard label={`Below ${minPercent}% (shortage)`} value={shortage} hint="in at least one subject" icon={<TriangleAlert className="size-5" />} tone="#dc2626" toneBg="#fdecec" href={`/attendance/shortage?${new URLSearchParams({ ...(dept ? { dept } : {}), ...(py ? { py } : {}) })}`} />
        <StatCard label={`${minPercent}–${warnPercent}% (warning)`} value={warning} hint="at risk" icon={<TriangleAlert className="size-5" />} tone="#d97706" toneBg="#fff4e0" href={`/attendance/shortage?band=warning${dept ? `&dept=${dept}` : ""}`} />
        <StatCard label="Divisions" value={divisions.length} hint="in this view" icon={<UsersRound className="size-5" />} tone="#0e8a7e" toneBg="#e5f6f3" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<ChartColumn className="size-5" />}
            title="Division × day heatmap"
            description={`Students present per division, last 10 working days${!dept && !py ? " · showing SE; pick a branch or year" : ""}`}
          />
          <CardBody>
            <Heatmap rows={hm.rows} columns={hm.columns} values={hm.values} threshold={minPercent} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Theory vs practical" description="Last 10 working days" />
          <CardBody className="space-y-5">
            {[
              { k: "TH" as const, label: "Theory lectures", icon: Presentation, tone: "#1d4ed8" },
              { k: "PR" as const, label: "Practicals (batch-wise)", icon: FlaskConical, tone: "#0e8a7e" },
            ].map(({ k, label, icon: Icon, tone }) => (
              <div key={k}>
                <div className="mb-1.5 flex items-center gap-2 text-sm">
                  <Icon className="size-4" style={{ color: tone }} />
                  <span className="font-medium">{label}</span>
                  <span className="ml-auto">
                    <PercentText value={pct(split[k])} min={minPercent} warn={warnPercent} />
                  </span>
                </div>
                <Progress value={pct(split[k]) ?? 0} tone={tone} />
                <div className="mt-1 text-[11px] text-muted">
                  {split[k][0].toLocaleString("en-IN")} present of {split[k][1].toLocaleString("en-IN")} marked
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
              <TR key={d.divisionId}>
                <TD className="font-medium">{d.label}</TD>
                <TD>
                  <DeptChip code={d.deptCode} soft />
                </TD>
                <TD>
                  <YearChip code={d.programYear} />
                </TD>
                <TD className="text-right tabular-nums">{d.students}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Progress value={d.percent} />
                    <span className="w-14 text-right text-xs">
                      <PercentText value={d.percent} min={minPercent} warn={warnPercent} />
                    </span>
                  </div>
                </TD>
                <TD className="text-right">
                  <Link href={`/attendance/shortage?division=${d.divisionId}`} className={d.shortage ? "font-semibold text-bad hover:underline" : "text-faint"}>
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
