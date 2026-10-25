// Attendance maths (§8.4). Mirrors the SQL implementation; both are tested
// against the same fixtures.

export interface StatusCodeRule {
  code: string;
  countsAsAttended: boolean;
  countsInHeld: boolean;
}

export interface Tally {
  held: number;
  attended: number;
}

/** Percentage rounded to 2 dp, or null when nothing has been held yet. */
export function attendancePercent({ held, attended }: Tally): number | null {
  if (held <= 0) return null;
  return Math.round((attended / held) * 10000) / 100;
}

/** Sessions a student must attend in a row to reach `minPercent`. 0 if already there. */
export function sessionsNeeded({ held, attended }: Tally, minPercent: number): number {
  if (minPercent >= 100) return held === attended ? 0 : Infinity;
  const needed = Math.ceil((minPercent * held - 100 * attended) / (100 - minPercent));
  return Math.max(0, needed);
}

/** Whether the threshold is still reachable with the sessions left in the term. */
export function isRecoverable(tally: Tally, minPercent: number, remainingSessions: number): boolean {
  return sessionsNeeded(tally, minPercent) <= remainingSessions;
}

export type Standing = "safe" | "warning" | "shortage" | "na";

export function standing(percent: number | null, minPercent: number, warnPercent: number): Standing {
  if (percent === null) return "na";
  if (percent < minPercent) return "shortage";
  if (percent < warnPercent) return "warning";
  return "safe";
}

export function tallyRecords(
  records: { status: string; weight?: number }[],
  rules: StatusCodeRule[],
): Tally {
  const byCode = new Map(rules.map((r) => [r.code, r]));
  let held = 0;
  let attended = 0;
  for (const r of records) {
    const rule = byCode.get(r.status);
    if (!rule) continue;
    const w = r.weight ?? 1;
    if (rule.countsInHeld) held += w;
    if (rule.countsAsAttended) attended += w;
  }
  return { held, attended };
}
