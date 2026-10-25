/**
 * Creates the first Admin (or Principal) account on a fresh deployment (§6).
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/bootstrap-admin.ts --email admin@college.edu.in --name "Full Name" [--role admin|principal]
 *
 * Prints a one-time temporary password. The person signs in, is sent to TOTP
 * enrolment (MFA is required for Admin/Principal), then runs the setup wizard.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = opt("email");
const name = opt("name");
const role = opt("role") ?? "admin";

if (!url || !key || !email || !name || !["admin", "principal"].includes(role)) {
  console.error('Usage: bootstrap-admin --email <email> --name "<full name>" [--role admin|principal]  (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomBytes(12).toString("base64url");

const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
if (created.error || !created.data.user) {
  console.error("Could not create the user:", created.error?.message);
  process.exit(1);
}
const id = created.data.user.id;
const profile = await admin.from("profiles").insert({ id, display_name: name, email });
const roleRow = await admin.from("user_roles").insert({ user_id: id, role });
if (profile.error || roleRow.error) {
  console.error("User created but profile/role failed:", profile.error?.message ?? roleRow.error?.message);
  process.exit(1);
}
console.log(`\n${role === "admin" ? "Admin" : "Principal"} account created for ${email}`);
console.log(`Temporary password (shown once): ${password}`);
console.log("Sign in, enrol an authenticator app, then change the password from the password-reset email.\n");
