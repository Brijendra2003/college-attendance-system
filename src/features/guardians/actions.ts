"use server";

import { z } from "zod";
import { AppError } from "@/shared/errors";
import { action } from "@/lib/auth/action";
import { audit, db } from "@/lib/data/store";

// A verified link triggers the SMS invite; the parent then signs in with OTP
// on that number (§11.5). There is no self-linking.
export const setGuardianLink = action({
  permission: "guardians.manage",
  schema: z.object({ linkId: z.string().min(1), status: z.enum(["verified", "revoked"]) }),
  run({ input, user }) {
    const store = db();
    const link = store.guardianLinks.find((l) => l.id === input.linkId);
    if (!link) throw new AppError("NOT_FOUND");
    const before = link.status;
    link.status = input.status;
    link.verifiedBy = input.status === "verified" ? user.id : link.verifiedBy;
    link.verifiedAt = input.status === "verified" ? new Date().toISOString() : link.verifiedAt;
    const g = store.guardians.find((x) => x.id === link.guardianId)!;
    const s = store.students.find((x) => x.id === link.studentId)!;
    audit(user, {
      action: `guardian_link.${input.status}`,
      entity: "guardian_links",
      entityId: link.id,
      summary: `${input.status === "verified" ? "Verified" : "Revoked"} ${g.name} (${g.relation}) for ${s.name}`,
      before: { status: before },
      after: { status: input.status },
      reason: null,
    });
    return input.status;
  },
  success: (s) => (s === "verified" ? "Verified. An SMS invite has been queued for the guardian." : "Link revoked. The guardian loses access immediately."),
});
