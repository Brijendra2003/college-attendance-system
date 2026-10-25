"use server";

import { z } from "zod";
import { decisionSchema, reopenSchema } from "@/shared/schemas";
import { AppError } from "@/shared/errors";
import { action } from "@/lib/auth/action";
import { assertDepartment } from "@/lib/auth/permissions";
import { audit, db } from "@/lib/data/store";
import { getSessionById } from "@/lib/data/engine";
import { divisionById } from "@/features/common/lookups";

// Production: apply_correction() RPC — updates records, writes history,
// recomputes summaries and notifies the student and guardians (§8.6).
export const decideCorrection = action({
  permission: "attendance.correct.approve",
  schema: decisionSchema,
  run({ input, user }) {
    const store = db();
    const req = store.corrections.find((c) => c.id === input.id);
    if (!req) throw new AppError("NOT_FOUND");
    if (req.status !== "pending") throw new AppError("ALREADY_DECIDED");
    const student = store.students.find((s) => s.id === req.studentId)!;
    assertDepartment(user, "attendance.correct.approve", student.departmentId);

    req.status = input.decision;
    req.decidedBy = user.id;
    req.decidedAt = new Date().toISOString();
    req.note = input.note ?? null;
    if (input.decision === "approved" && req.fromStatus === "A" && ["P", "OD"].includes(req.toStatus)) {
      const session = getSessionById(req.sessionId);
      if (session) {
        const key = `${req.studentId}|${session.slot.teachingGroupId}`;
        store.attendedAdjustments.set(key, (store.attendedAdjustments.get(key) ?? 0) + 1);
      }
    }
    audit(user, {
      action: `attendance.correction.${input.decision}`,
      entity: "attendance_records",
      entityId: req.id,
      summary: `${input.decision === "approved" ? "Approved" : "Rejected"} correction ${req.fromStatus} → ${req.toStatus} for ${student.name}`,
      before: { status: req.fromStatus },
      after: input.decision === "approved" ? { status: req.toStatus } : { status: req.fromStatus },
      reason: input.note || req.reason,
    });
    return req.status;
  },
  success: (s) => (s === "approved" ? "Correction applied. Student and guardians notified." : "Correction rejected."),
});

// Production: reopen_register(session, reason, until).
export const reopenRegister = action({
  permission: "attendance.reopen",
  schema: reopenSchema,
  run({ input, user }) {
    const session = getSessionById(input.sessionId);
    if (!session) throw new AppError("NOT_FOUND");
    const div = divisionById(session.slot.divisionId)!;
    assertDepartment(user, "attendance.reopen", div.departmentId);
    const store = db();
    const o = store.sessionOverrides.get(session.id) ?? {};
    o.reopened = { reason: input.reason, by: user.id, at: new Date().toISOString() };
    store.sessionOverrides.set(session.id, o);
    audit(user, {
      action: "attendance.register.reopened",
      entity: "attendance_registers",
      entityId: session.id,
      summary: `Reopened register for ${session.date} (${session.slot.room})`,
      before: { state: session.register?.state },
      after: { state: "reopened" },
      reason: input.reason,
    });
    return true;
  },
  success: "Register reopened. The professor can now submit from the app.",
});

export const nudgeProfessor = action({
  permission: "attendance.view",
  schema: z.object({ sessionId: z.string().min(1) }),
  run({ input, user }) {
    const session = getSessionById(input.sessionId);
    if (!session) throw new AppError("NOT_FOUND");
    assertDepartment(user, "attendance.view", divisionById(session.slot.divisionId)!.departmentId);
    const store = db();
    const o = store.sessionOverrides.get(session.id) ?? {};
    o.nudgedAt = new Date().toISOString();
    store.sessionOverrides.set(session.id, o);
    return true;
  },
  success: "Reminder sent",
});
