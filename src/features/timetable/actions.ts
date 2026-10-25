"use server";

import { z } from "zod";
import { sessionCancelSchema, sessionSubstituteSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { rpc } from "@/lib/db";

// publish_timetable generates future sessions, applies the republish rule,
// archives the previous version and notifies users (§11.7, §8.8).
export const publishTimetable = action({
  permission: "timetable.publish",
  schema: z.object({ versionId: z.uuid() }),
  run: ({ input }) => rpc<{ created: number; replaced: number }>("publish_timetable", { p_version: input.versionId }),
  success: (r) => `Published: ${r.created} sessions generated${r.replaced ? `, ${r.replaced} untouched future sessions replaced` : ""}. Students have been notified.`,
});

// Cancelled sessions never count as held; a marked register is voided (§8.1).
export const cancelSession = action({
  permission: "sessions.manage",
  schema: sessionCancelSchema,
  run: ({ input }) => rpc("cancel_session", { p_session: input.sessionId, p_reason: input.reason }),
  success: "Session cancelled. Students and the professor have been notified.",
});

export const assignSubstitute = action({
  permission: "sessions.manage",
  schema: sessionSubstituteSchema,
  run: ({ input }) => rpc("assign_substitute", { p_session: input.sessionId, p_staff: input.staffId }),
  success: "Substitute assigned. They can now mark attendance for this session.",
});
