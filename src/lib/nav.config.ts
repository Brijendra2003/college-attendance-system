import type { Permission } from "@/shared/permissions";

// The sidebar renders only entries the user holds the permission for (§5.4).
// Icons are lucide-react names resolved in components/shell/nav-icon.tsx.
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission: Permission | null;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "layout-dashboard", permission: null }],
  },
  {
    label: "Academics",
    items: [
      { href: "/academics/hierarchy", label: "Hierarchy", icon: "network", permission: "blueprint.view" },
      { href: "/academics/departments", label: "Departments", icon: "building", permission: "blueprint.view" },
      { href: "/academics/classes", label: "Divisions & batches", icon: "users-round", permission: "blueprint.view" },
      { href: "/academics/subjects", label: "Subjects", icon: "book-open", permission: "blueprint.view" },
      { href: "/academics/calendar", label: "Years & calendar", icon: "calendar-days", permission: "blueprint.view" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/people/students", label: "Students", icon: "graduation-cap", permission: "students.view" },
      { href: "/people/staff", label: "Staff", icon: "briefcase", permission: "staff.view" },
      { href: "/people/guardians", label: "Guardians", icon: "shield-check", permission: "guardians.manage" },
      { href: "/people/imports", label: "Imports", icon: "file-up", permission: "students.import" },
    ],
  },
  {
    label: "Timetable",
    items: [
      { href: "/timetable", label: "Timetables", icon: "table-2", permission: "timetable.view" },
      { href: "/timetable/sessions", label: "Session board", icon: "clock", permission: "sessions.manage" },
    ],
  },
  {
    label: "Attendance",
    items: [
      { href: "/attendance", label: "Overview", icon: "chart-column", permission: "attendance.view" },
      { href: "/attendance/registers", label: "Registers", icon: "clipboard-check", permission: "attendance.view" },
      { href: "/attendance/corrections", label: "Corrections", icon: "file-pen-line", permission: "attendance.correct.approve" },
      { href: "/attendance/shortage", label: "Shortage & detention", icon: "triangle-alert", permission: "attendance.view" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/exams", label: "Exams", icon: "notebook-pen", permission: "exams.view" },
      { href: "/leave", label: "Leave", icon: "calendar-x", permission: "leave.student.decide" },
      { href: "/announcements", label: "Announcements", icon: "megaphone", permission: null },
      { href: "/reports", label: "Reports", icon: "file-spreadsheet", permission: "reports.view" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/audit", label: "Audit log", icon: "scroll-text", permission: "audit.view" },
      { href: "/settings", label: "Settings", icon: "settings", permission: "settings.manage" },
    ],
  },
];
