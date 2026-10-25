import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GraduationCap } from "lucide-react";
import { getCurrentUser, needsMfa } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PageSkeleton } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SetupWizard } from "@/features/setup/wizard";
import { initialSetupState, setupStateSchema } from "@/features/setup/schema";

export const metadata: Metadata = { title: "College setup" };

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-navy text-white">
            <GraduationCap className="size-5" />
          </span>
          <div>
            <div className="font-bold text-heading">First-run setup</div>
            <div className="text-xs text-muted">Builds the academic structure the whole system runs on</div>
          </div>
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-6xl p-6">
        <Suspense fallback={<PageSkeleton variant="detail" />}>
          <Setup />
        </Suspense>
      </main>
    </div>
  );
}

async function Setup() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/setup");
  if (needsMfa(user)) redirect("/auth/mfa?next=/setup");
  if (user.setupCompleted) redirect("/dashboard");
  if (user.grants["settings.manage"] !== "all") redirect("/auth/not-ready");

  // Resume from the autosaved draft when there is one.
  const s = await db();
  const { data } = await s.from("blueprint_versions").select("document").eq("status", "draft").maybeSingle();
  const saved = setupStateSchema.safeParse((data?.document as { setup?: unknown } | undefined)?.setup);
  return <SetupWizard initial={saved.success ? saved.data : initialSetupState()} />;
}
