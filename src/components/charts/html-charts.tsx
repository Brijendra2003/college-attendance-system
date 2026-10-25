import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ld } from "@/components/ui/primitives";

// Lightweight HTML charts rendered on the server (no client JS).

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Part-to-whole for register states; every colour is paired with a text label. */
export function SegmentedBar({ segments, className }: { segments: Segment[]; className?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className={className}>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-line-soft">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div key={s.label} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
          ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="ml-auto font-semibold text-ink tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Sequential: one hue, light → dark with attendance (inverted for the dark theme).
const RAMP_LIGHT = ["#f0f5fd", "#d7e5fb", "#b3cdf6", "#7faaee", "#4a83df", "#1f5fc9", "#163a70"];
const RAMP_DARK = ["#15213a", "#183056", "#1c4176", "#255499", "#3468bb", "#5288dc", "#8db2f3"];
function rampIndex(v: number) {
  const t = Math.max(0, Math.min(1, (v - 60) / 40));
  return Math.min(RAMP_LIGHT.length - 1, Math.floor(t * RAMP_LIGHT.length));
}

export function Heatmap({
  rows,
  columns,
  values,
  threshold,
}: {
  rows: { id: string; label: ReactNode }[];
  columns: { id: string; label: string; sub?: string }[];
  values: Map<string, Map<string, number | null>>;
  threshold: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[3px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface" />
            {columns.map((c) => (
              <th key={c.id} className="px-1 pb-1 text-center font-medium whitespace-nowrap text-muted">
                <div>{c.label}</div>
                {c.sub && <div className="text-[10px] text-faint">{c.sub}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th className="sticky left-0 bg-surface pr-2 text-left font-medium whitespace-nowrap text-ink">{r.label}</th>
              {columns.map((c) => {
                const v = values.get(r.id)?.get(c.id) ?? null;
                const i = v === null ? -1 : rampIndex(v);
                return (
                  <td
                    key={c.id}
                    title={v === null ? "No sessions" : `${v.toFixed(1)}%`}
                    className={cn("h-8 min-w-11 rounded-md text-center font-semibold tabular-nums", v !== null && v < threshold && "ring-2 ring-bad ring-inset")}
                    style={{
                      background: v === null ? "var(--subtle)" : ld(RAMP_LIGHT[i], RAMP_DARK[i]),
                      color: v === null ? "var(--faint)" : i >= 5 ? ld("#ffffff", "#0b1220") : "var(--ink)",
                    }}
                  >
                    {v === null ? "·" : Math.round(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span>60%</span>
        <div className="flex">
          {RAMP_LIGHT.map((c, i) => (
            <span key={c} className="h-2.5 w-6" style={{ background: ld(c, RAMP_DARK[i]) }} />
          ))}
        </div>
        <span>100%</span>
        <span className="ml-3 inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm ring-2 ring-bad ring-inset" /> below {threshold}%
        </span>
      </div>
    </div>
  );
}
