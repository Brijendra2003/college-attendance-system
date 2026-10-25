import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { NAV } from "@/lib/nav.config";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getCollege } from "@/features/common/lookups";
import { MobileNavToggle, NavLinks } from "./nav-links";

async function visibleNav() {
  const user = await requireUser();
  const sections = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.permission === null || (Array.isArray(i.permission) ? i.permission.some((p) => can(user, p)) : can(user, i.permission))),
  })).filter((s) => s.items.length > 0);

  // Counts are RLS-scoped: an HOD only counts their own department.
  const s = await db();
  const [corrections, leave] = await Promise.all([
    can(user, "attendance.correct.approve")
      ? s.from("attendance_correction_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
      : Promise.resolve({ count: 0 }),
    can(user, "leave.student.decide")
      ? s.from("leave_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "needs_info"])
      : Promise.resolve({ count: 0 }),
  ]);
  return { sections, badges: { "/attendance/corrections": corrections.count ?? 0, "/leave": leave.count ?? 0 } };
}

async function Brand() {
  const college = await getCollege();
  return (
    <Link href="/dashboard" className="mx-3 mt-4 mb-5 flex items-center gap-3 rounded-xl bg-white/10 p-3 ring-1 ring-white/15">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-[#163a70]">
        <GraduationCap className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm leading-tight font-bold text-white">{college.short_name} Attendance</span>
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
    <div className="flex flex-col gap-2 p-4" aria-busy="true">
      <div className="mb-4 h-16 animate-pulse rounded-xl bg-white/10" />
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />
      ))}
    </div>
  );
}
