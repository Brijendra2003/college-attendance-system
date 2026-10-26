"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, UserPlus } from "lucide-react";
import type { ActionResult } from "@/lib/auth/action";
import { buttonClass } from "@/components/ui/primitives";
import { Dialog, Field, Input, SubmitButton } from "@/components/ui/forms";
import { createGuardianLogin, resetGuardianPassword, type GuardianCredentials } from "./actions";

type Mode = "create" | "reset";

/**
 * Issues a parent's app login (email + password) or a new password. Unlike
 * ActionForm it stays open on success: the password is shown here once, for
 * the admin to hand over, and is gone when the dialog closes.
 */
export function GuardianLoginDialog({ mode, guardianId, name, email }: { mode: Mode; guardianId: string; name: string; email: string | null }) {
  return (
    <Dialog
      trigger={
        <>
          {mode === "create" ? <UserPlus className="size-3.5" /> : <KeyRound className="size-3.5" />}
          {mode === "create" ? "Create login" : "New password"}
        </>
      }
      triggerVariant="secondary"
      triggerSize="sm"
      title={mode === "create" ? `App login for ${name}` : `New password for ${name}`}
      description="Parents sign in to the mobile app with their email and the password you give them."
    >
      <CredentialForm mode={mode} guardianId={guardianId} email={email} />
    </Dialog>
  );
}

function CredentialForm({ mode, guardianId, email }: { mode: Mode; guardianId: string; email: string | null }) {
  const [state, formAction] = useActionState<ActionResult<GuardianCredentials> | null, FormData>(
    mode === "create" ? createGuardianLogin : resetGuardianPassword,
    null,
  );
  if (state?.ok) return <Credentials c={state.data} />;
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="guardianId" value={guardianId} />
      {mode === "create" ? (
        <Field name="email" label="Parent's email (their username)">
          <Input name="email" type="email" required autoComplete="off" defaultValue={email ?? ""} placeholder="parent@example.com" />
        </Field>
      ) : (
        <p className="text-sm text-muted">The current password stops working immediately. Give the parent the new one shown on the next screen.</p>
      )}
      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad-ink">
          {state.fieldErrors?.email ?? state.error}
        </p>
      )}
      <SubmitButton pendingLabel={mode === "create" ? "Creating login" : "Issuing password"}>{mode === "create" ? "Create login" : "Issue new password"}</SubmitButton>
    </form>
  );
}

function Credentials({ c }: { c: GuardianCredentials }) {
  const [copied, setCopied] = useState(false);
  if (!c.password) {
    return (
      <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok-ink">
        {c.email} already had a login (staff or student). It now also opens {c.name}&apos;s parent view; they keep their existing password.
      </p>
    );
  }
  const text = `SJCEM Attendance app\nEmail: ${c.email}\nPassword: ${c.password}`;
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok-ink">
        Give these to {c.name}. The password is shown only now. They can change it later with “Forgot password?” in the app.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-line bg-canvas p-4 text-sm">
        <dt className="text-muted">Email</dt>
        <dd className="font-mono break-all">{c.email}</dd>
        <dt className="text-muted">Password</dt>
        <dd className="font-mono text-base font-semibold tracking-wide select-all">{c.password}</dd>
      </dl>
      <button
        type="button"
        className={buttonClass("secondary", "sm")}
        onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true), () => undefined)}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy email and password"}
      </button>
    </div>
  );
}
