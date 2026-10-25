import { z } from "zod";
import { blueprintSchema, muEngineeringBlueprint } from "@/shared/blueprint";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const setupStateSchema = z
  .object({
    step: z.number().int().min(0).max(7),
    college: z.object({
      name: z.string().trim().min(5, "Enter the college name"),
      shortName: z.string().trim().min(2).max(12),
      address: z.string().trim().min(3, "Enter the address"),
      phone: z.string().trim().max(30).optional().default(""),
      email: z.email("Enter the office email"),
      principalName: z.string().trim().min(3, "Enter the principal's name"),
    }),
    year: z.object({
      label: z.string().regex(/^\d{4}-\d{2}$/, "Format 2026-27"),
      start: date,
      end: date,
      oddStart: date,
      oddEnd: date,
      evenStart: date,
      evenEnd: date,
    }),
    policy: z.object({
      minPercent: z.number().min(0).max(100),
      warnPercent: z.number().min(0).max(100),
      editWindowHours: z.number().int().min(0).max(168),
      lockAfterHours: z.number().int().min(1).max(336),
      countMode: z.enum(["session", "hours"]),
    }),
    blueprint: blueprintSchema,
  })
  .refine((s) => s.year.oddStart < s.year.oddEnd && s.year.oddEnd < s.year.evenStart && s.year.evenStart < s.year.evenEnd, {
    message: "Terms must be in order: odd term, then even term",
    path: ["year", "evenStart"],
  })
  .refine((s) => s.policy.warnPercent >= s.policy.minPercent, { message: "Warning % must be ≥ minimum %", path: ["policy", "warnPercent"] });

export type SetupState = z.infer<typeof setupStateSchema>;

export function initialSetupState(): SetupState {
  const now = new Date(Date.now() + 330 * 60_000);
  const y = now.getUTCMonth() >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    step: 0,
    college: { name: "St. John College of Engineering and Management", shortName: "SJCEM", address: "Palghar, Maharashtra", phone: "", email: "", principalName: "" },
    year: {
      label: `${y}-${String((y + 1) % 100).padStart(2, "0")}`,
      start: `${y}-07-01`,
      end: `${y + 1}-06-30`,
      oddStart: `${y}-07-13`,
      oddEnd: `${y}-11-21`,
      evenStart: `${y + 1}-01-04`,
      evenEnd: `${y + 1}-05-08`,
    },
    policy: { minPercent: 75, warnPercent: 80, editWindowHours: 24, lockAfterHours: 48, countMode: "session" },
    blueprint: muEngineeringBlueprint(),
  };
}
