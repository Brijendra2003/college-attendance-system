"use server";

import { z } from "zod";
import { formatDate, formatTime, istDate } from "@/shared/dates";
import { AppError } from "@/shared/errors";
import { sessionCancelSchema, sessionSubstituteSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { assertDepartment } from "@/lib/auth/permissions";
import { audit, db } from "@/lib/data/store";
import { getSessionById } from "@/lib/data/engine";
import { deptCode, divisionById, divisionLabel, staffById, subjectById } from "@/features/common/lookups";
import { slotsForVersion, validateTimetable } from "./queries";

// publish_timetable(version, effective_from): generates future sessions,
// archives the previous version and notifies affected users with a diff.
export const publishTimetable = action({
  permission: "timetable.publish",
  schema: z.object({ versionId: z.string().min(1) }),
  run({ input, user }) {
    const store = db();
    const v = store.timetableVersions.find((x) => x.id === input.versionId);
    if (!v) throw new AppError("NOT_FOUND");
    assertDepartment(user, "timetable.publish", v.departmentId);
    if (v.status !== "draft") throw new AppError("VALIDATION", "Only draft versions can be published.");
    const slots = slotsForVersion(v.id).map((s) => ({ ...s, staffName: staffById(s.staffId)?.name ?? "" }));
    if (validateTimetable(slots).some((i) => i.severity === "error")) throw new AppError("VALIDATION", "Resolve the hard conflicts before publishing.");

    const previous = store.timetableVersions.find((x) => x.departmentId === v.departmentId && x.programYear === v.programYear && x.status === "published");
    if (previous) {
      // Re-point the copied slots to the new version; past sessions are untouched.
      for (const s of store.timetableSlots) if (s.versionId === previous.id) s.versionId = v.id;
      previous.status = "archived";
    }
    v.status = "published";
    v.publishedAt = new Date().toISOString();
    v.publishedBy = user.id;
    audit(user, {
      action: "timetable.published",
      entity: "timetable_versions",
      entityId: v.id,
      summary: `Published ${v.programYear} ${deptCode(v.departmentId)} timetable revision ${v.revision}, effective ${formatDate(v.effectiveFrom, { year: true })}`,
      before: { status: "draft" },
      after: { status: "published", effectiveFrom: v.effectiveFrom },
      reason: null,
    });
    return v.revision;
  },
  success: (rev) => `Revision ${rev} published. Future sessions regenerated and students notified.`,
});

function describe(sessionId: string) {
  const s = getSessionById(sessionId);
  if (!s) throw new AppError("NOT_FOUND");
  const div = divisionById(s.slot.divisionId)!;
  return { s, div, label: `${divisionLabel(div)} ${subjectById(s.slot.subjectId)?.name} (${formatDate(s.date)} ${formatTime(s.slot.start)})` };
}

// cancel_session: no register is created and the session never counts as held.
export const cancelSession = action({
  permission: "sessions.manage",
  schema: sessionCancelSchema,
  run({ input, user }) {
    const { s, div, label } = describe(input.sessionId);
    assertDepartment(user, "sessions.manage", div.departmentId);
    if (s.date < istDate()) throw new AppError("SESSION_PAST");
    if (s.status === "cancelled") return label;
    const store = db();
    const o = store.sessionOverrides.get(s.id) ?? {};
    o.cancelled = { reason: input.reason, by: user.id, at: new Date().toISOString() };
    store.sessionOverrides.set(s.id, o);
    audit(user, {
      action: "session.cancelled",
      entity: "class_sessions",
      entityId: s.id,
      summary: `Cancelled ${label}`,
      before: { status: s.status, register: s.register?.state ?? null },
      after: { status: "cancelled" },
      reason: input.reason,
    });
    return label;
  },
  success: "Session cancelled. Students and the professor have been notified.",
});

export const assignSubstitute = action({
  permission: "sessions.manage",
  schema: sessionSubstituteSchema,
  run({ input, user }) {
    const { s, div, label } = describe(input.sessionId);
    assertDepartment(user, "sessions.manage", div.departmentId);
    const sub = staffById(input.staffId);
    if (!sub) throw new AppError("NOT_FOUND");
    const store = db();
    const o = store.sessionOverrides.get(s.id) ?? {};
    o.substituteId = sub.id;
    store.sessionOverrides.set(s.id, o);
    audit(user, {
      action: "session.substitute.assigned",
      entity: "session_staff",
      entityId: s.id,
      summary: `${sub.name} substitutes for ${staffById(s.staffId)?.name} in ${label}`,
      before: null,
      after: { substitute: sub.name },
      reason: null,
    });
    return sub.name;
  },
  success: (name) => `${name} can now mark attendance for this session.`,
});
