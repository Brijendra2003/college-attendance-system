import "server-only";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { WEB_ROLES, type Grants, type Role } from "@/shared/permissions";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  /** effective permission → broadest scope, read live from role_permissions (§5.5) */
  grants: Grants;
  staffId: string | null;
  /** department the user heads today (HOD scope) */
  departmentId: string | null;
  aal: "aal1" | "aal2";
  mfaRequired: boolean;
  setupCompleted: boolean;
}

interface WhoAmI {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  roles: Role[];
  grants: Grants;
  staff_id: string | null;
  department_ids: string[];
  aal: "aal1" | "aal2";
  mfa_required: boolean;
  setup_completed: boolean;
}

/** Identity comes from verified JWT claims, never from getSession() (§6). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Everything behind the session is live data rendered per request. Mark it
  // dynamic first: getClaims() checks token expiry against the clock.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return null;
  const { data: me } = await supabase.rpc("whoami");
  const w = me as WhoAmI | null;
  if (!w || !w.is_active) return null;
  return {
    id: w.id,
    name: w.name,
    email: w.email,
    roles: w.roles,
    grants: w.grants,
    staffId: w.staff_id,
    departmentId: w.department_ids[0] ?? null,
    aal: w.aal,
    mfaRequired: w.mfa_required,
    setupCompleted: w.setup_completed,
  };
});

/** Principal and Admin must complete TOTP before using the portal (§6, §17). */
export function needsMfa(user: CurrentUser): boolean {
  return user.mfaRequired && user.aal !== "aal2" && user.roles.some((r) => r === "principal" || r === "admin");
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.roles.some((r) => WEB_ROLES.includes(r))) redirect("/use-mobile-app");
  if (needsMfa(user)) redirect("/auth/mfa");
  if (!user.setupCompleted) redirect(user.roles.includes("admin") || user.roles.includes("principal") ? "/setup" : "/auth/not-ready");
  return user;
}
