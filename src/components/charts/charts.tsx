"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useResolvedTheme } from "@/components/ui/theme-toggle";

// Palettes per theme; SVG presentation attributes can't read CSS variables
// reliably, so charts pick concrete colours from the resolved theme.
const PALETTE = {
  light: { ink: "#0f1f3d", muted: "#5b6b85", grid: "#e9eff7", series: "#1d4ed8", threshold: "#dc2626", dot: "#ffffff", cursor: "rgba(29,78,216,0.06)" },
  dark: { ink: "#e6edf7", muted: "#9aa9c0", grid: "#1c2942", series: "#7aa7ff", threshold: "#f87171", dot: "#111a2b", cursor: "rgba(122,167,255,0.10)" },
};

function TooltipBox({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <div className="font-semibold text-ink">{title}</div>
      <div className="mt-0.5 text-ink tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-muted">{note}</div>}
    </div>
  );
}

/** Single series: branch average attendance with the policy threshold as a reference line. */
export function BranchBarChart({
  data,
  threshold,
  height = 260,
}: {
  data: { code: string; name: string; percent: number | null; shortage: number }[];
  threshold: number;
  height?: number;
}) {
  const p = PALETTE[useResolvedTheme()];
  const values = data.map((d) => d.percent ?? 0);
  const min = Math.max(0, Math.floor((Math.min(...values, threshold) - 8) / 5) * 5);
  return (
    <div style={{ height }} role="img" aria-label="Average attendance by branch">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={p.grid} />
          <XAxis dataKey="code" tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: p.grid }} interval={0} />
          <YAxis domain={[min, 100]} tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={false} unit="%" width={48} />
          <ReferenceLine y={threshold} stroke={p.threshold} strokeDasharray="4 4" label={{ value: `${threshold}% min`, position: "insideTopLeft", fill: p.threshold, fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: p.cursor }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !d) return null;
              return <TooltipBox title={`${d.code} · ${d.name}`} value={d.percent === null ? "No data yet" : `${d.percent.toFixed(1)}% average`} note={`${d.shortage} students below ${threshold}%`} />;
            }}
          />
          <Bar dataKey="percent" fill={p.series} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single series: daily attendance % over recent working days. */
export function TrendLineChart({ data, threshold, height = 240 }: { data: { date: string; label: string; percent: number | null }[]; threshold: number; height?: number }) {
  const p = PALETTE[useResolvedTheme()];
  const values = data.map((d) => d.percent).filter((v): v is number => v !== null);
  const min = Math.max(0, Math.floor((Math.min(...values, threshold) - 6) / 5) * 5);
  return (
    <div style={{ height }} role="img" aria-label="Daily attendance trend">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={p.grid} />
          <XAxis dataKey="label" tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: p.grid }} minTickGap={16} />
          <YAxis domain={[min, 100]} tick={{ fill: p.muted, fontSize: 11 }} tickLine={false} axisLine={false} unit="%" width={48} />
          <ReferenceLine y={threshold} stroke={p.threshold} strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: p.muted, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !d) return null;
              return <TooltipBox title={d.label} value={d.percent === null ? "No sessions" : `${d.percent.toFixed(1)}% present`} />;
            }}
          />
          <Line
            type="monotone"
            dataKey="percent"
            stroke={p.series}
            strokeWidth={2}
            dot={{ r: 3.5, fill: p.series, stroke: p.dot, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: p.series, stroke: p.dot, strokeWidth: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
