import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarClock, CircleCheck, Clock, XCircle } from "lucide-react";
import { addDays, istDate, weekday } from "@/shared/dates";
import { departmentScope, requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { param } from "@/lib/utils";
import { Card, DeptChip, EmptyState, PageHeader, PageSkeleton, Skeleton, StatCard, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/forms";
import { batchLabel, registerCounts, sessionRows } from "@/features/attendance/queries";
import { DayStepper, RegisterBadge } from "@/features/attendance/components";
import { SessionRowActions, StaffOptionsProvider } from "@/features/timetable/session-actions";
import { departmentOptions } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Session board" };

export default function SessionBoardPage(props: PageProps<"/timetable/sessions">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <SessionBoard searchParams={props.searchParams} />
    </Suspense>
  );
}

/** Today, or the next weekday when today is Sunday. */
function defaultDate(today: string) {
  return weekday(today) === 0 ? addDays(today, 1) : today;
}

async function SessionBoard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("sessions.manage");
  const sp = await searchParams;
  const scope = departmentScope(user, "sessions.manage");
  const dept = scope ?? param(sp, "dept") ?? null;
  const today = istDate();
  const date = param(sp, "date") ?? defaultDate(today);
  const type = param(sp, "type");
  const keep: Record<string, string> = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "date" ? [[k, v]] : [])));

  return (
    <>
      <PageHeader
        eyebrow="Timetable"
        title="Daily session board"
        description="Every session on a day by branch and status. Cancel, substitute or follow up on registers. Cancelled sessions never count as held."
        actions={<DayStepper date={date} basePath="/timetable/sessions" params={keep} />}
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!scope && <FilterSelect name="dept" label="Branch" options={await departmentOptions()} allLabel="All branches" />}
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
      <Suspense key={`${date}-${dept}-${type}`} fallback={<Skeleton className="h-[32rem]" />}>
        <Board date={date} dept={dept} type={type} editable={date >= today} />
      </Suspense>
    </>
  );
}

async function Board({ date, dept, type, editable }: { date: string; dept: string | null; type?: string; editable: boolean }) {
  const [all, c] = await Promise.all([sessionRows(date, dept), registerCounts(date, dept)]);
  const rows = all.filter((r) => !type || (type === "PR" ? r.component === "PR" : r.component !== "PR"));

  const staffOptions: Record<string, { value: string; label: string }[]> = {};
  if (editable && rows.length) {
    const s = await db();
    let q = s.from("staff_directory").select("id, full_name, home_department_id").eq("status", "active").neq("designation", "Lab Assistant").order("full_name");
    if (dept) q = q.eq("home_department_id", dept);
    for (const st of unwrap(await q) as { id: string; full_name: string; home_department_id: string }[]) {
      (staffOptions[st.home_department_id] ??= []).push({ value: st.id, label: st.full_name });
    }
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Scheduled" value={c.total} icon={<CalendarClock className="size-5" />} />
        <StatCard label="Held (register in)" value={c.held + c.reopened} icon={<CircleCheck className="size-5" />} tone="ok" />
        <StatCard label="Pending / upcoming" value={c.pending + c.upcoming} icon={<Clock className="size-5" />} tone="warn" />
        <StatCard label="Cancelled" value={c.cancelled} icon={<XCircle className="size-5" />} tone="slate" />
      </div>
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
                      {r.start_time}
                      <div className="text-[11px] text-muted">to {r.end_time}</div>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <DeptChip code={r.department_code} soft />
                        <span className="font-medium">{r.division_label}</span>
                      </div>
                      {r.batch_code && <div className="mt-0.5 text-xs text-muted">{batchLabel(r.batch_code)}</div>}
                    </TD>
                    <TD>
                      <div className="font-medium">{r.subject_name}</div>
                      <div className="text-[11px] text-muted">
                        {r.subject_code} · {r.component === "PR" ? "Practical" : "Theory"}
                      </div>
                    </TD>
                    <TD>
                      {r.staff_name}
                      {r.substitute_name && <div className="text-xs text-violet">Substitute: {r.substitute_name}</div>}
                    </TD>
                    <TD className="text-muted">{r.room_label}</TD>
                    <TD>
                      <RegisterBadge state={r.display_state} late={r.is_late} />
                      {r.cancel_reason && <div className="mt-0.5 max-w-48 truncate text-[11px] text-muted">{r.cancel_reason}</div>}
                    </TD>
                    <TD>
                      {editable && (r.display_state === "upcoming" || r.display_state === "pending") && (
                        <SessionRowActions
                          sessionId={r.id}
                          departmentId={r.department_id}
                          staffId={r.staff_id}
                          title={`${r.division_label}${r.batch_code ? ` · Batch ${r.batch_code}` : ""} · ${r.subject_name} · ${r.start_time}`}
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
