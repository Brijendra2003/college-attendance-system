"use server";

import { z } from "zod";
import { divisionCreateSchema, hodAssignSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { rpc } from "@/lib/db";

// Effective-dated, audited changes; the rules live in the RPCs (§7.4–7.5).

export const assignHod = action({
  permission: "blueprint.manage",
  schema: hodAssignSchema,
  run: ({ input }) => rpc("assign_hod", { p_department: input.departmentId, p_staff: input.staffId, p_from: input.effectiveFrom }),
  success: "HOD updated. The previous assignment was closed and kept in history.",
});

export const createDivision = action({
  permission: "blueprint.manage",
  schema: divisionCreateSchema,
  run: ({ input }) =>
    rpc("create_division", {
      p_department: input.departmentId,
      p_program_year: input.programYear,
      p_code: input.code,
      p_capacity: input.capacity,
      p_batches: input.batchCount,
    }),
  success: "Division created. Assign a class teacher and a timetable next.",
});

export const setClassTeacher = action({
  permission: "assignments.manage",
  schema: z.object({ divisionId: z.uuid(), staffId: z.uuid(), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  run: ({ input }) => rpc("set_class_teacher", { p_division: input.divisionId, p_staff: input.staffId, p_from: input.effectiveFrom }),
  success: "Class teacher assigned.",
});
