import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { departmentScope } from "@/lib/auth/permissions";
import { PageHeader, PageSkeleton, Progress, Skeleton } from "@/components/ui/primitives";
import { departmentById, getCollege } from "@/features/common/lookups";
import { termProgress } from "@/features/attendance/queries";
import {
  AttendanceTrend,
  BranchComparison,
  DepartmentStrip,
  FacultySubmission,
  PendingApprovals,
  RecentAudit,
  RegistersNeedingAttention,
  SetupHealth,
  ShortageByBranch,
  StaffLeaveList,
  Totals,
  TodayRegisters,
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

/** Each widget streams in on its own, so a slow aggregate never blocks the page (§10.3). */
function W({ children, h = "h-72" }: { children: ReactNode; h?: string }) {
  return <Suspense fallback={<Skeleton className={h} />}>{children}</Suspense>;
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

async function TermBar() {
  const p = await termProgress();
  if (!p || !p.total) return null;
  return (
    <div className="w-64 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="font-semibold text-heading">{p.label}</span>
        <span className="text-muted">
          {p.done}/{p.total} days
        </span>
      </div>
      <Progress value={(p.done / p.total) * 100} tone="var(--primary)" />
    </div>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const college = await getCollege();
  const first = user.name.replace(/^(Dr\.|Prof\.) /, "").split(" ")[0];
  const header = (title: string, description: string) => (
    <PageHeader
      eyebrow={`${greeting()}, ${first}`}
      title={title}
      description={description}
      actions={
        <Suspense fallback={<Skeleton className="h-14 w-64" />}>
          <TermBar />
        </Suspense>
      }
    />
  );

  if (user.roles.includes("principal")) return <PrincipalDashboard header={header(college.name, "College-wide attendance, approvals and comparisons.")} />;
  if (user.roles.includes("admin")) return <AdminDashboard header={header(college.name, "Setup health, data quality and recent configuration changes.")} />;
  if (user.roles.includes("operations")) return <OperationsDashboard header={header(college.name, "Today's sessions, missing registers and pending work.")} />;
  if (user.roles.includes("exam_cell")) return <ExamDashboard header={header(college.name, "Upcoming exams, conflicts and eligibility.")} />;
  return <HodDashboard user={user} header={header} />;
}

function PrincipalDashboard({ header }: { header: ReactNode }) {
  return (
    <>
      {header}
      <W h="h-48">
        <DepartmentStrip />
      </W>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <W h="h-80">
            <BranchComparison />
          </W>
          <W h="h-80">
            <AttendanceTrend departmentId={null} title="College attendance trend" />
          </W>
        </div>
        <div className="space-y-6">
          <W>
            <PendingApprovals showStaffLeave />
          </W>
          <W h="h-96">
            <ShortageByBranch />
          </W>
          <W>
            <UpcomingExams />
          </W>
        </div>
      </div>
    </>
  );
}

function AdminDashboard({ header }: { header: ReactNode }) {
  return (
    <>
      {header}
      <W h="h-24">
        <Totals departmentId={null} />
      </W>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <W>
            <SetupHealth />
          </W>
          <W h="h-80">
            <BranchComparison />
          </W>
        </div>
        <div className="space-y-6">
          <W h="h-96">
            <RecentAudit />
          </W>
          <W>
            <PendingApprovals showStaffLeave={false} />
          </W>
        </div>
      </div>
    </>
  );
}

function OperationsDashboard({ header }: { header: ReactNode }) {
  return (
    <>
      {header}
      <W h="h-24">
        <Totals departmentId={null} />
      </W>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <W h="h-96">
            <TodayRegisters departmentId={null} />
          </W>
          <W>
            <PendingApprovals showStaffLeave={false} />
          </W>
        </div>
        <div className="space-y-6 xl:col-span-2">
          <W h="h-96">
            <RegistersNeedingAttention departmentId={null} />
          </W>
          <W h="h-80">
            <AttendanceTrend departmentId={null} />
          </W>
        </div>
      </div>
    </>
  );
}

function ExamDashboard({ header }: { header: ReactNode }) {
  return (
    <>
      {header}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <W>
            <UpcomingExams />
          </W>
          <W h="h-80">
            <BranchComparison />
          </W>
        </div>
        <W h="h-96">
          <ShortageByBranch />
        </W>
      </div>
    </>
  );
}

async function HodDashboard({ user, header }: { user: CurrentUser; header: (title: string, description: string) => ReactNode }) {
  const deptId = departmentScope(user, "attendance.view");
  const dept = await departmentById(deptId);
  return (
    <>
      {header(dept?.name ?? "Department", "Department attendance, faculty submissions and approvals.")}
      <W h="h-24">
        <Totals departmentId={deptId} />
      </W>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <W h="h-80">
            <AttendanceTrend departmentId={deptId} title="Department attendance trend" />
          </W>
          <W h="h-96">
            <FacultySubmission departmentId={deptId} />
          </W>
        </div>
        <div className="space-y-6">
          <W h="h-96">
            <TodayRegisters departmentId={deptId} />
          </W>
          <W>
            <PendingApprovals showStaffLeave />
          </W>
          <W>
            <StaffLeaveList />
          </W>
        </div>
      </div>
    </>
  );
}
