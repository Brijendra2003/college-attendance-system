"use server";

import { z } from "zod";
import { action } from "@/lib/auth/action";
import { departmentScope } from "@/lib/auth/permissions";
import { audit, db, nextId } from "@/lib/data/store";
import { shortageRows } from "./queries";

// Enqueues shortage_warning events for students and guardians (§13). The
// dedupe key short:{student}:{offering}:{iso_week} stops repeat sends.
export const notifyShortage = action({
  permission: "attendance.view",
  schema: z.object({ dept: z.string().optional(), py: z.string().optional(), division: z.string().optional() }),
  run({ input, user }) {
    const scope = departmentScope(user, "attendance.view");
    const rows = shortageRows({ departmentId: scope ?? (input.dept || null), programYear: input.py || undefined, divisionId: input.division || undefined });
    const store = db();
    const now = new Date().toISOString();
    store.announcements.unshift({
      id: nextId("an"),
      title: `Attendance shortage warning (${rows.length} students)`,
      body: `Your attendance is below ${store.policy.minPercent}% in at least one subject. Meet your class teacher this week. Sessions needed to recover are shown in the app.`,
      priority: "urgent",
      audience: "parents",
      departmentId: scope ?? (input.dept || null),
      channels: ["inapp", "push"],
      createdBy: user.id,
      createdAt: now,
      publishAt: now,
      recipients: rows.length * 2,
      readCount: 0,
    });
    audit(user, {
      action: "shortage.notified",
      entity: "notification_outbox",
      entityId: "shortage_warning",
      summary: `Sent shortage warnings to ${rows.length} students and their guardians`,
      before: null,
      after: { students: rows.length },
      reason: null,
    });
    return rows.length;
  },
  success: (n) => `Warnings queued for ${n} students and their guardians.`,
});
