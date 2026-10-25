import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Avatar, Badge, Card, DeptChip, PageHeader, PageSkeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect, SearchBox } from "@/components/ui/forms";
import { listStaff } from "@/features/staff/queries";
import { departmentOptions } from "@/features/common/lookups";
import { departmentTones } from "@/shared/tokens";

export const metadata: Metadata = { title: "Staff" };

export default function StaffPage(props: PageProps<"/people/staff">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StaffList searchParams={props.searchParams} />
    </Suspense>
  );
}

async function StaffList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("staff.view");
  const sp = await searchParams;
  const scope = departmentScope(user, "staff.view");
  const rows = listStaff({ departmentId: scope ?? param(sp, "dept") ?? null, q: param(sp, "q"), designation: param(sp, "designation") });

  return (
    <>
      <PageHeader eyebrow="People" title="Staff" description="Faculty and lab staff, department membership, teaching load and class-teacher assignments." />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SearchBox placeholder="Name or employee ID" />
          {!scope && <FilterSelect name="dept" label="Branch" options={departmentOptions()} allLabel="All branches" />}
          <FilterSelect
            name="designation"
            label="Designation"
            allLabel="All"
            options={["Professor", "Associate Professor", "Assistant Professor", "Lab Assistant"].map((d) => ({ value: d, label: d }))}
          />
        </div>
      </Card>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Employee ID</TH>
              <TH>Branch</TH>
              <TH>Designation</TH>
              <TH>Class teacher</TH>
              <TH className="text-right">Hours / week</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD>
                  <Link href={`/people/staff/${s.id}`} className="flex items-center gap-2.5 font-medium hover:text-primary">
                    <Avatar name={s.name} size={28} tone={departmentTones[s.deptCode].fg} />
                    {s.name}
                    {s.isHod && <Badge tone="navy">HOD</Badge>}
                  </Link>
                </TD>
                <TD className="font-mono text-xs text-muted">{s.employeeId}</TD>
                <TD>
                  <DeptChip code={s.deptCode} soft />
                </TD>
                <TD className="text-muted">{s.designation}</TD>
                <TD>{s.classTeacherOf ?? <span className="text-faint">—</span>}</TD>
                <TD className="text-right tabular-nums">{s.weeklyHours || "—"}</TD>
                <TD>
                  <Badge tone={s.status === "active" ? "ok" : s.status === "on_leave" ? "warn" : "neutral"}>{s.status.replace("_", " ")}</Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
