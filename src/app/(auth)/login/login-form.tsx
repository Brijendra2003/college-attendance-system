"use client";

import { use, useActionState, useState } from "react";
import { CircleAlert, KeyRound } from "lucide-react";
import { signIn } from "@/features/auth/actions";
import { Input } from "@/components/ui/forms";
import { buttonClass } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";

interface DemoAccount {
  email: string;
  role: string;
  note: string;
}

export function LoginForm({ demo, searchParams }: { demo: DemoAccount[]; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = use(searchParams);
  const next = typeof sp.next === "string" ? sp.next : "";
  const [state, action, pending] = useActionState(signIn, null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">College email</span>
          <Input name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">Password</span>
          <Input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {state && !state.ok && (
          <div role="alert" className="flex items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad-ink">
            <CircleAlert className="size-4" /> {state.error}
          </div>
        )}
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
          {pending ? <Spinner label="Signing in" /> : "Sign in"}
        </button>
        <p className="text-center text-xs text-muted">Forgot your password? Ask the college office to send a reset link.</p>
      </form>

      {demo.length > 0 && (
        <div className="mt-8 rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-heading">
            <KeyRound className="size-4" /> Demo accounts · password <code className="rounded bg-navy-50 px-1.5 py-0.5">demo1234</code>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {demo.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword("demo1234");
                }}
                className="rounded-lg border border-line-soft px-2.5 py-2 text-left hover:border-line hover:bg-navy-50"
              >
                <span className="block text-xs font-semibold text-ink">{a.role}</span>
                <span className="block truncate text-[11px] text-muted">{a.note || a.email}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">HOD accounts use the department head&apos;s college email.</p>
        </div>
      )}
    </>
  );
}
