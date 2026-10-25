import type { Metadata } from "next";
import { Suspense } from "react";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Badge, Card, DeptChip, PageHeader, PageSkeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/forms";
import { subjectRows } from "@/features/academics/queries";
import { departmentOptions, deptCode } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Subjects" };

export default function SubjectsPage(props: PageProps<"/academics/subjects">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Subjects searchParams={props.searchParams} />
    </Suspense>
  );
}

const COMPONENT_LABEL = { TH: "Theory", PR: "Practical", TUT: "Tutorial" } as const;

async function Subjects({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("blueprint.view");
  const sp = await searchParams;
  const only = departmentScope(user, "blueprint.view");
  const dept = only ?? param(sp, "dept") ?? "dep-comp";
  const sem = Number(param(sp, "sem")) || undefined;
  const rows = subjectRows(dept, sem);

  return (
    <>
      <PageHeader
        eyebrow="Academics · Rev-2019 C-Scheme"
        title="Subjects"
        description="The subject catalogue per semester with its components. Theory is taught division-wide; practicals run per batch through teaching groups."
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!only && <FilterSelect name="dept" label="Branch" options={departmentOptions()} allLabel={null} fallback={dept} />}
          <FilterSelect
            name="sem"
            label="Semester"
            allLabel="Odd term (1, 3, 5, 7)"
            options={[1, 3, 5, 7].map((s) => ({ value: String(s), label: `Semester ${s}` }))}
          />
        </div>
      </Card>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Subject</TH>
              <TH>Sem</TH>
              <TH>Components (hours / week)</TH>
              <TH className="text-right">Credits</TH>
              <TH className="text-right">Teaching groups</TH>
              <TH className="text-right">Professors</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-mono text-xs">{s.code}</TD>
                <TD>
                  <div className="font-medium">{s.name}</div>
                  <div className="mt-0.5 flex gap-1.5">
                    {s.departmentId === null ? <Badge tone="info">FE common</Badge> : <DeptChip code={deptCode(s.departmentId)} soft />}
                    {s.isElective && <Badge tone="violet">Elective</Badge>}
                  </div>
                </TD>
                <TD className="tabular-nums">{s.semester}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1.5">
                    {s.components.map((c) => (
                      <Badge key={c.kind} tone={c.kind === "TH" ? "info" : "ok"}>
                        {COMPONENT_LABEL[c.kind]} · {c.weeklyHours}h
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD className="text-right tabular-nums">{s.credits}</TD>
                <TD className="text-right tabular-nums">{s.groups}</TD>
                <TD className="text-right tabular-nums">{s.professors}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
