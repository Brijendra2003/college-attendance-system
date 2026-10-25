"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError, ERROR_MESSAGES } from "@/shared/errors";
import { action, type ActionResult } from "@/lib/auth/action";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser, needsMfa } from "@/lib/auth/session";
import { rpc } from "@/lib/db";
import { MAX_IMPORT_BYTES, missingStudentColumns, readTabular } from "./parse";

// Upload → parse here → stage + validate in Postgres (§12). This takes a File,
// so it does its own checks instead of the form-field action() wrapper.
export async function stageStudentImport(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: ERROR_MESSAGES.AUTH_REQUIRED };
  if (needsMfa(user)) return { ok: false, error: ERROR_MESSAGES.MFA_REQUIRED };
  if (!can(user, "students.import")) return { ok: false, error: ERROR_MESSAGES.FORBIDDEN };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a .xlsx or .csv file to upload." };
  if (!/\.(csv|xlsx)$/i.test(file.name)) return { ok: false, error: "Upload the template as .xlsx or .csv." };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: "The file is larger than 5 MB. Split it into smaller files." };

  let jobId: string;
  try {
    const { headers, rows } = await readTabular(file);
    if (!rows.length) return { ok: false, error: "The file has no data rows." };
    if (rows.length > 5000) return { ok: false, error: "Import at most 5,000 rows per file." };
    const missing = missingStudentColumns(headers);
    if (missing.length) return { ok: false, error: `Missing columns: ${missing.join(", ")}. Download the template.` };
    jobId = await rpc<string>("stage_student_import", { p_file_name: file.name, p_rows: rows.map((r, i) => ({ ...r, line: i + 2 })) });
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error("[import]", e);
    return { ok: false, error: "The file could not be read. Save it again from the template and retry." };
  }
  refresh();
  redirect(`/people/imports?job=${jobId}`);
}

// commit_student_import: one transaction, idempotent on enrollment number.
export const commitStudentImport = action({
  permission: "students.import",
  schema: z.object({ jobId: z.uuid() }),
  run: ({ input }) => rpc<number>("commit_student_import", { p_job: input.jobId }),
  success: (n) => `${n} students created. Provision app accounts and verify guardians next.`,
});
