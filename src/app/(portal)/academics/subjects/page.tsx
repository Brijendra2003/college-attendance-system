import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Badge, Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Skeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/forms";
import { subjectRows, teachingCounts } from "@/features/academics/queries";
import { departmentOptions, getActiveContext, getDepartments } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Subjects" };

export default function SubjectsPage(props: PageProps<"/academics/subjects">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Subjects searchParams={props.searchParams} />
    </Suspense>
  );
}

const COMPONENT_LABEL = { TH: "Theory", PR: "Practical", TUT: "Tutorial" } as const;

async function Subjects({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("blueprint.view");
  const sp = await searchParams;
  const only = departmentScope(user, "blueprint.view");
  const departments = await getDepartments();
  const dept = only ?? param(sp, "dept") ?? departments[0]?.id ?? null;
  const { term } = await getActiveContext();
  const semesters = term?.parity === "even" ? [2, 4, 6, 8] : [1, 3, 5, 7];
  const sem = Number(param(sp, "sem")) || undefined;

  return (
    <>
      <PageHeader
        eyebrow="Academics · curriculum"
        title="Subjects"
        description="The subject catalogue per semester with its components. Theory is taught division-wide; practicals run per batch through teaching groups. Edit it in the blueprint editor."
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!only && <FilterSelect name="dept" label="Branch" options={await departmentOptions()} allLabel={null} fallback={dept ?? ""} />}
          <FilterSelect
            name="sem"
            label="Semester"
            allLabel="All semesters"
            options={[1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({ value: String(s), label: `Semester ${s}${semesters.includes(s) ? " · this term" : ""}` }))}
          />
        </div>
      </Card>
      <Suspense key={`${dept}-${sem}`} fallback={<Skeleton className="h-96" />}>
        <SubjectTable dept={dept} sem={sem} />
      </Suspense>
    </>
  );
}

async function SubjectTable({ dept, sem }: { dept: string | null; sem?: number }) {
  const [rows, departments] = await Promise.all([subjectRows(dept, sem), getDepartments()]);
  const counts = await teachingCounts(rows.map((r) => r.id));
  const code = (id: string | null) => departments.find((d) => d.id === id)?.code ?? "";
  if (!rows.length) return <Card><EmptyState icon={<BookOpen className="size-6" />} title="No subjects for this selection" /></Card>;
  return (
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
                  {s.department_id === null ? <Badge tone="info">FE common</Badge> : <DeptChip code={code(s.department_id)} soft />}
                  {s.is_elective && <Badge tone="violet">Elective</Badge>}
                </div>
              </TD>
              <TD className="tabular-nums">{s.semester}</TD>
              <TD>
                <div className="flex flex-wrap gap-1.5">
                  {s.components.map((c) => (
                    <Badge key={c.kind} tone={c.kind === "TH" ? "info" : "ok"}>
                      {COMPONENT_LABEL[c.kind]} · {Number(c.weekly_hours)}h
                    </Badge>
                  ))}
                </div>
              </TD>
              <TD className="text-right tabular-nums">{Number(s.credits)}</TD>
              <TD className="text-right tabular-nums">{counts.get(s.id)?.groups ?? 0}</TD>
              <TD className="text-right tabular-nums">{counts.get(s.id)?.professors ?? 0}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
