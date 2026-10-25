import "server-only";
import { redirect } from "next/navigation";
import type { Permission, Scope } from "@/shared/permissions";
import { AppError } from "@/shared/errors";
import { requireUser, type CurrentUser } from "./session";

// UI-level checks (navigation, page gates). The database enforces the same
// grants through RLS and app.require() — this layer is a convenience (§5.4).

export function scopeOf(user: CurrentUser, perm: Permission): Scope | null {
  return user.grants[perm] ?? null;
}

export function can(user: CurrentUser, perm: Permission): boolean {
  const s = scopeOf(user, perm);
  return s === "all" || s === "department";
}

export async function requirePermission(perm: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, perm)) redirect(`/denied?p=${encodeURIComponent(perm)}`);
  return user;
}

/** null = whole college, otherwise the only department the user may see. */
export function departmentScope(user: CurrentUser, perm: Permission): string | null {
  const scope = scopeOf(user, perm);
  if (scope === "all") return null;
  return user.departmentId ?? "00000000-0000-0000-0000-000000000000";
}

export function assertDepartment(user: CurrentUser, perm: Permission, departmentId: string) {
  const only = departmentScope(user, perm);
  if (only !== null && only !== departmentId) throw new AppError("OUT_OF_SCOPE");
}
