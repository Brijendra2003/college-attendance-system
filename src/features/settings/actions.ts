"use server";

import { z } from "zod";
import { AppError } from "@/shared/errors";
import { PERMISSIONS, ROLES, type Permission, type Role, type Scope } from "@/shared/permissions";
import { policySchema, rolePermissionSchema } from "@/shared/schemas";
import { action } from "@/lib/auth/action";
import { audit, db } from "@/lib/data/store";

export const updatePolicy = action({
  permission: "attendance.policy.manage",
  schema: policySchema.refine((p) => p.warnPercent >= p.minPercent, { message: "Warning threshold must be at or above the minimum", path: ["warnPercent"] }),
  run({ input, user }) {
    const store = db();
    const before = { ...store.policy };
    Object.assign(store.policy, input);
    const changed = Object.keys(input).filter((k) => before[k as keyof typeof before] !== input[k as keyof typeof input]);
    audit(user, {
      action: "policy.updated",
      entity: "attendance_policies",
      entityId: "college",
      summary: changed.length ? `Updated college attendance policy: ${changed.join(", ")}` : "Saved attendance policy (no changes)",
      before: Object.fromEntries(changed.map((k) => [k, before[k as keyof typeof before]])),
      after: Object.fromEntries(changed.map((k) => [k, input[k as keyof typeof input]])),
      reason: null,
    });
    return changed.length;
  },
  success: "Policy saved. Summaries and shortage lists use the new values immediately.",
});

export const updateCollege = action({
  permission: "settings.manage",
  schema: z.object({
    name: z.string().trim().min(5),
    shortName: z.string().trim().min(2).max(10),
    address: z.string().trim().min(10),
    phone: z.string().trim().min(6),
    email: z.email(),
    principalName: z.string().trim().min(3),
  }),
  run({ input, user }) {
    const c = db().college;
    const before = { ...c };
    Object.assign(c, input);
    audit(user, { action: "college.updated", entity: "college", entityId: "1", summary: "Updated college profile", before, after: input, reason: null });
    return true;
  },
  success: "College profile saved.",
});

export const setRolePermission = action({
  permission: "roles.manage",
  schema: rolePermissionSchema,
  run({ input, user }) {
    if (!ROLES.includes(input.role as Role) || !PERMISSIONS.includes(input.permission as Permission)) throw new AppError("NOT_FOUND");
    const role = input.role as Role;
    const perm = input.permission as Permission;
    if (role === "admin" && perm === "roles.manage" && input.scope === "none") throw new AppError("VALIDATION", "Admin must keep roles.manage, or nobody could edit roles.");
    const grants = db().rolePermissions[role];
    const before = grants[perm] ?? "none";
    if (input.scope === "none") delete grants[perm];
    else grants[perm] = input.scope as Scope;
    audit(user, {
      action: "role_permission.updated",
      entity: "role_permissions",
      entityId: role,
      summary: `${role}: ${perm} ${before} → ${input.scope}`,
      before: { scope: before },
      after: { scope: input.scope },
      reason: null,
    });
    return true;
  },
  success: "Permission updated. It applies on the user's next request.",
});
