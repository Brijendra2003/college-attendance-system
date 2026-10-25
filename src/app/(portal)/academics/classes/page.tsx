import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, UsersRound } from "lucide-react";
import { istDate } from "@/shared/dates";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { param } from "@/lib/utils";
import { Card, DeptChip, EmptyState, ld, PageHeader, PageSkeleton, Progress, Skeleton, Table, TD, TH, THead, TR, YearChip } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, FilterSelect, Input, Select, SubmitButton } from "@/components/ui/forms";
import { createDivision, setClassTeacher } from "@/features/academics/actions";
import { departmentOptions, getDivisions, PROGRAM_YEAR_OPTIONS } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Divisions & batches" };

export default function ClassesPage(props: PageProps<"/academics/classes">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Classes searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Classes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("blueprint.view");
  const sp = await searchParams;
  const only = departmentScope(user, "blueprint.view");
  const dept = only ?? param(sp, "dept") ?? null;
  const py = param(sp, "py") ?? null;
  const canManage = can(user, "blueprint.manage");
  const options = await departmentOptions(only);

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Divisions & batches"
        description="Divisions are created per academic year, branch and program year. Batches split a division for practicals, labs and tutorials."
        actions={
          canManage && (
            <Dialog trigger={<><Plus className="size-4" /> New division</>} title="Create division" description="For the active academic year.">
              <ActionForm action={createDivision} className="grid grid-cols-2 gap-4">
                <Field name="departmentId" label="Branch" className="col-span-2">
                  <Select name="departmentId" defaultValue={dept ?? undefined}>
                    {options.map((o) => (
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
                  <SubmitButton pendingLabel="Creating">Create division</SubmitButton>
                </div>
              </ActionForm>
            </Dialog>
          )
        }
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!only && <FilterSelect name="dept" label="Branch" options={options} allLabel="All branches" />}
          <FilterSelect name="py" label="Program year" options={PROGRAM_YEAR_OPTIONS} allLabel="All years" />
        </div>
      </Card>
      <Suspense key={`${dept}-${py}`} fallback={<Skeleton className="h-96" />}>
        <DivisionTable dept={dept} py={py} canAssign={can(user, "assignments.manage")} />
      </Suspense>
    </>
  );
}

async function DivisionTable({ dept, py, canAssign }: { dept: string | null; py: string | null; canAssign: boolean }) {
  const rows = await getDivisions(dept, py);
  const s = await db();
  const staff = canAssign
    ? (unwrap(await s.from("staff_directory").select("id, full_name, home_department_id").neq("designation", "Lab Assistant").eq("status", "active").order("full_name")) as {
        id: string;
        full_name: string;
        home_department_id: string;
      }[])
    : [];
  if (!rows.length) return <Card><EmptyState icon={<UsersRound className="size-6" />} title="No divisions match" /></Card>;
  return (
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
              <TD className="font-semibold">{d.label}</TD>
              <TD>
                <DeptChip code={d.department_code} soft />
              </TD>
              <TD>
                <YearChip code={d.program_year} />
              </TD>
              <TD>
                <div className="flex items-center gap-2">
                  {d.class_teacher_id ? (
                    <Link href={`/people/staff/${d.class_teacher_id}`} className="hover:text-primary">
                      {d.class_teacher_name}
                    </Link>
                  ) : (
                    <span className="text-bad">Not assigned</span>
                  )}
                  {canAssign && (
                    <Dialog trigger="Change" triggerVariant="ghost" triggerSize="sm" title={`Class teacher — ${d.label}`} description="Grants leave approval and class messaging for this division.">
                      <ActionForm action={setClassTeacher} className="space-y-4">
                        <input type="hidden" name="divisionId" value={d.id} />
                        <Field name="staffId" label="Professor">
                          <Select name="staffId" defaultValue={d.class_teacher_id ?? undefined}>
                            {staff
                              .filter((x) => x.home_department_id === d.department_id)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.full_name}
                                </option>
                              ))}
                          </Select>
                        </Field>
                        <Field name="effectiveFrom" label="Effective from">
                          <Input type="date" name="effectiveFrom" defaultValue={istDate()} />
                        </Field>
                        <div className="flex justify-end">
                          <SubmitButton pendingLabel="Saving">Assign</SubmitButton>
                        </div>
                      </ActionForm>
                    </Dialog>
                  )}
                </div>
              </TD>
              <TD className="text-muted">{d.room_label ?? "—"}</TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {(d.batches ?? []).map((b) => (
                    <span key={b.id} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ background: ld("#e5f6f3", "#0f2a28"), color: ld("#0e6d64", "#5fd4c4") }}>
                      <UsersRound className="size-3" />B{b.code} · {b.students}
                    </span>
                  ))}
                </div>
              </TD>
              <TD>
                <div className="flex items-center gap-2">
                  <Progress value={(Number(d.students) / d.capacity) * 100} tone="var(--primary)" />
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
  );
}
