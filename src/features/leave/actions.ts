"use server";

import { z } from "zod";
import { formatDate } from "@/shared/dates";
import { AppError } from "@/shared/errors";
import { action } from "@/lib/auth/action";
import { assertDepartment } from "@/lib/auth/permissions";
import { audit, db } from "@/lib/data/store";
import { staffById } from "@/features/common/lookups";

const decision = z.object({
  id: z.string().min(1),
  decision: z.enum(["approved", "rejected", "needs_info"]),
});

// decide_leave(): on approval the affected sessions resolve to L (future
// sessions suggest L; past A becomes L if leave applies retroactively, §8.7).
export const decideLeave = action({
  permission: "leave.student.decide",
  schema: decision,
  run({ input, user }) {
    const store = db();
    const req = store.leaveRequests.find((l) => l.id === input.id);
    if (!req) throw new AppError("NOT_FOUND");
    if (req.status !== "pending" && req.status !== "needs_info") throw new AppError("ALREADY_DECIDED");
    const s = store.students.find((x) => x.id === req.studentId)!;
    assertDepartment(user, "leave.student.decide", s.departmentId);
    req.status = input.decision;
    if (input.decision !== "needs_info") {
      req.decidedBy = user.id;
      req.decidedAt = new Date().toISOString();
    }
    audit(user, {
      action: `leave.${input.decision}`,
      entity: "leave_requests",
      entityId: req.id,
      summary: `${input.decision === "needs_info" ? "Asked for more information on" : input.decision === "approved" ? "Approved" : "Rejected"} leave for ${s.name} (${formatDate(req.fromDate)}${req.toDate !== req.fromDate ? ` – ${formatDate(req.toDate)}` : ""})`,
      before: { status: "pending" },
      after: { status: input.decision },
      reason: null,
    });
    return input.decision;
  },
  success: (d) => (d === "approved" ? "Leave approved. Affected sessions now show L; student and guardians notified." : d === "rejected" ? "Leave rejected." : "Sent back to the student for more information."),
});

export const decideStaffLeave = action({
  permission: "leave.staff.decide",
  schema: decision.extend({ decision: z.enum(["approved", "rejected"]) }),
  run({ input, user }) {
    const store = db();
    const req = store.staffLeave.find((l) => l.id === input.id);
    if (!req) throw new AppError("NOT_FOUND");
    if (req.status !== "pending") throw new AppError("ALREADY_DECIDED");
    const s = staffById(req.staffId)!;
    assertDepartment(user, "leave.staff.decide", s.departmentId);
    if (user.staffId === s.id) throw new AppError("FORBIDDEN", "Your own leave is approved by the Principal.");
    req.status = input.decision;
    req.decidedBy = user.id;
    req.decidedAt = new Date().toISOString();
    audit(user, {
      action: `staff_leave.${input.decision}`,
      entity: "staff_leave_requests",
      entityId: req.id,
      summary: `${input.decision === "approved" ? "Approved" : "Rejected"} ${req.type} leave for ${s.name}`,
      before: { status: "pending" },
      after: { status: input.decision },
      reason: null,
    });
    return input.decision;
  },
  success: (d) => (d === "approved" ? "Approved. Arrange substitutes for the affected sessions on the session board." : "Leave rejected."),
});
