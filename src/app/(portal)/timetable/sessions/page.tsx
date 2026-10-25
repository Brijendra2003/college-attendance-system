import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarClock, CircleCheck, Clock, XCircle } from "lucide-react";
import { addDays, formatTime, istDate } from "@/shared/dates";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { isWorkingDay } from "@/lib/data/engine";
import { db } from "@/lib/data/store";
import { param } from "@/lib/utils";
import { Card, DeptChip, EmptyState, PageHeader, PageSkeleton, StatCard, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/forms";
import { registerCounts, sessionRows } from "@/features/attendance/queries";
import { DayStepper, RegisterBadge } from "@/features/attendance/components";
import { SessionRowActions, StaffOptionsProvider } from "@/features/timetable/session-actions";
import { departmentOptions } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Session board" };

function nextWorkingDay(from: string) {
  let d = from;
  for (let i = 0; i < 30 && !isWorkingDay(d); i++) d = addDays(d, 1);
  return isWorkingDay(d) ? d : from;
}

export default function SessionBoardPage(props: PageProps<"/timetable/sessions">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SessionBoard searchParams={props.searchParams} />
    </Suspense>
  );
}

async function SessionBoard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("sessions.manage");
  const sp = await searchParams;
  const scope = departmentScope(user, "sessions.manage");
  const dept = scope ?? param(sp, "dept") ?? null;
  const today = istDate();
  const date = param(sp, "date") ?? nextWorkingDay(today);
  const type = param(sp, "type");
  const all = sessionRows(date, dept);
  const rows = all.filter((r) => !type || (type === "PR" ? r.component === "PR" : r.component !== "PR")).sort((a, b) => a.start - b.start || a.division.localeCompare(b.division));
  const c = registerCounts(all);
  const editable = date >= today;
  const keep: Record<string, string> = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "date" ? [[k, v]] : [])));

  const staffOptions: Record<string, { value: string; label: string }[]> = {};
  if (editable) {
    for (const s of db().staff) {
      if (s.designation === "Lab Assistant" || (dept && s.departmentId !== dept)) continue;
      (staffOptions[s.departmentId] ??= []).push({ value: s.id, label: s.name });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Timetable"
        title="Daily session board"
        description="Every session on a day by branch and status. Cancel, substitute or follow up on registers. Cancelled sessions never count as held."
        actions={<DayStepper date={date} basePath="/timetable/sessions" params={keep} />}
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Scheduled" value={c.total} icon={<CalendarClock className="size-5" />} />
        <StatCard label="Held (register in)" value={c.held + c.reopened} icon={<CircleCheck className="size-5" />} tone="#16a34a" toneBg="#e8f7ee" />
        <StatCard label="Pending / upcoming" value={c.pending + c.upcoming} icon={<Clock className="size-5" />} tone="#d97706" toneBg="#fff4e0" />
        <StatCard label="Cancelled" value={c.cancelled} icon={<XCircle className="size-5" />} tone="#475569" toneBg="#eef2f7" />
      </div>
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!scope && <FilterSelect name="dept" label="Branch" options={departmentOptions()} allLabel="All branches" />}
          <FilterSelect
            name="type"
            label="Session type"
            allLabel="All"
            options={[
              { value: "TH", label: "Theory" },
              { value: "PR", label: "Practical" },
            ]}
          />
        </div>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<CalendarClock className="size-6" />} title="No sessions on this day">
            It is a holiday, a weekend or outside the term.
          </EmptyState>
        ) : (
          <StaffOptionsProvider options={staffOptions}>
            <Table>
              <THead>
                <tr>
                  <TH>Time</TH>
                  <TH>Class</TH>
                  <TH>Subject</TH>
                  <TH>Professor</TH>
                  <TH>Room</TH>
                  <TH>Register</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.id} className={r.status === "cancelled" ? "opacity-60" : undefined}>
                    <TD className="whitespace-nowrap tabular-nums">
                      {formatTime(r.start)}
                      <div className="text-[11px] text-muted">to {formatTime(r.end)}</div>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <DeptChip code={r.deptCode} soft />
                        <span className="font-medium">{r.division}</span>
                      </div>
                      {r.batch && <div className="mt-0.5 text-xs text-muted">{r.batch}</div>}
                    </TD>
                    <TD>
                      <div className="font-medium">{r.subjectName}</div>
                      <div className="text-[11px] text-muted">
                        {r.subjectCode} · {r.component === "PR" ? "Practical" : "Theory"}
                      </div>
                    </TD>
                    <TD>
                      {r.staffName}
                      {r.substituteName && <div className="text-xs text-violet">Substitute: {r.substituteName}</div>}
                    </TD>
                    <TD className="text-muted">{r.room}</TD>
                    <TD>
                      <RegisterBadge row={r} />
                      {r.cancelReason && <div className="mt-0.5 max-w-48 truncate text-[11px] text-muted">{r.cancelReason}</div>}
                    </TD>
                    <TD>
                      {editable && r.status !== "cancelled" && (r.state === "upcoming" || r.state === "pending") && (
                        <SessionRowActions
                          sessionId={r.id}
                          departmentId={r.departmentId}
                          staffId={r.staffId}
                          title={`${r.division}${r.batch ? ` ${r.batch}` : ""} · ${r.subjectName} · ${formatTime(r.start)}`}
                        />
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </StaffOptionsProvider>
        )}
      </Card>
    </>
  );
}
