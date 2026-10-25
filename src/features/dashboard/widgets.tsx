import Link from "next/link";
import {
  ArrowRight,
  Building,
  CalendarClock,
  CalendarX,
  ClipboardCheck,
  FilePenLine,
  GraduationCap,
  Layers,
  NotebookPen,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toneOf } from "@/shared/tokens";
import { formatDate, formatDateTime } from "@/shared/dates";
import { db, rpc, unwrap } from "@/lib/db";
import { formatNumber, relativeTime } from "@/lib/utils";
import { BranchBarChart, TrendLineChart } from "@/components/charts/charts";
import { SegmentedBar } from "@/components/charts/html-charts";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  DeptChip,
  EmptyState,
  ld,
  PercentText,
  Progress,
  StatCard,
  Table,
  TD,
  TH,
  THead,
  toneStyle,
  TR,
} from "@/components/ui/primitives";
import { RegisterBadge } from "@/features/attendance/components";
import { batchLabel, branchStats, dailyTrend, facultySubmission, referenceDate, registerCounts, sessionRows } from "@/features/attendance/queries";
import { getDepartments, getDivisions, getPolicy } from "@/features/common/lookups";

export async function Totals({ departmentId }: { departmentId: string | null }) {
  const s = await db();
  const [students, staff, divisions, departments] = await Promise.all([
    s.from("v_students").select("id", { count: "exact", head: true }).eq("status", "active").not("enrollment_id", "is", null).match(departmentId ? { department_id: departmentId } : {}),
    s.from("staff_directory").select("id", { count: "exact", head: true }).neq("status", "inactive").match(departmentId ? { home_department_id: departmentId } : {}),
    getDivisions(departmentId),
    getDepartments(),
  ]);
  const batches = divisions.reduce((a, d) => a + (d.batches?.length ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatCard label="Students" value={formatNumber(students.count ?? 0)} hint="active enrollments" icon={<GraduationCap className="size-5" />} href="/people/students" />
      <StatCard label="Staff" value={formatNumber(staff.count ?? 0)} hint={departmentId ? "in department" : "across all branches"} icon={<UserRound className="size-5" />} tone="violet" href="/people/staff" />
      <StatCard label="Branches" value={departmentId ? 1 : departments.length} hint="departments" icon={<Building className="size-5" />} tone="teal" href="/academics/departments" />
      <StatCard label="Divisions" value={divisions.length} hint="FE to BE" icon={<UsersRound className="size-5" />} tone="orange" href="/academics/classes" />
      <StatCard label="Batches" value={batches} hint="practical groups" icon={<Layers className="size-5" />} tone="cyan" href="/academics/classes" />
    </div>
  );
}

export async function TodayRegisters({ departmentId }: { departmentId: string | null }) {
  const ref = await referenceDate();
  const c = await registerCounts(ref.date, departmentId);
  const presentPct = c.roster ? (c.present / c.roster) * 100 : null;
  return (
    <Card>
      <CardHeader
        icon={<ClipboardCheck className="size-5" />}
        title={ref.isToday ? "Today's sessions" : `Last teaching day · ${formatDate(ref.date, { weekday: true })}`}
        description={ref.isToday ? "Register submission status, live" : `No classes today. Showing the most recent teaching day.`}
        action={
          <ButtonLink href={`/attendance/registers?date=${ref.date}`} size="sm" variant="ghost">
            Registers <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      <CardBody>
        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-navy-50 py-2.5">
            <div className="text-xl font-bold text-heading tabular-nums">{c.total}</div>
            <div className="text-[11px] text-muted">scheduled</div>
          </div>
          <div className="rounded-lg bg-ok-soft py-2.5">
            <div className="text-xl font-bold text-ok-ink tabular-nums">{c.held}</div>
            <div className="text-[11px] text-muted">submitted</div>
          </div>
          <div className="rounded-lg bg-bad-soft py-2.5">
            <div className="text-xl font-bold text-bad-ink tabular-nums">{c.missing}</div>
            <div className="text-[11px] text-muted">missing</div>
          </div>
        </div>
        <SegmentedBar
          segments={[
            { label: "Submitted", value: c.held, color: "var(--ok)" },
            { label: "Pending", value: c.pending, color: "var(--warn)" },
            { label: "Missing", value: c.missing, color: "var(--bad)" },
            { label: "Upcoming", value: c.upcoming, color: "var(--faint)" },
            { label: "Cancelled", value: c.cancelled, color: "var(--muted)" },
            { label: "Reopened", value: c.reopened, color: "var(--violet)" },
          ]}
        />
        <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3 text-xs text-muted">
          <span>Students present in submitted registers</span>
          <PercentText value={presentPct} />
        </div>
      </CardBody>
    </Card>
  );
}

export async function BranchComparison() {
  const [data, policy] = await Promise.all([branchStats(), getPolicy()]);
  return (
    <Card>
      <CardHeader
        icon={<Building className="size-5" />}
        title="Branch comparison"
        description="Average term attendance per student, by branch"
        action={
          <ButtonLink href="/attendance" size="sm" variant="ghost">
            Overview <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      <CardBody>
        <BranchBarChart data={data} threshold={policy.min_percent} />
      </CardBody>
    </Card>
  );
}

export async function AttendanceTrend({ departmentId, title = "Attendance trend" }: { departmentId: string | null; title?: string }) {
  const [rows, policy] = await Promise.all([dailyTrend(12, departmentId), getPolicy()]);
  const data = rows.map((r) => ({ ...r, label: formatDate(r.date) }));
  return (
    <Card>
      <CardHeader icon={<CalendarClock className="size-5" />} title={title} description="Students present across submitted registers, last 12 teaching days" />
      <CardBody>{data.length ? <TrendLineChart data={data} threshold={policy.min_percent} /> : <EmptyState title="No attendance recorded yet" />}</CardBody>
    </Card>
  );
}

export async function ShortageByBranch() {
  const [stats, policy] = await Promise.all([branchStats(), getPolicy()]);
  const data = [...stats].sort((a, b) => b.shortage - a.shortage);
  const max = Math.max(...data.map((d) => d.shortage), 1);
  return (
    <Card>
      <CardHeader
        icon={<TriangleAlert className="size-5" />}
        title="Shortage by branch"
        description={`Students below ${policy.min_percent}% in at least one subject`}
        action={
          <ButtonLink href="/attendance/shortage" size="sm" variant="ghost">
            List <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      <CardBody className="space-y-2.5">
        {data.map((d) => {
          const t = toneOf(d.code);
          return (
            <Link key={d.code} href={`/attendance/shortage?dept=${d.department_id}`} className="flex items-center gap-3 rounded-md hover:bg-navy-50">
              <DeptChip code={d.code} />
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-line-soft">
                  <div className="h-full rounded-full" style={{ width: `${(d.shortage / max) * 100}%`, background: ld(t.fg, t.fgDark) }} />
                </div>
              </div>
              <span className="w-24 text-right text-xs text-muted">
                <b className="text-ink tabular-nums">{d.shortage}</b> of {d.students}
              </span>
            </Link>
          );
        })}
      </CardBody>
    </Card>
  );
}

export async function PendingApprovals({ showStaffLeave }: { showStaffLeave: boolean }) {
  // Counts are RLS-scoped, so an HOD sees only their department's work.
  const s = await db();
  const count = (r: { count: number | null }) => r.count ?? 0;
  const [corrections, leave, staffLeave, drafts] = await Promise.all([
    s.from("attendance_correction_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    s.from("leave_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "needs_info"]),
    s.from("staff_leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    s.from("timetable_versions").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);
  const items = [
    { label: "Attendance corrections", count: count(corrections), href: "/attendance/corrections", icon: FilePenLine, tone: "var(--violet)" },
    { label: "Student leave", count: count(leave), href: "/leave", icon: CalendarX, tone: "var(--warn)" },
    ...(showStaffLeave ? [{ label: "Staff leave", count: count(staffLeave), href: "/leave?tab=staff", icon: UserRound, tone: "var(--info)" }] : []),
    { label: "Draft timetables", count: count(drafts), href: "/timetable?status=draft", icon: CalendarClock, tone: "var(--primary)" },
  ];
  return (
    <Card>
      <CardHeader icon={<ShieldCheck className="size-5" />} title="Pending approvals" description="Waiting on you or your team" />
      <ul className="divide-y divide-line-soft">
        {items.map((i) => (
          <li key={i.label}>
            <Link href={i.href} className="flex items-center gap-3 px-5 py-3 hover:bg-subtle">
              <span className="grid size-8 place-items-center rounded-lg bg-navy-50" style={{ color: i.tone }}>
                <i.icon className="size-4" />
              </span>
              <span className="flex-1 text-sm text-ink">{i.label}</span>
              <span className="text-lg font-bold text-heading tabular-nums">{i.count}</span>
              <ArrowRight className="size-4 text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface ExamRow {
  id: string;
  title: string;
  exam_type: string;
  starts_on: string;
  ends_on: string;
  status: string;
  paper_count: number;
  conflict_count: number;
}

export async function UpcomingExams() {
  const s = await db();
  const exams = unwrap(await s.from("exams").select("id, title, exam_type, starts_on, ends_on, status, paper_count, conflict_count").neq("status", "completed").order("starts_on")) as ExamRow[];
  return (
    <Card>
      <CardHeader
        icon={<NotebookPen className="size-5" />}
        title="Exam calendar"
        action={
          <ButtonLink href="/exams" size="sm" variant="ghost">
            Exams <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      {exams.length === 0 ? (
        <EmptyState title="No upcoming exams" />
      ) : (
        <ul className="divide-y divide-line-soft">
          {exams.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-14 shrink-0 rounded-lg bg-navy-50 py-1 text-center">
                <div className="text-[10px] font-semibold text-primary uppercase">{formatDate(e.starts_on).split(" ")[1]}</div>
                <div className="text-lg leading-none font-bold text-heading">{formatDate(e.starts_on).split(" ")[0]}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{e.title}</div>
                <div className="text-xs text-muted">
                  {formatDate(e.starts_on)} – {formatDate(e.ends_on)} · {e.paper_count} papers
                </div>
              </div>
              {e.conflict_count > 0 ? <Badge tone="bad">{e.conflict_count} conflicts</Badge> : <Badge tone={e.status === "published" ? "ok" : "neutral"}>{e.status}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export async function FacultySubmission({ departmentId }: { departmentId: string | null }) {
  const rows = await facultySubmission(10, departmentId);
  return (
    <Card>
      <CardHeader
        icon={<ClipboardCheck className="size-5" />}
        title="Faculty submission status"
        description="Registers over the last 10 teaching days, lowest on-time rate first"
        action={
          <ButtonLink href="/attendance/registers?state=missing" size="sm" variant="ghost">
            Missing <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No registers in this period" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Professor</TH>
              <TH className="text-right">On time</TH>
              <TH className="text-right">Late</TH>
              <TH className="text-right">Missing</TH>
              <TH className="w-40">On-time rate</TH>
            </tr>
          </THead>
          <tbody>
            {rows.slice(0, 8).map((r) => (
              <TR key={r.staff_id}>
                <TD>
                  <Link href={`/people/staff/${r.staff_id}`} className="font-medium text-ink hover:text-primary">
                    {r.full_name}
                  </Link>
                  <div className="text-xs text-muted">{r.designation}</div>
                </TD>
                <TD className="text-right tabular-nums">{r.on_time}</TD>
                <TD className="text-right tabular-nums">{r.late}</TD>
                <TD className="text-right tabular-nums">{r.missing ? <span className="font-semibold text-bad">{r.missing}</span> : 0}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Progress value={r.on_time_percent ?? 0} tone={(r.on_time_percent ?? 0) < 80 ? "var(--warn)" : "var(--ok)"} />
                    <span className="w-11 text-right text-xs tabular-nums">{(r.on_time_percent ?? 0).toFixed(0)}%</span>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

interface StaffLeaveRow {
  id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  staff: { full_name: string; home_department_id: string } | null;
}

export async function StaffLeaveList() {
  const s = await db();
  const [rows, departments] = await Promise.all([
    s.from("staff_leave_requests").select("id, from_date, to_date, reason, status, staff(full_name, home_department_id)").order("created_at", { ascending: false }).limit(5),
    getDepartments(),
  ]);
  const list = unwrap(rows) as unknown as StaffLeaveRow[];
  const code = (id?: string) => departments.find((d) => d.id === id)?.code ?? "—";
  return (
    <Card>
      <CardHeader
        icon={<CalendarX className="size-5" />}
        title="Staff leave requests"
        action={
          <ButtonLink href="/leave?tab=staff" size="sm" variant="ghost">
            Review <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      {list.length === 0 ? (
        <EmptyState title="No staff leave requests" />
      ) : (
        <ul className="divide-y divide-line-soft">
          {list.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-5 py-3">
              <DeptChip code={code(l.staff?.home_department_id)} soft />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{l.staff?.full_name}</div>
                <div className="truncate text-xs text-muted">
                  {formatDate(l.from_date)}
                  {l.to_date !== l.from_date && ` – ${formatDate(l.to_date)}`} · {l.reason}
                </div>
              </div>
              <Badge tone={l.status === "pending" ? "warn" : l.status === "approved" ? "ok" : "bad"}>{l.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export async function SetupHealth() {
  const h = await rpc<Record<string, number>>("setup_health");
  const checks = [
    { label: "Active students with no current enrollment", value: h.students_without_enrollment, href: "/people/students", bad: "bad" },
    { label: "Guardian links awaiting verification", value: h.pending_guardian_links, href: "/people/guardians?status=pending", bad: "warn" },
    { label: "Students without MU PRN (FE allowed)", value: h.students_without_prn, href: "/people/students?flag=no_prn", bad: "info" },
    { label: "Timetable drafts not yet published", value: h.timetable_drafts, href: "/timetable?status=draft", bad: "warn" },
    { label: "Divisions without a class teacher", value: h.divisions_without_class_teacher, href: "/academics/classes", bad: "bad" },
    { label: "Departments without an HOD", value: h.departments_without_hod, href: "/academics/departments", bad: "bad" },
  ] as const;
  return (
    <Card>
      <CardHeader icon={<ShieldCheck className="size-5" />} title="Setup health" description="Blueprint validation and data quality" />
      <ul className="divide-y divide-line-soft">
        {checks.map((c) => (
          <li key={c.label}>
            <Link href={c.href} className="flex items-center gap-3 px-5 py-3 hover:bg-subtle">
              <Badge tone={c.value ? c.bad : "ok"}>{c.value ? (c.bad === "bad" ? "Fix" : c.bad === "warn" ? "Review" : "Info") : "OK"}</Badge>
              <span className="flex-1 text-sm">{c.label}</span>
              <span className="font-bold text-heading tabular-nums">{formatNumber(c.value)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export async function RecentAudit() {
  const s = await db();
  const entries = unwrap(await s.from("audit_log").select("id, at, actor_name, summary").order("at", { ascending: false }).limit(6)) as {
    id: number;
    at: string;
    actor_name: string;
    summary: string;
  }[];
  return (
    <Card>
      <CardHeader
        icon={<ScrollText className="size-5" />}
        title="Recent activity"
        action={
          <ButtonLink href="/audit" size="sm" variant="ghost">
            Audit log <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      {entries.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <ul className="divide-y divide-line-soft">
          {entries.map((a) => (
            <li key={a.id} className="px-5 py-3">
              <div className="text-sm text-ink">{a.summary}</div>
              <div className="mt-0.5 text-xs text-muted" title={formatDateTime(a.at)}>
                {a.actor_name} · {relativeTime(a.at)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The department strip from the hierarchy reference, with live figures. */
export async function DepartmentStrip() {
  const s = await db();
  const [stats, hods] = await Promise.all([
    branchStats(),
    s.from("department_staff").select("department_id, valid_during, staff:staff_directory(full_name)").eq("role", "hod"),
  ]);
  const hodRows = (unwrap(hods) as unknown as { department_id: string; valid_during: string; staff: { full_name: string } | null }[]).filter((h) =>
    h.valid_during.endsWith(",)"),
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((d) => {
        const hod = hodRows.find((h) => h.department_id === d.department_id)?.staff?.full_name;
        return (
          <Link
            key={d.department_id}
            href={`/academics/departments#${d.code}`}
            className="rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-pop"
            style={toneStyle(d.code)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={toneStyle(d.code, "text")}>
                {d.code}
              </span>
              <PercentText value={d.percent} />
            </div>
            <div className="mt-0.5 line-clamp-1 text-[11px] text-muted">{d.name}</div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink">
              <UserRound className="size-3.5" style={toneStyle(d.code, "text")} />
              <span className="truncate">{hod?.replace(/^(Dr\.|Prof\.) /, "") ?? "No HOD"}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export async function RegistersNeedingAttention({ departmentId }: { departmentId: string | null }) {
  const ref = await referenceDate();
  const rows = (await sessionRows(ref.date, departmentId)).filter((r) => r.display_state === "missing" || r.display_state === "pending").slice(0, 8);
  return (
    <Card>
      <CardHeader
        icon={<TriangleAlert className="size-5" />}
        title="Registers needing attention"
        description={`${formatDate(ref.date, { weekday: true })} · pending or missing`}
        action={
          <ButtonLink href={`/attendance/registers?date=${ref.date}&state=missing`} size="sm" variant="ghost">
            All <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="All registers are in">Nothing is pending or missing.</EmptyState>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-12 shrink-0 text-xs text-muted tabular-nums">{r.start_time}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {r.division_label} {r.batch_code && `· ${batchLabel(r.batch_code)}`} — {r.subject_name}
                </div>
                <div className="truncate text-xs text-muted">{r.substitute_name ?? r.staff_name}</div>
              </div>
              <RegisterBadge state={r.display_state} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
