"use client";

import { useActionState, useState } from "react";
import { CircleAlert, KeyRound } from "lucide-react";
import { signIn } from "@/features/auth/actions";
import { Input } from "@/components/ui/forms";
import { buttonClass } from "@/components/ui/primitives";

interface DemoAccount {
  email: string;
  name: string;
  role: string;
  tone: string;
}

export function LoginForm({ accounts }: { accounts: DemoAccount[] }) {
  const [state, action, pending] = useActionState(signIn, null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <>
      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">College email</span>
          <Input name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">Password</span>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {state && !state.ok && (
          <div className="flex items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-red-800">
            <CircleAlert className="size-4" /> {state.error}
          </div>
        )}
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-8 rounded-xl border border-line bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-navy">
          <KeyRound className="size-4" /> Demo accounts · password <code className="rounded bg-navy-50 px-1.5 py-0.5">demo1234</code>
        </div>
        <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {accounts.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => {
                setEmail(a.email);
                setPassword("demo1234");
              }}
              className="flex items-center gap-2 rounded-lg border border-line-soft px-2.5 py-2 text-left hover:border-line hover:bg-navy-50"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: a.tone }} />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-ink">{a.role}</span>
                <span className="block truncate text-[11px] text-muted">{a.name}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
