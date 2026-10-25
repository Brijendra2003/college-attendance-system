import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BellRing, TriangleAlert } from "lucide-react";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Badge, Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Pagination, PercentText, Skeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, FilterSelect, SubmitButton } from "@/components/ui/forms";
import { shortageList } from "@/features/attendance/queries";
import { notifyShortage } from "@/features/attendance/actions";
import { ExportMenu } from "@/features/reports/export-menu";
import { departmentOptions, divisionOptions, getPolicy, PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Shortage & detention" };

export default function ShortagePage(props: PageProps<"/attendance/shortage">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Shortage searchParams={props.searchParams} />
    </Suspense>
  );
}

const PAGE = 50;

async function Shortage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("attendance.view");
  const sp = await searchParams;
  const scope = departmentScope(user, "attendance.view");
  const dept = scope ?? param(sp, "dept") ?? null;
  const py = param(sp, "py");
  const division = param(sp, "division");
  const band = param(sp, "band");
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const policy = await getPolicy();
  const filters = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Shortage & detention"
        description={`Students below ${policy.min_percent}% (${policy.eligibility_basis.replaceAll("_", " ")}). This list feeds exam eligibility (term grant).`}
        actions={
          <>
            {can(user, "reports.export") && <ExportMenu reportKey="shortage" filters={filters} />}
            <ActionForm action={notifyShortage} compact>
              {dept && <input type="hidden" name="dept" value={dept} />}
              {py && <input type="hidden" name="py" value={py} />}
              {division && <input type="hidden" name="division" value={division} />}
              <SubmitButton disabled={band === "warning"} pendingLabel="Queuing">
                <BellRing className="size-4" /> Notify students & parents
              </SubmitButton>
            </ActionForm>
          </>
        }
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!scope && <FilterSelect name="dept" label="Branch" options={await departmentOptions()} allLabel="All branches" />}
          <FilterSelect name="py" label="Program year" options={PROGRAM_YEAR_OPTIONS} allLabel="All years" />
          <FilterSelect name="division" label="Division" options={await divisionOptions(dept)} allLabel="All divisions" />
          <FilterSelect
            name="band"
            label="Band"
            allLabel={`Shortage (< ${policy.min_percent}%)`}
            options={[
              { value: "warning", label: `Warning (${policy.min_percent}–${policy.warn_percent}%)` },
              { value: "all", label: `Both (< ${policy.warn_percent}%)` },
            ]}
          />
        </div>
      </Card>
      <Suspense key={JSON.stringify(filters) + page} fallback={<Skeleton className="h-96" />}>
        <ShortageTable dept={dept} py={py} division={division} band={band} page={page} filters={filters} min={policy.min_percent} warn={policy.warn_percent} />
      </Suspense>
    </>
  );
}

async function ShortageTable(p: { dept: string | null; py?: string; division?: string; band?: string; page: number; filters: Record<string, string>; min: number; warn: number }) {
  const { rows, total } = await shortageList({ departmentId: p.dept, programYear: p.py, divisionId: p.division, band: p.band, page: p.page, pageSize: PAGE });
  const hrefFor = (n: number) => `/attendance/shortage?${new URLSearchParams({ ...p.filters, page: String(n) })}`;
  return (
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
                <TR key={r.id}>
                  <TD className="text-muted tabular-nums">{r.roll_no}</TD>
                  <TD>
                    <Link href={`/people/students/${r.id}`} className="font-medium hover:text-primary">
                      {r.full_name}
                    </Link>
                    <div className="font-mono text-[11px] text-muted">{r.enrollment_no}</div>
                  </TD>
                  <TD>
                    <DeptChip code={r.department_code} soft />
                  </TD>
                  <TD>{r.division_label}</TD>
                  <TD className="text-right">
                    <PercentText value={r.percent} min={p.min} warn={p.warn} />
                  </TD>
                  <TD className="text-right">
                    <PercentText value={r.lowest} min={p.min} warn={p.warn} />
                  </TD>
                  <TD className="text-right tabular-nums">{r.short_subjects}</TD>
                  <TD>{Number(r.lowest) < p.min ? <Badge tone="bad">Not eligible</Badge> : <Badge tone="warn">At risk</Badge>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <Pagination page={p.page} pageSize={PAGE} total={total} hrefFor={hrefFor} />
        </>
      )}
    </Card>
  );
}
