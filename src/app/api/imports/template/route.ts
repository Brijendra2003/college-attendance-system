import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { STUDENT_TEMPLATE_HEADERS, toCsv } from "@/features/imports/csv";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.import")) return new Response("Forbidden", { status: 403 });
  const csv = toCsv([
    [...STUDENT_TEMPLATE_HEADERS],
    ["Aarohi Sawant", "26COMP0901", "", "F", "2008-03-14", "aarohi.sawant@example.com", "9876543210", "COMP", "FE", "A", 1, "fe_regular", "Sunil Sawant", "Father", "9822012345"],
    ["Kabir Menon", "25IT0902", "2025016012345678", "M", "2006-11-02", "kabir.menon@example.com", "9123456780", "IT", "SE", "B", 2, "direct_second_year", "Lata Menon", "Mother", "9819012345"],
  ]);
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="student_import_template.csv"',
    },
  });
}
