import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { departmentScope } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { PageHeader, PageSkeleton, Progress } from "@/components/ui/primitives";
import { departmentById } from "@/features/common/lookups";
import { termProgress } from "@/features/attendance/queries";
import {
  AttendanceTrend,
  BranchComparison,
  DepartmentStrip,
  FacultySubmission,
  PendingApprovals,
  RecentAudit,
  SetupHealth,
  ShortageByBranch,
  StaffLeaveList,
  Totals,
  TodayRegisters,
  TodayTimeline,
  UpcomingExams,
} from "@/features/dashboard/widgets";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function TermBar() {
  const p = termProgress();
  return (
    <div className="w-64 rounded-xl border border-line bg-white px-4 py-3">
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="font-semibold text-navy">{p.term.label}</span>
        <span className="text-muted">
          {p.done}/{p.total} days
        </span>
      </div>
      <Progress value={p.percent} tone="var(--color-primary)" />
    </div>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const first = user.name.replace(/^(Dr\.|Prof\.) /, "").split(" ")[0];
  const header = (description: string) => (
    <PageHeader eyebrow={`${greeting()}, ${first}`} title={db().college.name} description={description} actions={<TermBar />} />
  );

  if (user.roles.includes("principal")) return <PrincipalDashboard header={header("College-wide attendance, approvals and comparisons.")} />;
  if (user.roles.includes("admin")) return <AdminDashboard header={header("Setup health, data quality and recent configuration changes.")} />;
  if (user.roles.includes("operations")) return <OperationsDashboard header={header("Today's sessions, missing registers and pending work.")} />;
  if (user.roles.includes("exam_cell")) return <ExamDashboard header={header("Upcoming exams, conflicts and eligibility.")} />;
  return <HodDashboard user={user} />;
}

function PrincipalDashboard({ header }: { header: React.ReactNode }) {
  return (
    <>
      {header}
      <DepartmentStrip />
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <BranchComparison />
          <AttendanceTrend departmentId={null} title="College attendance trend" />
        </div>
        <div className="space-y-6">
          <PendingApprovals departmentId={null} showStaffLeave />
          <ShortageByBranch />
          <UpcomingExams />
        </div>
      </div>
    </>
  );
}

function AdminDashboard({ header }: { header: React.ReactNode }) {
  return (
    <>
      {header}
      <Totals departmentId={null} />
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SetupHealth />
          <BranchComparison />
        </div>
        <div className="space-y-6">
          <RecentAudit />
          <PendingApprovals departmentId={null} showStaffLeave={false} />
        </div>
      </div>
    </>
  );
}

function OperationsDashboard({ header }: { header: React.ReactNode }) {
  return (
    <>
      {header}
      <Totals departmentId={null} />
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <TodayRegisters departmentId={null} />
          <PendingApprovals departmentId={null} showStaffLeave={false} />
        </div>
        <div className="space-y-6 xl:col-span-2">
          <TodayTimeline departmentId={null} />
          <AttendanceTrend departmentId={null} />
        </div>
      </div>
    </>
  );
}

function ExamDashboard({ header }: { header: React.ReactNode }) {
  return (
    <>
      {header}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <UpcomingExams />
          <BranchComparison />
        </div>
        <ShortageByBranch />
      </div>
    </>
  );
}

function HodDashboard({ user }: { user: CurrentUser }) {
  const deptId = departmentScope(user, "attendance.view");
  const dept = deptId ? departmentById(deptId) : undefined;
  return (
    <>
      <PageHeader
        eyebrow={`${greeting()}, ${user.name.replace(/^(Dr\.|Prof\.) /, "").split(" ")[0]}`}
        title={dept ? `${dept.name}` : "Department"}
        description="Department attendance, faculty submissions and approvals."
        actions={<TermBar />}
      />
      <Totals departmentId={deptId} />
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <AttendanceTrend departmentId={deptId} title="Department attendance trend" />
          <FacultySubmission departmentId={deptId} />
        </div>
        <div className="space-y-6">
          <TodayRegisters departmentId={deptId} />
          <PendingApprovals departmentId={deptId} showStaffLeave />
          <StaffLeaveList departmentId={deptId} />
        </div>
      </div>
    </>
  );
}
