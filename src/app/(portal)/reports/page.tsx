import type { Metadata } from "next";
import { Suspense } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { Badge, ButtonLink, Card, PageHeader, PageSkeleton } from "@/components/ui/primitives";
import { REPORTS } from "@/features/reports/catalogue";
import { departmentById } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reports />
    </Suspense>
  );
}

async function Reports() {
  const user = await requirePermission("reports.view");
  const scope = departmentScope(user, "reports.export");
  const canExport = can(user, "reports.export");
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Reports & exports"
        description={
          scope
            ? `Exports are scoped to ${departmentById(scope)?.name ?? "your department"}. Every export is recorded in the audit log.`
            : "College-wide exports. Every export is recorded in the audit log."
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r, i) => (
          <Card key={r.key} className="flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy">
                <FileSpreadsheet className="size-5" />
              </span>
              <div>
                <div className="text-xs font-semibold text-primary">Report {i + 1}</div>
                <h2 className="font-semibold text-ink">{r.title}</h2>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">{r.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="info">{r.grouping}</Badge>
              <Badge>CSV</Badge>
            </div>
            <div className="mt-auto pt-5">
              {canExport ? (
                <ButtonLink href={`/api/reports/${r.key}`} prefetch={false} variant="primary" className="w-full">
                  <Download className="size-4" /> Download CSV
                </ButtonLink>
              ) : (
                <p className="text-xs text-muted">Your role can view but not export reports.</p>
              )}
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted">
        Print-ready PDF (muster register, A4 landscape) and Excel exports with templates follow in phase 02, along with background jobs for exports above ~50k rows.
      </p>
    </>
  );
}
