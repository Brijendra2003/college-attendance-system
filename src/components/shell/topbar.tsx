import { CalendarDays, LogOut } from "lucide-react";
import { ROLE_LABELS } from "@/shared/permissions";
import { formatDate, istDate } from "@/shared/dates";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/data/store";
import { signOut } from "@/features/auth/actions";
import { deptCode } from "@/features/common/lookups";
import { Avatar, DeptChip } from "@/components/ui/primitives";
import { MobileSidebar } from "./sidebar";

export async function Topbar() {
  const user = await requireUser();
  const store = db();
  const year = store.academicYears.find((y) => y.status === "active")!;
  const term = store.terms.find((t) => t.status === "active")!;
  const roleLabel = user.roles
    .filter((r) => r !== "professor")
    .map((r) => ROLE_LABELS[r])
    .join(" · ");

  return (
    <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
      <MobileSidebar />
      {/* Academic context (§10.3): every query is scoped to the active year and term. */}
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-xs">
        <CalendarDays className="size-4 shrink-0 text-primary" />
        <span className="font-semibold text-navy">AY {year.label}</span>
        <span className="hidden text-faint sm:inline">·</span>
        <span className="hidden truncate text-muted sm:inline">{term.label.replace(/ \d{4}-\d{2}$/, "")} (Sem 1, 3, 5, 7)</span>
      </div>
      <div className="hidden text-xs text-muted md:block">{formatDate(istDate(), { weekday: true, year: true })} · IST</div>

      <div className="ml-auto flex items-center gap-3">
        {user.departmentId && <DeptChip code={deptCode(user.departmentId)} />}
        <div className="hidden text-right sm:block">
          <div className="text-sm leading-tight font-semibold text-ink">{user.name}</div>
          <div className="text-[11px] text-muted">{roleLabel}</div>
        </div>
        <Avatar name={user.name} size={34} />
        <form action={signOut}>
          <button
            type="submit"
            className="grid size-9 place-items-center rounded-lg border border-line bg-white text-muted hover:bg-navy-50 hover:text-ink"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export function TopbarSkeleton() {
  return <div className="h-16" />;
}
