import { cn } from "@/lib/utils";

/** Inline busy indicator for buttons and small areas. */
export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} role="status">
      <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ? <span>{label}…</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

/** Centered loader for panels that fetch on their own. */
export function PanelLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-14 text-sm text-muted">
      <Spinner label={label} />
    </div>
  );
}
