import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDate, formatDateTime } from "@/shared/dates";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { param } from "@/lib/utils";
import { Badge, Card, DeptChip, PageHeader, PageSkeleton, Table, TD, TH, THead, TR, YearChip } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/forms";
import { versionRows } from "@/features/timetable/queries";
import { actorName, departmentOptions } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Timetables" };

export default function TimetablesPage(props: PageProps<"/timetable">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Timetables searchParams={props.searchParams} />
    </Suspense>
  );
}

const STATUS_TONE = { draft: "warn", published: "ok", archived: "neutral" } as const;

async function Timetables({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("timetable.view");
  const sp = await searchParams;
  const scope = departmentScope(user, "timetable.view");
  const status = param(sp, "status");
  const rows = versionRows(scope ?? param(sp, "dept") ?? null).filter((v) => !status || v.status === status);

  return (
    <>
      <PageHeader
        eyebrow="Timetable · Odd term 2026-27"
        title="Semester timetables"
        description="Versions are scoped per branch × program year, so each department works independently: draft → published → archived."
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!scope && <FilterSelect name="dept" label="Branch" options={departmentOptions()} allLabel="All branches" />}
          <FilterSelect
            name="status"
            label="Status"
            allLabel="All"
            options={[
              { value: "draft", label: "Draft" },
              { value: "published", label: "Published" },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>
      </Card>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Branch</TH>
              <TH>Year</TH>
              <TH>Revision</TH>
              <TH>Status</TH>
              <TH>Effective from</TH>
              <TH className="text-right">Divisions</TH>
              <TH className="text-right">Weekly slots</TH>
              <TH>Published</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {rows.map((v) => (
              <TR key={v.id}>
                <TD>
                  <DeptChip code={v.deptCode} />
                </TD>
                <TD>
                  <YearChip code={v.programYear} />
                </TD>
                <TD className="tabular-nums">r{v.revision}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[v.status]}>{v.status}</Badge>
                </TD>
                <TD>{formatDate(v.effectiveFrom, { year: true })}</TD>
                <TD className="text-right tabular-nums">{v.divisions}</TD>
                <TD className="text-right tabular-nums">{v.slots}</TD>
                <TD className="text-xs text-muted">{v.publishedAt ? `${actorName(v.publishedBy)} · ${formatDateTime(v.publishedAt)}` : "—"}</TD>
                <TD className="text-right">
                  <Link href={`/timetable/${v.id}`} className="text-xs font-semibold text-primary hover:underline">
                    {v.status === "draft" ? "Review & publish" : "View grid"}
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
