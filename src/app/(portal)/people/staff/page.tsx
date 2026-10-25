import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Briefcase, UserPlus } from "lucide-react";
import { toneOf } from "@/shared/tokens";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { provisionAccounts } from "@/features/accounts/actions";
import { param } from "@/lib/utils";
import { Avatar, Badge, Card, DeptChip, EmptyState, ld, PageHeader, PageSkeleton, Skeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect, SearchBox } from "@/components/ui/forms";
import { listStaff } from "@/features/staff/queries";
import { departmentOptions } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Staff" };

export default function StaffPage(props: PageProps<"/people/staff">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <StaffList searchParams={props.searchParams} />
    </Suspense>
  );
}

async function StaffList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("staff.view");
  const sp = await searchParams;
  const scope = departmentScope(user, "staff.view");
  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Staff"
        description="Faculty and lab staff, department membership, teaching load and class-teacher assignments."
        actions={
          can(user, "staff.manage") && (
            <ActionForm action={provisionAccounts} compact>
              <input type="hidden" name="kind" value="staff" />
              <SubmitButton variant="secondary" pendingLabel="Provisioning">
                <UserPlus className="size-4" /> Provision app accounts
              </SubmitButton>
            </ActionForm>
          )
        }
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SearchBox placeholder="Name or employee ID" />
          {!scope && <FilterSelect name="dept" label="Branch" options={await departmentOptions()} allLabel="All branches" />}
          <FilterSelect
            name="designation"
            label="Designation"
            allLabel="All"
            options={["Professor", "Associate Professor", "Assistant Professor", "Lab Assistant"].map((d) => ({ value: d, label: d }))}
          />
        </div>
      </Card>
      <Suspense key={JSON.stringify(sp)} fallback={<Skeleton className="h-[32rem]" />}>
        <StaffTable departmentId={scope ?? param(sp, "dept") ?? null} q={param(sp, "q")} designation={param(sp, "designation")} />
      </Suspense>
    </>
  );
}

async function StaffTable(p: { departmentId: string | null; q?: string; designation?: string }) {
  const rows = await listStaff(p);
  if (!rows.length) return <Card><EmptyState icon={<Briefcase className="size-6" />} title="No staff match" /></Card>;
  return (
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
          {rows.map((s) => {
            const t = toneOf(s.department_code);
            return (
              <TR key={s.id}>
                <TD>
                  <Link href={`/people/staff/${s.id}`} className="flex items-center gap-2.5 font-medium hover:text-primary">
                    <Avatar name={s.full_name} size={28} tone={ld(t.fg, t.border)} />
                    {s.full_name}
                    {s.is_hod && <Badge tone="navy">HOD</Badge>}
                  </Link>
                </TD>
                <TD className="font-mono text-xs text-muted">{s.employee_id}</TD>
                <TD>
                  <DeptChip code={s.department_code} soft />
                </TD>
                <TD className="text-muted">{s.designation}</TD>
                <TD>{s.class_teacher_of ?? <span className="text-faint">—</span>}</TD>
                <TD className="text-right tabular-nums">{Number(s.weekly_hours) || "—"}</TD>
                <TD>
                  <Badge tone={s.status === "active" ? "ok" : s.status === "on_leave" ? "warn" : "neutral"}>{s.status.replace("_", " ")}</Badge>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
