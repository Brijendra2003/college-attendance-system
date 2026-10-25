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
import { departmentTones } from "@/shared/tokens";
import { formatDate, formatTime } from "@/shared/dates";
import { db, ACTIVE_YEAR_ID } from "@/lib/data/store";
import { currentEnrollments } from "@/lib/data/engine";
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
  PercentText,
  Progress,
  StatCard,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/primitives";
import {
  branchStats,
  dailyTrend,
  facultySubmission,
  recentWorkingDays,
  referenceDate,
  registerCounts,
  sessionRows,
} from "@/features/attendance/queries";
import { actorName, currentHod, deptCode, staffById } from "@/features/common/lookups";

export function Totals({ departmentId }: { departmentId: string | null }) {
  const store = db();
  const enr = currentEnrollments();
  const students = store.students.filter((s) => s.status === "active" && (!departmentId || enr.get(s.id)?.departmentId === departmentId)).length;
  const staff = store.staff.filter((s) => s.status !== "inactive" && (!departmentId || s.departmentId === departmentId)).length;
  const divisions = store.divisions.filter((d) => d.academicYearId === ACTIVE_YEAR_ID && (!departmentId || d.departmentId === departmentId));
  const divIds = new Set(divisions.map((d) => d.id));
  const batches = store.batches.filter((b) => divIds.has(b.divisionId)).length;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatCard label="Students" value={formatNumber(students)} hint="active enrollments" icon={<GraduationCap className="size-5" />} href="/people/students" />
      <StatCard label="Teaching staff" value={formatNumber(staff)} hint={departmentId ? "in department" : "across 12 branches"} icon={<UserRound className="size-5" />} tone="#6d3fd6" toneBg="#f2edff" href="/people/staff" />
      <StatCard label="Branches" value={departmentId ? 1 : store.departments.length} hint="departments" icon={<Building className="size-5" />} tone="#0e8a7e" toneBg="#e5f6f3" href="/academics/departments" />
      <StatCard label="Divisions" value={divisions.length} hint="FE to BE" icon={<UsersRound className="size-5" />} tone="#d96c0c" toneBg="#fff3e3" href="/academics/classes" />
      <StatCard label="Batches" value={batches} hint="practical groups" icon={<Layers className="size-5" />} tone="#0b85a6" toneBg="#e5f6fb" href="/academics/classes" />
    </div>
  );
}

