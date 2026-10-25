"use client";

import { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const LABEL = { xlsx: "Excel (.xlsx)", csv: "CSV", pdf: "PDF (print)" } as const;
const ICON = { xlsx: FileSpreadsheet, csv: Sheet, pdf: FileText } as const;
type Format = keyof typeof LABEL;

/** Download menu for a report, carrying the page's current filters. */
export function ExportMenu({ reportKey, filters, formats = ["xlsx", "csv", "pdf"] }: { reportKey: string; filters: Record<string, string>; formats?: Format[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);

  async function download(format: Format) {
    setBusy(format);
    setOpen(false);
    try {
      const res = await fetch(`/api/reports/${reportKey}?${new URLSearchParams({ ...filters, format })}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `${reportKey}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error && e.message ? e.message : "Export failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button type="button" className={buttonClass("secondary")} onClick={() => setOpen((o) => !o)} disabled={busy !== null} aria-haspopup="menu" aria-expanded={open}>
        {busy ? <Spinner label="Preparing" /> : (<><Download className="size-4" /> Export <ChevronDown className="size-3.5" /></>)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul role="menu" className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-pop">
            {formats.map((f) => {
              const Icon = ICON[f];
              return (
                <li key={f}>
                  <button type="button" role="menuitem" onClick={() => download(f)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-navy-50")}>
                    <Icon className="size-4 text-muted" /> {LABEL[f]}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
