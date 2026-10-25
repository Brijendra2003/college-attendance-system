import "server-only";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReportData } from "./catalogue";

// Print-ready A4 landscape tables (§11.13): registers, shortage lists, muster.

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica", color: "#0f1f3d" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: "#163a70", paddingBottom: 6, marginBottom: 10 },
  college: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#163a70" },
  title: { fontSize: 10, marginTop: 2 },
  meta: { fontSize: 7, color: "#5b6b85", textAlign: "right" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dbe4f0", minHeight: 14, alignItems: "center" },
  head: { backgroundColor: "#163a70", color: "#ffffff", fontFamily: "Helvetica-Bold" },
  zebra: { backgroundColor: "#f4f7fb" },
  cell: { paddingHorizontal: 3, paddingVertical: 2 },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#8a98ae" },
  signature: { marginTop: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 8 },
});

function Table({ data }: { data: ReportData }) {
  const weights = data.columns.map((c, i) => c.width ?? Math.min(6, Math.max(1, Math.max(c.label.length, ...data.rows.slice(0, 200).map((r) => String(r[i] ?? "").length)) / 6)));
  const total = weights.reduce((a, b) => a + b, 0);
  const width = (i: number) => `${(weights[i] / total) * 100}%`;
  return (
    <View>
      <View style={[s.row, s.head]} fixed>
        {data.columns.map((c, i) => (
          <Text key={i} style={[s.cell, { width: width(i), textAlign: c.align === "right" ? "right" : "left" }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {data.rows.map((r, ri) => (
        <View key={ri} style={[s.row, ri % 2 === 1 ? s.zebra : {}]} wrap={false}>
          {r.map((v, i) => (
            <Text key={i} style={[s.cell, { width: width(i), textAlign: data.columns[i]?.align === "right" ? "right" : "left" }]}>
              {v === null || v === undefined ? "" : String(v)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export async function renderPdf(data: ReportData, college: string, opts: { signatures?: boolean } = {}): Promise<Uint8Array> {
  const generated = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const doc = (
    <Document title={data.title} author={college} creator="SJCEM Attendance">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.college}>{college}</Text>
            <Text style={s.title}>{data.title}</Text>
            {data.subtitle ? <Text style={{ fontSize: 8, color: "#5b6b85" }}>{data.subtitle}</Text> : null}
          </View>
          <Text style={s.meta}>
            Generated {generated} IST{"\n"}
            {data.rows.length} rows
          </Text>
        </View>
        <Table data={data} />
        {opts.signatures ? (
          <View style={s.signature} wrap={false}>
            <Text>Subject teacher: ____________________</Text>
            <Text>Class teacher: ____________________</Text>
            <Text>HOD: ____________________</Text>
          </View>
        ) : null}
        <View style={s.footer} fixed>
          <Text>Confidential — contains student personal data</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
