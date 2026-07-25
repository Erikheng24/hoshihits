import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession, canAccess } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { getReport, cellValue, type ReportColumn } from "@/lib/reports";
import { ts } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOLD = "FFD4AF37";
const INK = "FF1A1A1A";
const ZEBRA = "FFF7F4EC";
const RULE = "FFD9D2C0";

const MONEY_FMT = '"$"#,##0.00';
const INT_FMT = "#,##0";

/** "2026-07-24 09:15:00" -> Date so Excel can format/sort it as a real date. */
function toDate(v: unknown): Date | string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return isNaN(d.getTime()) ? s : d;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtForCsv(row: Record<string, unknown>, col: ReportColumn): string {
  const v = cellValue(row, col);
  if (col.type === "money") return Number(v).toFixed(2);
  return String(v ?? "");
}

export async function GET(req: NextRequest) {
  const user = getSession();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const section = req.nextUrl.searchParams.get("section") ?? "";
  const format = (req.nextUrl.searchParams.get("format") ?? "xlsx").toLowerCase();
  const def = getReport(section);
  if (!def) return new NextResponse("Unknown report", { status: 404 });
  if (!canAccess(user.role, def.moduleKey)) return new NextResponse("Forbidden", { status: 403 });

  const rows = def.rows();
  const brand = getBranding();
  const stamp = ts().slice(0, 10);
  const fileBase = `${brand.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${section}-${stamp}`;

  // ---------- CSV ----------
  if (format === "csv") {
    const lines = [def.columns.map((c) => csvEscape(c.header)).join(",")];
    for (const r of rows) lines.push(def.columns.map((c) => csvEscape(fmtForCsv(r, c))).join(","));
    return new NextResponse("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      },
    });
  }

  // ---------- Excel ----------
  const wb = new ExcelJS.Workbook();
  wb.creator = brand.name;
  wb.created = new Date();
  const ws = wb.addWorksheet(def.title.slice(0, 28), {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: def.columns.length > 7 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      printTitlesRow: "5:5", // repeat the header row on every printed page
    },
    headerFooter: {
      oddFooter: `&L${brand.name}&C&P of &N&R${def.title}`,
    },
  });

  // Sections with photos get an extra leading "Photo" column that holds an
  // embedded thumbnail; every other column shifts one to the right.
  const imgCol = def.thumbnail ? 1 : 0;
  const lastCol = def.columns.length + imgCol;
  const colLetter = (n: number) => ws.getColumn(n).letter;
  const span = (r: number) => `A${r}:${colLetter(lastCol)}${r}`;

  // Title block
  ws.mergeCells(span(1));
  const t1 = ws.getCell("A1");
  t1.value = brand.name.toUpperCase();
  t1.font = { name: "Calibri", size: 18, bold: true, color: { argb: INK } };
  t1.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;

  ws.mergeCells(span(2));
  const t2 = ws.getCell("A2");
  t2.value = def.title;
  t2.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF7A6A2F" } };
  ws.getRow(2).height = 19;

  ws.mergeCells(span(3));
  const t3 = ws.getCell("A3");
  t3.value = `Generated ${ts().slice(0, 16)}  ·  ${rows.length} record${rows.length === 1 ? "" : "s"}`;
  t3.font = { name: "Calibri", size: 9.5, italic: true, color: { argb: "FF8A8A8A" } };

  // Gold rule under the title block
  ws.mergeCells(span(4));
  ws.getRow(4).height = 5;
  for (let c = 1; c <= lastCol; c++) {
    ws.getCell(4, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  }

  // Header row
  const header = ws.getRow(5);
  const styleHeaderCell = (cell: ExcelJS.Cell, label: string, right: boolean) => {
    cell.value = label;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle", horizontal: right ? "right" : "left" };
    cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
  };
  if (imgCol) {
    styleHeaderCell(header.getCell(1), "Photo", false);
    ws.getColumn(1).width = 8;
  }
  def.columns.forEach((col, i) => {
    styleHeaderCell(header.getCell(i + 1 + imgCol), col.header, col.type === "money" || col.type === "int");
    ws.getColumn(i + 1 + imgCol).width = col.width ?? 16;
  });
  header.height = 20;

  // Data rows
  rows.forEach((r, ri) => {
    const rowNum = 6 + ri;
    const row = ws.getRow(rowNum);
    if (imgCol) {
      const cell = row.getCell(1);
      cell.border = { bottom: { style: "hair", color: { argb: RULE } } };
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      // Embed the thumbnail floating over the photo cell.
      const img = typeof r.image === "string" ? r.image : "";
      const m = img.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (m) {
        const ext = (m[1] === "jpg" ? "jpeg" : m[1]) as "jpeg" | "png" | "gif";
        try {
          const id = wb.addImage({ base64: m[2], extension: ext });
          ws.addImage(id, {
            tl: { col: 0.12, row: rowNum - 1 + 0.08 } as ExcelJS.Anchor,
            ext: { width: 34, height: 34 },
            editAs: "oneCell",
          });
        } catch {
          /* an unreadable image just leaves the cell blank */
        }
      }
    }
    def.columns.forEach((col, ci) => {
      const cell = row.getCell(ci + 1 + imgCol);
      const v = cellValue(r, col);
      if (col.type === "date" || col.type === "datetime") {
        cell.value = toDate(v);
        cell.numFmt = col.type === "date" ? "yyyy-mm-dd" : "yyyy-mm-dd hh:mm";
      } else if (col.type === "money") {
        cell.value = Number(v);
        cell.numFmt = MONEY_FMT;
      } else if (col.type === "int") {
        cell.value = Number(v);
        cell.numFmt = INT_FMT;
      } else {
        cell.value = v as string;
        cell.alignment = { wrapText: false, vertical: "middle" };
      }
      cell.font = { name: "Calibri", size: 10.5, color: { argb: INK } };
      cell.border = { bottom: { style: "hair", color: { argb: RULE } } };
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
    row.height = imgCol ? 28 : 16.5;
  });

  // Totals row
  const totalCols = def.columns.filter((c) => c.total);
  if (rows.length && totalCols.length) {
    const rowIdx = 6 + rows.length;
    const row = ws.getRow(rowIdx);
    const styleTotalCell = (cell: ExcelJS.Cell) => {
      cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: INK } };
      cell.border = { top: { style: "medium", color: { argb: GOLD } } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2ECD9" } };
    };
    if (imgCol) styleTotalCell(row.getCell(1)); // keep the photo column styled
    def.columns.forEach((col, ci) => {
      const cell = row.getCell(ci + 1 + imgCol);
      if (ci === 0) cell.value = "TOTAL";
      else if (col.total) {
        const L = colLetter(ci + 1 + imgCol);
        cell.value = { formula: `SUM(${L}6:${L}${rowIdx - 1})` };
        cell.numFmt = col.type === "money" ? MONEY_FMT : INT_FMT;
      }
      styleTotalCell(cell);
    });
    row.height = 19;
  }

  // Filter the data columns only (skip the non-sortable Photo column).
  ws.autoFilter = { from: { row: 5, column: 1 + imgCol }, to: { row: 5, column: lastCol } };

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
    },
  });
}
