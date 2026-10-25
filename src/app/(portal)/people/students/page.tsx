import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, Search, UserPlus } from "lucide-react";
import { provisionAccounts } from "@/features/accounts/actions";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Badge, Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Pagination, PercentText, Skeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Dialog, FilterSelect, SearchBox, SubmitButton } from "@/components/ui/forms";
import { listStudents, PAGE_SIZE } from "@/features/students/queries";
import { StudentCreateForm } from "@/features/students/components";
import { ExportMenu } from "@/features/reports/export-menu";
import { batchOptionsByDivision, departmentOptions, divisionOptions, getPolicy, PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Students" };

export default function StudentsPage(props: PageProps<"/people/students">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Students searchParams={props.searchParams} />
    </Suspense>
  );
}

const GUARDIAN_TONE = { verified: "ok", pending: "warn", revoked: "bad" } as const;

async function Students({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("students.view");
  const sp = await searchParams;
  const scope = departmentScope(user, "students.view");
  const dept = scope ?? param(sp, "dept") ?? null;
  const filters = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Students"
        description="Permanent student records. Progression adds enrollment rows each term rather than duplicating the student."
        actions={
          <>
            {can(user, "reports.export") && <ExportMenu reportKey="students" filters={filters} />}
            {can(user, "students.manage") && (
              <ActionForm action={provisionAccounts} compact>
                <input type="hidden" name="kind" value="students" />
                <SubmitButton variant="secondary" pendingLabel="Provisioning">
                  <UserPlus className="size-4" /> Provision app accounts
                </SubmitButton>
              </ActionForm>
            )}
            {can(user, "students.manage") && (
              <Dialog trigger={<><Plus className="size-4" /> Add student</>} title="Add student" description="Creates the student, the current enrollment and a pending guardian link." wide>
                <StudentCreateForm divisions={await batchOptionsByDivision(scope)} />
              </Dialog>
            )}
          </>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SearchBox placeholder="Name, enrollment no., PRN" />
          {!scope && <FilterSelect name="dept" label="Branch" options={await departmentOptions()} allLabel="All branches" />}
          <FilterSelect name="py" label="Year" options={PROGRAM_YEAR_OPTIONS} allLabel="All years" />
          <FilterSelect name="division" label="Division" options={await divisionOptions(dept)} allLabel="All divisions" />
          <FilterSelect
            name="status"
            label="Status"
            allLabel="Active & detained"
            options={[
              { value: "active", label: "Active" },
              { value: "detained", label: "Detained" },
              { value: "withdrawn", label: "Withdrawn" },
              { value: "passed_out", label: "Passed out" },
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

      <Suspense key={JSON.stringify(sp)} fallback={<Skeleton className="h-[32rem]" />}>
        <StudentTable dept={dept} sp={sp} filters={filters} />
      </Suspense>
    </>
  );
}

async function StudentTable({ dept, sp, filters }: { dept: string | null; sp: Record<string, string | string[] | undefined>; filters: Record<string, string> }) {
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const [{ total, rows }, policy] = await Promise.all([
    listStudents({ dept, py: param(sp, "py"), division: param(sp, "division"), status: param(sp, "status"), q: param(sp, "q"), flag: param(sp, "flag"), page }),
    getPolicy(),
  ]);
  const hrefFor = (p: number) => `/people/students?${new URLSearchParams({ ...filters, page: String(p) })}`;
  return (
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
                  <TD className="text-muted tabular-nums">{s.roll_no ?? "—"}</TD>
                  <TD>
                    <Link href={`/people/students/${s.id}`} className="font-medium text-ink hover:text-primary">
                      {s.full_name}
                    </Link>
                    <div className="font-mono text-[11px] text-muted">{s.enrollment_no}</div>
                  </TD>
                  <TD>
                    <DeptChip code={s.department_code} soft />
                  </TD>
                  <TD className="whitespace-nowrap">
                    {s.division_label ?? "—"} {s.batch_code && <span className="text-muted">· B{s.batch_code}</span>}
                    {s.enrollment_type && s.enrollment_type !== "regular" && (
                      <Badge tone="violet" className="ml-1.5 uppercase">
                        {s.enrollment_type}
                      </Badge>
                    )}
                  </TD>
                  <TD className="font-mono text-[11px] text-muted">{s.prn ?? <Badge tone="warn">missing</Badge>}</TD>
                  <TD className="text-right">
                    <PercentText value={s.percent} min={policy.min_percent} warn={policy.warn_percent} />
                  </TD>
                  <TD className="text-right">
                    <PercentText value={s.lowest} min={policy.min_percent} warn={policy.warn_percent} />
                  </TD>
                  <TD>
                    <Badge tone={GUARDIAN_TONE[s.guardian_status as keyof typeof GUARDIAN_TONE] ?? "neutral"}>{s.guardian_status ?? "none"}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={s.status === "active" ? "ok" : s.status === "detained" ? "bad" : "neutral"}>{s.status.replace("_", " ")}</Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
        </>
      )}
    </Card>
  );
}
