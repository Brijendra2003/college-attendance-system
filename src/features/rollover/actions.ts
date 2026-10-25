"use server";

import { z } from "zod";
import { AppError } from "@/shared/errors";
import { action } from "@/lib/auth/action";
import { db, rpc, unwrap } from "@/lib/db";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const createNextYear = action({
  permission: "year.rollover",
  schema: z
    .object({ label: z.string().regex(/^\d{4}-\d{2}$/, "Format 2027-28"), start: date, end: date, oddStart: date, oddEnd: date, evenStart: date, evenEnd: date })
    .refine((y) => y.oddStart < y.oddEnd && y.oddEnd < y.evenStart && y.evenStart < y.evenEnd, { message: "Terms must be in order", path: ["evenStart"] }),
  run: ({ input }) => rpc("create_next_academic_year", { p: input }),
  success: "Next academic year created with this year's divisions and batches cloned.",
});

const OUTCOMES = ["promoted", "promoted_atkt", "repeat_year", "detained", "left"] as const;

/**
 * Outcomes are pasted as "enrollment_no,outcome" lines (or exported from the
 * results system). Students not listed are promoted.
 */
export const promoteProgramYear = action({
  permission: "year.rollover",
  schema: z.object({ toYear: z.uuid(), programYear: z.enum(["FE", "SE", "TE", "BE"]), outcomes: z.string().max(200_000).optional() }),
  async run({ input }) {
    const lines = (input.outcomes ?? "")
      .split(/\r?\n/)
      .map((l) => l.split(/[,\t;]/).map((x) => x.trim()))
      .filter((p) => p[0] && p[1]);
    const bad = lines.find((p) => !OUTCOMES.includes(p[1] as (typeof OUTCOMES)[number]));
    if (bad) throw new AppError("VALIDATION", `Unknown outcome “${bad[1]}” for ${bad[0]}. Use one of: ${OUTCOMES.join(", ")}.`);
    const s = await db();
    const ids = new Map<string, string>();
    for (let i = 0; i < lines.length; i += 200) {
      const chunk = lines.slice(i, i + 200).map((p) => p[0].toUpperCase());
      for (const r of unwrap(await s.from("students").select("id, enrollment_no").in("enrollment_no", chunk)) as { id: string; enrollment_no: string }[]) {
        ids.set(r.enrollment_no, r.id);
      }
    }
    const unknown = lines.find((p) => !ids.has(p[0].toUpperCase()));
    if (unknown) throw new AppError("VALIDATION", `No student with enrollment number ${unknown[0]}.`);
    const outcomes = lines.map((p) => ({ student_id: ids.get(p[0].toUpperCase()), outcome: p[1] }));
    return rpc<Record<string, number>>("promote_students", { p_to_year: input.toYear, p_program_year: input.programYear, p_outcomes: outcomes });
  },
  success: (c) => `Recorded: ${Object.entries(c).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(", ") || "no students"}.`,
});

export const advanceTerm = action({
  permission: "year.rollover",
  schema: z.object({ confirm: z.literal("yes") }),
  run: () => rpc<number>("advance_term"),
  success: (n) => `Even term started: ${n} enrollments moved to the next semester with the same division and batch.`,
});

export const activateYear = action({
  permission: "year.rollover",
  schema: z.object({ yearId: z.uuid(), confirm: z.literal("yes") }),
  run: ({ input }) => rpc("activate_academic_year", { p_year: input.yearId }),
  success: "New academic year activated. The previous year is archived and read-only.",
});