export function TodayRegisters({ departmentId }: { departmentId: string | null }) {
  const ref = referenceDate();
  const rows = sessionRows(ref.date, departmentId);
  const c = registerCounts(rows);
  const presentPct = c.roster ? (c.present / c.roster) * 100 : null;
  return (
    <Card>
      <CardHeader
        icon={<ClipboardCheck className="size-5" />}
        title={ref.isToday ? "Today's sessions" : `Last working day · ${formatDate(ref.date, { weekday: true })}`}
        description={ref.isToday ? "Live register submission status" : `No classes today (${formatDate(ref.today, { weekday: true })}). Showing the most recent working day.`}
        action={
          <ButtonLink href={`/attendance/registers?date=${ref.date}`} size="sm" variant="ghost">
            Registers <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      <CardBody>
        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-navy-50 py-2.5">
            <div className="text-xl font-bold text-navy tabular-nums">{c.total}</div>
            <div className="text-[11px] text-muted">scheduled</div>
          </div>
          <div className="rounded-lg bg-ok-soft py-2.5">
            <div className="text-xl font-bold text-green-800 tabular-nums">{c.held}</div>
            <div className="text-[11px] text-muted">submitted</div>
          </div>
          <div className="rounded-lg bg-bad-soft py-2.5">
            <div className="text-xl font-bold text-red-800 tabular-nums">{c.missing}</div>
            <div className="text-[11px] text-muted">missing</div>
          </div>
        </div>
        <SegmentedBar
          segments={[
            { label: "Submitted", value: c.held, color: "#16a34a" },
            { label: "Pending", value: c.pending, color: "#d97706" },
            { label: "Missing", value: c.missing, color: "#dc2626" },
            { label: "Upcoming", value: c.upcoming, color: "#94a3b8" },
            { label: "Cancelled", value: c.cancelled, color: "#475569" },
            { label: "Reopened", value: c.reopened, color: "#7c3aed" },
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

export function BranchComparison() {
  const data = branchStats();
  const threshold = db().policy.minPercent;
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
        <BranchBarChart data={data} threshold={threshold} />
      </CardBody>
    </Card>
  );
}

export function AttendanceTrend({ departmentId, title = "Attendance trend" }: { departmentId: string | null; title?: string }) {
  const days = recentWorkingDays(12);
  const data = dailyTrend(days, departmentId);
  return (
    <Card>
      <CardHeader icon={<CalendarClock className="size-5" />} title={title} description="Students present across submitted registers, last 12 working days" />
      <CardBody>
        <TrendLineChart data={data} threshold={db().policy.minPercent} />
      </CardBody>
    </Card>
  );
}

export function ShortageByBranch() {
  const data = branchStats().sort((a, b) => b.shortage - a.shortage);
  const max = Math.max(...data.map((d) => d.shortage), 1);
  return (
    <Card>
      <CardHeader
        icon={<TriangleAlert className="size-5" />}
        title="Shortage by branch"
        description={`Students below ${db().policy.minPercent}% in at least one subject`}
        action={
          <ButtonLink href="/attendance/shortage" size="sm" variant="ghost">
            List <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      <CardBody className="space-y-2.5">
        {data.map((d) => (
          <Link key={d.code} href={`/attendance/shortage?dept=${d.departmentId}`} className="flex items-center gap-3 rounded-md hover:bg-navy-50">
            <DeptChip code={d.code} />
            <div className="flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-line-soft">
                <div className="h-full rounded-full" style={{ width: `${(d.shortage / max) * 100}%`, background: departmentTones[d.code].fg }} />
              </div>
            </div>
            <span className="w-24 text-right text-xs text-muted">
              <b className="text-ink tabular-nums">{d.shortage}</b> of {d.students}
            </span>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

export function PendingApprovals({ departmentId, showStaffLeave }: { departmentId: string | null; showStaffLeave: boolean }) {
  const store = db();
  const deptOf = new Map(store.students.map((s) => [s.id, s.departmentId]));
  const inScope = (studentId: string) => !departmentId || deptOf.get(studentId) === departmentId;
  const corrections = store.corrections.filter((c) => c.status === "pending" && inScope(c.studentId)).length;
  const leave = store.leaveRequests.filter((l) => (l.status === "pending" || l.status === "needs_info") && inScope(l.studentId)).length;
  const staffLeave = store.staffLeave.filter((l) => l.status === "pending" && (!departmentId || staffById(l.staffId)?.departmentId === departmentId)).length;
  const drafts = store.timetableVersions.filter((v) => v.status === "draft" && (!departmentId || v.departmentId === departmentId)).length;
  const items = [
    { label: "Attendance corrections", count: corrections, href: "/attendance/corrections", icon: FilePenLine, tone: "#7c3aed" },
    { label: "Student leave", count: leave, href: "/leave", icon: CalendarX, tone: "#d97706" },
    ...(showStaffLeave ? [{ label: "Staff leave", count: staffLeave, href: "/leave?tab=staff", icon: UserRound, tone: "#0b85a6" }] : []),
    { label: "Draft timetables", count: drafts, href: "/timetable", icon: CalendarClock, tone: "#1d4ed8" },
  ];
  return (
    <Card>
      <CardHeader icon={<ShieldCheck className="size-5" />} title="Pending approvals" description="Waiting on you or your team" />
      <ul className="divide-y divide-line-soft">
        {items.map((i) => (
          <li key={i.label}>
            <Link href={i.href} className="flex items-center gap-3 px-5 py-3 hover:bg-navy-50/60">
              <span className="grid size-8 place-items-center rounded-lg" style={{ background: `${i.tone}14`, color: i.tone }}>
                <i.icon className="size-4" />
              </span>
              <span className="flex-1 text-sm text-ink">{i.label}</span>
              <span className="text-lg font-bold text-navy tabular-nums">{i.count}</span>
              <ArrowRight className="size-4 text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function UpcomingExams() {
  const exams = db().exams.filter((e) => e.status !== "completed");
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
      <ul className="divide-y divide-line-soft">
        {exams.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-5 py-3">
            <div className="w-14 shrink-0 rounded-lg bg-navy-50 py-1 text-center">
              <div className="text-[10px] font-semibold text-primary uppercase">{formatDate(e.startDate).split(" ")[1]}</div>
              <div className="text-lg leading-none font-bold text-navy">{formatDate(e.startDate).split(" ")[0]}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{e.title}</div>
              <div className="text-xs text-muted">
                {formatDate(e.startDate)} – {formatDate(e.endDate)} · {e.sessions} papers
              </div>
            </div>
            {e.conflicts > 0 ? <Badge tone="bad">{e.conflicts} conflicts</Badge> : <Badge tone={e.status === "published" ? "ok" : "neutral"}>{e.status}</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function FacultySubmission({ departmentId }: { departmentId: string | null }) {
  const rows = facultySubmission(departmentId, recentWorkingDays(10));
  return (
    <Card>
      <CardHeader
        icon={<ClipboardCheck className="size-5" />}
        title="Faculty submission status"
        description="Registers over the last 10 working days, lowest on-time rate first"
        action={
          <ButtonLink href="/attendance/registers?state=missing" size="sm" variant="ghost">
            Missing <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
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
            <TR key={r.staffId}>
              <TD>
                <Link href={`/people/staff/${r.staffId}`} className="font-medium text-ink hover:text-primary">
                  {r.name}
                </Link>
                <div className="text-xs text-muted">{r.designation}</div>
              </TD>
              <TD className="text-right tabular-nums">{r.onTime}</TD>
              <TD className="text-right tabular-nums">{r.late}</TD>
              <TD className="text-right tabular-nums">{r.missing ? <span className="font-semibold text-bad">{r.missing}</span> : 0}</TD>
              <TD>
                <div className="flex items-center gap-2">
                  <Progress value={r.onTimePercent} tone={r.onTimePercent < 80 ? "var(--color-warn)" : "var(--color-ok)"} />
                  <span className="w-11 text-right text-xs tabular-nums">{r.onTimePercent.toFixed(0)}%</span>
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

export function StaffLeaveList({ departmentId }: { departmentId: string | null }) {
  const rows = db().staffLeave.filter((l) => !departmentId || staffById(l.staffId)?.departmentId === departmentId);
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
      {rows.length === 0 ? (
        <EmptyState title="No staff leave requests" />
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.slice(0, 5).map((l) => {
            const s = staffById(l.staffId)!;
            return (
              <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                <DeptChip code={deptCode(s.departmentId)} soft />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted">
                    {formatDate(l.fromDate)}
                    {l.toDate !== l.fromDate && ` – ${formatDate(l.toDate)}`} · {l.reason}
                  </div>
                </div>
                <Badge tone={l.status === "pending" ? "warn" : l.status === "approved" ? "ok" : "bad"}>{l.status}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function SetupHealth() {
  const store = db();
  const enr = currentEnrollments();
  const noEnrollment = store.students.filter((s) => s.status === "active" && !enr.has(s.id)).length;
  const pendingGuardians = store.guardianLinks.filter((l) => l.status === "pending").length;
  const noPrn = store.students.filter((s) => s.status === "active" && !s.prn).length;
  const drafts = store.timetableVersions.filter((v) => v.status === "draft").length;
  const divisionsNoTeacher = store.divisions.filter((d) => d.academicYearId === ACTIVE_YEAR_ID && !d.classTeacherId).length;
  const checks = [
    { label: "Active students with no enrollment", value: noEnrollment, href: "/people/students", severity: noEnrollment ? "bad" : "ok" },
    { label: "Guardian links awaiting verification", value: pendingGuardians, href: "/people/guardians?status=pending", severity: pendingGuardians ? "warn" : "ok" },
    { label: "Students without MU PRN (FE allowed)", value: noPrn, href: "/people/students?flag=no_prn", severity: noPrn ? "info" : "ok" },
    { label: "Timetable drafts not yet published", value: drafts, href: "/timetable", severity: drafts ? "warn" : "ok" },
    { label: "Divisions without a class teacher", value: divisionsNoTeacher, href: "/academics/classes", severity: divisionsNoTeacher ? "bad" : "ok" },
  ] as const;
  return (
    <Card>
      <CardHeader icon={<ShieldCheck className="size-5" />} title="Setup health" description="Blueprint validation and data quality" />
      <ul className="divide-y divide-line-soft">
        {checks.map((c) => (
          <li key={c.label}>
            <Link href={c.href} className="flex items-center gap-3 px-5 py-3 hover:bg-navy-50/60">
              <Badge tone={c.severity}>{c.severity === "ok" ? "OK" : c.severity === "bad" ? "Fix" : c.severity === "warn" ? "Review" : "Info"}</Badge>
              <span className="flex-1 text-sm">{c.label}</span>
              <span className="font-bold text-navy tabular-nums">{formatNumber(c.value)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RecentAudit() {
  const entries = db().audit.slice(0, 6);
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
      <ul className="divide-y divide-line-soft">
        {entries.map((a) => (
          <li key={a.id} className="px-5 py-3">
            <div className="text-sm text-ink">{a.summary}</div>
            <div className="mt-0.5 text-xs text-muted">
              {a.actorName} · {relativeTime(a.at)}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The department strip from the hierarchy reference, with live figures. */
export function DepartmentStrip() {
  const stats = new Map(branchStats().map((b) => [b.departmentId, b]));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {db().departments.map((d) => {
        const t = departmentTones[d.code];
        const s = stats.get(d.id);
        const hod = currentHod(d.id);
        return (
          <Link
            key={d.id}
            href={`/academics/departments#${d.code}`}
            className="rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-pop"
            style={{ background: t.bg, borderColor: t.border }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: t.fg }}>
                {d.code}
              </span>
              <PercentText value={s?.percent ?? null} />
            </div>
            <div className="mt-0.5 line-clamp-1 text-[11px] text-muted">{d.name}</div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink">
              <UserRound className="size-3.5" style={{ color: t.fg }} />
              <span className="truncate">{hod?.staff.name.replace(/^(Dr\.|Prof\.) /, "") ?? "No HOD"}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function TodayTimeline({ departmentId }: { departmentId: string | null }) {
  const ref = referenceDate();
  const rows = sessionRows(ref.date, departmentId).filter((r) => r.state === "missing" || r.state === "pending").slice(0, 8);
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
              <span className="w-16 shrink-0 text-xs text-muted tabular-nums">{formatTime(r.start)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {r.division} {r.batch && `· ${r.batch}`} — {r.subjectName}
                </div>
                <div className="truncate text-xs text-muted">{actorName(r.staffId)}</div>
              </div>
              <Badge tone={r.state === "missing" ? "bad" : "warn"}>{r.state}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
