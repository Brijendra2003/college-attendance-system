import { istDate } from "@/shared/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { can, departmentScope } from "@/lib/auth/permissions";
import { audit } from "@/lib/data/store";
import { REPORTS } from "@/features/reports/catalogue";
import { toCsv } from "@/features/imports/csv";

// CSV export (§11.13). Exports of personal data are audited (§17).
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[key]">) {
  const user = await getCurrentUser();
  if (!user || !can(user, "reports.export")) return new Response("Forbidden", { status: 403 });
  const { key } = await ctx.params;
  const report = REPORTS.find((r) => r.key === key);
  if (!report) return new Response("Unknown report", { status: 404 });

  const filters = Object.fromEntries(new URL(request.url).searchParams);
  const scope = departmentScope(user, "reports.export");
  const rows = report.build(scope, filters);
  audit(user, {
    action: "report.exported",
    entity: "reports",
    entityId: key,
    summary: `Exported ${report.title} (${rows.length - 1} rows)`,
    before: null,
    after: { filters, scope: scope ?? "all" },
    reason: null,
  });
  return new Response(`﻿${toCsv(rows)}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${key}_${istDate()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
