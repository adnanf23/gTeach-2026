"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  getTahsinData,
  setNilaiTahsin,
  setCatatanTahsin,
} from "@/actions/tahfizh.action";

// ================================================================
// KONFIGURASI
// ================================================================
const FILE_PREFIX = "Tahsin"; // Tahsin_<nama kelas>_<YYYY-MM-DD>.xlsx
const NILAI_MIN_LULUS = 70;

// ================================================================
// STYLE
// ================================================================
const BTN =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97]";
const BTN_GLASS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97]";
const BTN_LIGHT =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[13px] font-bold text-blue-800 shadow-lg shadow-black/10 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97]";
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700`;
const BTN_GHOST = `${BTN} text-stone-600 hover:bg-stone-100`;

const INPUT =
  "h-11 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm text-stone-800 placeholder:text-stone-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10";
const SURFACE =
  "rounded-3xl border border-stone-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

const TH =
  "border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500";
const TD = "border-b border-slate-100 transition-colors";
const SHADOW_L = "shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)]";

const AVATAR_TONES = [
  "bg-blue-100 text-blue-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
];

// ================================================================
// UTIL
// ================================================================
const firstOf = (v) => (Array.isArray(v) ? v[0] : v);

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normNis = (v) => String(v ?? "").replace(/\D/g, "");

function readCellString(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if (v.richText)
      return v.richText
        .map((rt) => rt.text)
        .join("")
        .trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
  }
  return String(v).trim();
}

function findHeaderRow(sheet, maxRow = 6) {
  for (let r = 1; r <= maxRow; r++) {
    let found = false;
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (readCellString(cell).toLowerCase() === "nis") found = true;
    });
    if (found) return r;
  }
  return -1;
}

async function runPool(tasks, limit = 4) {
  let idx = 0;
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (idx < tasks.length) {
        const task = tasks[idx++];
        await task();
      }
    },
  );
  await Promise.all(workers);
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function makeFileName(kelasNama) {
  const kelas = String(kelasNama || "Kelas")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");
  return `${FILE_PREFIX}_${kelas}_${todayStr()}.xlsx`;
}

function initials(nama) {
  const parts = String(nama || "?")
    .trim()
    .split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function toneFor(nama) {
  let h = 0;
  const s = String(nama || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function isFilled(v) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

// ================================================================
// KOMPONEN UI KECIL
// ================================================================
const ICONS = {
  download: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "m7 10 5 5 5-5",
    "M12 15V3",
  ],
  upload: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "m17 8-5-5-5 5",
    "M12 3v12",
  ],
  sheet: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6",
    "M8 13h8",
    "M8 17h8",
  ],
  x: ["M18 6 6 18", "m6 6 12 12"],
  alert: [
    "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    "M12 9v4",
    "M12 17h.01",
  ],
  search: ["M21 21l-4.3-4.3", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  check: ["M20 6 9 17l-5-5"],
  book: [
    "M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
    "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  ],
  chart: ["M3 3v18h18", "m7 14 4-4 4 4 5-6"],
};

function Icon({ name, className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {(ICONS[name] || []).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

function Spinner({ className = "h-4 w-4" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

function Bar({ value, className = "" }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-stone-200/80 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          v >= 100 ? "bg-blue-500" : "bg-blue-400"
        }`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

