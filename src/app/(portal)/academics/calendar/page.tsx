import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarDays, Clock, GraduationCap } from "lucide-react";
import { diffDays, formatDate, istDate } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, PageSkeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { calendarEvents, periodTemplate } from "@/features/academics/queries";
import { getActiveContext, getPolicy } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Academic calendar" };

export default function CalendarPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <AcademicCalendar />
    </Suspense>
  );
}

const KIND_TONE = { holiday: "bad", exam: "violet", event: "info", working_override: "ok" } as const;
const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];

async function AcademicCalendar() {
  await requirePermission("blueprint.view");
  const [{ terms }, events, template, policy] = await Promise.all([getActiveContext(), calendarEvents(), periodTemplate(), getPolicy()]);
  const today = istDate();

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Academic calendar"
        description="Terms, the daily period template and holidays. Session generation and “sessions remaining” both read this calendar."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<GraduationCap className="size-5" />} title="Terms" description="Odd terms run July–November, even terms January–May." />
            <Table>
              <THead>
                <tr>
                  <TH>Term</TH>
                  <TH>Semesters</TH>
                  <TH>Dates</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody>
                {[...terms].reverse().map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.label}</TD>
                    <TD>{t.parity === "odd" ? "1, 3, 5, 7" : "2, 4, 6, 8"}</TD>
                    <TD className="text-muted">
                      {formatDate(t.start_date, { year: true })} – {formatDate(t.end_date, { year: true })}
                    </TD>
                    <TD>
                      <Badge tone={t.status === "active" ? "ok" : t.status === "planned" ? "info" : "neutral"}>{t.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader icon={<CalendarDays className="size-5" />} title="Holidays, exams & events" />
            {events.length === 0 ? (
              <EmptyState title="No calendar events yet" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {events.map((e) => {
                  const past = e.ends_on < today;
                  const inDays = diffDays(e.starts_on, today);
                  return (
                    <li key={e.id} className={`flex items-center gap-4 px-5 py-3 ${past ? "opacity-60" : ""}`}>
                      <div className="w-32 shrink-0 text-sm font-semibold text-heading tabular-nums">
                        {formatDate(e.starts_on)}
                        {e.ends_on !== e.starts_on && ` – ${formatDate(e.ends_on)}`}
                      </div>
                      <div className="flex-1 text-sm">{e.title}</div>
                      {!past && inDays >= 0 && inDays <= 14 && <Badge tone="warn">in {inDays} days</Badge>}
                      <Badge tone={KIND_TONE[e.kind]}>{e.kind.replace("_", " ")}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<Clock className="size-5" />} title="Period template" description="Monday to Friday" />
            <ul className="divide-y divide-line-soft">
              {template.periods.map((p) => (
                <li key={p.start} className={`flex items-center gap-3 px-5 py-2.5 text-sm ${p.kind === "break" ? "bg-subtle text-muted" : ""}`}>
                  <span className="w-20 font-semibold text-heading">{p.label}</span>
                  <span className="tabular-nums">
                    {p.start} – {p.end}
                  </span>
                  {p.kind === "practical" && (
                    <Badge tone="ok" className="ml-auto">
                      practical block
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
                <b>Saturdays:</b>{" "}
                {template.working_saturdays.length ? `${template.working_saturdays.map((n) => ORDINAL[n]).join(" and ")} are working days.` : "not working days."}
              </p>
              <p>
                <b>Counting:</b> {policy.count_mode === "session" ? "a 2-hour practical counts as one session" : "attendance is weighted by session hours"}.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
