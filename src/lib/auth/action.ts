import "server-only";
import { refresh } from "next/cache";
import type { z } from "zod";
import type { Permission } from "@/shared/permissions";
import { AppError, ERROR_MESSAGES } from "@/shared/errors";
import { can } from "./permissions";
import { getCurrentUser, needsMfa, type CurrentUser } from "./session";

export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

interface ActionOptions<S extends z.ZodType, T> {
  /** required permission; with an array, holding any one of them is enough */
  permission: Permission | Permission[];
  schema: S;
  /** form fields that always parse as arrays (checkbox groups) */
  arrays?: string[];
  run(ctx: { input: z.infer<S>; user: CurrentUser }): T | Promise<T>;
  success?: string | ((data: T) => string);
}

function formToObject(fd: FormData, arrays: string[] = []) {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = fd.getAll(key).filter((v) => typeof v === "string");
    out[key] = arrays.includes(key) || values.length > 1 ? values : values[0];
  }
  for (const key of arrays) out[key] ??= [];
  return out;
}

/**
 * Every Server Action goes through this wrapper (§10.4): Server Actions are
 * public HTTP endpoints, so it re-checks session, active status, MFA level,
 * permission and input. The RPC it calls re-checks everything again in SQL.
 */
export function action<S extends z.ZodType, T>(opts: ActionOptions<S, T>) {
  return async function run(_prev: ActionResult<T> | null, formData: FormData): Promise<ActionResult<T>> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: ERROR_MESSAGES.AUTH_REQUIRED };
    if (needsMfa(user)) return { ok: false, error: ERROR_MESSAGES.MFA_REQUIRED };
    const perms = Array.isArray(opts.permission) ? opts.permission : [opts.permission];
    if (!perms.some((p) => can(user, p))) return { ok: false, error: ERROR_MESSAGES.FORBIDDEN };

    const parsed = opts.schema.safeParse(formToObject(formData, opts.arrays));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path.join(".") || "_";
        fieldErrors[k] ??= issue.message;
      }
      return { ok: false, error: ERROR_MESSAGES.VALIDATION, fieldErrors };
    }
    try {
      const data = await opts.run({ input: parsed.data, user });
      refresh();
      const message = typeof opts.success === "function" ? opts.success(data) : opts.success;
      return { ok: true, data, message };
    } catch (e) {
      if (e instanceof AppError) return { ok: false, error: e.message };
      console.error("[action]", e);
      return { ok: false, error: "Something went wrong. It has been logged; try again." };
    }
  };
}