function Avatar({ nama, className = "h-9 w-9 text-xs" }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${toneFor(nama)} ${className}`}
    >
      {initials(nama)}
    </span>
  );
}

function Modal({ onClose, size = "max-w-md", children }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full ${size} flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-stone-200 sm:hidden" />
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0">
        <h3 className="text-base font-bold text-stone-900">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="-mr-1 rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

function ModalFooter({ children }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-stone-100 bg-stone-50 px-5 py-3.5">
      {children}
    </div>
  );
}

function StatBox({ value, label, tone = "stone" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    stone: "bg-stone-100 text-stone-700",
  };
  return (
    <div className={`rounded-2xl px-3 py-3 text-center ${tones[tone]}`}>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium leading-tight">
        {label}
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const tones = {
    success: "bg-blue-600 text-white",
    error: "bg-rose-600 text-white",
    info: "bg-stone-800 text-white",
  };
  return (
    <div
      role="status"
      className={`fixed left-1/2 top-4 z-[100] max-w-[92vw] -translate-x-1/2 rounded-full px-5 py-2.5 text-center text-sm font-semibold shadow-xl ${tones[toast.type] || tones.info}`}
    >
      {toast.msg}
    </div>
  );
}

// Indikator status simpan per baris
function SaveState({ status }) {
  if (status === "saving")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-400">
        <Spinner className="h-3 w-3" /> Menyimpan
      </span>
    );
  if (status === "success")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600">
        <Icon name="check" className="h-3 w-3" /> Tersimpan
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
        <Icon name="alert" className="h-3 w-3" /> Gagal
      </span>
    );
  return null;
}

function nilaiTone(v) {
  if (!isFilled(v)) return "border-stone-200 bg-stone-50 text-stone-800";
  const n = Number(v);
  if (Number.isNaN(n) || n < 0 || n > 100)
    return "border-rose-300 bg-rose-50 text-rose-700";
  if (n < NILAI_MIN_LULUS) return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-blue-300 bg-blue-50 text-blue-800";
}

// Style tabel mengikuti components/organism/table/penilaian-tables.js
function nilaiTextTone(v) {
  if (!isFilled(v)) return "text-slate-800";
  const n = Number(v);
  if (Number.isNaN(n) || n < 0 || n > 100) return "text-rose-700";
  return n < NILAI_MIN_LULUS ? "text-red-600" : "text-slate-800";
}

function inputState(status) {
  if (status === "error") return "border-red-400 bg-red-50";
  if (status === "saving") return "border-blue-300 bg-blue-50";
  if (status === "success") return "border-emerald-400 bg-emerald-50";
  return "border-slate-200 bg-white hover:border-slate-300";
}

// ================================================================
// PANEL UTAMA
// ================================================================
export default function TahsinPanel({
  kelasId,
  kelasNama = "Kelas",
  tahunAjaranId,
  siswaList = [],
  activeTab,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapel, setMapel] = useState(null);
  const [nilaiMap, setNilaiMap] = useState({});
  const [catatanMap, setCatatanMap] = useState({});
  const [status, setStatus] = useState({}); // { [siswaId]: { nilai, catatan } }
  const [search, setSearch] = useState("");

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const catatanTimers = useRef({});
  const savedNilai = useRef({}); // nilai terakhir yang tersimpan (hindari simpan ganda)
  const fileInputRef = useRef(null);

  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const isCatatan = activeTab === "tahsin_catatan";

  function show(msg, type = "success") {
    setToast({ msg, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }

  useEffect(() => {
    const timers = catatanTimers.current;
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const load = useCallback(async () => {
    if (!kelasId || !tahunAjaranId) return;
    setLoading(true);
    setError("");
    try {
      const res = await getTahsinData({ kelasId, tahunAjaranId });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMapel(res.mapel);
      const nMap = {};
      const saved = {};
      (res.nilai || []).forEach((r) => {
        const sid = firstOf(r.siswa_id);
        nMap[sid] = { id: r.id, nilai: r.nilai };
        saved[sid] = String(r.nilai ?? "");
      });
      savedNilai.current = saved;
      setNilaiMap(nMap);
      const cMap = {};
      (res.catatan || []).forEach((r) => {
        cMap[firstOf(r.siswa_id)] = { id: r.id, catatan: r.catatan };
      });
      setCatatanMap(cMap);
    } catch (e) {
      setError(e?.message || "Gagal memuat data tahsin.");
    } finally {
      setLoading(false);
    }
  }, [kelasId, tahunAjaranId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function setField(siswaId, field, value) {
    setStatus((prev) => ({
      ...prev,
      [siswaId]: { ...(prev[siswaId] || {}), [field]: value },
    }));
  }

  function clearFieldLater(siswaId, field) {
    setTimeout(() => setField(siswaId, field, undefined), 1500);
  }

  // ---------- Simpan nilai ----------
  async function saveNilai(siswaId, raw) {
    if (!mapel?.id) return;
    const value = String(raw ?? "").trim();
    if (value === (savedNilai.current[siswaId] ?? "")) return;

    if (value !== "") {
      const n = Number(value);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        setField(siswaId, "nilai", "error");
        setError("Nilai harus berupa angka 0–100.");
        return;
      }
    }

    setField(siswaId, "nilai", "saving");
    try {
      const res = await setNilaiTahsin({
        siswaId,
        kelasId,
        tahunAjaranId,
        mapelId: mapel.id,
        nilai: value,
        existingId: nilaiMap[siswaId]?.id,
      });
      if (res.error) {
        setError(res.error);
        setField(siswaId, "nilai", "error");
        return;
      }
      setError("");
      savedNilai.current[siswaId] = value;
      setNilaiMap((prev) => ({
        ...prev,
        [siswaId]: { id: res.record.id, nilai: res.record.nilai },
      }));
      setField(siswaId, "nilai", "success");
      clearFieldLater(siswaId, "nilai");
    } catch (e) {
      setError(e?.message || "Gagal menyimpan nilai.");
      setField(siswaId, "nilai", "error");
    }
  }

  // ---------- Simpan catatan ----------
  async function saveCatatan(siswaId, text) {
    setField(siswaId, "catatan", "saving");
    try {
      const res = await setCatatanTahsin({
        siswaId,
        kelasId,
        tahunAjaranId,
        catatan: text,
        existingId: catatanMap[siswaId]?.id,
      });
      if (res.error) {
        setError(res.error);
        setField(siswaId, "catatan", "error");
        return;
      }
      setError("");
      setCatatanMap((prev) => ({
        ...prev,
        [siswaId]: { id: res.record.id, catatan: res.record.catatan },
      }));
      setField(siswaId, "catatan", "success");
      clearFieldLater(siswaId, "catatan");
    } catch (e) {
      setError(e?.message || "Gagal menyimpan catatan.");
      setField(siswaId, "catatan", "error");
    }
  }

  function scheduleSaveCatatan(siswaId, text) {
    if (catatanTimers.current[siswaId])
      clearTimeout(catatanTimers.current[siswaId]);
    catatanTimers.current[siswaId] = setTimeout(() => {
      saveCatatan(siswaId, text);
      delete catatanTimers.current[siswaId];
    }, 800);
  }

  // ---------- Statistik ----------
  const stat = useMemo(() => {
    const total = siswaList.length;
    let nilaiFilled = 0;
    let catatanFilled = 0;
    let sum = 0;
    siswaList.forEach((s) => {
      const n = nilaiMap[s.id]?.nilai;
      if (isFilled(n) && !Number.isNaN(Number(n))) {
        nilaiFilled++;
        sum += Number(n);
      }
      if (isFilled(catatanMap[s.id]?.catatan)) catatanFilled++;
    });
    const filled = isCatatan ? catatanFilled : nilaiFilled;
    return {
      total,
      filled,
      pct: total ? Math.round((filled / total) * 100) : 0,
      avg: nilaiFilled ? sum / nilaiFilled : null,
      nilaiFilled,
      catatanFilled,
    };
  }, [siswaList, nilaiMap, catatanMap, isCatatan]);

  const filteredSiswa = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return siswaList;
    return siswaList.filter(
      (s) =>
        String(s.nama_siswa || "")
          .toLowerCase()
          .includes(q) ||
        String(s.nis || "")
          .toLowerCase()
          .includes(q),
    );
  }, [siswaList, search]);

  const indexById = useMemo(() => {
    const m = {};
    siswaList.forEach((s, i) => (m[s.id] = i + 1));
    return m;
  }, [siswaList]);

  // ================= TEMPLATE & EKSPOR =================
  async function buildWorkbookFile({ withData }) {
    const GREEN = "FFD9EAD3";
    const CYAN = "FFE0FFFF";
    const YELLOW = "FFFFFF00";

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistem Penilaian";
    workbook.created = new Date();

    const border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
    const fill = (argb) => ({
      type: "pattern",
      pattern: "solid",
      fgColor: { argb },
    });

    const ws = workbook.addWorksheet("TAHSIN");
    const cols = 5;

    ws.mergeCells(1, 1, 1, cols);
    const title = ws.getCell(1, 1);
    title.value = `${withData ? "NILAI" : "TEMPLATE"} TAHSIN - ${mapel?.nama_mapel || "TAHSIN"} - ${kelasNama}  |  Nilai: 0-100`;
    title.font = { bold: true, size: 13 };
    title.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 26;

    const headers = ["NO", "NAMA SISWA", "NIS", "NILAI", "CATATAN"];
    const hr = ws.getRow(2);
    headers.forEach((h, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = h;
      cell.fill = fill(GREEN);
      cell.font = { bold: true, size: 11 };
      cell.alignment = {
        horizontal: i === 1 || i === 4 ? "left" : "center",
        vertical: "middle",
      };
      cell.border = border;
    });
    hr.height = 28;

    siswaList.forEach((s, idx) => {
      const r = ws.getRow(3 + idx);
      r.getCell(1).value = idx + 1;
      r.getCell(2).value = s.nama_siswa;
      r.getCell(3).value = s.nis || "";

      const nilai = nilaiMap[s.id]?.nilai;
      const catatan = catatanMap[s.id]?.catatan;

      const cNilai = r.getCell(4);
      const cCatatan = r.getCell(5);

      if (withData && isFilled(nilai) && !Number.isNaN(Number(nilai))) {
        cNilai.value = Number(nilai);
        cNilai.fill = fill(YELLOW);
        cNilai.font = { bold: true };
      } else {
        cNilai.value = null;
        cNilai.fill = fill(CYAN);
      }
      cNilai.dataValidation = {
        type: "decimal",
        operator: "between",
        allowBlank: true,
        formulae: [0, 100],
        showErrorMessage: true,
        errorTitle: "Nilai tidak valid",
        error: "Isi dengan angka 0 sampai 100",
      };

      if (withData && isFilled(catatan)) {
        cCatatan.value = String(catatan);
        cCatatan.fill = fill(YELLOW);
      } else {
        cCatatan.value = null;
        cCatatan.fill = fill(CYAN);
      }

      for (let c = 1; c <= cols; c++) {
        const cell = r.getCell(c);
        cell.border = border;
        cell.alignment = {
          horizontal: c === 2 || c === 5 ? "left" : "center",
          vertical: "middle",
          wrapText: c === 5,
        };
      }
    });

    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 32;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 10;
    ws.getColumn(5).width = 60;
    ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      makeFileName(kelasNama),
    );
  }

  async function handleDownloadTemplate() {
    if (siswaList.length === 0) {
      show("Belum ada siswa di kelas ini.", "error");
      return;
    }
    try {
      await buildWorkbookFile({ withData: false });
      show("Template diunduh", "success");
    } catch (e) {
      console.error("Gagal unduh template:", e);
      show("Gagal mengunduh template", "error");
    }
  }

  async function handleExport() {
    if (siswaList.length === 0) {
      show("Belum ada siswa di kelas ini.", "error");
      return;
    }
    try {
      setExporting(true);
      await buildWorkbookFile({ withData: true });
      show("Data berhasil diekspor", "success");
    } catch (e) {
      console.error("Gagal ekspor:", e);
      show("Gagal mengekspor data", "error");
    } finally {
      setExporting(false);
    }
  }

  // ================= IMPOR =================
  async function handleImportFile(file) {
    if (!file) return;
    if (!mapel?.id) {
      show("Mapel TAHSIN belum tersedia.", "error");
      return;
    }
    try {
      setImporting(true);
      setError("");
      setImportResult(null);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const ws =
        workbook.worksheets.find((w) => norm(w.name) === "tahsin") ||
        workbook.worksheets[0];
      if (!ws) throw new Error("File kosong.");

      const headerRow = findHeaderRow(ws);
      if (headerRow === -1)
        throw new Error("Header kolom NIS tidak ditemukan.");

      let nisCol = -1;
      let namaCol = -1;
      let nilaiCol = -1;
      let catatanCol = -1;
      ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
        const t = norm(readCellString(cell));
        if (t === "nis" && nisCol === -1) nisCol = col;
        else if ((t === "nama" || t.startsWith("nama ")) && namaCol === -1)
          namaCol = col;
        else if (t === "nilai" && nilaiCol === -1) nilaiCol = col;
        else if (t === "catatan" && catatanCol === -1) catatanCol = col;
      });
      if (nisCol === -1) nisCol = 3;
      if (namaCol === -1) namaCol = 2;
      if (nilaiCol === -1 && catatanCol === -1)
        throw new Error("Kolom NILAI atau CATATAN tidak ditemukan.");

      const byNis = new Map();
      const byNama = new Map();
      siswaList.forEach((s) => {
        const n = normNis(s.nis);
        if (n && !byNis.has(n)) byNis.set(n, s);
        const nm = norm(s.nama_siswa);
        if (nm && !byNama.has(nm)) byNama.set(nm, s);
      });

      const result = { nilai: 0, catatan: 0, skipped: 0, errors: [] };
      const newNilai = { ...nilaiMap };
      const newCatatan = { ...catatanMap };
      const tasks = [];

      for (let rowNum = headerRow + 1; rowNum <= ws.rowCount; rowNum++) {
        const row = ws.getRow(rowNum);
        const nama = readCellString(row.getCell(namaCol));
        const nis = readCellString(row.getCell(nisCol));
        if (!nama && !nis) continue;

        const n = normNis(nis);
        const s = (n && byNis.get(n)) || byNama.get(norm(nama));
        if (!s) {
          result.errors.push(
            `Baris ${rowNum}: Siswa "${nama || nis}" tidak ditemukan.`,
          );
          continue;
        }

        // Nilai
        if (nilaiCol !== -1) {
          const raw = readCellString(row.getCell(nilaiCol));
          if (raw !== "") {
            const num = Number(raw.replace(",", "."));
            if (Number.isNaN(num) || num < 0 || num > 100) {
              result.errors.push(
                `Baris ${rowNum} (${s.nama_siswa}): nilai "${raw}" tidak valid (0-100).`,
              );
            } else if (String(newNilai[s.id]?.nilai ?? "") === String(num)) {
              result.skipped++;
            } else {
              tasks.push(async () => {
                try {
                  const res = await setNilaiTahsin({
                    siswaId: s.id,
                    kelasId,
                    tahunAjaranId,
                    mapelId: mapel.id,
                    nilai: num,
                    existingId: newNilai[s.id]?.id,
                  });
                  if (res.error) throw new Error(res.error);
                  newNilai[s.id] = {
                    id: res.record.id,
                    nilai: res.record.nilai,
                  };
                  savedNilai.current[s.id] = String(res.record.nilai ?? "");
                  result.nilai++;
                } catch (err) {
                  result.errors.push(
                    `Baris ${rowNum} (${s.nama_siswa}) nilai: ${err?.message || "gagal"}`,
                  );
                }
              });
            }
          }
        }

        // Catatan
        if (catatanCol !== -1) {
          const raw = readCellString(row.getCell(catatanCol));
          if (raw !== "") {
            if (String(newCatatan[s.id]?.catatan ?? "") === raw) {
              result.skipped++;
            } else {
              tasks.push(async () => {
                try {
                  const res = await setCatatanTahsin({
                    siswaId: s.id,
                    kelasId,
                    tahunAjaranId,
                    catatan: raw,
                    existingId: newCatatan[s.id]?.id,
                  });
                  if (res.error) throw new Error(res.error);
                  newCatatan[s.id] = {
                    id: res.record.id,
                    catatan: res.record.catatan,
                  };
                  result.catatan++;
                } catch (err) {
                  result.errors.push(
                    `Baris ${rowNum} (${s.nama_siswa}) catatan: ${err?.message || "gagal"}`,
                  );
                }
              });
            }
          }
        }
      }

      await runPool(tasks, 4);
      setNilaiMap(newNilai);
      setCatatanMap(newCatatan);
      setImportResult(result);
      show(
        `${result.nilai + result.catatan} data diimpor`,
        result.errors.length ? "info" : "success",
      );
    } catch (e) {
      console.error("Gagal impor:", e);
      show("Gagal impor: " + (e?.message || "File tidak valid"), "error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ================= RENDER =================
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 animate-pulse rounded-[28px] bg-stone-100" />
        <div className="space-y-2.5 rounded-3xl bg-white p-5 ring-1 ring-stone-200/70">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-2xl bg-stone-100"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!mapel) {
    return (
      <div className="rounded-3xl bg-amber-50 px-5 py-8 text-center text-sm text-amber-800 ring-1 ring-amber-200">
        Mapel <b>TAHSIN</b> belum di-ploting untuk kelas ini. Hubungi admin/ICT
        untuk memetakan mapel TAHSIN.
      </div>
    );
  }

  const errCount = importResult?.errors?.length || 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <Toast toast={toast} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFile(file);
        }}
      />

      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-blue-800 via-blue-700 to-blue-600 p-5 text-white shadow-lg shadow-blue-900/10 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-teal-300/20 blur-3xl" />

        <div className="relative space-y-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100/80">
                {isCatatan ? "Catatan Tahsin" : "Penilaian Tahsin"}
              </p>
              <h2 className="mt-0.5 break-words text-xl font-bold leading-tight sm:text-2xl">
                {mapel.nama_mapel}
              </h2>
              <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-blue-50/90">
                {isCatatan
                  ? "Catatan per siswa akan muncul di rapor tahfizh bagian Tahsin. Tersimpan otomatis."
                  : "Isi nilai tahsin per siswa (0–100). Nilai tersimpan otomatis saat kolom ditinggalkan."}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:flex lg:shrink-0">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className={BTN_GLASS}
                title="Unduh template Excel"
              >
                <Icon name="sheet" />
                <span>Template</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className={BTN_GLASS}
                title="Impor dari Excel"
              >
                {importing ? <Spinner /> : <Icon name="upload" />}
                <span>{importing ? "Proses" : "Impor"}</span>
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className={BTN_LIGHT}
                title="Ekspor ke Excel"
              >
                {exporting ? <Spinner /> : <Icon name="download" />}
                <span>{exporting ? "Proses" : "Ekspor"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["users", stat.total, "Siswa"],
              [
                "check",
                `${stat.filled}/${stat.total}`,
                isCatatan ? "Catatan terisi" : "Nilai terisi",
              ],
              [
                "chart",
                stat.avg === null ? "-" : stat.avg.toFixed(1),
                "Rata-rata nilai",
              ],
              ["book", `${stat.pct}%`, "Kelengkapan"],
            ].map(([icon, value, label]) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-2xl bg-white/12 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon name={icon} className="h-4 w-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="text-sm font-bold tabular-nums">{value}</div>
                  <div className="truncate text-[11px] text-blue-50/85">
                    {label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-rose-200">
          <span className="flex items-start gap-2">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5" />
            <span>{error}</span>
          </span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Tutup pesan"
            className="shrink-0 text-rose-400 transition hover:text-rose-700"
          >
            <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ===== KONTEN ===== */}
      <section className={`${SURFACE} overflow-hidden`}>
        <div className="space-y-3 border-b border-stone-100 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-stone-900">
                Daftar siswa
              </h3>
              <p className="mt-0.5 text-xs text-stone-500">
                {stat.filled} dari {stat.total} siswa sudah terisi
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-sm font-bold tabular-nums text-blue-700">
              {stat.pct}%
            </span>
          </div>
          <Bar value={stat.pct} />

          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari siswa atau NIS"
              aria-label="Cari siswa"
              className={`${INPUT} pl-10`}
            />
          </div>
        </div>

        {siswaList.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Icon name="users" className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-bold text-stone-800">
              Belum ada siswa
            </p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-stone-500">
              Belum ada siswa terdaftar di kelas ini.
            </p>
          </div>
        ) : filteredSiswa.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-stone-400">
            Siswa tidak ditemukan.
          </div>
        ) : (
          <>
            {/* ---------- TABEL (tablet & desktop) ---------- */}
            <div className="hidden max-h-[72vh] overflow-auto overscroll-contain sm:block">
              <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th
                      className={`${TH} sticky left-0 top-0 z-30 h-11 w-12 min-w-[48px] border-r px-2 text-center`}
                    >
                      No
                    </th>
                    <th
                      className={`${TH} sticky left-12 top-0 z-30 h-11 min-w-[220px] border-r px-4 text-left ${SHADOW_L}`}
                    >
                      Siswa
                    </th>
                    <th
                      className={`${TH} sticky top-0 z-20 h-11 px-3 ${
                        isCatatan ? "min-w-[420px] text-left" : "w-[170px] text-center"
                      }`}
                    >
                      {isCatatan ? "Catatan" : "Nilai"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSiswa.map((s, idx) => {
                    const st = status[s.id] || {};
                    const bg = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
                    return (
                      <tr key={s.id} className="group">
                        <td
                          className={`${TD} sticky left-0 z-10 w-12 min-w-[48px] border-r px-2 text-center text-xs tabular-nums text-slate-400 group-hover:bg-blue-50 ${bg}`}
                        >
                          {idx + 1}
                        </td>
                        <td
                          title={s.nama_siswa}
                          className={`${TD} sticky left-12 z-10 min-w-[220px] border-r px-4 py-1.5 text-[13px] font-medium text-slate-800 group-hover:bg-blue-50 ${SHADOW_L} ${bg}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="min-w-0 truncate">{s.nama_siswa}</span>
                            {s.nis ? (
                              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                                · {s.nis}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td
                          className={`${TD} px-3 py-1.5 group-hover:bg-blue-50 ${bg}`}
                        >
                          {isCatatan ? (
                            <div>
                              <textarea
                                value={catatanMap[s.id]?.catatan ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCatatanMap((prev) => ({
                                    ...prev,
                                    [s.id]: { ...prev[s.id], catatan: val },
                                  }));
                                  scheduleSaveCatatan(s.id, val);
                                }}
                                rows={2}
                                placeholder="Catatan tahsin..."
                                aria-label={`Catatan ${s.nama_siswa}`}
                                className={`w-full min-w-[380px] resize-y rounded-md border px-3 py-2 text-left text-[13px] text-slate-800 outline-none transition placeholder:text-slate-300 focus:ring-2 focus:ring-blue-400 ${inputState(
                                  st.catatan,
                                )}`}
                              />
                              <div className="h-4">
                                <SaveState status={st.catatan} />
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                inputMode="decimal"
                                value={nilaiMap[s.id]?.nilai ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNilaiMap((prev) => ({
                                    ...prev,
                                    [s.id]: { ...prev[s.id], nilai: val },
                                  }));
                                }}
                                onBlur={(e) => saveNilai(s.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="–"
                                aria-label={`Nilai ${s.nama_siswa}`}
                                className={`h-8 w-16 rounded-md border px-1 text-center text-[13px] font-semibold tabular-nums outline-none transition placeholder:text-slate-300 focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${nilaiTextTone(
                                  nilaiMap[s.id]?.nilai,
                                )} ${inputState(st.nilai)}`}
                              />
                              <div className="h-4">
                                <SaveState status={st.nilai} />
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ---------- KARTU (HP) ---------- */}
            <div className="space-y-3 bg-stone-50 p-3 sm:hidden">
              {filteredSiswa.map((s) => {
                const st = status[s.id] || {};
                return (
                  <div
                    key={s.id}
                    className="overflow-hidden rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        nama={s.nama_siswa}
                        className="h-10 w-10 text-sm"
                      />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate text-sm font-bold text-stone-900">
                          {s.nama_siswa}
                        </div>
                        <div className="mt-0.5 text-[11px] tabular-nums text-stone-400">
                          #{indexById[s.id]}
                          {s.nis ? ` · ${s.nis}` : ""}
                        </div>
                      </div>
                      {!isCatatan && (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          inputMode="decimal"
                          value={nilaiMap[s.id]?.nilai ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNilaiMap((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], nilai: val },
                            }));
                          }}
                          onBlur={(e) => saveNilai(s.id, e.target.value)}
                          placeholder="-"
                          aria-label={`Nilai ${s.nama_siswa}`}
                          className={`h-11 w-20 shrink-0 rounded-full border-2 text-center text-base font-bold tabular-nums outline-none transition focus:ring-4 focus:ring-blue-500/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${nilaiTone(
                            nilaiMap[s.id]?.nilai,
                          )}`}
                        />
                      )}
                    </div>

                    {isCatatan && (
                      <textarea
                        value={catatanMap[s.id]?.catatan ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCatatanMap((prev) => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], catatan: val },
                          }));
                          scheduleSaveCatatan(s.id, val);
                        }}
                        rows={3}
                        placeholder="Catatan tahsin..."
                        aria-label={`Catatan ${s.nama_siswa}`}
                        className="mt-3 w-full resize-y rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-[13px] text-stone-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      />
                    )}

                    <div className="mt-2 h-4 text-right">
                      <SaveState status={isCatatan ? st.catatan : st.nilai} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Keterangan warna nilai */}
      {!isCatatan && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[11.5px] text-stone-500">
          <span className="font-semibold text-stone-600">Warna nilai:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-blue-400" />≥{" "}
            {NILAI_MIN_LULUS}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            &lt; {NILAI_MIN_LULUS}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-stone-300" />
            Belum diisi
          </span>
        </div>
      )}

      {/* ===== Modal hasil impor ===== */}
      {importResult && (
        <Modal size="max-w-lg" onClose={() => setImportResult(null)}>
          <ModalHeader
            title="Hasil impor"
            subtitle="Sel kosong dilewati. Nilai/catatan yang sama dengan data saat ini tidak diubah."
            onClose={() => setImportResult(null)}
          />
          <div className="space-y-4 overflow-y-auto px-5 pb-5">
            <div className="grid grid-cols-3 gap-2">
              <StatBox
                tone="blue"
                value={importResult.nilai}
                label="Nilai disimpan"
              />
              <StatBox
                tone="blue"
                value={importResult.catatan}
                label="Catatan disimpan"
              />
              <StatBox
                tone="amber"
                value={importResult.skipped}
                label="Dilewati (sama)"
              />
            </div>
            {errCount > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-2xl bg-rose-50 p-3 text-left">
                <div className="mb-1 text-xs font-bold text-rose-700">
                  Peringatan ({errCount})
                </div>
                <ul className="space-y-0.5 text-xs text-rose-600">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className={BTN_PRIMARY}
            >
              Tutup
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
