"use server";

import { z } from "zod";
import { policySchema, rolePermissionSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { rpc } from "@/lib/db";

// Sensitive settings need aal2 (MFA) — enforced again inside each RPC (§17).

export const updatePolicy = action({
  permission: "attendance.policy.manage",
  schema: policySchema.refine((p) => p.warnPercent >= p.minPercent, { message: "Warning threshold must be at or above the minimum", path: ["warnPercent"] }),
  run: ({ input }) => rpc("update_attendance_policy", { p: input }),
  success: "Policy saved. Summaries and shortage lists use the new values immediately.",
});

export const updateCollege = action({
  permission: "settings.manage",
  schema: z.object({
    name: z.string().trim().min(5),
    shortName: z.string().trim().min(2).max(12),
    address: z.string().trim().min(5),
    phone: z.string().trim().max(30).optional(),
    email: z.email(),
    principalName: z.string().trim().min(3),
  }),
  run: ({ input }) => rpc("update_college", { p: input }),
  success: "College profile saved.",
});

export const setRolePermission = action({
  permission: "roles.manage",
  schema: rolePermissionSchema,
  run: ({ input }) => rpc("set_role_permission", { p_role: input.role, p_permission: input.permission, p_scope: input.scope }),
  success: "Permission updated. It applies on the user's next request.",
});

export const setAppConfig = action({
  permission: "settings.manage",
  schema: z.object({ key: z.enum(["require_mfa_for_admins", "min_mobile_version", "maintenance_banner"]), value: z.string().max(500) }),
  run: ({ input }) => rpc("set_app_config", { p_key: input.key, p_value: input.value }),
  success: "Setting saved.",
});
