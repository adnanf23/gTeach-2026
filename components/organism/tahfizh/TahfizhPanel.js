"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import {
  getTahfizhData,
  addTahfizhKomponen,
  removeTahfizhKomponen,
  setTahfizhPredikat,
  getTahfizhCatatan,
  setCatatanTahfizh,
} from "@/actions/tahfizh.action";

const KATEGORI = [
  { key: "hafalan", label: "Hafalan Al-Qur'an", item: "Surat" },
  { key: "jaritmatika", label: "Jaritmatika Al-Qur'an", item: "Surat" },
  { key: "gesture", label: "Gesture", item: "Surat" },
  { key: "hadits", label: "Hadits", item: "Hadits" },
  { key: "doa", label: "Doa", item: "Niat & Doa" },
  { key: "wudhu", label: "Doa Berwudhu", item: "Doa" },
];

const PREDIKAT = ["A", "B", "C", "*"];
const FILE_PREFIX = "Tahfizh";

// ================================================================
// STYLE (mengikuti TahsinPanel)
// ================================================================
const BTN =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97]";
const BTN_GLASS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97]";
const BTN_LIGHT =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[13px] font-bold text-blue-800 shadow-lg shadow-black/10 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97]";
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700`;

const INPUT =
  "h-11 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm text-stone-800 placeholder:text-stone-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10";
const SURFACE =
  "rounded-3xl border border-stone-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

const TH =
  "border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500";
const TD = "border-b border-slate-100 transition-colors";
const SHADOW_L = "shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)]";

// ================================================================
// UTIL
// ================================================================
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normNis = (v) => String(v ?? "").replace(/\D/g, "");

const firstOf = (v) => (Array.isArray(v) ? v[0] : v);

const isFilled = (v) => String(v ?? "").trim().length > 0;

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

function makeFileName(mapelNama, kategoriLabel) {
  const clean = (v) =>
    String(v || "")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "_");
  return `${FILE_PREFIX}_${clean(mapelNama || "Mapel")}_${clean(kategoriLabel || "Kategori")}_${todayStr()}.xlsx`;
}

function safeSheetName(name) {
  return (
    String(name || "TAHFIZH")
      .replace(/[\\/*?:\[\]]/g, "-")
      .trim()
      .slice(0, 31) || "TAHFIZH"
  );
}

function predikatInputTone(value, status) {
  if (status === "error") return "border-red-400 bg-red-50 text-red-700";
  if (status === "saving") return "border-blue-300 bg-blue-50 text-blue-700";
  if (status === "success")
    return "border-emerald-400 bg-emerald-50 text-emerald-700";
  if (!value)
    return "border-slate-200 bg-white text-slate-700 hover:border-slate-300";
  if (value === "*") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-blue-200 bg-blue-50 text-blue-800";
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
  check: ["M20 6 9 17l-5-5"],
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
  book: [
    "M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
    "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  ],
  chart: ["M3 3v18h18", "m7 14 4-4 4 4 5-6"],
  plus: ["M5 12h14", "M12 5v14"],
  file: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6",
  ],
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

// ================================================================
// PANEL UTAMA
// ================================================================
export default function TahfizhPanel({
  kelasId,
  kelasNama = "Kelas",
  tahunAjaranId,
  mapelId,
  mapelNama,
  siswaList = [],
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [komponen, setKomponen] = useState([]);
  const [predikat, setPredikat] = useState({});
  const [activeKategori, setActiveKategori] = useState("hafalan");
  const [namaKomponen, setNamaKomponen] = useState("");
  const [busy, setBusy] = useState(false);
  const [cellStatus, setCellStatus] = useState({});
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("penilaian");
  const [catatanMap, setCatatanMap] = useState({});
  const [catatanStatus, setCatatanStatus] = useState({});

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const catatanTimers = useRef({});
  const fileInputRef = useRef(null);

  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);

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
    if (!kelasId || !tahunAjaranId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [res, catatanRes] = await Promise.all([
        mapelId
          ? getTahfizhData({ kelasId, tahunAjaranId, mapelId })
          : Promise.resolve({ komponen: [], predikat: {} }),
        getTahfizhCatatan({ kelasId, tahunAjaranId }),
      ]);
      if (res.error) {
        setError(res.error);
        return;
      }
      setKomponen(res.komponen || []);
      setPredikat(res.predikat || {});
      const cMap = {};
      (catatanRes?.rows || []).forEach((r) => {
        cMap[firstOf(r.siswa_id)] = { id: r.id, catatan: r.catatan };
      });
      setCatatanMap(cMap);
    } catch (e) {
      setError(e?.message || "Gagal memuat data tahfizh.");
    } finally {
      setLoading(false);
    }
  }, [kelasId, tahunAjaranId, mapelId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const komponenKategori = useMemo(
    () => komponen.filter((k) => (k.kategori || "") === activeKategori),
    [komponen, activeKategori],
  );
  const kategoriInfo = KATEGORI.find((k) => k.key === activeKategori);

  // Kalau kategori aktif kosong tapi kategori lain punya komponen, pindah otomatis.
  useEffect(() => {
    if (komponenKategori.length > 0 || komponen.length === 0) return;
    const firstWithKomponen = KATEGORI.find((k) =>
      komponen.some((c) => (c.kategori || "") === k.key),
    );
    if (firstWithKomponen && firstWithKomponen.key !== activeKategori) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveKategori(firstWithKomponen.key);
    }
  }, [komponen, komponenKategori.length, activeKategori]);

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

  const stat = useMemo(() => {
    const total = siswaList.length;
    const totalCells = total * komponenKategori.length;
    let filled = 0;
    siswaList.forEach((s) => {
      komponenKategori.forEach((k) => {
        if (predikat[activeKategori]?.[k.id]?.[s.id]?.predikat) filled++;
      });
    });
    return {
      total,
      komponenCount: komponenKategori.length,
      filled,
      totalCells,
      pct: totalCells ? Math.round((filled / totalCells) * 100) : 0,
    };
  }, [siswaList, komponenKategori, predikat, activeKategori]);

  const isCatatan = activeTab === "catatan";

  const catatanStat = useMemo(() => {
    const total = siswaList.length;
    const filled = siswaList.filter((s) =>
      isFilled(catatanMap[s.id]?.catatan),
    ).length;
    return {
      total,
      filled,
      pct: total ? Math.round((filled / total) * 100) : 0,
    };
  }, [siswaList, catatanMap]);

  async function handleAddKomponen(e) {
    e.preventDefault();
    if (!namaKomponen.trim()) return;
    setBusy(true);
    try {
      const res = await addTahfizhKomponen({
        kelasId,
        tahunAjaranId,
        mapelId,
        komponen: namaKomponen,
        kategori: activeKategori,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      show(`Komponen "${namaKomponen.trim()}" ditambahkan`, "success");
      setNamaKomponen("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteKomponen(id) {
    if (!window.confirm("Hapus komponen ini?")) return;
    setBusy(true);
    try {
      const res = await removeTahfizhKomponen(id);
      if (res.error) setError(res.error);
      else {
        show("Komponen dihapus", "info");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePredikatChange(komponenId, siswaId, value) {
    const key = `${komponenId}-${siswaId}`;
    const current = predikat[activeKategori]?.[komponenId]?.[siswaId];
    if ((current?.predikat || "") === (value || "")) return;

    setCellStatus((prev) => ({ ...prev, [key]: "saving" }));
    try {
      const res = await setTahfizhPredikat({
        kategori: activeKategori,
        siswaId,
        komponenId,
        tahunAjaranId,
        predikat: value,
        existingId: current?.id,
      });
      if (res.error) {
        setError(res.error);
        setCellStatus((prev) => ({ ...prev, [key]: "error" }));
        return;
      }
      setPredikat((prev) => {
        const next = { ...prev };
        if (!next[activeKategori]) next[activeKategori] = {};
        if (!next[activeKategori][komponenId])
          next[activeKategori][komponenId] = {};
        next[activeKategori][komponenId][siswaId] = {
          id: res.record.id,
          predikat: res.record.predikat,
        };
        return next;
      });
      setCellStatus((prev) => ({ ...prev, [key]: "success" }));
      setTimeout(
        () => setCellStatus((prev) => ({ ...prev, [key]: undefined })),
        1200,
      );
    } finally {
      setCellStatus((prev) =>
        prev[key] === "saving" ? { ...prev, [key]: undefined } : prev,
      );
    }
  }

  async function saveCatatan(siswaId, text) {
    setCatatanStatus((prev) => ({ ...prev, [siswaId]: "saving" }));
    try {
      const res = await setCatatanTahfizh({
        siswaId,
        kelasId,
        tahunAjaranId,
        catatan: text,
        existingId: catatanMap[siswaId]?.id,
      });
      if (res.error) {
        setError(res.error);
        setCatatanStatus((prev) => ({ ...prev, [siswaId]: "error" }));
        return;
      }
      setError("");
      setCatatanMap((prev) => ({
        ...prev,
        [siswaId]: { id: res.record.id, catatan: res.record.catatan },
      }));
      setCatatanStatus((prev) => ({ ...prev, [siswaId]: "success" }));
      setTimeout(
        () =>
          setCatatanStatus((prev) => ({ ...prev, [siswaId]: undefined })),
        1500,
      );
    } catch (e) {
      setError(e?.message || "Gagal menyimpan catatan.");
      setCatatanStatus((prev) => ({ ...prev, [siswaId]: "error" }));
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

  function handleCatatanChange(siswaId, value) {
    setCatatanMap((prev) => ({
      ...prev,
      [siswaId]: { ...prev[siswaId], catatan: value },
    }));
    scheduleSaveCatatan(siswaId, value);
  }

  // ================= TEMPLATE & EKSPOR =================
  async function buildWorkbookFile({ title = "DATA" } = {}) {
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

    function createSheet(sheetName, titleText, headers, textCols) {
      const ws = workbook.addWorksheet(safeSheetName(sheetName));
      const cols = headers.length;

      ws.mergeCells(1, 1, 1, cols);
      const title = ws.getCell(1, 1);
      title.value = titleText;
      title.font = { bold: true, size: 13 };
      title.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 26;

      const hr = ws.getRow(2);
      headers.forEach((h, i) => {
        const cell = hr.getCell(i + 1);
        cell.value = h;
        cell.fill = fill(GREEN);
        cell.font = { bold: true, size: 11 };
        cell.alignment = {
          horizontal: i === 1 ? "left" : "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = border;
      });
      hr.height = 30;

      siswaList.forEach((s, idx) => {
        const r = ws.getRow(3 + idx);
        r.getCell(1).value = idx + 1;
        r.getCell(2).value = s.nama_siswa;
        r.getCell(3).value = s.nis || "";
        for (let c = 1; c <= cols; c++) {
          const cell = r.getCell(c);
          cell.border = border;
          cell.alignment = {
            horizontal: textCols.has(c) ? "left" : "center",
            vertical: textCols.has(c) ? "top" : "middle",
            wrapText: textCols.has(c),
          };
        }
      });

      ws.getColumn(1).width = 6;
      ws.getColumn(2).width = 32;
      ws.getColumn(3).width = 14;
      for (let c = 4; c <= cols; c++) ws.getColumn(c).width = 20;
      ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];
      return ws;
    }

    KATEGORI.forEach((kat) => {
      const list = komponen.filter((k) => (k.kategori || "") === kat.key);
      const headers = [
        "NO",
        "NAMA SISWA",
        "NIS",
        ...list.map((k) => k.komponen),
      ];
      const ws = createSheet(
        kat.label,
        `${title} TAHFIZH - ${mapelNama || "TAHFIZH"} - ${kat.label}  |  Predikat: A, B, C, *`,
        headers,
        new Set([2]),
      );

      siswaList.forEach((s, idx) => {
        const r = ws.getRow(3 + idx);
        list.forEach((k, i) => {
          const cell = r.getCell(4 + i);
          const value = predikat[kat.key]?.[k.id]?.[s.id]?.predikat;

          if (value) {
            cell.value = value;
            cell.fill = fill(YELLOW);
            cell.font = { bold: true };
          } else {
            cell.value = null;
            cell.fill = fill(CYAN);
          }
          cell.dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: ['"A,B,C,*"'],
            showErrorMessage: true,
            errorTitle: "Predikat tidak valid",
            error: "Isi dengan A, B, C, atau *",
          };
        });
      });
    });

    const wsCatatan = createSheet(
      "Catatan",
      `${title} CATATAN TAHFIZH - ${mapelNama || "TAHFIZH"}`,
      ["NO", "NAMA SISWA", "NIS", "CATATAN"],
      new Set([2, 4]),
    );
    wsCatatan.getColumn(4).width = 60;
    siswaList.forEach((s, idx) => {
      const cell = wsCatatan.getRow(3 + idx).getCell(4);
      const value = catatanMap[s.id]?.catatan;
      if (isFilled(value)) {
        cell.value = String(value);
        cell.fill = fill(YELLOW);
      } else {
        cell.value = null;
        cell.fill = fill(CYAN);
      }
    });

    return workbook;
  }

  async function saveWorkbook(workbook, fileNameSuffix) {
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      makeFileName(mapelNama, fileNameSuffix),
    );
  }

  async function handleDownloadTemplate() {
    if (siswaList.length === 0) {
      show("Belum ada siswa di kelas ini.", "error");
      return;
    }
    try {
      const workbook = await buildWorkbookFile({ title: "TEMPLATE" });
      await saveWorkbook(workbook, "Template");
      show("Template diunduh", "success");
    } catch (e) {
      console.error("Gagal unduh template:", e);
      show("Gagal mengunduh template", "error");
    }
  }

  function exportCatatanPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 15;
    const bottom = pageH - 15;
    const colNo = marginX;
    const colNama = marginX + 12;
    const colCatatan = marginX + 62;
    const widthNo = 12;
    const widthNama = 50;
    const widthCatatan = pageW - marginX - colCatatan;

    let y = 0;

    const drawTitle = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`Catatan Tahfizh Kelas ${kelasNama || "-"}`, marginX, 18);
      if (mapelNama) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(mapelNama, marginX, 24);
      }
      y = mapelNama ? 30 : 26;
    };

    const drawTableHead = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("NO", colNo + 3, y + 5);
      doc.text("NAMA", colNama + 3, y + 5);
      doc.text("CATATAN", colCatatan + 3, y + 5);
      doc.setLineWidth(0.2);
      doc.rect(colNo, y, widthNo, 8);
      doc.rect(colNama, y, widthNama, 8);
      doc.rect(colCatatan, y, widthCatatan, 8);
      y += 8;
      doc.setFont("helvetica", "normal");
    };

    drawTitle();
    drawTableHead();

    const LINE_H = 5;

    siswaList.forEach((s, idx) => {
      doc.setFontSize(10);
      const catatan = String(catatanMap[s.id]?.catatan || "-");
      const namaLines = doc.splitTextToSize(
        String(s.nama_siswa || "-"),
        widthNama - 6,
      );
      const lines = doc.splitTextToSize(catatan, widthCatatan - 6);
      const rowH = Math.max(8, Math.max(namaLines.length, lines.length) * LINE_H + 4);

      if (y + rowH > bottom) {
        doc.addPage();
        y = 15;
        drawTableHead();
        doc.setFontSize(10);
      }

      doc.text(String(idx + 1), colNo + 3, y + 5.5);
      doc.text(namaLines, colNama + 3, y + 5.5);
      doc.text(lines, colCatatan + 3, y + 5.5);

      doc.rect(colNo, y, widthNo, rowH);
      doc.rect(colNama, y, widthNama, rowH);
      doc.rect(colCatatan, y, widthCatatan, rowH);
      y += rowH;
    });

    const clean = (v) =>
      String(v || "")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/\s+/g, "_");
    doc.save(
      `Catatan_Tahfizh_${clean(kelasNama || "Kelas")}_${clean(mapelNama || "Mapel")}_${todayStr()}.pdf`,
    );
  }

  async function handleExport(mode) {
    if (siswaList.length === 0) {
      show("Belum ada siswa di kelas ini.", "error");
      return;
    }
    setExportOpen(false);
    try {
      setExporting(true);
      if (mode === "catatan") {
        exportCatatanPdf();
        show("Catatan diekspor ke PDF", "success");
      } else {
        const workbook = await buildWorkbookFile({ title: "NILAI" });
        await saveWorkbook(workbook, "Nilai");
        show("Nilai diekspor ke Excel", "success");
      }
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
    try {
      setImporting(true);
      setError("");
      setImportResult(null);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      if (workbook.worksheets.length === 0) throw new Error("File kosong.");

      const byNis = new Map();
      const byNama = new Map();
      siswaList.forEach((s) => {
        const n = normNis(s.nis);
        if (n && !byNis.has(n)) byNis.set(n, s);
        const nm = norm(s.nama_siswa);
        if (nm && !byNama.has(nm)) byNama.set(nm, s);
      });

      const result = { saved: 0, skipped: 0, catatan: 0, errors: [] };
      const tasks = [];
      const newPredikat = JSON.parse(JSON.stringify(predikat));
      const newCatatan = { ...catatanMap };

      for (const ws of workbook.worksheets) {
        const headerRow = findHeaderRow(ws);
        if (headerRow === -1) continue;

        const sheetName = norm(ws.name);
        const isCatatanSheet = sheetName === "catatan";
        const kategori = isCatatanSheet
          ? null
          : KATEGORI.find(
              (k) =>
                norm(k.label) === sheetName || norm(k.key) === sheetName,
            );
        if (!isCatatanSheet && !kategori) continue;

        const list = isCatatanSheet
          ? []
          : komponen.filter((k) => (k.kategori || "") === kategori.key);

        let nisCol = -1;
        let namaCol = -1;
        let catatanCol = -1;
        const colByKomponen = {};
        ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
          const t = norm(readCellString(cell));
          if (t === "nis" && nisCol === -1) nisCol = col;
          else if ((t === "nama" || t.startsWith("nama ")) && namaCol === -1)
            namaCol = col;
          else if (isCatatanSheet && t === "catatan" && catatanCol === -1)
            catatanCol = col;
          else if (!isCatatanSheet) {
            const match = list.find((k) => norm(k.komponen) === t);
            if (match && !colByKomponen[match.id])
              colByKomponen[match.id] = col;
          }
        });
        if (nisCol === -1) nisCol = 3;
        if (namaCol === -1) namaCol = 2;

        if (isCatatanSheet) {
          if (catatanCol === -1) {
            result.errors.push(
              `Sheet "${ws.name}": kolom CATATAN tidak ditemukan.`,
            );
            continue;
          }
        } else if (Object.keys(colByKomponen).length === 0) {
          result.errors.push(
            `Sheet "${ws.name}": tidak ada kolom komponen yang cocok untuk kategori ${kategori.label}.`,
          );
          continue;
        }

        for (let rowNum = headerRow + 1; rowNum <= ws.rowCount; rowNum++) {
          const row = ws.getRow(rowNum);
          const nama = readCellString(row.getCell(namaCol));
          const nis = readCellString(row.getCell(nisCol));
          if (!nama && !nis) continue;

          const n = normNis(nis);
          const s = (n && byNis.get(n)) || byNama.get(norm(nama));
          if (!s) {
            result.errors.push(
              `Sheet "${ws.name}" baris ${rowNum}: siswa "${nama || nis}" tidak ditemukan.`,
            );
            continue;
          }

          if (isCatatanSheet) {
            const raw = readCellString(row.getCell(catatanCol));
            if (raw === (newCatatan[s.id]?.catatan || "")) {
              result.skipped++;
              continue;
            }
            const existingId = newCatatan[s.id]?.id;
            tasks.push(async () => {
              try {
                const res = await setCatatanTahfizh({
                  siswaId: s.id,
                  kelasId,
                  tahunAjaranId,
                  catatan: raw,
                  existingId,
                });
                if (res.error) throw new Error(res.error);
                newCatatan[s.id] = {
                  id: res.record.id,
                  catatan: res.record.catatan,
                };
                result.catatan++;
              } catch (err) {
                result.errors.push(
                  `Sheet "${ws.name}" baris ${rowNum} (${s.nama_siswa}): ${err?.message || "gagal"}`,
                );
              }
            });
            continue;
          }

          Object.entries(colByKomponen).forEach(([komponenId, col]) => {
            const raw = readCellString(row.getCell(col)).toUpperCase();
            if (!raw) return;
            if (!PREDIKAT.includes(raw)) {
              result.errors.push(
                `Sheet "${ws.name}" baris ${rowNum} (${s.nama_siswa}): predikat "${raw}" tidak valid (A/B/C/*).`,
              );
              return;
            }
            const existing = newPredikat[kategori.key]?.[komponenId]?.[s.id];
            if ((existing?.predikat || "") === raw) {
              result.skipped++;
              return;
            }

            tasks.push(async () => {
              try {
                const res = await setTahfizhPredikat({
                  kategori: kategori.key,
                  siswaId: s.id,
                  komponenId,
                  tahunAjaranId,
                  predikat: raw,
                  existingId: existing?.id,
                });
                if (res.error) throw new Error(res.error);
                if (!newPredikat[kategori.key]) newPredikat[kategori.key] = {};
                if (!newPredikat[kategori.key][komponenId])
                  newPredikat[kategori.key][komponenId] = {};
                newPredikat[kategori.key][komponenId][s.id] = {
                  id: res.record.id,
                  predikat: res.record.predikat,
                };
                result.saved++;
              } catch (err) {
                result.errors.push(
                  `Sheet "${ws.name}" baris ${rowNum} (${s.nama_siswa}): ${err?.message || "gagal"}`,
                );
              }
            });
          });
        }
      }

      await runPool(tasks, 4);
      setPredikat(newPredikat);
      setCatatanMap(newCatatan);
      setImportResult(result);
      show(
        `${result.saved} predikat & ${result.catatan} catatan diimpor`,
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
                {isCatatan ? "Catatan Tahfizh" : "Penilaian Tahfizh"}
              </p>
              <h2 className="mt-0.5 break-words text-xl font-bold leading-tight sm:text-2xl">
                {mapelNama || "TAHFIZH"}
              </h2>
              <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-blue-50/90">
                {isCatatan
                  ? "Catatan per siswa akan muncul di rapor tahfizh bagian Catatan Tahfizh. Tersimpan otomatis."
                  : `Kelola komponen dan isi predikat per siswa untuk kategori ${kategoriInfo?.label}. Tersimpan otomatis saat predikat dipilih.`}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:flex lg:shrink-0">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className={BTN_GLASS}
                title="Unduh template Excel semua kategori + catatan"
              >
                <Icon name="sheet" />
                <span>Template</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className={BTN_GLASS}
                title="Impor dari Excel semua kategori + catatan"
              >
                {importing ? <Spinner /> : <Icon name="upload" />}
                <span>{importing ? "Proses" : "Impor"}</span>
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  disabled={exporting}
                  className={`${BTN_LIGHT} w-full`}
                  title="Pilih format ekspor"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                >
                  {exporting ? <Spinner /> : <Icon name="download" />}
                  <span>{exporting ? "Proses" : "Ekspor"}</span>
                </button>
                {exportOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setExportOpen(false)}
                    />
                    <div
                      role="menu"
                      className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleExport("nilai")}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-stone-700 transition hover:bg-stone-100"
                      >
                        <Icon name="sheet" className="h-4 w-4 text-emerald-600" />
                        Ekspor Nilai (Excel)
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleExport("catatan")}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-stone-700 transition hover:bg-stone-100"
                      >
                        <Icon name="file" className="h-4 w-4 text-rose-600" />
                        Ekspor Catatan (PDF)
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(isCatatan
              ? [
                  ["users", stat.total, "Siswa"],
                  [
                    "check",
                    `${catatanStat.filled}/${catatanStat.total}`,
                    "Catatan terisi",
                  ],
                  ["chart", `${catatanStat.pct}%`, "Kelengkapan"],
                ]
              : [
                  ["users", stat.total, "Siswa"],
                  ["book", stat.komponenCount, "Komponen"],
                  [
                    "check",
                    `${stat.filled}/${stat.totalCells}`,
                    "Predikat terisi",
                  ],
                  ["chart", `${stat.pct}%`, "Kelengkapan"],
                ]
            ).map(([icon, value, label]) => (
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

      {/* ===== TAB UTAMA ===== */}
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex min-w-full gap-1 rounded-xl bg-stone-100 p-1 sm:min-w-0">
          {[
            { key: "penilaian", label: "Penilaian" },
            { key: "catatan", label: "Catatan Tahfizh" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                activeTab === t.key
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== KATEGORI TABS ===== */}
      <div
        className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isCatatan ? "hidden" : ""}`}
      >
        <div className="inline-flex min-w-full gap-1 rounded-xl bg-stone-100 p-1 sm:min-w-0">
          {KATEGORI.map((k) => (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={activeKategori === k.key}
              onClick={() => setActiveKategori(k.key)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                activeKategori === k.key
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== TAMBAH KOMPONEN ===== */}
      <form
        onSubmit={handleAddKomponen}
        className={`${SURFACE} ${isCatatan ? "hidden" : "flex"} flex-col gap-2 p-4 sm:flex-row sm:items-end`}
      >
        <label className="flex-1">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Nama komponen ({kategoriInfo?.item}) · {kategoriInfo?.label}
          </span>
          <input
            value={namaKomponen}
            onChange={(e) => setNamaKomponen(e.target.value)}
            placeholder="mis. Al-Faatihaah"
            className={INPUT}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !namaKomponen.trim()}
          className={`${BTN_PRIMARY} h-11`}
        >
          {busy ? <Spinner /> : <Icon name="plus" />}
          Tambah
        </button>
      </form>

      {/* ===== KONTEN ===== */}
      <section className={`${SURFACE} overflow-hidden`}>
        <div className="space-y-3 border-b border-stone-100 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-stone-900">
                {isCatatan ? "Catatan Tahfizh" : "Daftar siswa"}
              </h3>
              <p className="mt-0.5 text-xs text-stone-500">
                {isCatatan
                  ? `${catatanStat.filled} dari ${catatanStat.total} siswa sudah diberi catatan`
                  : `${stat.filled} dari ${stat.totalCells} predikat sudah terisi`}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-sm font-bold tabular-nums text-blue-700">
              {isCatatan ? catatanStat.pct : stat.pct}%
            </span>
          </div>
          <Bar value={isCatatan ? catatanStat.pct : stat.pct} />

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
        ) : isCatatan ? (
          <div className="max-h-[72vh] overflow-auto overscroll-contain">
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
                    className={`${TH} sticky top-0 z-20 h-11 min-w-[420px] px-3 text-left`}
                  >
                    Catatan Tahfizh
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSiswa.map((s, idx) => {
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
                          <span className="min-w-0 truncate">
                            {s.nama_siswa}
                          </span>
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
                        <div>
                          <textarea
                            value={catatanMap[s.id]?.catatan ?? ""}
                            onChange={(e) =>
                              handleCatatanChange(s.id, e.target.value)
                            }
                            rows={2}
                            placeholder="Catatan tahfizh..."
                            aria-label={`Catatan ${s.nama_siswa}`}
                            className="w-full min-w-[380px] resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-[13px] text-slate-800 outline-none transition placeholder:text-slate-300 focus:ring-2 focus:ring-blue-400"
                          />
                          <div className="h-4">
                            <SaveState status={catatanStatus[s.id]} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : komponenKategori.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-stone-400">
            Belum ada komponen untuk kategori ini. Tambahkan dulu di atas.
          </div>
        ) : (
          <div className="max-h-[72vh] overflow-auto overscroll-contain">
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
                  {komponenKategori.map((k) => (
                    <th
                      key={k.id}
                      className={`${TH} sticky top-0 z-20 h-11 min-w-[96px] px-2 text-center`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span
                          title={k.komponen}
                          className="max-w-[110px] truncate"
                        >
                          {k.komponen}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteKomponen(k.id)}
                          disabled={busy}
                          aria-label={`Hapus komponen ${k.komponen}`}
                          title="Hapus komponen"
                          className="shrink-0 rounded p-0.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                        >
                          <Icon name="x" className="h-3 w-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSiswa.map((s, idx) => {
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
                          <span className="min-w-0 truncate">
                            {s.nama_siswa}
                          </span>
                          {s.nis ? (
                            <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                              · {s.nis}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {komponenKategori.map((k) => {
                        const cellKey = `${k.id}-${s.id}`;
                        const st = cellStatus[cellKey];
                        const value =
                          predikat[activeKategori]?.[k.id]?.[s.id]?.predikat ||
                          "";
                        return (
                          <td
                            key={k.id}
                            className={`${TD} px-1.5 py-1.5 group-hover:bg-blue-50 ${bg}`}
                          >
                            <div className="flex flex-col items-center">
                              <select
                                value={value}
                                onChange={(e) =>
                                  handlePredikatChange(
                                    k.id,
                                    s.id,
                                    e.target.value,
                                  )
                                }
                                aria-label={`Predikat ${s.nama_siswa} - ${k.komponen}`}
                                className={`h-8 w-14 rounded-md border px-1 text-center text-[13px] font-semibold tabular-nums outline-none transition focus:ring-2 focus:ring-blue-400 ${predikatInputTone(
                                  value,
                                  st,
                                )}`}
                              >
                                <option value="">–</option>
                                {PREDIKAT.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                              <div className="h-4">
                                <SaveState status={st} />
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Keterangan predikat */}
      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[11.5px] text-stone-500 ${isCatatan ? "hidden" : ""}`}
      >
        <span className="font-semibold text-stone-600">Keterangan:</span>
        <span>A = Hafal</span>
        <span>B = Hafal dengan sedikit bantuan</span>
        <span>C = Hafal dengan banyak bantuan</span>
        <span>* = Belum hafal</span>
      </div>

      {/* ===== Modal hasil impor ===== */}
      {importResult && (
        <Modal size="max-w-lg" onClose={() => setImportResult(null)}>
          <ModalHeader
            title="Hasil impor"
            subtitle="Sel kosong dilewati. Predikat/catatan yang sama dengan data saat ini tidak diubah."
            onClose={() => setImportResult(null)}
          />
          <div className="space-y-4 overflow-y-auto px-5 pb-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatBox
                tone="blue"
                value={importResult.saved}
                label="Predikat disimpan"
              />
              <StatBox
                tone="blue"
                value={importResult.catatan}
                label="Catatan disimpan"
              />
              <StatBox
                tone="stone"
                value={importResult.skipped}
                label="Dilewati (sama)"
              />
              <StatBox tone="amber" value={errCount} label="Peringatan" />
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
