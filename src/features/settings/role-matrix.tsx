"use client";

import { startTransition, useActionState, useState } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { setRolePermission } from "./actions";

const SCOPES = ["none", "all", "department", "assigned", "self", "linked"] as const;
const TONE: Record<string, string> = {
  none: "text-faint bg-surface",
  all: "text-ok-ink bg-ok-soft",
  department: "text-info-ink bg-info-soft",
  assigned: "text-violet-ink bg-violet-soft",
  self: "text-warn-ink bg-warn-soft",
  linked: "text-warn-ink bg-warn-soft",
};

/**
 * One role × permission cell; saves on change. Controlled and dispatched
 * without a <form action>, because React resets uncontrolled form fields
 * after a form action and the select would show a stale scope.
 */
export function ScopeCell({ role, permission, value }: { role: string; permission: string; value: string }) {
  const [scope, setScope] = useState(value);
  const [synced, setSynced] = useState(value);
  const [state, dispatch, pending] = useActionState(setRolePermission, null);
  if (synced !== value) {
    // The server's value changed (after refresh): follow it.
    setSynced(value);
    setScope(value);
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={scope}
        disabled={pending}
        aria-label={`${role} ${permission}`}
        onChange={(e) => {
          setScope(e.target.value);
          const fd = new FormData();
          fd.set("role", role);
          fd.set("permission", permission);
          fd.set("scope", e.target.value);
          startTransition(() => dispatch(fd));
        }}
        className={cn("h-7 w-full rounded-md border border-line px-1.5 text-[11px] font-semibold", TONE[scope] ?? TONE.none)}
      >
        {SCOPES.map((s) => (
          <option key={s} value={s}>
            {s === "none" ? "—" : s}
          </option>
        ))}
      </select>
      {pending && <Spinner className="text-primary" />}
      {state && !state.ok && (
        <span title={state.error} className="text-bad">
          <CircleAlert className="size-3.5" />
        </span>
      )}
    </div>
  );
}
