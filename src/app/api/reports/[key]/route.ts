import { istDate } from "@/shared/dates";
import { getCurrentUser, needsMfa } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { rpc } from "@/lib/db";
import { reportByKey, type Format, type ReportData } from "@/features/reports/catalogue";
import { buildMuster } from "@/features/reports/muster";
import { renderCsv, renderXlsx } from "@/features/reports/render";
import { renderPdf } from "@/features/reports/pdf";
import { getCollege } from "@/features/common/lookups";

const TYPES: Record<Format, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

// Exports (§11.13). Every export of personal data is audited (§17); RLS
// scopes the rows to the caller, so an HOD only ever exports their department.
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[key]">) {
  const user = await getCurrentUser();
  if (!user || needsMfa(user) || !can(user, "reports.export")) return new Response("Forbidden", { status: 403 });
  const { key } = await ctx.params;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const format = (["csv", "xlsx", "pdf"].includes(params.format) ? params.format : "csv") as Format;

  let data: ReportData;
  try {
    if (key === "muster") data = await buildMuster(params);
    else {
      const def = reportByKey(key);
      if (!def) return new Response("Unknown report", { status: 404 });
      if (!def.formats.includes(format)) return new Response(`This report isn't available as ${format.toUpperCase()}`, { status: 400 });
      data = await def.build(params);
    }
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Report failed", { status: 400 });
  }

  const college = (await getCollege()).name;
  const body: BodyInit =
    format === "csv"
      ? renderCsv(data)
      : format === "xlsx"
        ? await renderXlsx(data, college)
        : Buffer.from(await renderPdf(data, college, { signatures: key === "muster" }));

  // Audit before handing over the file; if the audit write fails, so does the export.
  await rpc("log_export", { p_report: key, p_format: format, p_rows: data.rows.length, p_filters: params });
  return new Response(body, {
    headers: {
      "content-type": TYPES[format],
      "content-disposition": `attachment; filename="${key}_${istDate()}.${format}"`,
      "cache-control": "no-store",
    },
  });
}
