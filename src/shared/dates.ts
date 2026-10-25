// IST helpers. Everything is displayed in Asia/Kolkata (UTC+05:30, no DST).

export const TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

/** ISO date (yyyy-mm-dd) in IST for the given instant. */
export function istDate(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Minutes since IST midnight for the given instant. */
export function istMinutes(at: Date = new Date()): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

/** 1-based index of this weekday within its month (e.g. 3 = third Saturday). */
export function weekdayOrdinal(iso: string): number {
  return Math.ceil(parseISODate(iso).getUTCDate() / 7);
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDate(iso: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = parseISODate(iso);
  const parts = [
    opts.weekday ? `${DAYS[d.getUTCDay()]},` : "",
    `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
    opts.year ? String(d.getUTCFullYear()) : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function formatDateTime(isoInstant: string): string {
  const at = new Date(isoInstant);
  return `${formatDate(istDate(at), { year: true })}, ${formatTime(istMinutes(at))}`;
}

export function dayName(iso: string, long = false): string {
  const name = DAYS[weekday(iso)];
  if (!long) return name;
  return { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" }[name]!;
}
