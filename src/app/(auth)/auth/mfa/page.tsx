import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/features/auth/actions";
import { MfaEnroll, MfaVerify } from "./mfa-forms";

export const metadata: Metadata = { title: "Two-factor verification" };

export default function MfaPage(props: PageProps<"/auth/mfa">) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-card">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-navy-50 text-navy">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-navy">Two-factor verification</h1>
            <p className="text-xs text-muted">Required for Principal and Admin accounts</p>
          </div>
        </div>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-line-soft" />}>
          <Mfa searchParams={props.searchParams} />
        </Suspense>
        <form action={signOut} className="mt-6 text-center">
          <button type="submit" className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
            Sign out and use another account
          </button>
        </form>
      </div>
    </div>
  );
}

async function Mfa({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/dashboard";
  if (user.aal === "aal2") redirect(next);
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp.find((f) => f.status === "verified");
  return verified ? <MfaVerify factorId={verified.id} next={next} /> : <MfaEnroll next={next} />;
}
