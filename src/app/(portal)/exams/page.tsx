import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlert, NotebookPen, ShieldCheck } from "lucide-react";
import { formatDate } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, Progress, StatCard, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { shortageList } from "@/features/attendance/queries";
import { getActiveContext, getPolicy } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Exams" };

export default function ExamsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Exams />
    </Suspense>
  );
}

const TONE = { draft: "warn", published: "info", completed: "ok" } as const;

interface ExamRow {
  id: string;
  exam_type: string;
  title: string;
  starts_on: string;
  ends_on: string;
  status: keyof typeof TONE;
  semesters: number[];
  paper_count: number;
  conflict_count: number;
  attendance_marked: number;
}

async function Exams() {
  await requirePermission("exams.view");
  const s = await db();
  const { term } = await getActiveContext();
  const [exams, policy, short, active] = await Promise.all([
    s.from("exams").select("id, exam_type, title, starts_on, ends_on, status, semesters, paper_count, conflict_count, attendance_marked").eq("term_id", term?.id ?? "").order("starts_on"),
    getPolicy(),
    shortageList({ departmentId: null, page: 1, pageSize: 1 }),
    s.from("v_students").select("id", { count: "exact", head: true }).eq("status", "active").not("enrollment_id", "is", null),
  ]);
  const rows = unwrap(exams) as ExamRow[];
  const notEligible = short.total;
  const eligible = Math.max(0, (active.count ?? 0) - notEligible);

  return (
    <>
      <PageHeader
        eyebrow="Examination cell"
        title="Exams"
        description="Exam types are configurable (IAET-1, IAET-2, practical, oral, end-sem). Exam attendance is kept separate from lecture attendance."
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Upcoming exams" value={rows.filter((e) => e.status !== "completed").length} icon={<NotebookPen className="size-5" />} />
        <StatCard label="Eligible (term grant)" value={eligible.toLocaleString("en-IN")} hint={`≥ ${policy.min_percent}% in every subject × component`} icon={<ShieldCheck className="size-5" />} tone="ok" />
        <StatCard label="Not eligible" value={notEligible.toLocaleString("en-IN")} hint="from the shortage list" icon={<CircleAlert className="size-5" />} tone="bad" href="/attendance/shortage" />
      </div>
      <Card>
        <CardHeader title={term?.label ?? "Exams"} />
        {rows.length === 0 ? (
          <EmptyState icon={<NotebookPen className="size-6" />} title="No exams scheduled this term" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Exam</TH>
                <TH>Type</TH>
                <TH>Dates</TH>
                <TH>Semesters</TH>
                <TH className="text-right">Papers</TH>
                <TH>Conflicts</TH>
                <TH className="w-48">Exam attendance</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((e) => (
                <TR key={e.id}>
                  <TD className="font-medium">{e.title}</TD>
                  <TD>
                    <Badge tone="violet">{e.exam_type}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {formatDate(e.starts_on)} – {formatDate(e.ends_on, { year: true })}
                  </TD>
                  <TD>{e.semesters.join(", ")}</TD>
                  <TD className="text-right tabular-nums">{e.paper_count}</TD>
                  <TD>{e.conflict_count ? <Badge tone="bad">{e.conflict_count} to resolve</Badge> : <span className="text-xs text-ok">None</span>}</TD>
                  <TD>
                    {e.status === "completed" && e.paper_count ? (
                      <div className="flex items-center gap-2">
                        <Progress value={(e.attendance_marked / e.paper_count) * 100} tone="var(--primary)" />
                        <span className="w-14 text-right text-xs tabular-nums">
                          {e.attendance_marked}/{e.paper_count}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-faint">after the exam</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={TONE[e.status]}>{e.status}</Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
