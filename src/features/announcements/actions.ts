"use server";

import { AppError } from "@/shared/errors";
import { announcementSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { can, departmentScope } from "@/lib/auth/permissions";
import { audit, db, nextId } from "@/lib/data/store";
import { currentEnrollments } from "@/lib/data/engine";

// Publishing creates announcement_recipients rows and outbox entries
// (dedupe key ann:{id}:{user}) so delivery and reads are tracked per person.
export const publishAnnouncement = action({
  permission: ["announcements.college", "announcements.class"],
  schema: announcementSchema,
  arrays: ["channels"],
  run({ input, user }) {
    const store = db();
    const collegeWide = can(user, "announcements.college");
    let departmentId = input.audience === "department" ? input.departmentId || null : null;
    if (!collegeWide) {
      // HODs announce to their own department only.
      departmentId = departmentScope(user, "announcements.class");
      if (!departmentId || departmentId === "__none__") throw new AppError("FORBIDDEN");
    }
    if (input.audience === "department" && !departmentId) throw new AppError("VALIDATION", "Choose a department.");

    const enr = [...currentEnrollments().values()].filter((e) => !departmentId || e.departmentId === departmentId);
    const staff = store.staff.filter((s) => !departmentId || s.departmentId === departmentId).length;
    const audience = collegeWide ? input.audience : "department";
    const recipients =
      audience === "students" ? enr.length : audience === "parents" ? Math.round(enr.length * 1.3) : audience === "staff" ? staff : enr.length * 2 + staff;

    const now = new Date();
    // datetime-local has no zone; the college works in IST.
    const publishAt = input.publishAt ? new Date(`${input.publishAt}:00+05:30`) : now;
    if (Number.isNaN(publishAt.getTime())) throw new AppError("VALIDATION", "Enter a valid schedule time.");
    const id = nextId("an");
    store.announcements.unshift({
      id,
      title: input.title,
      body: input.body,
      priority: input.priority,
      audience,
      departmentId,
      channels: input.channels,
      createdBy: user.id,
      createdAt: now.toISOString(),
      publishAt: publishAt.toISOString(),
      recipients,
      readCount: 0,
    });
    audit(user, {
      action: publishAt > now ? "announcement.scheduled" : "announcement.published",
      entity: "announcements",
      entityId: id,
      summary: `${publishAt > now ? "Scheduled" : "Published"} “${input.title}” to ${recipients.toLocaleString("en-IN")} recipients`,
      before: null,
      after: { audience, channels: input.channels },
      reason: null,
    });
    return { recipients, scheduled: publishAt > now };
  },
  success: (r) => (r.scheduled ? `Scheduled for ${r.recipients.toLocaleString("en-IN")} recipients.` : `Sent to ${r.recipients.toLocaleString("en-IN")} recipients.`),
});
