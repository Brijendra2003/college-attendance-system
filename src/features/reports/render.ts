import "server-only";
import ExcelJS from "exceljs";
import { toCsv } from "@/features/imports/csv";
import type { ReportData } from "./catalogue";

export function renderCsv(data: ReportData): string {
  return `﻿${toCsv([data.columns.map((c) => c.label), ...data.rows])}\r\n`;
}

export async function renderXlsx(data: ReportData, college: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = college;
  wb.created = new Date();
  const ws = wb.addWorksheet(data.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), { views: [{ state: "frozen", ySplit: 3 }] });

  ws.mergeCells(1, 1, 1, Math.max(1, data.columns.length));
  ws.getCell(1, 1).value = `${college} — ${data.title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF163A70" } };
  ws.getCell(2, 1).value = `Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST${data.subtitle ? ` · ${data.subtitle}` : ""}`;
  ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF5B6B85" } };

  const header = ws.getRow(3);
  data.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF163A70" } };
    cell.alignment = { horizontal: c.align === "right" ? "right" : "left", vertical: "middle" };
  });
  header.height = 20;
  data.rows.forEach((r) => ws.addRow(r));
  data.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    const longest = Math.max(c.label.length, ...data.rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
    col.width = Math.min(48, Math.max(8, longest + 2));
    if (c.align === "right") col.alignment = { horizontal: "right" };
  });
  if (data.rows.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + data.rows.length, column: data.columns.length } };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
