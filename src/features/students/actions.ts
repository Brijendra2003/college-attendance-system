"use server";

import { z } from "zod";
import { addDays } from "@/shared/dates";
import { AppError } from "@/shared/errors";
import { studentCreateSchema, transferSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { assertDepartment } from "@/lib/auth/permissions";
import { audit, db, nextId, ACTIVE_TERM_ID, ACTIVE_YEAR_ID } from "@/lib/data/store";
import { batchLabel, divisionById, divisionLabel } from "@/features/common/lookups";

const SEMESTER = { FE: 1, SE: 3, TE: 5, BE: 7 } as const;

// Production: create_student RPC (one transaction: student, enrollment,
// guardian + pending link). Auth account provisioning is a separate step.
export const createStudent = action({
  permission: "students.manage",
  schema: studentCreateSchema,
  run({ input, user }) {
    const store = db();
    const div = divisionById(input.divisionId);
    const batch = store.batches.find((b) => b.id === input.batchId && b.divisionId === input.divisionId);
    if (!div || !batch) throw new AppError("NOT_FOUND");
    assertDepartment(user, "students.manage", div.departmentId);

    // Duplicate detection (§11.4): enrollment no, PRN, email, phone + name + DOB.
    const dup = store.students.find(
      (s) =>
        s.enrollmentNo === input.enrollmentNo ||
        (input.prn && s.prn === input.prn) ||
        s.email.toLowerCase() === input.email.toLowerCase() ||
        (s.phone === input.phone && s.name.toLowerCase() === input.name.toLowerCase() && s.dob === input.dob),
    );
    if (dup) throw new AppError("DUPLICATE", `Possible duplicate of ${dup.name} (${dup.enrollmentNo}).`);

    const id = nextId("stu");
    const today = new Date().toISOString();
    store.students.push({
      id,
      enrollmentNo: input.enrollmentNo,
      prn: input.prn || null,
      name: input.name,
      gender: input.gender,
      dob: input.dob,
      email: input.email,
      phone: input.phone,
      admissionYear: 2026,
      admissionType: input.admissionType,
      departmentId: div.departmentId,
      status: "active",
      createdAt: today,
    });
    const roll = Math.max(0, ...store.enrollments.filter((e) => e.divisionId === div.id).map((e) => e.rollNo)) + 1;
    store.enrollments.push({
      id: nextId("enr"),
      studentId: id,
      academicYearId: ACTIVE_YEAR_ID,
      termId: ACTIVE_TERM_ID,
      departmentId: div.departmentId,
      programYear: div.programYear,
      semester: SEMESTER[div.programYear],
      divisionId: div.id,
      batchId: batch.id,
      rollNo: roll,
      enrollmentType: input.admissionType === "direct_second_year" ? "dse" : "regular",
      isPrimary: true,
      validFrom: today.slice(0, 10),
      validTo: null,
      reason: "New admission",
    });
    store.propensity.set(id, 0.9);
    const gid = nextId("gdn");
    store.guardians.push({ id: gid, name: input.guardianName, relation: input.guardianRelation, phone: input.guardianPhone, email: null, activated: false });
    store.guardianLinks.push({ id: nextId("gl"), studentId: id, guardianId: gid, status: "pending", isPrimary: true, verifiedBy: null, verifiedAt: null });
    audit(user, {
      action: "student.created",
      entity: "students",
      entityId: id,
      summary: `Admitted ${input.name} (${input.enrollmentNo}) to ${divisionLabel(div)}, roll ${roll}`,
      before: null,
      after: { enrollmentNo: input.enrollmentNo, division: divisionLabel(div), batch: batchLabel(batch.id) },
      reason: null,
    });
    return { id, name: input.name };
  },
  success: (d) => `${d.name} added. Guardian link is pending verification.`,
});

// Effective-dated: close the current enrollment, open a new one (§7.5).
// Past attendance keeps its division/batch snapshot.
export const transferStudent = action({
  permission: "students.manage",
  schema: transferSchema,
  run({ input, user }) {
    const store = db();
    const current = store.enrollments.find((e) => e.studentId === input.studentId && e.validTo === null && e.isPrimary);
    const div = divisionById(input.divisionId);
    const batch = store.batches.find((b) => b.id === input.batchId && b.divisionId === input.divisionId);
    if (!current || !div || !batch) throw new AppError("NOT_FOUND");
    assertDepartment(user, "students.manage", current.departmentId);
    assertDepartment(user, "students.manage", div.departmentId);
    if (current.divisionId === div.id && current.batchId === batch.id) throw new AppError("VALIDATION", "The student is already in that division and batch.");
    if (input.effectiveFrom <= current.validFrom) throw new AppError("VALIDATION", "The transfer must start after the current enrollment began.");

    const before = { division: divisionLabel(divisionById(current.divisionId)!), batch: batchLabel(current.batchId) };
    current.validTo = addDays(input.effectiveFrom, -1);
    const roll = current.divisionId === div.id ? current.rollNo : Math.max(0, ...store.enrollments.filter((e) => e.divisionId === div.id).map((e) => e.rollNo)) + 1;
    store.enrollments.push({
      ...current,
      id: nextId("enr"),
      divisionId: div.id,
      batchId: batch.id,
      departmentId: div.departmentId,
      rollNo: roll,
      validFrom: input.effectiveFrom,
      validTo: null,
      reason: input.reason,
    });
    audit(user, {
      action: "student.transferred",
      entity: "student_enrollments",
      entityId: input.studentId,
      summary: `Moved ${store.students.find((s) => s.id === input.studentId)?.name} from ${before.division} ${before.batch} to ${divisionLabel(div)} ${batchLabel(batch.id)}`,
      before,
      after: { division: divisionLabel(div), batch: batchLabel(batch.id), effectiveFrom: input.effectiveFrom },
      reason: input.reason,
    });
    return true;
  },
  success: "Enrollment updated. History and past attendance are preserved.",
});

export const setStudentStatus = action({
  permission: "students.manage",
  schema: z.object({ studentId: z.string().min(1), status: z.enum(["active", "withdrawn", "detained"]), reason: z.string().trim().min(5, "Give a reason") }),
  run({ input, user }) {
    const s = db().students.find((x) => x.id === input.studentId);
    if (!s) throw new AppError("NOT_FOUND");
    assertDepartment(user, "students.manage", s.departmentId);
    const before = s.status;
    s.status = input.status;
    audit(user, {
      action: `student.${input.status === "active" ? "reactivated" : input.status}`,
      entity: "students",
      entityId: s.id,
      summary: `${s.name}: ${before} → ${input.status}`,
      before: { status: before },
      after: { status: input.status },
      reason: input.reason,
    });
    return input.status;
  },
  success: (st) => `Status set to ${st}.`,
});
