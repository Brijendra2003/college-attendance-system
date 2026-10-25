"use client";

import { useActionState, useState, useTransition } from "react";
import { CircleAlert, KeyRound, Smartphone } from "lucide-react";
import { startEnrollment, verifyMfa, type Enrollment } from "@/features/auth/actions";
import { Input } from "@/components/ui/forms";
import { Spinner } from "@/components/ui/spinner";
import { buttonClass } from "@/components/ui/primitives";

function CodeForm({ factorId, next, label }: { factorId: string; next: string; label: string }) {
  const [state, action, pending] = useActionState(verifyMfa, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1 block text-xs font-semibold">{label}</span>
        <Input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="123456"
          autoFocus
          className="h-12 text-center font-mono text-xl tracking-[0.4em]"
        />
      </label>
      {state && !state.ok && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          <CircleAlert className="size-4 shrink-0" /> {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
        {pending ? <Spinner label="Verifying" /> : "Verify"}
      </button>
    </form>
  );
}

export function MfaVerify({ factorId, next }: { factorId: string; next: string }) {
  return (
    <>
      <p className="mb-4 flex items-start gap-2 text-sm text-muted">
        <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />
        Open your authenticator app and enter the current code for SJCEM Attendance.
      </p>
      <CodeForm factorId={factorId} next={next} label="6-digit code" />
    </>
  );
}

export function MfaEnroll({ next }: { next: string }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!enrollment) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Your account needs an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or 1Password). Set it up once; after that
          you enter a 6-digit code when you sign in.
        </p>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button
          type="button"
          disabled={pending}
          className={buttonClass("primary", "lg", "w-full")}
          onClick={() =>
            start(async () => {
              const r = await startEnrollment();
              if (r.ok) setEnrollment(r.data);
              else setError(r.error);
            })
          }
        >
          {pending ? <Spinner label="Preparing" /> : (<><KeyRound className="size-4" /> Set up authenticator</>)}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Scan the QR code with your authenticator app, or enter the key manually.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      {enrollment.qrCode ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL SVG from Supabase Auth
        <img src={enrollment.qrCode} alt="QR code for your authenticator app" className="mx-auto size-44 rounded-lg border border-line bg-white p-2" />
      ) : null}
      <div className="rounded-lg bg-navy-50 p-3">
        <div className="text-[11px] font-semibold text-muted uppercase">Setup key</div>
        <code className="block font-mono text-sm break-all text-navy select-all">{enrollment.secret.match(/.{1,4}/g)?.join(" ")}</code>
      </div>
      <CodeForm factorId={enrollment.factorId} next={next} label="Code from your app" />
    </div>
  );
}
