import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarDays, Clock, GraduationCap } from "lucide-react";
import { diffDays, formatDate, formatTime, istDate } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { workingDays } from "@/lib/data/engine";
import { PERIODS } from "@/lib/data/catalogue";
import { Badge, Card, CardBody, CardHeader, PageHeader, PageSkeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Years & calendar" };

export default function CalendarPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AcademicCalendar />
    </Suspense>
  );
}

const KIND_TONE = { holiday: "bad", exam: "violet", event: "info", working_override: "ok" } as const;

async function AcademicCalendar() {
  await requirePermission("blueprint.view");
  const store = db();
  const today = istDate();

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Academic years & calendar"
        description="Years and terms, daily period template and holidays. Session generation and “sessions remaining” both read this calendar."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<GraduationCap className="size-5" />} title="Academic years & terms" description="Odd terms run July–November, even terms January–May." />
            <Table>
              <THead>
                <tr>
                  <TH>Term</TH>
                  <TH>Semesters</TH>
                  <TH>Dates</TH>
                  <TH className="text-right">Teaching days</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody>
                {store.terms
                  .slice()
                  .reverse()
                  .map((t) => (
                    <TR key={t.id}>
                      <TD className="font-medium">{t.label}</TD>
                      <TD>{t.parity === "odd" ? "1, 3, 5, 7" : "2, 4, 6, 8"}</TD>
                      <TD className="text-muted">
                        {formatDate(t.startDate, { year: true })} – {formatDate(t.endDate, { year: true })}
                      </TD>
                      <TD className="text-right tabular-nums">{t.status === "active" ? workingDays(t.startDate, t.endDate).length : "—"}</TD>
                      <TD>
                        <Badge tone={t.status === "active" ? "ok" : t.status === "planned" ? "info" : "neutral"}>{t.status}</Badge>
                      </TD>
                    </TR>
                  ))}
              </tbody>
            </Table>
            <p className="border-t border-line-soft px-5 py-3 text-xs text-muted">
              Archived years are read-only. Year rollover clones the active blueprint into new divisions and batches, then promotes students
              by closing old enrollments and opening new ones.
            </p>
          </Card>

          <Card>
            <CardHeader icon={<CalendarDays className="size-5" />} title="Holidays, exams & events" description="2026-27 odd term" />
            <ul className="divide-y divide-line-soft">
              {store.calendar
                .slice()
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((e) => {
                  const past = (e.endDate ?? e.date) < today;
                  return (
                    <li key={e.id} className={`flex items-center gap-4 px-5 py-3 ${past ? "opacity-60" : ""}`}>
                      <div className="w-28 shrink-0 text-sm font-semibold text-navy tabular-nums">
                        {formatDate(e.date)}
                        {e.endDate && ` – ${formatDate(e.endDate)}`}
                      </div>
                      <div className="flex-1 text-sm">{e.title}</div>
                      {!past && diffDays(e.date, today) <= 14 && diffDays(e.date, today) >= 0 && <Badge tone="warn">in {diffDays(e.date, today)} days</Badge>}
                      <Badge tone={KIND_TONE[e.kind]}>{e.kind.replace("_", " ")}</Badge>
                    </li>
                  );
                })}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<Clock className="size-5" />} title="Period template" description="Monday to Friday" />
            <ul className="divide-y divide-line-soft">
              {PERIODS.map((p) => (
                <li key={p.start} className={`flex items-center gap-3 px-5 py-2.5 text-sm ${p.kind === "break" ? "bg-[#f8fafd] text-muted" : ""}`}>
                  <span className="w-14 font-semibold text-navy">{p.label}</span>
                  <span className="tabular-nums">
                    {formatTime(p.start)} – {formatTime(p.end)}
                  </span>
                  {p.kind === "practical" && (
                    <Badge tone="ok" className="ml-auto">
                      2-hour practical
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Working pattern" />
            <CardBody className="space-y-2 text-sm">
              <p>
                <b>Saturdays:</b> 1st and 3rd are working days for extra and remedial lectures only; no regular timetable.
              </p>
              <p>
                <b>Lecture:</b> 60 minutes. <b>Practical:</b> 120 minutes, counted as one session (<code>count_mode = session</code>).
              </p>
              <p className="text-xs text-muted">These are decisions to confirm with the college (architecture §23, items 2 and 8).</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
