"use server";

import { z } from "zod";
import { action } from "@/lib/auth/action";
import { rpc } from "@/lib/db";

// decide_leave resolves affected sessions and, per policy, converts past A to L (§8.7).
export const decideLeave = action({
  permission: "leave.student.decide",
  schema: z.object({ id: z.uuid(), decision: z.enum(["approved", "rejected", "needs_info"]) }),
  run: ({ input }) => rpc<string>("decide_leave", { p_request: input.id, p_decision: input.decision }),
  success: (d) => (d === "approved" ? "Leave approved. Affected sessions show L; student and guardians notified." : d === "rejected" ? "Leave rejected." : "Sent back for more information."),
});

export const decideStaffLeave = action({
  permission: "leave.staff.decide",
  schema: z.object({ id: z.uuid(), decision: z.enum(["approved", "rejected"]) }),
  run: ({ input }) => rpc<string>("decide_staff_leave", { p_request: input.id, p_decision: input.decision }),
  success: (d) => (d === "approved" ? "Approved. Arrange substitutes for the affected sessions on the session board." : "Leave rejected."),
});
