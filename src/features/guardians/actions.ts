"use server";

import { randomInt } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/shared/errors";
import { action } from "@/lib/auth/action";
import { db, rpc, unwrap } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

// Links are verified by Operations against admission records (§11.5). There is
// no self-linking. Verifying a link does not create a login: parents sign in
// with an email and a password issued by the college (createGuardianLogin).
export const setGuardianLink = action({
  permission: "guardians.manage",
  schema: z.object({ linkId: z.uuid(), status: z.enum(["verified", "revoked"]) }),
  async run({ input }) {
    await rpc("set_guardian_link_status", { p_link: input.linkId, p_status: input.status });
    return input.status;
  },
  success: (s) => (s === "verified" ? "Verified. Create the guardian's app login to give them access." : "Link revoked. The guardian loses access immediately."),
});

export interface GuardianCredentials {
  name: string;
  email: string;
  /** Shown once to the admin; null when an existing account was linked. */
  password: string | null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** 12 characters without look-alikes (0/O, 1/l/I), always mixing upper, lower and digits. */
function temporaryPassword(): string {
  for (;;) {
    const p = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (/[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p)) return p;
  }
}

interface GuardianRow {
  id: string;
  full_name: string;
  user_id: string | null;
  guardian_links: { status: string }[];
}

/** Read as the signed-in user, so RLS decides who may act on this guardian. */
async function guardianFor(id: string): Promise<GuardianRow> {
  const s = await db();
  const g = unwrap(await s.from("guardians").select("id, full_name, user_id, guardian_links(status)").eq("id", id).maybeSingle()) as GuardianRow | null;
  if (!g) throw new AppError("NOT_FOUND");
  return g;
}

/**
 * Creates the parent's app login: email as username, a generated password the
 * admin hands over. When the email already belongs to an account (a parent
 * who is also staff), that account gets the parent role instead and keeps its
 * password. Service-role use: docs/service-role-usage.md.
 */
export const createGuardianLogin = action({
  permission: "guardians.manage",
  schema: z.object({ guardianId: z.uuid(), email: z.email("Enter the parent's email address") }),
  async run({ input }): Promise<GuardianCredentials> {
    const g = await guardianFor(input.guardianId);
    if (g.user_id) throw new AppError("DUPLICATE", "This guardian already has an app login. Use Reset password instead.");
    if (!g.guardian_links.some((l) => l.status === "verified")) throw new AppError("VALIDATION", "Verify the guardian's link to a student first.");
    const email = input.email.trim().toLowerCase();
    const admin = createAdminClient();

    const existing = unwrap(
      await admin.from("profiles").select("id").ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle(),
    ) as { id: string } | null;
    let uid = existing?.id;
    let password: string | null = null;
    if (!uid) {
      password = temporaryPassword();
      const res = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: g.full_name } });
      uid = res.data.user?.id;
      if (!uid) throw new AppError("DUPLICATE", `Could not create the login: ${res.error?.message ?? "unknown error"}`);
      const profile = await admin.from("profiles").insert({ id: uid, display_name: g.full_name, email });
      if (profile.error) {
        await admin.auth.admin.deleteUser(uid);
        throw new Error(`profile insert failed: ${profile.error.message}`);
      }
    }
    // Link first: it is the step that can conflict (one login per guardian record).
    const link = await admin.from("guardians").update({ user_id: uid, email }).eq("id", g.id).is("user_id", null);
    if (link.error) {
      if (password) await admin.auth.admin.deleteUser(uid);
      throw new AppError("DUPLICATE", link.error.code === "23505" ? "That email's login is already linked to another guardian." : "Could not link the login. Try again.");
    }
    const role = await admin.from("user_roles").upsert({ user_id: uid, role: "parent" });
    if (role.error) throw new Error(`parent role failed: ${role.error.message}`);
    await rpc("log_guardian_account", { p_guardian: g.id, p_event: password ? "created" : "linked" });
    return { name: g.full_name, email, password };
  },
});

/** Issues a new password for a parent-only login (staff/student logins are reset from their own records). */
export const resetGuardianPassword = action({
  permission: "guardians.manage",
  schema: z.object({ guardianId: z.uuid() }),
  async run({ input }): Promise<GuardianCredentials> {
    const g = await guardianFor(input.guardianId);
    if (!g.user_id) throw new AppError("NOT_FOUND", "This guardian has no app login yet.");
    const admin = createAdminClient();
    const roles = (unwrap(await admin.from("user_roles").select("role").eq("user_id", g.user_id)) as { role: string }[]).map((r) => r.role);
    if (roles.some((r) => r !== "parent")) {
      throw new AppError("FORBIDDEN", "This login is also a staff or student account. The person resets it with “Forgot password”.");
    }
    const password = temporaryPassword();
    const res = await admin.auth.admin.updateUserById(g.user_id, { password });
    if (res.error || !res.data.user) throw new Error(`password reset failed: ${res.error?.message}`);
    await rpc("log_guardian_account", { p_guardian: g.id, p_event: "password_reset" });
    return { name: g.full_name, email: res.data.user.email ?? "", password };
  },
});
