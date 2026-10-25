"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const INK = "#0f1f3d";
const MUTED = "#5b6b85";
const GRID = "#e9eff7";
const SERIES = "#1d4ed8";
const THRESHOLD = "#dc2626";

const axisTick = { fill: MUTED, fontSize: 11 };

function TooltipBox({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-pop">
      <div className="font-semibold text-ink">{title}</div>
      <div className="mt-0.5 tabular-nums" style={{ color: INK }}>
        {value}
      </div>
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
  data: { code: string; name: string; percent: number; shortage: number }[];
  threshold: number;
  height?: number;
}) {
  const min = Math.max(0, Math.floor((Math.min(...data.map((d) => d.percent), threshold) - 8) / 5) * 5);
  return (
    <div style={{ height }} role="img" aria-label="Average attendance by branch">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="code" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
          <YAxis domain={[min, 100]} tick={axisTick} tickLine={false} axisLine={false} unit="%" width={48} />
          <ReferenceLine
            y={threshold}
            stroke={THRESHOLD}
            strokeDasharray="4 4"
            label={{ value: `${threshold}% min`, position: "insideTopRight", fill: THRESHOLD, fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(29,78,216,0.06)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return <TooltipBox title={`${p.code} · ${p.name}`} value={`${p.percent.toFixed(1)}% average`} note={`${p.shortage} students below ${threshold}%`} />;
            }}
          />
          <Bar dataKey="percent" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single series: daily attendance % over recent working days. */
export function TrendLineChart({
  data,
  threshold,
  height = 240,
}: {
  data: { date: string; label: string; percent: number | null }[];
  threshold: number;
  height?: number;
}) {
  const values = data.map((d) => d.percent).filter((v): v is number => v !== null);
  const min = Math.max(0, Math.floor((Math.min(...values, threshold) - 6) / 5) * 5);
  return (
    <div style={{ height }} role="img" aria-label="Daily attendance trend">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis domain={[min, 100]} tick={axisTick} tickLine={false} axisLine={false} unit="%" width={48} />
          <ReferenceLine y={threshold} stroke={THRESHOLD} strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return <TooltipBox title={p.label} value={p.percent === null ? "No sessions" : `${p.percent.toFixed(1)}% present`} />;
            }}
          />
          <Line
            type="monotone"
            dataKey="percent"
            stroke={SERIES}
            strokeWidth={2}
            dot={{ r: 3.5, fill: SERIES, stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: SERIES, stroke: "#fff", strokeWidth: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
