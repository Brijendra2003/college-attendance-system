import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatDate, weekday } from "@/shared/dates";
import { Badge, buttonClass, type BadgeTone } from "@/components/ui/primitives";
import type { DisplayState } from "./queries";

const STATE: Record<DisplayState, { label: string; tone: BadgeTone }> = {
  submitted: { label: "Submitted", tone: "ok" },
  pending: { label: "Pending", tone: "warn" },
  missing: { label: "Missing", tone: "bad" },
  upcoming: { label: "Upcoming", tone: "info" },
  reopened: { label: "Reopened", tone: "violet" },
  voided: { label: "Voided", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function RegisterBadge({ state, late, locked }: { state: DisplayState; late?: boolean | null; locked?: boolean }) {
  const s = STATE[state];
  return (
    <span className="inline-flex gap-1">
      <Badge tone={s.tone}>{s.label}</Badge>
      {locked && state === "submitted" && <Badge>locked</Badge>}
      {late && state === "submitted" && <Badge tone="warn">late</Badge>}
    </span>
  );
}

/** Previous / next weekday (Mon–Sat), preserving other query params. */
function step(date: string, dir: 1 | -1) {
  let d = addDays(date, dir);
  while (weekday(d) === 0) d = addDays(d, dir);
  return d;
}

export function DayStepper({ date, basePath, params }: { date: string; basePath: string; params: Record<string, string> }) {
  const href = (d: string) => `${basePath}?${new URLSearchParams({ ...params, date: d })}`;
  return (
    <div className="flex items-center gap-1.5">
      <Link href={href(step(date, -1))} className={buttonClass("secondary", "sm")} aria-label="Previous day">
        <ChevronLeft className="size-4" />
      </Link>
      <div className="min-w-40 rounded-lg border border-line bg-surface px-3 py-1.5 text-center text-sm font-semibold text-heading">
        {formatDate(date, { weekday: true, year: true })}
      </div>
      <Link href={href(step(date, 1))} className={buttonClass("secondary", "sm")} aria-label="Next day">
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
