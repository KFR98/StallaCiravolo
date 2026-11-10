import ExcelJS from "exceljs";

export type Col = { header: string; key: string; width?: number; money?: boolean };

export async function toXlsx(sheet: string, cols: Col[], rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Stalla Ciravolo";
  const ws = wb.addWorksheet(sheet);
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.money ? { numFmt: '"$"#,##0.00' } : undefined }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toCsv(cols: Col[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.map((c) => esc(c.header)).join(";"), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(";"))].join("\n");
}
