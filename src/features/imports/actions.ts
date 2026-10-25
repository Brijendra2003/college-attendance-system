"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ERROR_MESSAGES, AppError } from "@/shared/errors";
import { studentImportRowSchema } from "@/shared/schemas";
import { action, type ActionResult } from "@/lib/auth/action";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { audit, db, nextId, ACTIVE_TERM_ID, ACTIVE_YEAR_ID } from "@/lib/data/store";
import { invalidate } from "@/lib/data/engine";
import { parseCsv, STUDENT_TEMPLATE_HEADERS } from "./csv";

const MAX_BYTES = 2 * 1024 * 1024;
const SEMESTER = { FE: 1, SE: 3, TE: 5, BE: 7 } as const;

function resolveTarget(row: z.infer<typeof studentImportRowSchema>) {
  const store = db();
  const dept = store.departments.find((d) => d.code === row.department);
  const div = dept && store.divisions.find((d) => d.academicYearId === ACTIVE_YEAR_ID && d.departmentId === dept.id && d.programYear === row.programYear && d.code === row.division);
  const batch = div && store.batches.find((b) => b.divisionId === div.id && b.code === String(row.batch));
  return { dept, div, batch };
}

// Upload → parse → stage import_rows → validate (§12). This takes a File,
// so it does its own auth checks instead of the form-field action() wrapper.
export async function stageStudentImport(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: ERROR_MESSAGES.AUTH_REQUIRED };
  if (!can(user, "students.import")) return { ok: false, error: ERROR_MESSAGES.FORBIDDEN };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file to upload." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File is larger than 2 MB. Split it into smaller files." };

  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { ok: false, error: "The file has no data rows." };
  const headers = rows[0].map((h) => h.trim());
  const missing = STUDENT_TEMPLATE_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) return { ok: false, error: `Missing columns: ${missing.join(", ")}. Download the template.` };

  const store = db();
  const seenEnrollment = new Set<string>();
  const staged = rows.slice(1).map((cells, i) => {
    const raw = Object.fromEntries(headers.map((h, j) => [h, (cells[j] ?? "").trim()]));
    const errors: string[] = [];
    const parsed = studentImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${issue.path.join(".")}: ${issue.message}`);
    } else {
      const r = parsed.data;
      const { dept, div, batch } = resolveTarget(r);
      if (!dept) errors.push(`department: unknown branch “${r.department}”`);
      else if (!div) errors.push(`division: ${r.programYear} ${r.department}-${r.division} does not exist in 2026-27`);
      else if (!batch) errors.push(`batch: batch ${r.batch} not found in ${r.division}`);
      if (seenEnrollment.has(r.enrollmentNo)) errors.push("enrollmentNo: duplicated within this file");
      if (store.students.some((s) => s.enrollmentNo === r.enrollmentNo)) errors.push("enrollmentNo: already exists (will be skipped on commit)");
      if (r.prn && store.students.some((s) => s.prn === r.prn)) errors.push("prn: belongs to another student");
      seenEnrollment.add(r.enrollmentNo);
    }
    return { line: i + 2, raw, errors, committed: false };
  });

  const jobId = nextId("imp");
  const errorRows = staged.filter((r) => r.errors.length).length;
  store.stagedImports.set(jobId, staged);
  store.imports.unshift({
    id: jobId,
    kind: "students",
    fileName: file.name,
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    status: errorRows === staged.length ? "failed" : "validated",
    totalRows: staged.length,
    okRows: staged.length - errorRows,
    errorRows,
  });
  invalidate();
  refresh();
  redirect(`/people/imports?job=${jobId}`);
}

// commit_import(job): one transaction, idempotent on enrollment number.
export const commitStudentImport = action({
  permission: "students.import",
  schema: z.object({ jobId: z.string().min(1) }),
  run({ input, user }) {
    const store = db();
    const job = store.imports.find((j) => j.id === input.jobId);
    const staged = store.stagedImports.get(input.jobId);
    if (!job || !staged) throw new AppError("NOT_FOUND");
    if (job.status === "committed") return 0;
    let created = 0;
    for (const row of staged) {
      if (row.errors.length || row.committed) continue;
      const r = studentImportRowSchema.parse(row.raw);
      if (store.students.some((s) => s.enrollmentNo === r.enrollmentNo)) continue;
      const { div, batch } = resolveTarget(r);
      if (!div || !batch) continue;
      const id = nextId("stu");
      const today = new Date().toISOString();
      store.students.push({ id, enrollmentNo: r.enrollmentNo, prn: r.prn || null, name: r.name, gender: r.gender, dob: r.dob, email: r.email, phone: r.phone, admissionYear: 2026, admissionType: r.admissionType, departmentId: div.departmentId, status: "active", createdAt: today });
      const roll = Math.max(0, ...store.enrollments.filter((e) => e.divisionId === div.id).map((e) => e.rollNo)) + 1;
      store.enrollments.push({ id: nextId("enr"), studentId: id, academicYearId: ACTIVE_YEAR_ID, termId: ACTIVE_TERM_ID, departmentId: div.departmentId, programYear: div.programYear, semester: SEMESTER[div.programYear], divisionId: div.id, batchId: batch.id, rollNo: roll, enrollmentType: r.admissionType === "direct_second_year" ? "dse" : "regular", isPrimary: true, validFrom: today.slice(0, 10), validTo: null, reason: `Import ${job.fileName}` });
      store.propensity.set(id, 0.9);
      const gid = nextId("gdn");
      store.guardians.push({ id: gid, name: r.guardianName, relation: r.guardianRelation, phone: r.guardianPhone, email: null, activated: false });
      store.guardianLinks.push({ id: nextId("gl"), studentId: id, guardianId: gid, status: "pending", isPrimary: true, verifiedBy: null, verifiedAt: null });
      row.committed = true;
      created++;
    }
    job.status = "committed";
    audit(user, { action: "import.committed", entity: "import_jobs", entityId: job.id, summary: `Committed ${job.fileName}: ${created} students created`, before: null, after: { created }, reason: null });
    return created;
  },
  success: (n) => `${n} students created. Account provisioning and guardian verification are next.`,
});
