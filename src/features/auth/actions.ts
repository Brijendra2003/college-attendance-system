"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/auth/action";

const signInSchema = z.object({
  email: z.email("Enter your college email"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

function claimsOf(accessToken: string): { app_roles?: string[] } {
  try {
    return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
  } catch {
    return {};
  }
}

/** Only same-site paths are allowed as a post-login destination. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

/** Only a credentials error says "incorrect": an unreachable or misconfigured Auth server must not look like a typo. */
function signInError(error: { code?: string; status?: number; name?: string; message: string } | null): string {
  const code = error?.code;
  if (code === "invalid_credentials" || (!code && error?.status === 400)) return "Email or password is incorrect.";
  if (code === "email_not_confirmed") return "This account isn't confirmed yet. Ask the college office to confirm it.";
  if (code === "too_many_requests" || code === "over_request_rate_limit") return "Too many attempts. Wait a minute and try again.";
  if (code === "user_banned") return "This account has been deactivated.";
  console.error("[signIn]", error?.status, code, error?.message);
  // The code (never the raw message) tells the admin which setting is wrong.
  return `Couldn't reach the sign-in service (${code ?? error?.name ?? "unknown"}${error?.status ? `, ${error.status}` : ""}). Try again; if it keeps happening, tell the admin.`;
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error || !data.session) return { ok: false, error: signInError(error) };
  const roles = claimsOf(data.session.access_token).app_roles ?? [];
  if (roles.includes("principal") || roles.includes("admin")) redirect(`/auth/mfa?next=${encodeURIComponent(safeNext(parsed.data.next))}`);
  redirect(safeNext(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ── TOTP MFA (§6) ────────────────────────────────────────────────────────
export interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export async function startEnrollment(): Promise<ActionResult<Enrollment>> {
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Clear abandoned, unverified attempts so the user isn't left with stale factors.
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`, issuer: "SJCEM Attendance" });
  if (error || !data) return { ok: false, error: "Could not start authenticator setup. Try again." };
  return { ok: true, data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri } };
}

const verifySchema = z.object({
  factorId: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  next: z.string().optional(),
});

export async function verifyMfa(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = verifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter the 6-digit code" };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) return { ok: false, error: "That code didn't match. Check the time on your phone and try the newest code." };
  redirect(safeNext(parsed.data.next));
}
