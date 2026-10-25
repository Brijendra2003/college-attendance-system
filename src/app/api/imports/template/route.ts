import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getDepartments, getDivisions } from "@/features/common/lookups";
import { STUDENT_TEMPLATE_HEADERS, toCsv } from "@/features/imports/csv";

const EXAMPLE = ["Aarohi Sawant", "26COMP0901", "", "F", "2008-03-14", "aarohi.sawant@example.com", "9876543210", "COMP", "FE", "A", "1", "fe_regular", "Sunil Sawant", "Father", "9822012345"];

// Templates with dropdown lists (§12): valid codes for the active year.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.import")) return new Response("Forbidden", { status: 403 });
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";

  if (format === "csv") {
    return new Response(`﻿${toCsv([[...STUDENT_TEMPLATE_HEADERS], EXAMPLE])}\r\n`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="student_import_template.csv"' },
    });
  }

  const [departments, divisions] = await Promise.all([getDepartments(), getDivisions()]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "SJCEM Attendance";
  const ws = wb.addWorksheet("Students", { views: [{ state: "frozen", ySplit: 1 }] });
  const lists = wb.addWorksheet("Lists", { state: "veryHidden" });

  ws.columns = STUDENT_TEMPLATE_HEADERS.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4) }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF163A70" } };
  ws.addRow(EXAMPLE);

  const put = (col: number, values: string[]) => values.forEach((v, i) => (lists.getCell(i + 1, col).value = v));
  put(1, departments.map((d) => d.code));
  put(2, ["FE", "SE", "TE", "BE"]);
  put(3, [...new Set(divisions.map((d) => d.code))].sort());
  put(4, ["1", "2", "3", "4", "5", "6"]);
  put(5, ["M", "F", "O"]);
  put(6, ["fe_regular", "direct_second_year"]);
  put(7, ["Father", "Mother", "Guardian"]);
  const ref = (col: string, n: number) => [`Lists!$${col}$1:$${col}$${Math.max(1, n)}`];
  const rules: Record<string, string[]> = {
    department: ref("A", departments.length),
    programYear: ref("B", 4),
    division: ref("C", new Set(divisions.map((d) => d.code)).size),
    batch: ref("D", 6),
    gender: ref("E", 3),
    admissionType: ref("F", 2),
    guardianRelation: ref("G", 3),
  };
  STUDENT_TEMPLATE_HEADERS.forEach((h, i) => {
    const formulae = rules[h];
    if (!formulae) return;
    const col = ws.getColumn(i + 1).letter;
    for (let r = 2; r <= 2001; r++) {
      ws.getCell(`${col}${r}`).dataValidation = { type: "list", allowBlank: true, formulae, showErrorMessage: true, errorTitle: "Invalid value", error: `Pick a value for ${h} from the list.` };
    }
  });
  ws.getColumn(STUDENT_TEMPLATE_HEADERS.indexOf("dob") + 1).numFmt = "@";

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="student_import_template.xlsx"',
    },
  });
}
