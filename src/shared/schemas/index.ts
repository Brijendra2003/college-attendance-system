// Zod schemas shared by web forms, Server Actions and the mobile app.
import { z } from "zod";

const id = z.string().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const reason = z.string().trim().min(5, "Give a reason of at least 5 characters").max(500);

export const studentCreateSchema = z.object({
  name: z.string().trim().min(3, "Enter the full name").max(120),
  enrollmentNo: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{6,15}$/, "6–15 capital letters or digits"),
  prn: z
    .string()
    .trim()
    .regex(/^\d{16}$/, "PRN is 16 digits")
    .or(z.literal(""))
    .optional(),
  gender: z.enum(["M", "F", "O"]),
  dob: isoDate,
  email: z.email("Enter a valid email"),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "10-digit Indian mobile number"),
  divisionId: id,
  batchId: id,
  admissionType: z.enum(["fe_regular", "direct_second_year"]),
  guardianName: z.string().trim().min(3, "Enter the guardian's name"),
  guardianRelation: z.enum(["Father", "Mother", "Guardian"]),
  guardianPhone: z.string().trim().regex(/^[6-9]\d{9}$/, "10-digit Indian mobile number"),
});
export type StudentCreateInput = z.infer<typeof studentCreateSchema>;

export const transferSchema = z.object({
  studentId: id,
  divisionId: id,
  batchId: id,
  effectiveFrom: isoDate,
  reason,
});

export const hodAssignSchema = z.object({
  departmentId: id,
  staffId: id,
  effectiveFrom: isoDate,
});

export const divisionCreateSchema = z.object({
  departmentId: id,
  programYear: z.enum(["FE", "SE", "TE", "BE"]),
  code: z.string().trim().regex(/^[A-Z]$/, "One capital letter"),
  capacity: z.coerce.number().int().min(10).max(120),
  batchCount: z.coerce.number().int().min(1).max(6),
});

export const sessionCancelSchema = z.object({ sessionId: id, reason });
export const sessionSubstituteSchema = z.object({ sessionId: id, staffId: id });

export const decisionSchema = z.object({
  id,
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

export const reopenSchema = z.object({ sessionId: id, reason });

export const announcementSchema = z.object({
  title: z.string().trim().min(4, "Add a title").max(140),
  body: z.string().trim().min(10, "Write at least a sentence").max(4000),
  priority: z.enum(["normal", "important", "urgent"]),
  audience: z.enum(["college", "students", "staff", "parents", "department"]),
  departmentId: z.string().optional(),
  channels: z.array(z.enum(["inapp", "push", "email", "sms"])).min(1),
  publishAt: z.string().optional(),
});

export const policySchema = z.object({
  minPercent: z.coerce.number().min(0).max(100),
  warnPercent: z.coerce.number().min(0).max(100),
  countMode: z.enum(["session", "hours"]),
  eligibilityBasis: z.enum(["per_subject_component", "per_subject", "aggregate"]),
  editWindowHours: z.coerce.number().int().min(0).max(168),
  lockAfterHours: z.coerce.number().int().min(1).max(336),
  defaultUnmarkedStatus: z.enum(["A", "P"]),
  leaveAppliesRetroactively: z.coerce.boolean(),
});

export const rolePermissionSchema = z.object({
  role: z.string(),
  permission: z.string(),
  scope: z.enum(["none", "all", "department", "assigned", "self", "linked"]),
});

export const studentImportRowSchema = studentCreateSchema
  .omit({ divisionId: true, batchId: true })
  .extend({
    department: z.string().trim().toUpperCase(),
    programYear: z.enum(["FE", "SE", "TE", "BE"]),
    division: z.string().trim().toUpperCase(),
    batch: z.coerce.number().int().min(1),
  });
export type StudentImportRow = z.infer<typeof studentImportRowSchema>;
