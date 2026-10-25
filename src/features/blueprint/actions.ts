"use server";

import { blueprintSchema, type BlueprintDoc } from "@/shared/blueprint";
import { AppError, ERROR_MESSAGES } from "@/shared/errors";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/auth/action";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser, needsMfa } from "@/lib/auth/session";
import { rpc } from "@/lib/db";

// The document is JSON, not form fields, so these check permissions directly.
async function check(perm: "blueprint.manage" | "blueprint.activate") {
  const user = await getCurrentUser();
  if (!user) return ERROR_MESSAGES.AUTH_REQUIRED;
  if (needsMfa(user)) return ERROR_MESSAGES.MFA_REQUIRED;
  if (!can(user, perm)) return ERROR_MESSAGES.FORBIDDEN;
  return null;
}

export async function saveBlueprintDraft(doc: BlueprintDoc): Promise<ActionResult<{ id: string; errors: string[]; warnings: string[] }>> {
  const denied = await check("blueprint.manage");
  if (denied) return { ok: false, error: denied };
  const parsed = blueprintSchema.safeParse(doc);
  if (!parsed.success) return { ok: false, error: `${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}` };
  try {
    const r = await rpc<{ id: string; validation: { errors: string[]; warnings: string[] } }>("save_blueprint_draft", { p_doc: parsed.data });
    refresh();
    return { ok: true, data: { id: r.id, ...r.validation }, message: "Draft saved." };
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "Could not save the draft." };
  }
}

export async function activateBlueprint(draftId: string): Promise<ActionResult<Record<string, number>>> {
  const denied = await check("blueprint.activate");
  if (denied) return { ok: false, error: denied };
  try {
    const r = await rpc<Record<string, number>>("activate_blueprint", { p_version: draftId });
    refresh();
    return { ok: true, data: r, message: `Activated: ${r.divisions} divisions, ${r.subjects} subjects, ${r.offerings} new offerings.` };
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "Activation failed; nothing changed." };
  }
}
