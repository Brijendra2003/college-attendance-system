"use server";

import { z } from "zod";
import { AppError } from "@/shared/errors";
import { action } from "@/lib/auth/action";
import { departmentScope } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { db, rpc, unwrap } from "@/lib/db";

/**
 * Provisions mobile-app accounts for staff or students that don't have one
 * yet (§12: a separate, re-runnable step after imports — Auth admin calls
 * can't join the database transaction). Each person gets an account with no
 * usable password and a password-setup email. Parent logins (email + a
 * password the admin hands over) are issued per guardian from People →
 * Guardians (features/guardians/actions.ts).
 *
 * The rows to provision are read as the signed-in user (so RLS and department
 * scope apply); only the Auth/profile writes use the service role.
 */
const BATCH = 50;

export const provisionAccounts = action({
  permission: ["staff.manage", "students.manage"],
  schema: z.object({ kind: z.enum(["staff", "students"]) }),
  async run({ input, user }) {
    const perm = input.kind === "staff" ? "staff.manage" : "students.manage";
    if (!user.grants[perm]) throw new AppError("FORBIDDEN");
    const scope = departmentScope(user, perm);
    const s = await db();
    const rows =
      input.kind === "staff"
        ? (unwrap(
            await (scope ? s.from("staff").select("id, full_name, email").is("user_id", null).neq("status", "inactive").not("email", "is", null).eq("home_department_id", scope) : s.from("staff").select("id, full_name, email").is("user_id", null).neq("status", "inactive").not("email", "is", null)).limit(BATCH),
          ) as { id: string; full_name: string; email: string }[])
        : (unwrap(
            await (scope ? s.from("students").select("id, full_name, email").is("user_id", null).eq("status", "active").not("email", "is", null).eq("admitted_department_id", scope) : s.from("students").select("id, full_name, email").is("user_id", null).eq("status", "active").not("email", "is", null)).limit(BATCH),
          ) as { id: string; full_name: string; email: string }[]);

    const admin = createAdminClient();
    let created = 0;
    const failed: string[] = [];
    for (const r of rows) {
      const res = await admin.auth.admin.createUser({ email: r.email, email_confirm: true, user_metadata: { name: r.full_name } });
      const uid = res.data.user?.id;
      if (!uid) {
        failed.push(`${r.full_name} (${res.error?.message ?? "unknown error"})`);
        continue;
      }
      const roles = input.kind === "staff" ? ["professor"] : ["student"];
      const writes = await Promise.all([
        admin.from("profiles").upsert({ id: uid, display_name: r.full_name, email: r.email }),
        admin.from("user_roles").upsert(roles.map((role) => ({ user_id: uid, role }))),
        admin.from(input.kind).update({ user_id: uid }).eq("id", r.id),
      ]);
      if (writes.some((w) => w.error)) {
        failed.push(`${r.full_name} (profile link failed)`);
        continue;
      }
      // Password-setup email (Supabase Auth's reset flow doubles as the invite).
      await admin.auth.resetPasswordForEmail(r.email).catch(() => undefined);
      created++;
    }
    await rpc("log_account_provisioning", { p_kind: input.kind, p_created: created, p_failed: failed.length });
    return { created, failed, more: rows.length === BATCH };
  },
  success: (r) =>
    `${r.created} accounts created and invited.${r.failed.length ? ` ${r.failed.length} failed: ${r.failed.slice(0, 3).join("; ")}.` : ""}${r.more ? " Run again for the next batch." : ""}`,
});
