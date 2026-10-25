"use server";

import { redirect } from "next/navigation";
import { blueprintSchema, validateBlueprint, type BlueprintDoc } from "@/shared/blueprint";
import { AppError, ERROR_MESSAGES } from "@/shared/errors";
import type { ActionResult } from "@/lib/auth/action";
import { getCurrentUser, needsMfa } from "@/lib/auth/session";
import { rpc } from "@/lib/db";
import { setupStateSchema, type SetupState } from "./schema";

async function guard(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return ERROR_MESSAGES.AUTH_REQUIRED;
  if (needsMfa(user)) return ERROR_MESSAGES.MFA_REQUIRED;
  if (user.grants["settings.manage"] !== "all") return ERROR_MESSAGES.FORBIDDEN;
  return null;
}

/** Autosave: the wizard's state lives in the draft blueprint row (resumable, §11.1). */
export async function saveSetupDraft(state: SetupState): Promise<ActionResult<{ errors: string[]; warnings: string[] }>> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = setupStateSchema.safeParse(state);
  if (!parsed.success) return { ok: false, error: "Some fields are invalid." };
  try {
    const r = await rpc<{ validation: { errors: string[]; warnings: string[] } }>("save_blueprint_draft", { p_doc: { ...parsed.data.blueprint, setup: parsed.data } });
    return { ok: true, data: r.validation };
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "Could not save the draft." };
  }
}

export async function completeSetup(state: SetupState): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const parsed = setupStateSchema.safeParse(state);
  if (!parsed.success) return { ok: false, error: `Check: ${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}` };
  const doc: BlueprintDoc = blueprintSchema.parse(parsed.data.blueprint);
  const local = validateBlueprint(doc);
  if (local.errors.length) return { ok: false, error: local.errors[0] };
  try {
    await rpc("complete_setup", { p: { college: parsed.data.college, year: parsed.data.year, policy: parsed.data.policy, blueprint: doc } });
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "Setup failed. Nothing was saved; try again." };
  }
  redirect("/dashboard");
}
