"use client";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// Pemetaan header kolom ke label yang ramah dibaca.
export const HEADER_LABELS = {
  nama_siswa: "Nama Siswa",
  nis: "NIS",
  nisn: "NISN",
  jenis_kelamin: "Jenis Kelamin",
  kelas: "Kelas",
  tingkat: "Tingkat",
  walikelas: "Wali Kelas",
  pendamping: "Guru Pendamping",
  hadir: "Hadir",
  sakit: "Sakit",
  izin: "Izin",
  alpha: "Alpha",
  nama_kelas: "Nama Kelas",
  username: "Username",
  nama_lengkap: "Nama Lengkap",
  no_whatsapp: "No WhatsApp",
  role: "Role",
  waktu: "Waktu",
  pengguna: "Pengguna",
  tipe: "Tipe",
  aktivitas: "Aktivitas",
  endpoint: "Endpoint",
  status: "Status",
  payload: "Payload",
};

const NUMERIC_KEYS = new Set([
  "hadir",
  "sakit",
  "izin",
  "alpha",
  "tingkat",
  "status",
]);

export function newWorkbook() {
  return new ExcelJS.Workbook();
}

export function safeSheetName(raw, wb) {
  let base = String(raw || "Sheet")
    .replace(/[\\/?*[\]:]/g, " ")
    .trim();
  if (!base) base = "Sheet";
  base = base.slice(0, 28);
  let name = base;
  let i = 2;
  while (wb.getWorksheet(name)) name = `${base.slice(0, 26)}_${i++}`;
  return name;
}

export function addSheet(wb, name, headers, rows) {
  const ws = wb.addWorksheet(safeSheetName(name, wb));
  const labels = headers.map((h) => HEADER_LABELS[h] || h);

  const headRow = ws.addRow(labels);
  headRow.font = { bold: true, color: { argb: "FF334155" } };
  headRow.height = 20;
  headRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  rows.forEach((r) => ws.addRow(headers.map((h) => r[h] ?? "")));

  const thin = { style: "thin", color: { argb: "FFE2E8F0" } };
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
  });

  headers.forEach((h, idx) => {
    const col = ws.getColumn(idx + 1);
    const maxLen = Math.max(
      labels[idx].length,
      ...rows.map((r) => String(r[h] ?? "").length),
      1,
    );
    col.width = Math.min(42, Math.max(10, maxLen + 2));
    if (NUMERIC_KEYS.has(h)) {
      col.alignment = { horizontal: "center" };
    }
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

export async function saveWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}
