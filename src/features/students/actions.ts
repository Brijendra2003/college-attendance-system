"use server";

import { z } from "zod";
import { studentCreateSchema, transferSchema } from "@/shared/schemas";
import { AppError } from "@/shared/errors";
import { action } from "@/lib/auth/action";
import { rpc } from "@/lib/db";

// create_student runs as one transaction: student, enrollment, guardian and
// pending link, with duplicate detection (§11.4). Accounts are provisioned
// separately (§12).
export const createStudent = action({
  permission: "students.manage",
  schema: studentCreateSchema,
  async run({ input }) {
    try {
      await rpc("create_student", { p: input });
    } catch (e) {
      if (e instanceof AppError && e.code === "DUPLICATE") throw new AppError("DUPLICATE", "Possible duplicate: a student with the same enrollment number, PRN, email or phone + name + date of birth exists.");
      throw e;
    }
    return input.name;
  },
  success: (name) => `${name} added. The guardian link is pending verification.`,
});

// Effective-dated: closes the current enrollment and opens a new one (§7.5).
export const transferStudent = action({
  permission: "students.manage",
  schema: transferSchema,
  run: ({ input }) =>
    rpc("transfer_student", { p_student: input.studentId, p_division: input.divisionId, p_batch: input.batchId, p_from: input.effectiveFrom, p_reason: input.reason }),
  success: "Enrollment updated. History and past attendance are preserved.",
});

export const setStudentStatus = action({
  permission: "students.manage",
  schema: z.object({
    studentId: z.uuid(),
    status: z.enum(["active", "withdrawn", "detained", "passed_out"]),
    reason: z.string().trim().min(5, "Give a reason of at least 5 characters"),
  }),
  run: ({ input }) => rpc("set_student_status", { p_student: input.studentId, p_status: input.status, p_reason: input.reason }),
  success: "Status updated.",
});
