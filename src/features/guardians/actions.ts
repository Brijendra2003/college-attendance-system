"use server";

import { z } from "zod";
import { action } from "@/lib/auth/action";
import { rpc } from "@/lib/db";

// A verified link queues the SMS invite; the parent then signs in with OTP on
// that number (§11.5). There is no self-linking.
export const setGuardianLink = action({
  permission: "guardians.manage",
  schema: z.object({ linkId: z.uuid(), status: z.enum(["verified", "revoked"]) }),
  async run({ input }) {
    await rpc("set_guardian_link_status", { p_link: input.linkId, p_status: input.status });
    return input.status;
  },
  success: (s) => (s === "verified" ? "Verified. An SMS invite has been queued for the guardian." : "Link revoked. The guardian loses access immediately."),
});
