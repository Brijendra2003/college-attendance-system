// Blueprint document (§7.6): structure only — departments, divisions and
// batches per program year, the subject catalogue, period template. Validated
// here for instant feedback and again by validate_blueprint() in Postgres.
import { z } from "zod";

export const PROGRAM_YEAR_CODES = ["FE", "SE", "TE", "BE"] as const;
export type ProgramYearCode = (typeof PROGRAM_YEAR_CODES)[number];

export const divisionTemplateSchema = z.object({
  count: z.number().int().min(0).max(10),
  batches: z.number().int().min(0).max(6),
  capacity: z.number().int().min(10).max(240),
});

export const blueprintDepartmentSchema = z.object({
  code: z.string().regex(/^[A-Z]{2,8}$/, "2–8 capital letters"),
  name: z.string().trim().min(3),
  established: z.number().int().min(1850).max(2100).nullable().optional(),
  active: z.boolean(),
  divisions: z.partialRecord(z.enum(PROGRAM_YEAR_CODES), divisionTemplateSchema),
});

export const blueprintSubjectSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{3,12}$/, "3–12 capital letters, digits or -"),
  name: z.string().trim().min(3),
  department: z.string().nullable(),
  semester: z.number().int().min(1).max(8),
  credits: z.number().min(0).max(10),
  elective: z.boolean(),
  components: z
    .array(z.object({ kind: z.enum(["TH", "PR", "TUT"]), hours: z.number().min(0.5).max(10) }))
    .min(1, "Add at least one component"),
});

export const periodSchema = z.object({
  label: z.string().min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  kind: z.enum(["lecture", "practical", "break"]),
});

export const blueprintSchema = z.object({
  scheme: z.object({ code: z.string().min(2), name: z.string().min(3) }),
  departments: z.array(blueprintDepartmentSchema).min(1),
  subjects: z.array(blueprintSubjectSchema),
  periods: z.array(periodSchema).min(1),
  workingSaturdays: z.array(z.number().int().min(1).max(5)),
});

export type BlueprintDoc = z.infer<typeof blueprintSchema>;
export type BlueprintDepartment = z.infer<typeof blueprintDepartmentSchema>;
export type BlueprintSubject = z.infer<typeof blueprintSubjectSchema>;
export type DivisionTemplate = z.infer<typeof divisionTemplateSchema>;

/** Client-side checks mirroring validate_blueprint() in SQL. */
export function validateBlueprint(doc: BlueprintDoc): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = blueprintSchema.safeParse(doc);
  if (!parsed.success) {
    for (const i of parsed.error.issues) errors.push(`${i.path.join(".")}: ${i.message}`);
    return { errors, warnings };
  }
  const deptCodes = new Set<string>();
  for (const d of doc.departments) {
    if (deptCodes.has(d.code)) errors.push(`Duplicate department code ${d.code}`);
    deptCodes.add(d.code);
  }
  if (!doc.departments.some((d) => d.active)) errors.push("At least one active department is required");
  const subjectCodes = new Set<string>();
  for (const s of doc.subjects) {
    if (subjectCodes.has(s.code)) errors.push(`Duplicate subject code ${s.code}`);
    subjectCodes.add(s.code);
    if (s.department && !deptCodes.has(s.department)) errors.push(`Subject ${s.code} belongs to unknown department ${s.department}`);
  }
  const semestersOf: Record<ProgramYearCode, number[]> = { FE: [1, 2], SE: [3, 4], TE: [5, 6], BE: [7, 8] };
  for (const d of doc.departments.filter((x) => x.active)) {
    for (const py of PROGRAM_YEAR_CODES) {
      const t = d.divisions[py];
      if (!t || t.count === 0) continue;
      const subs = doc.subjects.filter((s) => (s.department === d.code || (py === "FE" && s.department === null)) && semestersOf[py].includes(s.semester));
      if (subs.length === 0) warnings.push(`${d.code} ${py} has no subjects for its semesters`);
      if (t.batches === 0 && subs.some((s) => s.components.some((c) => c.kind === "PR"))) {
        warnings.push(`${d.code} ${py} has divisions without batches while practical subjects exist`);
      }
    }
  }
  const load = new Map<string, number>();
  for (const s of doc.subjects) {
    const k = `${s.department ?? "FE common"} semester ${s.semester}`;
    load.set(k, (load.get(k) ?? 0) + s.components.reduce((a, c) => a + c.hours, 0));
  }
  for (const [k, h] of load) if (h > 30) warnings.push(`${k} schedules ${h} hours a week (more than 30)`);
  return { errors, warnings };
}
