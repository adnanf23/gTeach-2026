"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { pb, getCurrentUser } from "@/lib/pocketbase";

// ------------------------------------------------------------------
// Helper tanggal & sistem absensi
// ------------------------------------------------------------------
const HARI_KEY = [
  "minggu",
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
];

function toISODate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function parseISODate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}
function isHoliday(date, hariLiburList) {
  if (!hariLiburList || hariLiburList.length === 0) return false;
  const dateStr = toISODate(date);
  const dayKey = HARI_KEY[date.getDay()];
  for (const h of hariLiburList) {
    if (h.tanggal) {
      const liburDateStr = toISODate(new Date(h.tanggal));
      if (liburDateStr === dateStr) return true;
    }
    if (h.hari && h.hari === dayKey) return true;
  }
  return false;
}
function countEffectiveDays(startStr, endStr, hariLiburList) {
  if (!startStr || !endStr) return 0;
  const start = parseISODate(startStr);
  const end = parseISODate(endStr);
  if (!start || !end || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (!isWeekend(cur) && !isHoliday(cur, hariLiburList)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ------------------------------------------------------------------
// Helper status — alpha & warning tetap merah
// ------------------------------------------------------------------
const STATUS_CONFIG = {
  hadir: {
    label: "Hadir",
    dot: "bg-gray-900",
    text: "text-gray-900",
    bg: "bg-gray-100",
    ring: "ring-gray-300",
  },
  sakit: {
    label: "Sakit",
    dot: "bg-gray-600",
    text: "text-gray-700",
    bg: "bg-gray-100",
    ring: "ring-gray-200",
  },
  izin: {
    label: "Izin",
    dot: "bg-gray-400",
    text: "text-gray-600",
    bg: "bg-gray-50",
    ring: "ring-gray-200",
  },
  // WARNING — tetap merah
  alpha: {
    label: "Alpha",
    dot: "bg-rose-500",
    text: "text-rose-700",
    bg: "bg-rose-50",
    ring: "ring-rose-200",
  },
};
const STATUS_ORDER = ["hadir", "sakit", "izin", "alpha"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatTanggalID(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}
function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

// ------------------------------------------------------------------
// Export helper — warna Excel monokrom
// ------------------------------------------------------------------
const EXPORT_FONT = { name: "Calibri" };
const BORDER_THIN = {
  top: { style: "thin", color: { rgb: "BFBFBF" } },
  bottom: { style: "thin", color: { rgb: "BFBFBF" } },
  left: { style: "thin", color: { rgb: "BFBFBF" } },
  right: { style: "thin", color: { rgb: "BFBFBF" } },
};

async function exportAbsensiWorkbook({
  kelasList,
  siswaPerKelas,
  kelasId,
  startDate,
  endDate,
}) {
  const XLSX = await import("xlsx-js-style");

  const kelasFilter = kelasId !== "semua" ? ` && kelas_id = "${kelasId}"` : "";
  const filter = `tanggal >= "${startDate} 00:00:00" && tanggal <= "${endDate} 23:59:59"${kelasFilter}`;

  const records = await pb
    .collection("absensi")
    .getFullList({ filter, requestKey: null });

  const targetKelas =
    kelasId === "semua" ? kelasList : kelasList.filter((k) => k.id === kelasId);

  const HEADERS = [
    "NO",
    "NIS",
    "NAMA",
    "L/P",
    "KELAS",
    "KETIDAK HADIRAN",
    "Jumlah",
    "Hadir",
    "Sakit",
    "Izin",
    "Alpa",
    "% Kehadiran",
  ];

  const aoa = [
    ["DAFTAR HADIR PESERTA DIDIK"],
    [
      `Periode: ${formatTanggalID(startDate)}  —  ${formatTanggalID(endDate)}` +
        (kelasId !== "semua"
          ? `   •   Kelas: ${targetKelas[0]?.nama_kelas || ""}`
          : ""),
    ],
    [],
    HEADERS,
  ];

  let noUrut = 1;

  for (const k of targetKelas) {
    const siswaKelas = (siswaPerKelas.get(k.id) || [])
      .slice()
      .sort((a, b) => a.nama_siswa.localeCompare(b.nama_siswa));

    const kelasRecords = records.filter((r) => firstOf(r.kelas_id) === k.id);
    const bySiswa = new Map();
    for (const r of kelasRecords) {
      const sid = firstOf(r.siswa_id);
      if (!sid) continue;
      if (!bySiswa.has(sid))
        bySiswa.set(sid, { hadir: 0, sakit: 0, izin: 0, alpha: 0 });
      const e = bySiswa.get(sid);
      if (r.status in e) e[r.status]++;
    }

    for (const s of siswaKelas) {
      const c = bySiswa.get(s.id) || { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
      const total = c.hadir + c.sakit + c.izin + c.alpha;
      const tidakHadir = c.sakit + c.izin + c.alpha;
      const persen = total ? Math.round((c.hadir / total) * 100) : 0;

      aoa.push([
        noUrut++,
        s.nis || "",
        s.nama_siswa || "",
        s.jenis_kelamin || "-",
        k.nama_kelas,
        tidakHadir,
        total,
        c.hadir,
        c.sakit,
        c.izin,
        c.alpha,
        persen,
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
  ];
  ws["!cols"] = [
    { wch: 5 },
    { wch: 12 },
    { wch: 32 },
    { wch: 6 },
    { wch: 20 },
    { wch: 16 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 13 },
  ];
  ws["!rows"] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 6 }, { hpt: 26 }];
  ws["!freeze"] = "A5";

  // Warna monokrom (abu)
  const GRAY_DARK = "FFE5E7EB";
  const GRAY_MED = "FFD1D5DB";
  const GRAY_LIGHT = "FFF3F4F6";

  const sTitle = {
    font: { ...EXPORT_FONT, bold: true, sz: 15, color: { rgb: "111827" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const sMeta = {
    font: { ...EXPORT_FONT, italic: true, sz: 10, color: { rgb: "6B7280" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const sHead = {
    font: { ...EXPORT_FONT, bold: true, sz: 11, color: { rgb: "000000" } },
    fill: { fgColor: { rgb: GRAY_DARK } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: BORDER_THIN,
  };
  const sCell = {
    font: { ...EXPORT_FONT, sz: 11 },
    alignment: { vertical: "center", wrapText: true },
    border: BORDER_THIN,
  };
  const sCellC = {
    ...sCell,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  const sHadir = {
    ...sCellC,
    fill: { fgColor: { rgb: GRAY_DARK } },
    font: { ...EXPORT_FONT, bold: true, sz: 11 },
  };
  const sSakit = {
    ...sCellC,
    fill: { fgColor: { rgb: GRAY_MED } },
  };
  const sIzin = {
    ...sCellC,
    fill: { fgColor: { rgb: GRAY_LIGHT } },
  };
  const sPersen = {
    ...sCellC,
    fill: { fgColor: { rgb: GRAY_MED } },
    font: { ...EXPORT_FONT, bold: true, sz: 11 },
  };

  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      if (R === 0) ws[addr].s = sTitle;
      else if (R === 1) ws[addr].s = sMeta;
      else if (R === 3) ws[addr].s = sHead;
      else if (R >= 4) {
        if (C === 11) ws[addr].s = sPersen;
        else if (C === 7) ws[addr].s = sHadir;
        else if (C === 8) ws[addr].s = sSakit;
        else if (C === 9) ws[addr].s = sIzin;
        else if (
          C === 0 ||
          C === 1 ||
          C === 3 ||
          C === 5 ||
          C === 6 ||
          C === 10
        )
          ws[addr].s = sCellC;
        else ws[addr].s = sCell;
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "KEHADIRAN");

  const kelasSlug =
    kelasId === "semua"
      ? "semua-kelas"
      : (targetKelas[0]?.nama_kelas || "kelas").replace(/\s+/g, "_");
  XLSX.writeFile(wb, `absensi_${kelasSlug}_${startDate}_${endDate}.xlsx`);
}

// ------------------------------------------------------------------
// UI primitives
// ------------------------------------------------------------------
const ICONS = {
  download: "M12 4v12m0 0l-4-4m4 4l4-4M4 20h16",
  refresh:
    "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  search: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",
  chevron: "M19 9l-7 7-7-7",
  check: "M5 13l4 4L19 7",
  alert:
    "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  x: "M6 18L18 6M6 6l12 12",
  grid: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
  calendar:
    "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  users:
    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
};

function Icon({ name, className = "h-4 w-4" }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

// TONES — rose tetap merah (warning), sisanya monokrom
const TONES = {
  indigo: {
    soft: "bg-gray-100",
    text: "text-gray-900",
    ring: "ring-gray-300",
    dot: "bg-gray-900",
    bar: "bg-gray-900",
    border: "border-gray-300",
  },
  emerald: {
    soft: "bg-gray-100",
    text: "text-gray-700",
    ring: "ring-gray-200",
    dot: "bg-gray-700",
    bar: "bg-gray-700",
    border: "border-gray-200",
  },
  // WARNING — tetap merah
  rose: {
    soft: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
    border: "border-rose-200",
  },
  amber: {
    soft: "bg-gray-50",
    text: "text-gray-600",
    ring: "ring-gray-200",
    dot: "bg-gray-500",
    bar: "bg-gray-500",
    border: "border-gray-200",
  },
  slate: {
    soft: "bg-slate-100",
    text: "text-slate-600",
    ring: "ring-slate-200",
    dot: "bg-slate-400",
    bar: "bg-slate-400",
    border: "border-slate-200",
  },
};

const CARD = "rounded-2xl bg-white ring-1 ring-slate-200/70";
const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-900/10";

function PageHeader({
  eyebrow,
  title,
  selectedDate,
  setSelectedDate,
  user,
  canExport,
  onExport,
  onRefresh,
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-900">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {formatTanggalID(selectedDate)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-900/10"
        />
        <button
          onClick={onRefresh}
          title="Segarkan"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
        >
          <Icon name="refresh" />
        </button>
        {canExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
          >
            <Icon name="download" />
            Export
          </button>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1 pl-1 pr-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-[11px] font-semibold text-white">
            {initials(user?.nama_lengkap || "G")}
          </div>
          <span className="max-w-[110px] truncate text-xs font-medium text-slate-700">
            {user?.nama_lengkap || "Guru"}
          </span>
        </div>
      </div>
    </header>
  );
}

function Banner({ tone, icon, title, children }) {
  const t = TONES[tone];
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border ${t.border} ${t.soft} p-4`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white ${t.text} ring-1 ${t.ring}`}
      >
        <Icon name={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${t.text}`}>{title}</p>
        {children && (
          <p
            className={`mt-0.5 break-words text-xs leading-relaxed ${t.text} opacity-80`}
          >
            {children}
          </p>
        )}
      </div>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-gray-900" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function StatCard({ label, value, sub, icon, tone = "slate", progress }) {
  const t = TONES[tone];
  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-xl ${t.soft} ${t.text}`}
        >
          <Icon name={icon} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {value}
      </p>
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${t.bar} transition-all`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
      {sub && <p className="mt-2 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function StatusListCard({
  title,
  kelasArr,
  siswaPerKelas,
  onLihatSemua,
  onLihatDetail,
  emptyText,
  tone,
}) {
  const t = TONES[tone];
  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${t.dot}`} />
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.soft} ${t.text}`}
          >
            {kelasArr.length}
          </span>
        </div>
        <button
          onClick={onLihatSemua}
          className="text-xs font-medium text-gray-900 hover:text-black"
        >
          Lihat semua →
        </button>
      </header>

      {kelasArr.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-5 text-center text-sm text-slate-400">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {kelasArr.slice(0, 4).map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${t.soft} ${t.text}`}
                >
                  {k.nama_kelas?.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {k.nama_kelas}
                  </p>
                  <p className="text-xs text-slate-400">
                    {siswaPerKelas.get(k.id)?.length || 0} siswa
                  </p>
                </div>
              </div>
              <button
                onClick={() => onLihatDetail(k.id)}
                className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                Detail
              </button>
            </li>
          ))}
          {kelasArr.length > 4 && (
            <li className="pt-2.5 text-center">
              <button
                onClick={onLihatSemua}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                + {kelasArr.length - 4} lainnya
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function RankingCard({ title, subtitle, data, tone }) {
  const t = TONES[tone];
  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mb-4 text-xs text-slate-400">{subtitle}</p>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Belum ada data.
        </p>
      ) : (
        <ul className="space-y-3.5">
          {data.map(({ kelas, rate, display }, i) => (
            <li key={kelas.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                      i < 3
                        ? "bg-gray-900 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate">{kelas.nama_kelas}</span>
                </span>
                <span className={`shrink-0 font-semibold ${t.text}`}>
                  {display ?? `${rate.toFixed(1)}%`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${t.bar}`}
                  style={{ width: `${Math.min(100, rate)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Modal({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

// ------------------------------------------------------------------
// Export modal
// ------------------------------------------------------------------
function ExportModal({
  kelasList,
  siswaPerKelas,
  defaultKelasId = "semua",
  onClose,
}) {
  const [kelasId, setKelasId] = useState(defaultKelasId);
  const [startDate, setStartDate] = useState(daysAgoStr(30));
  const [endDate, setEndDate] = useState(todayStr());
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState("");

  const handleExport = async () => {
    setErr("");
    if (!startDate || !endDate) {
      setErr("Tanggal mulai & selesai wajib diisi.");
      return;
    }
    if (startDate > endDate) {
      setErr("Tanggal mulai harus ≤ tanggal selesai.");
      return;
    }
    if (kelasId === "semua") {
      const ok = window.confirm(
        "Kamu memilih SEMUA KELAS. File akan cukup besar. Lanjut?",
      );
      if (!ok) return;
    }

    setExporting(true);
    try {
      await exportAbsensiWorkbook({
        kelasList,
        siswaPerKelas,
        kelasId,
        startDate,
        endDate,
      });
      onClose();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Gagal membuat file Excel.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal onClose={() => !exporting && onClose()}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Export Absensi
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Rekap kehadiran siswa per kelas dalam rentang tanggal tertentu.
            </p>
          </div>
          <button
            onClick={() => !exporting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="x" />
          </button>
        </div>

        {err && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {err}
          </div>
        )}

        <Field label="Kelas">
          <select
            value={kelasId}
            onChange={(e) => setKelasId(e.target.value)}
            className={INPUT}
          >
            <option value="semua">Semua kelas</option>
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama_kelas}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tanggal mulai">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Tanggal selesai">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-gray-100 px-3.5 py-2.5 text-xs text-gray-800">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            File diunduh sebagai <b>.xlsx</b> dengan header dan formatting
            sesuai template.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
          >
            {exporting && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {exporting ? "Menyiapkan..." : "Export Excel"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------
// Toolbar
// ------------------------------------------------------------------
function Toolbar({
  title,
  searchValue,
  setSearchValue,
  searchPlaceholder,
  filterStatus,
  setFilterStatus,
  statusCounts,
  filterKelas,
  setFilterKelas,
  kelasList,
}) {
  const segments = [
    { key: "semua", label: "Semua" },
    { key: "sudah", label: "Lengkap" },
    { key: "belum", label: "Belum lengkap" },
  ];

  return (
    <div className={`${CARD} p-3 sm:p-4`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <h2 className="text-base font-semibold text-slate-900 lg:mr-auto">
          {title}
        </h2>

        <div className="relative lg:w-72">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon name="search" />
          </span>
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-gray-900 focus:bg-white focus:ring-4 focus:ring-gray-900/10"
          />
        </div>

        <select
          value={filterKelas}
          onChange={(e) => setFilterKelas(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-700 outline-none transition focus:border-gray-900 focus:bg-white focus:ring-4 focus:ring-gray-900/10 lg:w-48"
        >
          <option value="semua">Semua kelas</option>
          {kelasList.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nama_kelas}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
        {segments.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilterStatus(s.key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              filterStatus === s.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {s.label}{" "}
            <span className="text-slate-400">({statusCounts[s.key]})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Konten Absensi
// ------------------------------------------------------------------
function AbsensiContent({
  selectedDate,
  kelasList,
  siswaPerKelas,
  totalSiswa,
  hariLiburList,
}) {
  const [absensiRange, setAbsensiRange] = useState([]);
  const [absensiTanggal, setAbsensiTanggal] = useState([]);
  const [loadingRange, setLoadingRange] = useState(true);
  const [loadingTanggal, setLoadingTanggal] = useState(false);

  const [expandedKelas, setExpandedKelas] = useState(() => new Set());
  const [filterKelas, setFilterKelas] = useState("semua");
  const [filterStatus, setFilterStatus] = useState("semua");
  const [searchSiswa, setSearchSiswa] = useState("");

  const selectedDateObj = useMemo(
    () => parseISODate(selectedDate),
    [selectedDate],
  );
  const selectedIsWeekend = selectedDateObj
    ? isWeekend(selectedDateObj)
    : false;
  const selectedIsHoliday = selectedDateObj
    ? isHoliday(selectedDateObj, hariLiburList)
    : false;
  const selectedIsWorkday = !selectedIsWeekend && !selectedIsHoliday;

  const loadRange = useCallback(async () => {
    setLoadingRange(true);
    try {
      const records = await pb.collection("absensi").getFullList({
        filter: `tanggal >= "${daysAgoStr(30)} 00:00:00" && tanggal <= "${todayStr()} 23:59:59"`,
        sort: "-tanggal",
        requestKey: null,
      });
      setAbsensiRange(records);
    } catch (err) {
      console.error(err);
      setAbsensiRange([]);
    } finally {
      setLoadingRange(false);
    }
  }, []);

  useEffect(() => {
    loadRange();
  }, [loadRange]);

  const loadTanggal = useCallback(async (dateStr) => {
    setLoadingTanggal(true);
    try {
      const records = await pb.collection("absensi").getFullList({
        filter: `tanggal >= "${dateStr} 00:00:00" && tanggal <= "${dateStr} 23:59:59"`,
        expand: "siswa_id,kelas_id",
        requestKey: null,
      });
      setAbsensiTanggal(records);
    } catch (err) {
      console.error(err);
      setAbsensiTanggal([]);
    } finally {
      setLoadingTanggal(false);
    }
  }, []);

  useEffect(() => {
    loadTanggal(selectedDate);
  }, [selectedDate, loadTanggal]);

  const hariEfektif30 = useMemo(
    () => countEffectiveDays(daysAgoStr(30), todayStr(), hariLiburList),
    [hariLiburList],
  );

  const kelasLengkapIds = useMemo(() => {
    const recordsPerKelas = new Map();
    for (const a of absensiTanggal) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      recordsPerKelas.set(kid, (recordsPerKelas.get(kid) || 0) + 1);
    }
    const lengkap = new Set();
    for (const k of kelasList) {
      const jumlahSiswa = siswaPerKelas.get(k.id)?.length || 0;
      if (jumlahSiswa > 0 && (recordsPerKelas.get(k.id) || 0) >= jumlahSiswa) {
        lengkap.add(k.id);
      }
    }
    return lengkap;
  }, [absensiTanggal, kelasList, siswaPerKelas]);

  const kelasSudah = useMemo(() => {
    if (!selectedIsWorkday) return [];
    return kelasList.filter((k) => kelasLengkapIds.has(k.id));
  }, [kelasList, kelasLengkapIds, selectedIsWorkday]);

  const kelasBelum = useMemo(() => {
    if (!selectedIsWorkday) return [];
    return kelasList.filter((k) => !kelasLengkapIds.has(k.id));
  }, [kelasList, kelasLengkapIds, selectedIsWorkday]);

  const statistikKelas = useMemo(() => {
    if (hariEfektif30 === 0) return [];
    const map = new Map();
    for (const a of absensiRange) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      if (!map.has(kid)) map.set(kid, { hadir: 0 });
      const entry = map.get(kid);
      if (a.status === "hadir") entry.hadir += 1;
    }
    const result = [];
    for (const k of kelasList) {
      const jumlahSiswa = siswaPerKelas.get(k.id)?.length || 0;
      if (jumlahSiswa === 0) continue;
      const entry = map.get(k.id) || { hadir: 0 };
      const denom = hariEfektif30 * jumlahSiswa;
      result.push({
        kelas: k,
        rate: denom > 0 ? (entry.hadir / denom) * 100 : 0,
        total: denom,
        hadir: entry.hadir,
      });
    }
    result.sort((a, b) => b.rate - a.rate);
    return result;
  }, [absensiRange, kelasList, siswaPerKelas, hariEfektif30]);

  const terbaik = statistikKelas.slice(0, 5);
  const terendah = [...statistikKelas].reverse().slice(0, 5);

  const absensiPerKelas = useMemo(() => {
    const map = new Map();
    for (const a of absensiTanggal) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      if (!map.has(kid)) map.set(kid, []);
      map.get(kid).push(a);
    }
    return map;
  }, [absensiTanggal]);

  const kelasUntukDitampilkan = useMemo(() => {
    let list =
      filterKelas === "semua"
        ? kelasList
        : kelasList.filter((k) => k.id === filterKelas);
    if (filterStatus === "sudah")
      list = list.filter((k) => kelasLengkapIds.has(k.id));
    else if (filterStatus === "belum")
      list = list.filter((k) => !kelasLengkapIds.has(k.id));
    if (searchSiswa.trim()) {
      const q = searchSiswa.trim().toLowerCase();
      list = list.filter((k) => {
        if (k.nama_kelas.toLowerCase().includes(q)) return true;
        return (siswaPerKelas.get(k.id) || []).some((s) =>
          s.nama_siswa.toLowerCase().includes(q),
        );
      });
    }
    return list;
  }, [
    kelasList,
    filterKelas,
    filterStatus,
    searchSiswa,
    siswaPerKelas,
    kelasLengkapIds,
  ]);

  const toggleExpand = (kelasId) => {
    setExpandedKelas((prev) => {
      const next = new Set(prev);
      next.has(kelasId) ? next.delete(kelasId) : next.add(kelasId);
      return next;
    });
  };

  const goToDetail = (kelasId, status) => {
    setFilterKelas(kelasId || "semua");
    setFilterStatus(status || "semua");
    setExpandedKelas(kelasId ? new Set([kelasId]) : new Set());
    document
      .getElementById("absensi-list-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const persenSudah =
    kelasList.length && selectedIsWorkday
      ? Math.round((kelasSudah.length / kelasList.length) * 100)
      : 0;
  const statusCounts = {
    semua: kelasList.length,
    sudah: selectedIsWorkday ? kelasSudah.length : 0,
    belum: selectedIsWorkday ? kelasBelum.length : 0,
  };

  const kelasBelumNama = kelasBelum.map((k) => k.nama_kelas);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Banner status hari — rose (warning) tetap merah */}
      {!selectedIsWorkday ? (
        <Banner
          tone="slate"
          icon="info"
          title={selectedIsWeekend ? "Akhir pekan" : "Hari libur"}
        >
          Tanggal {formatTanggalID(selectedDate)} bukan hari kerja efektif, jadi
          absensi tidak dihitung dalam monitoring.
        </Banner>
      ) : kelasBelum.length > 0 ? (
        <Banner
          tone="rose"
          icon="alert"
          title={`${kelasBelum.length} kelas belum lengkap isi absensi pada ${formatTanggalID(selectedDate)}`}
        >
          {kelasBelumNama.slice(0, 20).join(", ")}
          {kelasBelumNama.length > 20 &&
            ` +${kelasBelumNama.length - 20} kelas lain`}
        </Banner>
      ) : kelasList.length > 0 ? (
        <Banner
          tone="emerald"
          icon="check"
          title="Semua kelas sudah lengkap isi absensi hari ini 🎉"
        />
      ) : null}

      {/* Statistik */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Kelas"
          value={kelasList.length}
          sub={`${totalSiswa} siswa`}
          icon="grid"
          tone="slate"
        />
        {!selectedIsWorkday ? (
          <StatCard
            label="Status Hari Ini"
            value="Libur"
            sub={selectedIsWeekend ? "Akhir pekan" : "Hari libur"}
            icon="info"
            tone="slate"
          />
        ) : (
          <StatCard
            label="Sudah Lengkap"
            value={loadingTanggal ? "…" : kelasSudah.length}
            sub={`${persenSudah}% dari seluruh kelas`}
            icon="check"
            tone="indigo"
            progress={persenSudah}
          />
        )}
        {!selectedIsWorkday ? (
          <StatCard
            label="Hari Efektif 30h"
            value={hariEfektif30}
            sub="Sen–Jum non-libur"
            icon="calendar"
            tone="slate"
          />
        ) : (
          <StatCard
            label="Belum Lengkap"
            value={loadingTanggal ? "…" : kelasBelum.length}
            sub="perlu ditindaklanjuti"
            icon="alert"
            tone="rose"
          />
        )}
        <StatCard
          label="Rata-rata Hadir"
          value={`${Math.round(avgRate(terbaik, terendah))}%`}
          sub="30 hari terakhir"
          icon="users"
          tone="emerald"
          progress={avgRate(terbaik, terendah)}
        />
      </div>

      {/* Status kelas */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        {selectedIsWorkday ? (
          <>
            <StatusListCard
              title="Sudah Lengkap"
              kelasArr={kelasSudah}
              siswaPerKelas={siswaPerKelas}
              onLihatSemua={() => goToDetail(null, "sudah")}
              onLihatDetail={(id) => goToDetail(id, null)}
              emptyText="Belum ada kelas yang lengkap"
              tone="indigo"
            />
            <StatusListCard
              title="Belum Lengkap"
              kelasArr={kelasBelum}
              siswaPerKelas={siswaPerKelas}
              onLihatSemua={() => goToDetail(null, "belum")}
              onLihatDetail={(id) => goToDetail(id, null)}
              emptyText="Semua kelas sudah lengkap"
              tone="rose"
            />
          </>
        ) : (
          <section className={`${CARD} p-4 sm:p-5 lg:col-span-2`}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">
                {selectedIsWeekend ? "Akhir Pekan" : "Hari Libur"}
              </h3>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Tanggal <b>{formatTanggalID(selectedDate)}</b> bukan hari kerja
              efektif, jadi tidak ada absensi yang perlu dilengkapi.
            </p>
          </section>
        )}
      </div>

      {/* Ranking */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <RankingCard
          title="Kehadiran Terbaik"
          subtitle={`30 hari · ${hariEfektif30} hari efektif × jumlah siswa`}
          data={terbaik}
          tone="emerald"
        />
        <RankingCard
          title="Kehadiran Terendah"
          subtitle={`30 hari · ${hariEfektif30} hari efektif × jumlah siswa`}
          data={terendah}
          tone="rose"
        />
      </div>

      {/* Daftar kelas */}
      <div id="absensi-list-section" className="scroll-mt-6 space-y-3">
        <Toolbar
          title="Absensi per Kelas"
          searchValue={searchSiswa}
          setSearchValue={setSearchSiswa}
          searchPlaceholder="Cari kelas / siswa"
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          statusCounts={statusCounts}
          filterKelas={filterKelas}
          setFilterKelas={setFilterKelas}
          kelasList={kelasList}
        />

        {loadingTanggal ? (
          <LoadingState label="Memuat absensi..." />
        ) : kelasUntukDitampilkan.length === 0 ? (
          <div className={`${CARD} p-10 text-center`}>
            <p className="text-sm text-slate-400">
              Tidak ada kelas yang cocok.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {kelasUntukDitampilkan.map((k) => (
              <KelasAbsensiCard
                key={k.id}
                kelas={k}
                siswaKelas={siswaPerKelas.get(k.id) || []}
                records={absensiPerKelas.get(k.id) || []}
                lengkap={kelasLengkapIds.has(k.id)}
                expanded={expandedKelas.has(k.id)}
                onToggle={() => toggleExpand(k.id)}
                selectedIsWorkday={selectedIsWorkday}
                selectedIsWeekend={selectedIsWeekend}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function avgRate(a, b) {
  const seen = new Set();
  const all = [...a, ...b].filter((x) => {
    if (seen.has(x.kelas.id)) return false;
    seen.add(x.kelas.id);
    return true;
  });
  if (!all.length) return 0;
  return all.reduce((s, x) => s + x.rate, 0) / all.length;
}

function KelasAbsensiCard({
  kelas,
  siswaKelas,
  records,
  lengkap,
  expanded,
  onToggle,
  selectedIsWorkday,
  selectedIsWeekend,
}) {
  const counts = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
  const statusBySiswaId = new Map();
  for (const r of records) {
    const sid = firstOf(r.siswa_id);
    if (r.status in counts) counts[r.status] += 1;
    if (sid) statusBySiswaId.set(sid, r.status);
  }
  const belumTercatat = siswaKelas.length - records.length;
  const progress = siswaKelas.length
    ? Math.min(100, (records.length / siswaKelas.length) * 100)
    : 0;

  const statusLabel = !selectedIsWorkday
    ? selectedIsWeekend
      ? "Akhir pekan"
      : "Libur"
    : lengkap
      ? "Lengkap"
      : records.length > 0
        ? "Sebagian"
        : "Belum";

  const tone = !selectedIsWorkday
    ? "slate"
    : lengkap
      ? "indigo"
      : records.length > 0
        ? "amber"
        : "rose";
  const t = TONES[tone];

  return (
    <div className={`${CARD} overflow-hidden transition hover:shadow-md`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/70 sm:px-5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${t.soft} ${t.text}`}
          >
            {kelas.nama_kelas?.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {kelas.nama_kelas}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${t.bar}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400">
                {records.length}/{siswaKelas.length} siswa tercatat
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden gap-1.5 md:flex">
            {STATUS_ORDER.map((s) =>
              counts[s] > 0 ? (
                <span
                  key={s}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} ${STATUS_CONFIG[s].ring}`}
                >
                  {STATUS_CONFIG[s].label} {counts[s]}
                </span>
              ) : null,
            )}
          </div>
          <span
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${t.soft} ${t.text} ${t.ring}`}
          >
            {statusLabel}
          </span>
          <Icon
            name="chevron"
            className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
          {siswaKelas.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              Belum ada data siswa di kelas ini.
            </p>
          ) : !selectedIsWorkday ? (
            <div className="rounded-xl bg-white px-3 py-4 text-center text-sm text-slate-500 ring-1 ring-slate-200/70">
              Tanggal ini bukan hari kerja efektif. Tidak ada absensi untuk
              dicatat.
            </div>
          ) : (
            <>
              {belumTercatat > 0 && (
                // Warning — tetap merah
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                  <Icon name="alert" className="h-4 w-4 shrink-0" />
                  {belumTercatat} siswa belum tercatat pada tanggal ini.
                </div>
              )}
              <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200/70">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="w-10 px-4 py-2.5 font-medium">#</th>
                      <th className="px-4 py-2.5 font-medium">Nama siswa</th>
                      <th className="px-4 py-2.5 font-medium">NIS</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...siswaKelas]
                      .sort((a, b) => a.nama_siswa.localeCompare(b.nama_siswa))
                      .map((s, idx) => {
                        const status = statusBySiswaId.get(s.id);
                        const cfg = status ? STATUS_CONFIG[status] : null;
                        return (
                          <tr
                            key={s.id}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="px-4 py-2.5 text-xs text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="max-w-[180px] truncate px-4 py-2.5 font-medium text-slate-800 sm:max-w-none">
                              {s.nama_siswa}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">
                              {s.nis}
                            </td>
                            <td className="px-4 py-2.5">
                              {cfg ? (
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}
                                  />
                                  {cfg.label}
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-400">
                                  Belum
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Halaman utama
// ------------------------------------------------------------------
export default function AbsensiPage() {
  const [kelasList, setKelasList] = useState([]);
  const [siswaList, setSiswaList] = useState([]);
  const [hariLiburList, setHariLiburList] = useState([]);
  const [loadingBase, setLoadingBase] = useState(true);
  const [errorBase, setErrorBase] = useState("");

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [user, setUser] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const loadBaseData = useCallback(async () => {
    setLoadingBase(true);
    setErrorBase("");
    try {
      const [kelas, siswa, hariLibur] = await Promise.all([
        pb.collection("kelas").getFullList({
          sort: "tingkat,nama_kelas",
          expand: "walikelas_id,pendamping_id",
          requestKey: null,
        }),
        pb.collection("siswa").getFullList({
          sort: "nama_siswa",
          requestKey: null,
        }),
        pb
          .collection("hari_libur")
          .getFullList({ requestKey: null })
          .catch(() => []),
      ]);
      setKelasList(kelas);
      setSiswaList(siswa);
      setHariLiburList(hariLibur);
    } catch (err) {
      console.error(err);
      setErrorBase(
        "Gagal memuat data. Pastikan PocketBase berjalan dan kamu sudah login.",
      );
    } finally {
      setLoadingBase(false);
    }
  }, []);

  useEffect(() => {
    loadBaseData();
  }, [loadBaseData]);

  const siswaPerKelas = useMemo(() => {
    const map = new Map();
    for (const s of siswaList) {
      const kid = firstOf(s.kelas_id);
      if (!kid) continue;
      if (!map.has(kid)) map.set(kid, []);
      map.get(kid).push(s);
    }
    return map;
  }, [siswaList]);

  const totalSiswa = siswaList.length;

  return (
    <div className="min-h-screen text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader
          eyebrow="Monitoring"
          title="Absensi Siswa"
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          user={user}
          canExport={!loadingBase && !errorBase}
          onExport={() => setExportOpen(true)}
          onRefresh={loadBaseData}
        />

        {/* Error box — tetap merah */}
        {errorBase && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {errorBase}
          </div>
        )}

        {loadingBase ? (
          <LoadingState label="Memuat data..." />
        ) : (
          <AbsensiContent
            selectedDate={selectedDate}
            kelasList={kelasList}
            siswaPerKelas={siswaPerKelas}
            totalSiswa={totalSiswa}
            hariLiburList={hariLiburList}
          />
        )}

        {exportOpen && (
          <ExportModal
            kelasList={kelasList}
            siswaPerKelas={siswaPerKelas}
            onClose={() => setExportOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
