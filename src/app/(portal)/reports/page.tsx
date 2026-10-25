import type { Metadata } from "next";
import { Suspense } from "react";
import { ClipboardList, FileSpreadsheet } from "lucide-react";
import { can, departmentScope, requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, PageHeader, PageSkeleton } from "@/components/ui/primitives";
import { REPORTS } from "@/features/reports/catalogue";
import { ExportMenu } from "@/features/reports/export-menu";
import { MusterForm } from "@/features/reports/muster-form";
import { departmentById, getActiveContext, getDivisions } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Reports />
    </Suspense>
  );
}

async function Reports() {
  const user = await requirePermission("reports.view");
  const scope = departmentScope(user, "reports.export");
  const canExport = can(user, "reports.export");
  const dept = scope ? await departmentById(scope) : undefined;
  const { term } = await getActiveContext();
  const s = await db();
  const [divisions, offerings] = await Promise.all([
    getDivisions(scope),
    s.from("subject_offerings").select("id, department_id, program_year, subject:subjects(code, name, components:subject_components(kind))").eq("term_id", term?.id ?? "").order("subject_id"),
  ]);
  const offeringRows = (unwrap(offerings) as unknown as { id: string; department_id: string; program_year: string; subject: { code: string; name: string; components: { kind: string }[] } }[])
    .map((o) => ({ id: o.id, department_id: o.department_id, program_year: o.program_year, label: `${o.subject.code} · ${o.subject.name}`, hasPractical: o.subject.components.some((c) => c.kind === "PR") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const months: { value: string; label: string }[] = [];
  if (term) {
    for (let d = new Date(`${term.start_date}T00:00:00Z`); d <= new Date(`${term.end_date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1)) {
      months.push({ value: d.toISOString().slice(0, 7), label: d.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) });
      d.setUTCDate(1);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Reports & exports"
        description={
          dept ? `Exports are limited to ${dept.name}. Every export is recorded in the audit log.` : "College-wide exports in Excel, CSV and print-ready PDF. Every export is recorded in the audit log."
        }
      />
      {canExport && (
        <Card className="mb-6">
          <CardHeader icon={<ClipboardList className="size-5" />} title="Muster register" description="Print-friendly monthly register: roll no × session dates for a division or batch and one subject (A4 landscape)." />
          <CardBody>
            <MusterForm divisions={divisions.map((d) => ({ id: d.id, label: d.label, department_id: d.department_id, program_year: d.program_year, batches: d.batches ?? [] }))} offerings={offeringRows} months={months} />
          </CardBody>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.filter((r) => r.key !== "audit" || can(user, "audit.view")).map((r) => (
          <Card key={r.key} className="flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-heading">
                <FileSpreadsheet className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold text-ink">{r.title}</h2>
                <p className="mt-1 text-sm text-muted">{r.description}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="info">{r.grouping}</Badge>
              {r.formats.map((f) => (
                <Badge key={f}>{f.toUpperCase()}</Badge>
              ))}
            </div>
            <div className="mt-auto pt-5">
              {canExport ? <ExportMenu reportKey={r.key} filters={{}} formats={r.formats} /> : <p className="text-xs text-muted">Your role can view but not export reports.</p>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
