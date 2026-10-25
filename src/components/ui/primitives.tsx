import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { programYearTones, toneOf } from "@/shared/tokens";
import { cn, initials } from "@/lib/utils";

/** light-dark() pairs follow the resolved theme via color-scheme (globals.css). */
export const ld = (light: string, dark: string) => `light-dark(${light}, ${dark})`;

export function toneStyle(code: string, kind: "card" | "chip" | "text" = "card"): CSSProperties {
  const t = toneOf(code);
  if (kind === "chip") return { background: ld(t.fg, t.fgDark), color: ld("#fff", "#0b1220") };
  if (kind === "text") return { color: ld(t.fg, t.fgDark) };
  return { background: ld(t.bg, t.bgDark), borderColor: ld(t.border, t.borderDark) };
}

// ── Layout ───────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-heading">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  number,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  number?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {number !== undefined && (
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{number}</span>
        )}
        {icon && <span className="mt-0.5 shrink-0 text-heading">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-heading">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

// ── Buttons & links ──────────────────────────────────────────────────────
const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap";
const buttonVariants = {
  primary: "bg-navy text-white hover:bg-navy-700 shadow-sm",
  secondary: "border border-line bg-surface text-ink hover:bg-navy-50",
  ghost: "text-muted hover:bg-navy-50 hover:text-ink",
  danger: "bg-bad text-white dark:text-[#1a0a0a] hover:opacity-90",
  success: "bg-ok text-white dark:text-[#06210f] hover:opacity-90",
  soft: "bg-primary-soft text-primary hover:opacity-90",
};
const buttonSizes = { sm: "h-8 px-3 text-xs", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-sm" };

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ── Badges & chips ───────────────────────────────────────────────────────
const badgeTones = {
  neutral: "bg-neutral-soft text-neutral-ink ring-line",
  ok: "bg-ok-soft text-ok-ink ring-ok/25",
  warn: "bg-warn-soft text-warn-ink ring-warn/25",
  bad: "bg-bad-soft text-bad-ink ring-bad/25",
  info: "bg-info-soft text-info-ink ring-info/25",
  violet: "bg-violet-soft text-violet-ink ring-violet/25",
  navy: "bg-navy text-white ring-navy",
};
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function DeptChip({ code, soft = false, className }: { code: string; soft?: boolean; className?: string }) {
  const t = toneOf(code);
  return (
    <span
      className={cn("inline-flex min-w-[52px] items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide", className)}
      style={soft ? { background: ld(t.bg, t.bgDark), color: ld(t.fg, t.fgDark), boxShadow: `inset 0 0 0 1px ${ld(t.border, t.borderDark)}` } : toneStyle(code, "chip")}
    >
      {code}
    </span>
  );
}

export function YearChip({ code }: { code: string }) {
  const t = programYearTones[code as keyof typeof programYearTones] ?? programYearTones.FE;
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: ld(t.bg, t.bgDark), color: ld(t.fg, t.fgDark) }}>
      {code}
    </span>
  );
}

export function Avatar({ name, size = 32, tone }: { name: string; size?: number; tone?: string }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: tone ?? "var(--navy)", fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

// ── Data display ─────────────────────────────────────────────────────────
const statTones = {
  navy: ["var(--heading)", "var(--navy-50)"],
  violet: ["var(--violet)", "var(--violet-soft)"],
  teal: [ld("#0e8a7e", "#5fd4c4"), ld("#e5f6f3", "#0f2a28")],
  orange: [ld("#d96c0c", "#ffb46b"), ld("#fff3e3", "#2d1f0f")],
  cyan: [ld("#0b85a6", "#5fcdee"), ld("#e5f6fb", "#0d2731")],
  ok: ["var(--ok)", "var(--ok-soft)"],
  warn: ["var(--warn)", "var(--warn-soft)"],
  bad: ["var(--bad)", "var(--bad-soft)"],
  slate: ["var(--muted)", "var(--neutral-soft)"],
} as const;
export type StatTone = keyof typeof statTones;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "navy",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: StatTone;
  href?: string;
}) {
  const [fg, bg] = statTones[tone];
  const body = (
    <div className="flex items-start gap-3.5 p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: bg, color: fg }}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted">{label}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
    </div>
  );
  return <Card className={cn(href && "transition hover:-translate-y-0.5 hover:shadow-pop")}>{href ? <Link href={href}>{body}</Link> : body}</Card>;
}

export function Progress({ value, tone, className }: { value: number; tone?: string; className?: string }) {
  const color = tone ?? (value < 75 ? "var(--bad)" : value < 80 ? "var(--warn)" : "var(--ok)");
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line-soft", className)}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function PercentText({ value, min = 75, warn = 80 }: { value: number | string | null | undefined; min?: number; warn?: number }) {
  if (value === null || value === undefined || value === "") return <span className="text-faint">—</span>;
  const v = Number(value);
  const cls = v < min ? "text-bad" : v < warn ? "text-warn" : "text-ok";
  return <span className={cn("font-semibold tabular-nums", cls)}>{v.toFixed(1)}%</span>;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-navy-50 text-heading">{icon}</div>}
      <div className="font-semibold text-ink">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

// ── Tables ───────────────────────────────────────────────────────────────
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function THead(props: ComponentProps<"thead">) {
  return <thead className="bg-sunken text-left text-xs font-semibold text-heading" {...props} />;
}
export function TH({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("border-b border-line px-4 py-2.5 font-semibold whitespace-nowrap", className)} {...props} />;
}
export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line-soft px-4 py-2.5 align-middle", className)} {...props} />;
}
export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-subtle", className)} {...props} />;
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-muted">
      <span>
        Showing <b className="text-ink">{from}</b>–<b className="text-ink">{to}</b> of <b className="text-ink">{total.toLocaleString("en-IN")}</b>
      </span>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <ButtonLink size="sm" href={hrefFor(page - 1)}>
            Previous
          </ButtonLink>
        ) : (
          <span className={buttonClass("secondary", "sm", "opacity-40")}>Previous</span>
        )}
        <span className="px-2">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <ButtonLink size="sm" href={hrefFor(page + 1)}>
            Next
          </ButtonLink>
        ) : (
          <span className={buttonClass("secondary", "sm", "opacity-40")}>Next</span>
        )}
      </div>
    </div>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: ReactNode; key: string }[]; active: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            t.key === active ? "bg-navy text-white" : "text-muted hover:bg-navy-50 hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Loading skeletons ────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-line-soft", className)} />;
}

export function PageSkeleton({ variant = "dashboard" }: { variant?: "dashboard" | "table" | "detail" }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-4 w-28" />
      <Skeleton className="mb-6 h-8 w-72" />
      {variant === "dashboard" && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Skeleton className="h-80 xl:col-span-2" />
            <Skeleton className="h-80" />
          </div>
        </>
      )}
      {variant === "table" && (
        <>
          <Skeleton className="mb-5 h-20" />
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <Skeleton className="h-10 rounded-none" />
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="flex gap-4 border-t border-line-soft px-4 py-3">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </>
      )}
      {variant === "detail" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Skeleton className="h-96 xl:col-span-2" />
          <div className="space-y-6">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
        </div>
      )}
    </div>
  );
}
