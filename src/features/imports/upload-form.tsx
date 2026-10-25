"use client";

import { useActionState } from "react";
import { CircleAlert, Upload } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";
import { stageStudentImport } from "./actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(stageStudentImport, null);
  return (
    <form action={action} className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-[#f8fafd] px-4 py-8 text-center hover:border-primary hover:bg-primary-soft/40">
        <Upload className="size-6 text-primary" />
        <span className="text-sm font-medium text-ink">Choose the filled-in template (.csv)</span>
        <span className="text-xs text-muted">Up to 2 MB. Rows are validated before anything is saved.</span>
        <input type="file" name="file" accept=".csv,text/csv" required className="mt-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-white" />
      </label>
      {state && !state.ok && (
        <div className="flex items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-red-800">
          <CircleAlert className="size-4 shrink-0" /> {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "w-full")}>
        {pending ? "Validating…" : "Upload & validate"}
      </button>
    </form>
  );
}
