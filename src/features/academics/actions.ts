"use server";

import { addDays } from "@/shared/dates";
import { AppError } from "@/shared/errors";
import { divisionCreateSchema, hodAssignSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { audit, db, nextId, ACTIVE_YEAR_ID } from "@/lib/data/store";
import { currentHod, departmentById, staffById } from "@/features/common/lookups";

// Rule 1: one HOD per department at any moment (exclusion constraint in
// production). Close the current row and open a new one; never update in place.
export const assignHod = action({
  permission: "blueprint.manage",
  schema: hodAssignSchema,
  run({ input, user }) {
    const store = db();
    const dept = departmentById(input.departmentId);
    const s = staffById(input.staffId);
    if (!dept || !s || s.departmentId !== dept.id) throw new AppError("NOT_FOUND");
    const current = currentHod(dept.id);
    if (current?.staff.id === s.id) return dept.code;
    if (current) {
      if (input.effectiveFrom <= current.row.validFrom) throw new AppError("VALIDATION", "The new HOD must start after the current HOD's start date.");
      current.row.validTo = addDays(input.effectiveFrom, -1);
    }
    store.departmentStaff.push({ id: nextId("ds"), departmentId: dept.id, staffId: s.id, role: "hod", validFrom: input.effectiveFrom, validTo: null });
    if (!store.profiles.some((p) => p.staffId === s.id)) {
      store.profiles.push({ id: `usr-${s.id}`, name: s.name, email: s.email, roles: ["hod", "professor"], staffId: s.id, isActive: true });
    }
    audit(user, {
      action: "department.hod.assigned",
      entity: "department_staff",
      entityId: dept.id,
      summary: `${s.name} appointed HOD of ${dept.code} from ${input.effectiveFrom}`,
      before: current ? { hod: current.staff.name } : null,
      after: { hod: s.name, validFrom: input.effectiveFrom },
      reason: null,
    });
    return dept.code;
  },
  success: (code) => `HOD for ${code} updated. Previous assignment closed and kept in history.`,
});

export const createDivision = action({
  permission: "blueprint.manage",
  schema: divisionCreateSchema,
  run({ input, user }) {
    const store = db();
    const dept = departmentById(input.departmentId);
    if (!dept) throw new AppError("NOT_FOUND");
    const exists = store.divisions.some(
      (d) => d.academicYearId === ACTIVE_YEAR_ID && d.departmentId === dept.id && d.programYear === input.programYear && d.code === input.code,
    );
    if (exists) throw new AppError("DIVISION_EXISTS");
    const id = `div-${dept.code.toLowerCase()}-${input.programYear.toLowerCase()}-${input.code.toLowerCase()}`;
    store.divisions.push({
      id,
      academicYearId: ACTIVE_YEAR_ID,
      departmentId: dept.id,
      programYear: input.programYear,
      code: input.code,
      capacity: input.capacity,
      classTeacherId: null,
      room: "Unassigned",
    });
    for (let n = 1; n <= input.batchCount; n++) store.batches.push({ id: `${id}-b${n}`, divisionId: id, code: String(n) });
    audit(user, {
      action: "division.created",
      entity: "divisions",
      entityId: id,
      summary: `Created ${input.programYear} ${dept.code}-${input.code} with ${input.batchCount} batches`,
      before: null,
      after: input,
      reason: null,
    });
    return `${input.programYear} ${dept.code}-${input.code}`;
  },
  success: (label) => `${label} created. Assign a class teacher and timetable next.`,
});
