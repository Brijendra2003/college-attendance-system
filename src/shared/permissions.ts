// Permission keys and the default role → permission → scope matrix (§5.2, §5.3).
// Seeded into `permissions` / `role_permissions`; Admin can edit the grants.

export const PERMISSIONS = [
  "settings.manage",
  "roles.manage",
  "audit.view",
  "blueprint.view",
  "blueprint.manage",
  "blueprint.activate",
  "calendar.manage",
  "year.rollover",
  "students.view",
  "students.manage",
  "students.import",
  "students.promote",
  "guardians.manage",
  "staff.view",
  "staff.manage",
  "staff.import",
  "assignments.manage",
  "timetable.view",
  "timetable.edit",
  "timetable.publish",
  "sessions.manage",
  "attendance.view",
  "attendance.mark",
  "attendance.override",
  "attendance.reopen",
  "attendance.correct.approve",
  "attendance.policy.manage",
  "leave.student.decide",
  "leave.staff.decide",
  "exams.view",
  "exams.manage",
  "exams.attendance.mark",
  "announcements.college",
  "announcements.class",
  "reports.view",
  "reports.export",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const SCOPES = ["all", "department", "assigned", "self", "linked"] as const;
export type Scope = (typeof SCOPES)[number];

export const ROLES = [
  "principal",
  "admin",
  "operations",
  "exam_cell",
  "hod",
  "professor",
  "student",
  "parent",
] as const;
export type Role = (typeof ROLES)[number];

export const WEB_ROLES: Role[] = ["principal", "admin", "operations", "exam_cell", "hod"];

export const ROLE_LABELS: Record<Role, string> = {
  principal: "Principal",
  admin: "Admin",
  operations: "Operations",
  exam_cell: "Exam Cell",
  hod: "HOD",
  professor: "Professor",
  student: "Student",
  parent: "Parent",
};

export type Grants = Partial<Record<Permission, Scope>>;

const all = (perms: Permission[]): Grants =>
  Object.fromEntries(perms.map((p) => [p, "all" as Scope]));
const dept = (perms: Permission[]): Grants =>
  Object.fromEntries(perms.map((p) => [p, "department" as Scope]));

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Grants> = {
  principal: all([...PERMISSIONS]),
  admin: all(PERMISSIONS.filter((p) => p !== "leave.staff.decide")),
  operations: all([
    "blueprint.view",
    "students.view",
    "students.manage",
    "students.import",
    "guardians.manage",
    "staff.view",
    "staff.manage",
    "staff.import",
    "assignments.manage",
    "timetable.view",
    "timetable.edit",
    "timetable.publish",
    "sessions.manage",
    "attendance.view",
    "attendance.override",
    "attendance.reopen",
    "attendance.correct.approve",
    "leave.student.decide",
    "exams.view",
    "announcements.college",
    "reports.view",
    "reports.export",
  ]),
  exam_cell: all([
    "blueprint.view",
    "students.view",
    "staff.view",
    "timetable.view",
    "attendance.view",
    "exams.view",
    "exams.manage",
    "exams.attendance.mark",
    "announcements.college",
    "reports.view",
    "reports.export",
  ]),
  hod: dept([
    "blueprint.view",
    "students.view",
    "staff.view",
    "assignments.manage",
    "timetable.view",
    "timetable.edit",
    "sessions.manage",
    "attendance.view",
    "attendance.reopen",
    "attendance.correct.approve",
    "leave.student.decide",
    "leave.staff.decide",
    "exams.view",
    "announcements.class",
    "reports.view",
    "reports.export",
  ]),
  professor: {
    "attendance.mark": "assigned",
    "attendance.view": "assigned",
    "timetable.view": "assigned",
  },
  student: { "attendance.view": "self", "timetable.view": "self" },
  parent: { "attendance.view": "linked" },
};

/** Broader scopes win when a user holds several roles. */
const SCOPE_RANK: Record<Scope, number> = { all: 4, department: 3, assigned: 2, self: 1, linked: 1 };

export function resolveScope(
  grants: Record<Role, Grants>,
  roles: Role[],
  perm: Permission,
): Scope | null {
  let best: Scope | null = null;
  for (const role of roles) {
    const s = grants[role]?.[perm];
    if (s && (!best || SCOPE_RANK[s] > SCOPE_RANK[best])) best = s;
  }
  return best;
}
