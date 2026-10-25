import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, UsersRound } from "lucide-react";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Card, DeptChip, PageHeader, PageSkeleton, Progress, Table, TD, TH, THead, TR, YearChip } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, FilterSelect, Input, Select, SubmitButton } from "@/components/ui/forms";
import { divisionRows } from "@/features/academics/queries";
import { createDivision } from "@/features/academics/actions";
import { departmentOptions, deptCode, PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Divisions & batches" };

export default function ClassesPage(props: PageProps<"/academics/classes">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Classes searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Classes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("blueprint.view");
  const sp = await searchParams;
  const only = departmentScope(user, "blueprint.view");
  const dept = only ?? param(sp, "dept") ?? null;
  const py = param(sp, "py");
  const rows = divisionRows(dept, py);
  const canManage = can(user, "blueprint.manage");

  return (
    <>
      <PageHeader
        eyebrow="Academics · 2026-27"
        title="Divisions & batches"
        description="Divisions are created per academic year, branch and program year. Batches split a division for practicals, labs and tutorials."
        actions={
          canManage && (
            <Dialog trigger={<><Plus className="size-4" /> New division</>} title="Create division" description="For the active academic year 2026-27.">
              <ActionForm action={createDivision} className="grid grid-cols-2 gap-4">
                <Field name="departmentId" label="Branch" className="col-span-2">
                  <Select name="departmentId" defaultValue={dept ?? undefined}>
                    {departmentOptions(only).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field name="programYear" label="Program year">
                  <Select name="programYear" defaultValue={py ?? "FE"}>
                    {PROGRAM_YEAR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field name="code" label="Division code" hint="A, B, C …">
                  <Input name="code" maxLength={1} placeholder="C" className="uppercase" />
                </Field>
                <Field name="capacity" label="Capacity">
                  <Input name="capacity" type="number" defaultValue={60} />
                </Field>
                <Field name="batchCount" label="Practical batches">
                  <Input name="batchCount" type="number" defaultValue={3} />
                </Field>
                <div className="col-span-2 flex justify-end">
                  <SubmitButton>Create division</SubmitButton>
                </div>
              </ActionForm>
            </Dialog>
          )
        }
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!only && <FilterSelect name="dept" label="Branch" options={departmentOptions()} allLabel="All branches" />}
          <FilterSelect name="py" label="Program year" options={PROGRAM_YEAR_OPTIONS} allLabel="All years" />
        </div>
      </Card>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Division</TH>
              <TH>Branch</TH>
              <TH>Year</TH>
              <TH>Class teacher</TH>
              <TH>Room</TH>
              <TH>Batches</TH>
              <TH className="w-44">Strength</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {rows.map((d) => (
              <TR key={d.id}>
                <TD className="font-semibold">
                  {d.programYear} {deptCode(d.departmentId)}-{d.code}
                </TD>
                <TD>
                  <DeptChip code={deptCode(d.departmentId)} soft />
                </TD>
                <TD>
                  <YearChip code={d.programYear} />
                </TD>
                <TD>{d.classTeacher ? <Link href={`/people/staff/${d.classTeacher.id}`} className="hover:text-primary">{d.classTeacher.name}</Link> : <span className="text-bad">Not assigned</span>}</TD>
                <TD className="text-muted">{d.room}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {d.batches.map((b) => (
                      <span key={b.id} className="inline-flex items-center gap-1 rounded-md bg-[#e5f6f3] px-1.5 py-0.5 text-[11px] font-medium text-[#0e6d64]">
                        <UsersRound className="size-3" />B{b.code} · {b.students}
                      </span>
                    ))}
                  </div>
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Progress value={(d.students / d.capacity) * 100} tone="var(--color-primary)" />
                    <span className="w-14 text-right text-xs tabular-nums">
                      {d.students}/{d.capacity}
                    </span>
                  </div>
                </TD>
                <TD className="text-right">
                  <Link href={`/people/students?division=${d.id}`} className="text-xs font-medium text-primary hover:underline">
                    Roster
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
