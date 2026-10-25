import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatDate } from "@/shared/dates";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { isWorkingDay } from "@/lib/data/engine";
import type { SessionRow } from "./queries";

const STATE: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" | "violet" | "info" }> = {
  submitted: { label: "Submitted", tone: "ok" },
  locked: { label: "Locked", tone: "neutral" },
  pending: { label: "Pending", tone: "warn" },
  missing: { label: "Missing", tone: "bad" },
  upcoming: { label: "Upcoming", tone: "info" },
  reopened: { label: "Reopened", tone: "violet" },
  voided: { label: "Voided", tone: "neutral" },
};

export function RegisterBadge({ row }: { row: Pick<SessionRow, "status" | "state" | "late"> }) {
  if (row.status === "cancelled") return <Badge tone="neutral">Cancelled</Badge>;
  const s = row.state ? STATE[row.state] : STATE.upcoming;
  return (
    <span className="inline-flex gap-1">
      <Badge tone={s.tone}>{s.label}</Badge>
      {row.late && <Badge tone="warn">late</Badge>}
    </span>
  );
}

function step(date: string, dir: 1 | -1) {
  let d = addDays(date, dir);
  for (let i = 0; i < 14 && !isWorkingDay(d); i++) d = addDays(d, dir);
  return d;
}

/** Previous / next working day, preserving other query params. */
export function DayStepper({ date, basePath, params }: { date: string; basePath: string; params: Record<string, string> }) {
  const href = (d: string) => `${basePath}?${new URLSearchParams({ ...params, date: d })}`;
  return (
    <div className="flex items-center gap-1.5">
      <Link href={href(step(date, -1))} className={buttonClass("secondary", "sm")} aria-label="Previous working day">
        <ChevronLeft className="size-4" />
      </Link>
      <div className="min-w-40 rounded-lg border border-line bg-white px-3 py-1.5 text-center text-sm font-semibold text-navy">{formatDate(date, { weekday: true, year: true })}</div>
      <Link href={href(step(date, 1))} className={buttonClass("secondary", "sm")} aria-label="Next working day">
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
