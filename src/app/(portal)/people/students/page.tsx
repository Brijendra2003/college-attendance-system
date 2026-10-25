import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download, Plus, Search } from "lucide-react";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { param } from "@/lib/utils";
import { Badge, ButtonLink, Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Pagination, PercentText, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Dialog, FilterSelect, SearchBox } from "@/components/ui/forms";
import { batchOptionsByDivision, divisionOptions, listStudents, PAGE_SIZE } from "@/features/students/queries";
import { StudentCreateForm } from "@/features/students/components";
import { departmentOptions, PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Students" };

export default function StudentsPage(props: PageProps<"/people/students">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Students searchParams={props.searchParams} />
    </Suspense>
  );
}

const GUARDIAN_TONE = { verified: "ok", pending: "warn", revoked: "bad", none: "neutral" } as const;

async function Students({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("students.view");
  const sp = await searchParams;
  const scopeDept = departmentScope(user, "students.view");
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const dept = scopeDept ?? param(sp, "dept");
  const { total, rows } = listStudents({
    scopeDept,
    dept: param(sp, "dept"),
    py: param(sp, "py"),
    division: param(sp, "division"),
    status: param(sp, "status"),
    q: param(sp, "q"),
    flag: param(sp, "flag"),
    page,
  });
  const { minPercent, warnPercent } = db().policy;
  const qs = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    next.set("page", String(p));
    return `/people/students?${next}`;
  };
  const exportQs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Students"
        description="Permanent student records. Progression adds enrollment rows each term rather than duplicating the student."
        actions={
          <>
            {can(user, "reports.export") && (
              <ButtonLink href={`/api/reports/students?${exportQs}`} prefetch={false}>
                <Download className="size-4" /> Export CSV
              </ButtonLink>
            )}
            {can(user, "students.manage") && (
              <Dialog trigger={<><Plus className="size-4" /> Add student</>} title="Add student" description="Creates the student, the 2026-27 enrollment and a pending guardian link." wide>
                <StudentCreateForm divisions={batchOptionsByDivision(scopeDept)} />
              </Dialog>
            )}
          </>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SearchBox placeholder="Name, enrollment no., PRN" />
          {!scopeDept && <FilterSelect name="dept" label="Branch" options={departmentOptions()} allLabel="All branches" />}
          <FilterSelect name="py" label="Year" options={PROGRAM_YEAR_OPTIONS} allLabel="All years" />
          <FilterSelect name="division" label="Division" options={divisionOptions(dept ?? null)} allLabel="All divisions" />
          <FilterSelect
            name="status"
            label="Status"
            allLabel="Active & detained"
            options={[
              { value: "active", label: "Active" },
              { value: "detained", label: "Detained" },
              { value: "withdrawn", label: "Withdrawn" },
            ]}
          />
          <FilterSelect
            name="flag"
            label="Data quality"
            allLabel="All records"
            options={[
              { value: "no_prn", label: "Missing PRN" },
              { value: "guardian_pending", label: "Guardian unverified" },
            ]}
          />
        </div>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Search className="size-6" />} title="No students match these filters" />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Roll</TH>
                  <TH>Student</TH>
                  <TH>Branch</TH>
                  <TH>Division · batch</TH>
                  <TH>PRN</TH>
                  <TH className="text-right">Overall</TH>
                  <TH className="text-right">Lowest subject</TH>
                  <TH>Guardian</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((s) => (
                  <TR key={s.id}>
                    <TD className="text-muted tabular-nums">{s.rollNo ?? "—"}</TD>
                    <TD>
                      <Link href={`/people/students/${s.id}`} className="font-medium text-ink hover:text-primary">
                        {s.name}
                      </Link>
                      <div className="font-mono text-[11px] text-muted">{s.enrollmentNo}</div>
                    </TD>
                    <TD>
                      <DeptChip code={s.deptCode} soft />
                    </TD>
                    <TD className="whitespace-nowrap">
                      {s.division} <span className="text-muted">· {s.batch}</span>
                      {s.enrollmentType && s.enrollmentType !== "regular" && (
                        <Badge tone="violet" className="ml-1.5 uppercase">
                          {s.enrollmentType}
                        </Badge>
                      )}
                    </TD>
                    <TD className="font-mono text-[11px] text-muted">{s.prn ?? <Badge tone="warn">missing</Badge>}</TD>
                    <TD className="text-right">
                      <PercentText value={s.standing?.percent ?? null} min={minPercent} warn={warnPercent} />
                    </TD>
                    <TD className="text-right">
                      <PercentText value={s.standing?.lowest ?? null} min={minPercent} warn={warnPercent} />
                    </TD>
                    <TD>
                      <Badge tone={GUARDIAN_TONE[s.guardian as keyof typeof GUARDIAN_TONE] ?? "neutral"}>{s.guardian}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={s.status === "active" ? "ok" : s.status === "detained" ? "bad" : "neutral"}>{s.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={qs} />
          </>
        )}
      </Card>
    </>
  );
}
