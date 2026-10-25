import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlert, NotebookPen, ShieldCheck } from "lucide-react";
import { formatDate } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { allStandings } from "@/lib/data/engine";
import { Badge, ButtonLink, Card, CardBody, CardHeader, PageHeader, PageSkeleton, Progress, StatCard, Table, TD, TH, THead, TR } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Exams" };

export default function ExamsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Exams />
    </Suspense>
  );
}

const TONE = { draft: "warn", published: "info", completed: "ok" } as const;

async function Exams() {
  await requirePermission("exams.view");
  const store = db();
  const min = store.policy.minPercent;
  let eligible = 0;
  let notEligible = 0;
  for (const s of allStandings().values()) {
    if ((s.lowest ?? 100) < min) notEligible++;
    else eligible++;
  }

  return (
    <>
      <PageHeader
        eyebrow="Examination cell"
        title="Exams"
        description="Exam types are configurable (IAET-1, IAET-2, practical, oral, end-sem). Exam attendance is kept separate from lecture attendance."
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Upcoming exams" value={store.exams.filter((e) => e.status !== "completed").length} icon={<NotebookPen className="size-5" />} />
        <StatCard label="Eligible (term grant)" value={eligible.toLocaleString("en-IN")} hint={`≥ ${min}% in every subject × component`} icon={<ShieldCheck className="size-5" />} tone="#16a34a" toneBg="#e8f7ee" />
        <StatCard label="Not eligible" value={notEligible.toLocaleString("en-IN")} hint="from the shortage list" icon={<CircleAlert className="size-5" />} tone="#dc2626" toneBg="#fdecec" href="/attendance/shortage" />
      </div>
      <Card>
        <CardHeader title="Odd term 2026-27" />
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
            {store.exams.map((e) => (
              <TR key={e.id}>
                <TD className="font-medium">{e.title}</TD>
                <TD>
                  <Badge tone="violet">{e.type}</Badge>
                </TD>
                <TD className="whitespace-nowrap">
                  {formatDate(e.startDate)} – {formatDate(e.endDate, { year: true })}
                </TD>
                <TD>{e.semesters.join(", ")}</TD>
                <TD className="text-right tabular-nums">{e.sessions}</TD>
                <TD>{e.conflicts ? <Badge tone="bad">{e.conflicts} to resolve</Badge> : <span className="text-xs text-ok">None</span>}</TD>
                <TD>
                  {e.status === "completed" ? (
                    <div className="flex items-center gap-2">
                      <Progress value={(e.attendanceMarked / e.sessions) * 100} tone="var(--color-primary)" />
                      <span className="w-14 text-right text-xs tabular-nums">
                        {e.attendanceMarked}/{e.sessions}
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
      </Card>
      <Card className="mt-6">
        <CardHeader title="End-semester conflicts" description="Detected from teaching-group membership, rooms and examiners" />
        <CardBody className="space-y-2 text-sm">
          {[
            "SE COMP-B: 3 ATKT students have Engineering Mathematics-III (SE) and Discrete Structures (re-exam) on 25 Nov, morning",
            "Room A-204 is booked for TE IT and TE AIML papers on 1 Dec, afternoon",
            `Examiner ${store.staff[7].name} is assigned to two practical vivas on 4 Dec, 10:00`,
          ].map((c) => (
            <div key={c} className="flex items-start gap-2 text-bad">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {c}
            </div>
          ))}
          <div className="pt-2">
            <ButtonLink href="/academics/calendar" size="sm">
              View exam blocks in the calendar
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
