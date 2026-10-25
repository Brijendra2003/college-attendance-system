import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BellRing, Download, TriangleAlert } from "lucide-react";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { param } from "@/lib/utils";
import { Badge, ButtonLink, Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Pagination, PercentText, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, FilterSelect, SubmitButton } from "@/components/ui/forms";
import { shortageRows } from "@/features/attendance/queries";
import { notifyShortage } from "@/features/attendance/notify";
import { departmentOptions, PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";
import { divisionOptions } from "@/features/students/queries";

export const metadata: Metadata = { title: "Shortage & detention" };

export default function ShortagePage(props: PageProps<"/attendance/shortage">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Shortage searchParams={props.searchParams} />
    </Suspense>
  );
}

const PAGE = 50;

async function Shortage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("attendance.view");
  const sp = await searchParams;
  const scope = departmentScope(user, "attendance.view");
  const dept = scope ?? param(sp, "dept");
  const py = param(sp, "py");
  const division = param(sp, "division");
  const band = param(sp, "band");
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const all = shortageRows({ departmentId: dept ?? null, programYear: py, divisionId: division, band });
  const rows = all.slice((page - 1) * PAGE, page * PAGE);
  const { minPercent, warnPercent, eligibilityBasis } = db().policy;
  const filters = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));
  const hrefFor = (p: number) => `/attendance/shortage?${new URLSearchParams({ ...filters, page: String(p) })}`;

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Shortage & detention"
        description={`Students below ${minPercent}% (${eligibilityBasis.replaceAll("_", " ")}). This list feeds exam eligibility (term grant).`}
        actions={
          <>
            {can(user, "reports.export") && (
              <ButtonLink href={`/api/reports/shortage?${new URLSearchParams(filters)}`} prefetch={false}>
                <Download className="size-4" /> Export CSV
              </ButtonLink>
            )}
            <ActionForm action={notifyShortage} compact>
              {dept && <input type="hidden" name="dept" value={dept} />}
              {py && <input type="hidden" name="py" value={py} />}
              {division && <input type="hidden" name="division" value={division} />}
              <SubmitButton disabled={band === "warning" || all.length === 0} pendingLabel="Sending…">
                <BellRing className="size-4" /> Notify students & parents
              </SubmitButton>
            </ActionForm>
          </>
        }
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!scope && <FilterSelect name="dept" label="Branch" options={departmentOptions()} allLabel="All branches" />}
          <FilterSelect name="py" label="Program year" options={PROGRAM_YEAR_OPTIONS} allLabel="All years" />
          <FilterSelect name="division" label="Division" options={divisionOptions(dept ?? null)} allLabel="All divisions" />
          <FilterSelect
            name="band"
            label="Band"
            allLabel={`Shortage (< ${minPercent}%)`}
            options={[
              { value: "warning", label: `Warning (${minPercent}–${warnPercent}%)` },
              { value: "all", label: `Both (< ${warnPercent}%)` },
            ]}
          />
        </div>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<TriangleAlert className="size-6" />} title="No students in this band" />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Roll</TH>
                  <TH>Student</TH>
                  <TH>Branch</TH>
                  <TH>Division</TH>
                  <TH className="text-right">Overall</TH>
                  <TH className="text-right">Lowest subject</TH>
                  <TH className="text-right">Subjects short</TH>
                  <TH>Eligibility</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.studentId}>
                    <TD className="text-muted tabular-nums">{r.rollNo}</TD>
                    <TD>
                      <Link href={`/people/students/${r.studentId}`} className="font-medium hover:text-primary">
                        {r.name}
                      </Link>
                      <div className="font-mono text-[11px] text-muted">{r.enrollmentNo}</div>
                    </TD>
                    <TD>
                      <DeptChip code={r.deptCode} soft />
                    </TD>
                    <TD>{r.division}</TD>
                    <TD className="text-right">
                      <PercentText value={r.percent} min={minPercent} warn={warnPercent} />
                    </TD>
                    <TD className="text-right">
                      <PercentText value={r.lowest} min={minPercent} warn={warnPercent} />
                    </TD>
                    <TD className="text-right tabular-nums">{r.shortSubjects}</TD>
                    <TD>{r.standing === "shortage" ? <Badge tone="bad">Not eligible</Badge> : <Badge tone="warn">At risk</Badge>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE} total={all.length} hrefFor={hrefFor} />
          </>
        )}
      </Card>
    </>
  );
}
