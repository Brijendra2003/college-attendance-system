"use server";

import { announcementSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { rpc } from "@/lib/db";

// Publishing creates per-recipient rows and outbox entries (§11.12); HODs are
// limited to their own department inside the RPC.
export const publishAnnouncement = action({
  permission: ["announcements.college", "announcements.class"],
  schema: announcementSchema,
  arrays: ["channels"],
  run: ({ input }) =>
    rpc<{ id: string; recipients: number; scheduled: boolean }>("publish_announcement", {
      p: {
        ...input,
        departmentId: input.departmentId || null,
        // datetime-local has no zone; the college works in IST.
        publishAt: input.publishAt ? `${input.publishAt}:00+05:30` : null,
      },
    }),
  success: (r) => (r.scheduled ? "Scheduled. It will be delivered at the chosen time." : `Sent to ${r.recipients.toLocaleString("en-IN")} app users.`),
});
