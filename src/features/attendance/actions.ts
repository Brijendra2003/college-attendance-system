"use server";

import { z } from "zod";
import { decisionSchema, reopenSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { rpc } from "@/lib/db";

// Thin wrappers: permission, scope, history, summaries, notifications and
// audit all happen inside the RPCs (§8.6), so web and mobile behave the same.

export const decideCorrection = action({
  permission: "attendance.correct.approve",
  schema: decisionSchema,
  run: ({ input }) => rpc<string>("decide_correction", { p_request: input.id, p_decision: input.decision, p_note: input.note ?? null }),
  success: (s) => (s === "approved" ? "Correction applied. The student and guardians have been notified." : "Correction rejected."),
});

export const reopenRegister = action({
  permission: "attendance.reopen",
  schema: reopenSchema,
  run: ({ input }) => rpc("reopen_register", { p_session: input.sessionId, p_reason: input.reason, p_hours: 24 }),
  success: "Register reopened for 24 hours. The professor can now submit from the app.",
});

export const nudgeProfessor = action({
  permission: "attendance.view",
  schema: z.object({ sessionId: z.uuid() }),
  run: ({ input }) => rpc("nudge_register", { p_session: input.sessionId }),
  success: "Reminder sent",
});

export const notifyShortage = action({
  permission: "attendance.view",
  schema: z.object({ dept: z.string().optional(), py: z.string().optional(), division: z.string().optional() }),
  run: ({ input }) =>
    rpc<number>("notify_shortage", { p_department: input.dept || null, p_program_year: input.py || null, p_division: input.division || null }),
  success: (n) => `Warnings queued for ${n} students and their guardians.`,
});
