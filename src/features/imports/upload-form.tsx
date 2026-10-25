"use client";

import { useActionState, useState } from "react";
import { CircleAlert, FileSpreadsheet, Upload } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { stageStudentImport } from "./actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(stageStudentImport, null);
  const [name, setName] = useState<string | null>(null);
  return (
    <form action={action} className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-subtle px-4 py-8 text-center hover:border-primary">
        {name ? <FileSpreadsheet className="size-6 text-primary" /> : <Upload className="size-6 text-primary" />}
        <span className="text-sm font-medium text-ink">{name ?? "Choose the filled-in template (.xlsx or .csv)"}</span>
        <span className="text-xs text-muted">Up to 5 MB. Every row is validated before anything is saved.</span>
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="sr-only"
          onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
      {state && !state.ok && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad-ink">
          <CircleAlert className="size-4 shrink-0" /> {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "w-full")}>
        {pending ? <Spinner label="Validating rows" /> : "Upload & validate"}
      </button>
    </form>
  );
}
