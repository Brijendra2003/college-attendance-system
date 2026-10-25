import "server-only";
import ExcelJS from "exceljs";
import { parseCsv, STUDENT_TEMPLATE_HEADERS } from "./csv";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Reads the first sheet of an .xlsx or a .csv into header-keyed rows. */
export async function readTabular(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  let matrix: string[][];
  if (/\.xlsx$/i.test(file.name)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };
    matrix = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => {
        if (v === null || v === undefined) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text);
        if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result ?? "");
        return String(v);
      });
      matrix.push(values);
    });
  } else {
    matrix = parseCsv(await file.text());
  }
  const [head, ...body] = matrix;
  const headers = (head ?? []).map((h) => h.trim());
  const rows = body
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, rows };
}

export function missingStudentColumns(headers: string[]) {
  return STUDENT_TEMPLATE_HEADERS.filter((h) => !headers.includes(h));
}
