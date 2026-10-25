import type { Metadata } from "next";
import { Hourglass } from "lucide-react";
import { signOut } from "@/features/auth/actions";
import { buttonClass } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Setup in progress" };

export default function NotReadyPage() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-navy-50 text-heading">
          <Hourglass className="size-7" />
        </div>
        <h1 className="text-xl font-bold text-heading">The college is still being set up</h1>
        <p className="mt-2 text-sm text-muted">An administrator is completing the first-run setup. Try again once they confirm it is finished.</p>
        <form action={signOut} className="mt-6">
          <button type="submit" className={buttonClass("secondary")}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
