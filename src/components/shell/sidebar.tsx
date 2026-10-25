import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { NAV } from "@/lib/nav.config";
import { can, departmentScope } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/data/store";
import { MobileNavToggle, NavLinks } from "./nav-links";

async function visibleNav() {
  const user = await requireUser();
  const sections = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.permission === null || can(user, i.permission)),
  })).filter((s) => s.items.length > 0);

  const store = db();
  const correctionScope = departmentScope(user, "attendance.correct.approve");
  const leaveScope = departmentScope(user, "leave.student.decide");
  const studentDept = new Map(store.students.map((s) => [s.id, s.departmentId]));
  const badges: Record<string, number> = {
    "/attendance/corrections": store.corrections.filter(
      (c) => c.status === "pending" && (correctionScope === null || studentDept.get(c.studentId) === correctionScope),
    ).length,
    "/leave": store.leaveRequests.filter(
      (l) => (l.status === "pending" || l.status === "needs_info") && (leaveScope === null || studentDept.get(l.studentId) === leaveScope),
    ).length,
  };
  return { sections, badges };
}

function Brand() {
  const college = db().college;
  return (
    <Link href="/dashboard" className="mx-3 mt-4 mb-5 flex items-center gap-3 rounded-xl bg-white/10 p-3 ring-1 ring-white/15">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-navy">
        <GraduationCap className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm leading-tight font-bold text-white">{college.shortName} Attendance</span>
        <span className="block truncate text-[11px] text-blue-100/75">{college.name}</span>
      </span>
    </Link>
  );
}

export async function Sidebar() {
  const { sections, badges } = await visibleNav();
  return (
    <>
      <Brand />
      <NavLinks sections={sections} badges={badges} />
    </>
  );
}

export async function MobileSidebar() {
  const { sections, badges } = await visibleNav();
  return (
    <MobileNavToggle>
      <Brand />
      <NavLinks sections={sections} badges={badges} />
    </MobileNavToggle>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="mb-4 h-16 animate-pulse rounded-xl bg-white/10" />
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />
      ))}
    </div>
  );
}
