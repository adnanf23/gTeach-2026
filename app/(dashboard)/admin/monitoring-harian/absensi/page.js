"use client";

import { db } from "@/lib/db";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { getCurrentUser } from "@/lib/pocketbase";

// ------------------------------------------------------------------
// Helper tanggal & sistem absensi (hari libur, weekend, hari efektif)
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
// Status config — aksen biru, alpha tetap merah (warning)
// ------------------------------------------------------------------
const STATUS_CONFIG = {
  hadir: {
    label: "Hadir",
    hex: "#1d4ed8",
    dot: "bg-blue-700",
    text: "text-blue-800",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  sakit: {
    label: "Sakit",
    hex: "#60a5fa",
    dot: "bg-blue-400",
    text: "text-blue-700",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  izin: {
    label: "Izin",
    hex: "#93c5fd",
    dot: "bg-blue-300",
    text: "text-blue-600",
    bg: "bg-blue-50",
    ring: "ring-blue-100",
  },
  alpha: {
    label: "Alpha",
    hex: "#f43f5e",
    dot: "bg-rose-500",
    text: "text-rose-700",
    bg: "bg-rose-50",
    ring: "ring-rose-200",
  },
};
const STATUS_ORDER = ["hadir", "sakit", "izin", "alpha"];
const BELUM_CONFIG = {
  label: "Belum tercatat",
  hex: "#e5e7eb",
  dot: "bg-gray-200",
  text: "text-gray-500",
  bg: "bg-gray-50",
  ring: "ring-gray-200",
};

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
// Export helper (xlsx-js-style)
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

  const records = await db.getFullList("absensi", {
    filter,
    fields: "id,kelas_id,siswa_id,status",
    requestKey: null,
  });

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

  const GREEN = "FFD9EAD3";
  const YELLOW = "FFFFFF00";
  const CYAN = "FF7FFFD4";

  const sTitle = {
    font: { ...EXPORT_FONT, bold: true, sz: 15, color: { rgb: "1E3A8A" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const sMeta = {
    font: { ...EXPORT_FONT, italic: true, sz: 10, color: { rgb: "6B7280" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const sHead = {
    font: { ...EXPORT_FONT, bold: true, sz: 11, color: { rgb: "000000" } },
    fill: { fgColor: { rgb: "FFF2CC" } },
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
    fill: { fgColor: { rgb: GREEN } },
    font: { ...EXPORT_FONT, bold: true, sz: 11 },
  };
  const sSakit = {
    ...sCellC,
    fill: { fgColor: { rgb: YELLOW } },
  };
  const sIzin = {
    ...sCellC,
    fill: { fgColor: { rgb: CYAN } },
  };
  const sYellow = {
    ...sCellC,
    fill: { fgColor: { rgb: YELLOW } },
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
        if (C === 11) ws[addr].s = sYellow;
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
  left: "M15 19l-7-7 7-7",
  right: "M9 5l7 7-7 7",
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
      className={`shrink-0 ${className}`}
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

const TONES = {
  indigo: {
    soft: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
    dot: "bg-blue-600",
    bar: "bg-blue-600",
    border: "border-blue-200",
  },
  emerald: {
    soft: "bg-blue-50",
    text: "text-blue-600",
    ring: "ring-blue-200",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
    border: "border-blue-200",
  },
  rose: {
    soft: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
    border: "border-rose-200",
  },
  amber: {
    soft: "bg-blue-50",
    text: "text-blue-600",
    ring: "ring-blue-200",
    dot: "bg-blue-400",
    bar: "bg-blue-400",
    border: "border-blue-200",
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
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

// Angka naik halus
function useCountUp(target, duration = 600) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (typeof target !== "number") return;
    const from = fromRef.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = from + (target - from) * eased;
      setVal(cur);
      fromRef.current = cur;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return typeof target === "number" ? Math.round(val) : target;
}

function AnimatedNumber({ value }) {
  const v = useCountUp(value);
  return <>{v}</>;
}

// ------------------------------------------------------------------
// Donut chart (SVG) — ukuran fluid: mengecil otomatis di layar sempit
// ------------------------------------------------------------------
function DonutChart({
  segments,
  size = 200,
  thickness = 24,
  activeKey = null,
  onHover,
  onSelect,
  children,
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = segments.reduce((s, x) => s + x.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const grow = onSelect ? 6 : 0;
  const r = (size - thickness - grow - 2) / 2;
  const c = size / 2;
  const C = 2 * Math.PI * r;
  const gap = visible.length > 1 ? Math.min(3, C * 0.012) : 0;
  let acc = 0;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1" }}
    >
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
      >
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="#f3f4f6"
          strokeWidth={thickness}
        />
        <g transform={`rotate(-90 ${c} ${c})`}>
          {total > 0 &&
            visible.map((s) => {
              const len = (s.value / total) * C;
              const dash = mounted ? Math.max(len - gap, 0.001) : 0;
              const offset = -acc;
              acc += len;
              const isActive = activeKey === s.key;
              const dim = activeKey && !isActive;
              return (
                <circle
                  key={s.key}
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={isActive ? thickness + grow : thickness}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={offset}
                  opacity={dim ? 0.3 : 1}
                  style={{
                    transition:
                      "stroke-dasharray .9s cubic-bezier(.22,1,.36,1), stroke-width .2s ease, opacity .2s ease",
                    cursor: onSelect ? "pointer" : "default",
                  }}
                  onMouseEnter={() => onHover?.(s.key)}
                  onMouseLeave={() => onHover?.(null)}
                  onClick={() => onSelect?.(s.key)}
                />
              );
            })}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Hero header — 3 baris: judul+user · kontrol tanggal · progress
// ------------------------------------------------------------------
function HeroHeader({
  selectedDate,
  setSelectedDate,
  user,
  canExport,
  onExport,
  onRefresh,
  persenLengkap,
  lengkapText,
  isWorkday,
  loading,
}) {
  const shift = (n) => {
    const d = parseISODate(selectedDate);
    d.setDate(d.getDate() + n);
    setSelectedDate(toISODate(d));
  };
  const isToday = selectedDate === todayStr();

  const ctrl =
    "flex h-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 active:scale-95";

  return (
    <header className="mb-6 overflow-hidden rounded-3xl bg-blue-700 p-5 text-white sm:mb-8 sm:p-7">
      {/* Baris 1: judul + user */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/60">Monitoring</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Absensi Siswa
          </h1>
          <p className="mt-1.5 text-sm leading-snug text-white/70">
            {formatTanggalID(selectedDate)}
          </p>
        </div>
        <div className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white/15 p-1 sm:pr-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-semibold text-blue-700">
            {initials(user?.nama_lengkap || "G")}
          </div>
          <span className="hidden max-w-[140px] truncate text-xs font-medium sm:inline">
            {user?.nama_lengkap || "Guru"}
          </span>
        </div>
      </div>

      {/* Baris 2: kontrol */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shift(-1)}
            title="Hari sebelumnya"
            className={`${ctrl} w-10`}
          >
            <Icon name="left" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-xl bg-white/15 px-3 text-sm text-white outline-none transition [color-scheme:dark] hover:bg-white/25 focus:ring-2 focus:ring-white/50 sm:flex-none"
          />
          <button
            onClick={() => shift(1)}
            title="Hari berikutnya"
            className={`${ctrl} w-10`}
          >
            <Icon name="right" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDate(todayStr())}
            disabled={isToday}
            className={`${ctrl} flex-1 px-4 text-sm font-medium disabled:opacity-40 sm:flex-none`}
          >
            Hari ini
          </button>
          <button
            onClick={onRefresh}
            title="Segarkan"
            className={`${ctrl} w-10`}
          >
            <Icon name="refresh" />
          </button>
          {canExport && (
            <button
              onClick={onExport}
              className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-blue-700 transition hover:bg-blue-50 active:scale-95"
            >
              <Icon name="download" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Baris 3: progress */}
      <div className="mt-6">
        <div className="mb-2 flex items-end justify-between gap-3 text-sm">
          <span className="text-white/70">
            {isWorkday ? "Kelengkapan input absensi" : "Bukan hari kerja"}
          </span>
          <span className="whitespace-nowrap font-semibold">
            {loading ? "…" : isWorkday ? lengkapText : "—"}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all duration-700"
            style={{ width: `${isWorkday ? persenLengkap : 0}%` }}
          />
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
        <p className={`text-sm font-semibold leading-snug ${t.text}`}>{title}</p>
        {children && (
          <div className={`mt-2 break-words text-xs leading-relaxed ${t.text}`}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

// Chip daftar kelas: scroll horizontal di mobile, wrap di sm+
function KelasChips({ kelasArr, onPick, onMore, max = 20 }) {
  return (
    <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1 [contain:inline-size] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {kelasArr.slice(0, max).map((k) => (
          <button
            key={k.id}
            onClick={() => onPick(k.id)}
            className="whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-rose-200 transition hover:bg-rose-100 active:scale-95"
          >
            {k.nama_kelas}
          </button>
        ))}
        {kelasArr.length > max && (
          <button
            onClick={onMore}
            className="whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-medium underline ring-1 ring-rose-200 transition hover:bg-rose-100 active:scale-95"
          >
            +{kelasArr.length - max} kelas lain
          </button>
        )}
      </div>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "slate",
  progress,
  onClick,
  suffix = "",
}) {
  const t = TONES[tone];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`${CARD} min-w-0 p-4 text-left sm:p-5 ${
        onClick
          ? "transition hover:-translate-y-0.5 hover:ring-blue-600/40 hover:shadow-md active:translate-y-0"
          : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium text-slate-500">
          {label}
        </p>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${t.soft} ${t.text}`}
        >
          <Icon name={icon} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
        {typeof value === "number" && suffix}
      </p>
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${t.bar} transition-all duration-700`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
      {sub && (
        <p className="mt-2 text-xs leading-snug text-slate-400">{sub}</p>
      )}
    </Tag>
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
    <section className={`${CARD} min-w-0 p-5 sm:p-6`}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} />
          <h3 className="truncate text-sm font-semibold text-slate-800">
            {title}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${t.soft} ${t.text}`}
          >
            {kelasArr.length}
          </span>
        </div>
        <button
          onClick={onLihatSemua}
          className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
        >
          Lihat semua
        </button>
      </header>

      {kelasArr.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {kelasArr.slice(0, 4).map((k) => (
            <li key={k.id}>
              <button
                onClick={() => onLihatDetail(k.id)}
                className="group flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${t.soft} ${t.text}`}
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
                <Icon
                  name="right"
                  className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600"
                />
              </button>
            </li>
          ))}
          {kelasArr.length > 4 && (
            <li className="pt-3 text-center">
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

function RankingCard({ data, avg, onPick, loading }) {
  const [tab, setTab] = useState("terbaik");
  const [showAll, setShowAll] = useState(false);

  const sorted = tab === "terbaik" ? data : [...data].reverse();
  const rows = showAll ? sorted : sorted.slice(0, 5);
  const barClass = tab === "terbaik" ? "bg-blue-600" : "bg-rose-500";
  const textClass = tab === "terbaik" ? "text-blue-700" : "text-rose-700";

  return (
    <section className={`${CARD} p-5 sm:p-6`}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Ranking Kehadiran
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            30 hari terakhir · rata-rata {avg.toFixed(1)}%
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto">
          {[
            ["terbaik", "Terbaik"],
            ["terendah", "Terendah"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-lg px-4 py-1.5 text-xs font-medium transition sm:flex-none ${
                tab === k
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Belum ada data.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(({ kelas, rate, display }, i) => (
            <li key={kelas.id}>
              <button
                onClick={() => onPick(kelas.id)}
                className="group w-full rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50"
              >
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-2.5 font-medium text-slate-700">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                        i < 3
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="truncate">{kelas.nama_kelas}</span>
                  </span>
                  <span className={`shrink-0 font-semibold ${textClass}`}>
                    {display ?? `${rate.toFixed(1)}%`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${barClass} transition-all duration-700`}
                    style={{ width: `${Math.min(100, rate)}%` }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sorted.length > 5 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 w-full rounded-xl py-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-blue-600"
        >
          {showAll
            ? "Tampilkan 5 teratas"
            : `Tampilkan semua (${sorted.length})`}
        </button>
      )}
    </section>
  );
}

// Modal: bottom-sheet di mobile, dialog di sm+
function Modal({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200 sm:rounded-3xl sm:p-6">
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
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">
              Export Absensi
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Rekap kehadiran siswa per kelas dalam rentang tanggal tertentu.
            </p>
          </div>
          <button
            onClick={() => !exporting && onClose()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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

        <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 px-3.5 py-3 text-xs leading-relaxed text-blue-800">
          <Icon name="info" className="mt-0.5 h-4 w-4" />
          <p>
            File diunduh sebagai <b>.xlsx</b> dengan header dan formatting
            sesuai template.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
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
// Donut: ringkasan status siswa
// ------------------------------------------------------------------
function StatusDonutCard({
  totals,
  belum,
  totalSiswa,
  isWorkday,
  isWeekend,
  loading,
  activeStatus,
  onSelect,
}) {
  const [hover, setHover] = useState(null);

  const segments = [
    ...STATUS_ORDER.map((k) => ({
      key: k,
      label: STATUS_CONFIG[k].label,
      value: totals[k],
      color: STATUS_CONFIG[k].hex,
    })),
    {
      key: "belum",
      label: BELUM_CONFIG.label,
      value: belum,
      color: BELUM_CONFIG.hex,
    },
  ];

  const tercatat = STATUS_ORDER.reduce((s, k) => s + totals[k], 0);
  const focusKey = hover || activeStatus;
  const focus = segments.find((s) => s.key === focusKey);
  const totalAll = segments.reduce((s, x) => s + x.value, 0);
  const pct = (v) => (totalAll ? Math.round((v / totalAll) * 100) : 0);

  const centerBig = !isWorkday
    ? "Libur"
    : loading
      ? "…"
      : focus
        ? `${pct(focus.value)}%`
        : `${pct(totals.hadir)}%`;
  const centerSmall = !isWorkday
    ? isWeekend
      ? "Akhir pekan"
      : "Hari libur"
    : focus
      ? `${focus.label} · ${focus.value}`
      : "Hadir";

  return (
    <section className={`${CARD} min-w-0 p-5 sm:p-6 lg:col-span-2`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">
            Kehadiran Siswa
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            Ketuk donut atau legenda untuk memfilter daftar siswa.
          </p>
        </div>
        {activeStatus && (
          <button
            onClick={() => onSelect(null)}
            className="flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-700"
          >
            Reset filter
            <Icon name="x" className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <div className={loading ? "animate-pulse" : ""}>
          <DonutChart
            segments={isWorkday && !loading ? segments : []}
            size={200}
            thickness={26}
            activeKey={focusKey}
            onHover={setHover}
            onSelect={
              isWorkday
                ? (k) => onSelect(activeStatus === k ? null : k)
                : undefined
            }
          >
            <div className="px-6">
              <p className="text-3xl font-semibold tracking-tight text-slate-900">
                {centerBig}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">
                {centerSmall}
              </p>
            </div>
          </DonutChart>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-1.5">
          {segments.map((s) => {
            const active = activeStatus === s.key;
            return (
              <li key={s.key}>
                <button
                  disabled={!isWorkday}
                  onClick={() => onSelect(active ? null : s.key)}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition disabled:opacity-50 ${
                    active
                      ? "bg-blue-600 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ background: s.color }}
                    />
                    <span className="truncate">{s.label}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="font-semibold tabular-nums">
                      {isWorkday ? s.value : 0}
                    </span>
                    <span
                      className={`w-10 text-right text-xs tabular-nums ${
                        active ? "text-white/60" : "text-slate-400"
                      }`}
                    >
                      {isWorkday ? `${pct(s.value)}%` : "—"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="px-3 pt-2 text-xs leading-relaxed text-slate-400">
            {isWorkday
              ? `${tercatat} dari ${totalSiswa} siswa sudah tercatat`
              : "Tidak ada absensi pada hari ini."}
          </li>
        </ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Donut: kelengkapan input per kelas
// ------------------------------------------------------------------
function KelengkapanDonutCard({
  sudah,
  belum,
  isWorkday,
  loading,
  activeFilter,
  onSelect,
}) {
  const [hover, setHover] = useState(null);
  const total = sudah + belum;
  const segments = [
    { key: "sudah", label: "Lengkap", value: sudah, color: "#1d4ed8" },
    { key: "belum", label: "Belum lengkap", value: belum, color: "#f43f5e" },
  ];
  const focusKey = hover || (activeFilter !== "semua" ? activeFilter : null);
  const pct = total ? Math.round((sudah / total) * 100) : 0;

  return (
    <section className={`${CARD} flex min-w-0 flex-col p-5 sm:p-6`}>
      <h3 className="text-sm font-semibold text-slate-800">
        Kelengkapan Input
      </h3>
      <p className="mb-5 mt-0.5 text-xs text-slate-400">
        Jumlah kelas hari ini
      </p>

      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div className={loading ? "animate-pulse" : ""}>
          <DonutChart
            segments={isWorkday && !loading ? segments : []}
            size={160}
            thickness={20}
            activeKey={focusKey}
            onHover={setHover}
            onSelect={
              isWorkday
                ? (k) => onSelect(activeFilter === k ? "semua" : k)
                : undefined
            }
          >
            <div>
              <p className="text-2xl font-semibold text-slate-900">
                {!isWorkday ? "—" : loading ? "…" : `${pct}%`}
              </p>
              <p className="text-[11px] text-slate-500">lengkap</p>
            </div>
          </DonutChart>
        </div>

        <div className="grid w-full grid-cols-2 gap-2.5">
          {segments.map((s) => (
            <button
              key={s.key}
              disabled={!isWorkday}
              onClick={() => onSelect(activeFilter === s.key ? "semua" : s.key)}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              className={`min-w-0 rounded-xl px-3 py-2.5 text-left transition disabled:opacity-50 ${
                activeFilter === s.key
                  ? "bg-blue-600 text-white"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="mt-1 block truncate text-lg font-semibold tabular-nums">
                {isWorkday ? s.value : 0}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
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
  siswaStatus,
  setSiswaStatus,
  siswaStatusCounts,
  onExpandAll,
  onCollapseAll,
  disabledStatus,
}) {
  const segments = [
    { key: "semua", label: "Semua", short: "Semua" },
    { key: "sudah", label: "Lengkap", short: "Lengkap" },
    { key: "belum", label: "Belum lengkap", short: "Belum" },
  ];
  const chips = [
    { key: "semua", label: "Semua status" },
    ...STATUS_ORDER.map((k) => ({ key: k, label: STATUS_CONFIG[k].label })),
    { key: "belum", label: "Belum tercatat" },
  ];

  return (
    <div className={`${CARD} space-y-4 p-4 sm:p-5`}>
      {/* Judul + pencarian + kelas */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <h2 className="text-base font-semibold text-slate-900 lg:mr-auto">
          {title}
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex">
          <div className="relative lg:w-72">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon name="search" />
            </span>
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
            {searchValue && (
              <button
                onClick={() => setSearchValue("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <select
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 lg:w-48"
          >
            <option value="semua">Semua kelas</option>
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama_kelas}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Segmented: kelengkapan */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {segments.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilterStatus(s.key)}
            className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-xs font-medium transition sm:px-3 ${
              filterStatus === s.key
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span className="hidden sm:inline">{s.label}</span>
            <span className="sm:hidden">{s.short}</span>{" "}
            <span
              className={
                filterStatus === s.key ? "text-white/60" : "text-slate-400"
              }
            >
              ({statusCounts[s.key]})
            </span>
          </button>
        ))}
      </div>

      {/* Chip status siswa: scroll horizontal di mobile */}
      <div className="-mx-4 max-w-full overflow-x-auto px-4 pb-1 [contain:inline-size] [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {chips.map((c) => {
            const active = siswaStatus === c.key;
            return (
              <button
                key={c.key}
                disabled={disabledStatus}
                onClick={() => setSiswaStatus(c.key)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 transition disabled:opacity-40 ${
                  active
                    ? "bg-blue-600 text-white ring-blue-600"
                    : "bg-white text-slate-600 ring-slate-200 hover:ring-blue-600/40"
                }`}
              >
                {c.label}
                {c.key !== "semua" && (
                  <span
                    className={`ml-1.5 ${active ? "text-white/60" : "text-slate-400"}`}
                  >
                    {siswaStatusCounts[c.key] ?? 0}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Buka / tutup semua */}
      <div className="flex justify-end gap-1 border-t border-slate-100 pt-3">
        <button
          onClick={onExpandAll}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-blue-600"
        >
          Buka semua
        </button>
        <button
          onClick={onCollapseAll}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-blue-600"
        >
          Tutup semua
        </button>
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
  onSummary,
}) {
  const [absensiRange, setAbsensiRange] = useState([]);
  const [absensiTanggal, setAbsensiTanggal] = useState([]);
  const [loadingRange, setLoadingRange] = useState(true);
  const [loadingTanggal, setLoadingTanggal] = useState(false);
  const [initialReady, setInitialReady] = useState(false);

  const [expandedKelas, setExpandedKelas] = useState(() => new Set());
  const [filterKelas, setFilterKelas] = useState("semua");
  const [filterStatus, setFilterStatus] = useState("semua");
  const [siswaStatus, setSiswaStatus] = useState("semua");
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
      const records = await db.getFullList("absensi", {
        filter: `tanggal >= "${daysAgoStr(30)} 00:00:00" && tanggal <= "${todayStr()} 23:59:59"`,
        sort: "-tanggal",
        fields: "id,kelas_id,siswa_id,status",
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
      const records = await db.getFullList("absensi", {
        filter: `tanggal >= "${dateStr} 00:00:00" && tanggal <= "${dateStr} 23:59:59"`,
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

  useEffect(() => {
    if (initialReady) return;
    if (!loadingRange && !loadingTanggal) {
      setInitialReady(true);
    }
  }, [initialReady, loadingRange, loadingTanggal]);

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

  const avgKehadiran = useMemo(() => {
    if (!statistikKelas.length) return 0;
    return (
      statistikKelas.reduce((s, x) => s + x.rate, 0) / statistikKelas.length
    );
  }, [statistikKelas]);

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

  const statusMapPerKelas = useMemo(() => {
    const out = {};
    for (const a of absensiTanggal) {
      const kid = firstOf(a.kelas_id);
      const sid = firstOf(a.siswa_id);
      if (!kid || !sid) continue;
      if (!out[kid]) out[kid] = new Map();
      out[kid].set(sid, a.status);
    }
    return out;
  }, [absensiTanggal]);

  const totalsHari = useMemo(() => {
    const t = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
    for (const a of absensiTanggal) {
      if (a.status in t) t[a.status] += 1;
    }
    return t;
  }, [absensiTanggal]);

  const tercatatHari = STATUS_ORDER.reduce((s, k) => s + totalsHari[k], 0);
  const belumTercatatHari = Math.max(0, totalSiswa - tercatatHari);

  const siswaStatusCounts = {
    ...totalsHari,
    belum: belumTercatatHari,
  };

  const persenSudah =
    kelasList.length && selectedIsWorkday
      ? Math.round((kelasSudah.length / kelasList.length) * 100)
      : 0;

  useEffect(() => {
    onSummary?.({
      persen: persenSudah,
      text: `${kelasSudah.length} dari ${kelasList.length} kelas`,
      isWorkday: selectedIsWorkday,
      loading: loadingTanggal,
    });
  }, [
    persenSudah,
    kelasSudah.length,
    kelasList.length,
    selectedIsWorkday,
    loadingTanggal,
    onSummary,
  ]);

  const matchSiswaStatus = useCallback(
    (kelasId, siswaId) => {
      if (siswaStatus === "semua") return true;
      const st = statusMapPerKelas[kelasId]?.get(siswaId);
      return siswaStatus === "belum" ? !st : st === siswaStatus;
    },
    [siswaStatus, statusMapPerKelas],
  );

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
    if (siswaStatus !== "semua" && selectedIsWorkday) {
      list = list.filter((k) =>
        (siswaPerKelas.get(k.id) || []).some((s) =>
          matchSiswaStatus(k.id, s.id),
        ),
      );
    }
    return list;
  }, [
    kelasList,
    filterKelas,
    filterStatus,
    searchSiswa,
    siswaPerKelas,
    kelasLengkapIds,
    siswaStatus,
    selectedIsWorkday,
    matchSiswaStatus,
  ]);

  const toggleExpand = (kelasId) => {
    setExpandedKelas((prev) => {
      const next = new Set(prev);
      next.has(kelasId) ? next.delete(kelasId) : next.add(kelasId);
      return next;
    });
  };

  const scrollToList = () =>
    document
      .getElementById("absensi-list-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  const goToDetail = (kelasId, status) => {
    setFilterKelas(kelasId || "semua");
    setFilterStatus(status || "semua");
    setSiswaStatus("semua");
    setSearchSiswa("");
    setExpandedKelas(kelasId ? new Set([kelasId]) : new Set());
    scrollToList();
  };

  const selectSiswaStatus = (key) => {
    const next = key || "semua";
    setSiswaStatus(next);
    if (next !== "semua") {
      setFilterKelas("semua");
      setFilterStatus("semua");
      const ids = kelasList
        .filter((k) =>
          (siswaPerKelas.get(k.id) || []).some((s) => {
            const st = statusMapPerKelas[k.id]?.get(s.id);
            return next === "belum" ? !st : st === next;
          }),
        )
        .map((k) => k.id);
      setExpandedKelas(ids.length <= 5 ? new Set(ids) : new Set());
      scrollToList();
    }
  };

  const statusCounts = {
    semua: kelasList.length,
    sudah: selectedIsWorkday ? kelasSudah.length : 0,
    belum: selectedIsWorkday ? kelasBelum.length : 0,
  };

  if (!initialReady) {
    return <LoadingState label="Memuat data absensi..." />;
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 sm:space-y-8">
      {/* Banner — hanya tampil di hari kerja (hari libur sudah dijelaskan kartu lain) */}
      {selectedIsWorkday && kelasBelum.length > 0 ? (
        <Banner
          tone="rose"
          icon="alert"
          title={`${kelasBelum.length} kelas belum lengkap isi absensi pada ${formatTanggalID(selectedDate)}`}
        >
          <KelasChips
            kelasArr={kelasBelum}
            onPick={(id) => goToDetail(id, null)}
            onMore={() => goToDetail(null, "belum")}
          />
        </Banner>
      ) : selectedIsWorkday && kelasList.length > 0 ? (
        <Banner
          tone="emerald"
          icon="check"
          title="Semua kelas sudah lengkap isi absensi hari ini 🎉"
        />
      ) : null}

      {/* Statistik */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Kelas"
          value={kelasList.length}
          sub={`${totalSiswa} siswa`}
          icon="grid"
          tone="slate"
          onClick={() => goToDetail(null, null)}
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
            onClick={() => goToDetail(null, "sudah")}
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
            onClick={() => goToDetail(null, "belum")}
          />
        )}
        <StatCard
          label="Rata-rata Hadir"
          value={loadingRange ? "…" : Math.round(avgKehadiran)}
          suffix="%"
          sub="30 hari terakhir"
          icon="users"
          tone="emerald"
          progress={avgKehadiran}
        />
      </div>

      {/* Donut charts */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        <StatusDonutCard
          totals={totalsHari}
          belum={belumTercatatHari}
          totalSiswa={totalSiswa}
          isWorkday={selectedIsWorkday}
          isWeekend={selectedIsWeekend}
          loading={loadingTanggal}
          activeStatus={siswaStatus === "semua" ? null : siswaStatus}
          onSelect={selectSiswaStatus}
        />
        <KelengkapanDonutCard
          sudah={kelasSudah.length}
          belum={kelasBelum.length}
          isWorkday={selectedIsWorkday}
          loading={loadingTanggal}
          activeFilter={filterStatus}
          onSelect={(k) => {
            setFilterStatus(k);
            setSiswaStatus("semua");
            if (k !== "semua") scrollToList();
          }}
        />
      </div>

      {/* Status kelas */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
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
          <section className={`${CARD} p-5 sm:p-6 lg:col-span-2`}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">
                {selectedIsWeekend ? "Akhir Pekan" : "Hari Libur"}
              </h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Tanggal <b>{formatTanggalID(selectedDate)}</b> bukan hari kerja
              efektif, jadi tidak ada absensi yang perlu dilengkapi.
            </p>
          </section>
        )}
      </div>

      <RankingCard
        data={statistikKelas}
        avg={avgKehadiran}
        loading={loadingRange}
        onPick={(id) => goToDetail(id, null)}
      />

      {/* Daftar kelas */}
      <div id="absensi-list-section" className="scroll-mt-6 space-y-4">
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
          siswaStatus={siswaStatus}
          setSiswaStatus={selectSiswaStatus}
          siswaStatusCounts={siswaStatusCounts}
          disabledStatus={!selectedIsWorkday}
          onExpandAll={() =>
            setExpandedKelas(new Set(kelasUntukDitampilkan.map((k) => k.id)))
          }
          onCollapseAll={() => setExpandedKelas(new Set())}
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
          <div className="space-y-3">
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
                siswaStatus={siswaStatus}
                query={searchSiswa.trim().toLowerCase()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
  siswaStatus,
  query,
}) {
  const counts = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
  const statusBySiswaId = new Map();
  for (const r of records) {
    const sid = firstOf(r.siswa_id);
    if (r.status in counts) counts[r.status] += 1;
    if (sid) statusBySiswaId.set(sid, r.status);
  }
  const belumTercatat = Math.max(0, siswaKelas.length - records.length);
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

  const miniSegments = [
    ...STATUS_ORDER.map((s) => ({
      key: s,
      value: counts[s],
      color: STATUS_CONFIG[s].hex,
    })),
    { key: "belum", value: belumTercatat, color: BELUM_CONFIG.hex },
  ];

  const kelasCocokQuery =
    !query || kelas.nama_kelas.toLowerCase().includes(query);

  const rows = [...siswaKelas]
    .sort((a, b) => a.nama_siswa.localeCompare(b.nama_siswa))
    .filter((s) => {
      if (!kelasCocokQuery && !s.nama_siswa.toLowerCase().includes(query))
        return false;
      if (siswaStatus === "semua") return true;
      const st = statusBySiswaId.get(s.id);
      return siswaStatus === "belum" ? !st : st === siswaStatus;
    });

  // Grid baris siswa: # | nama(+NIS di mobile) | NIS (sm+) | status
  const ROW_GRID =
    "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[2rem_minmax(0,1fr)_8rem_auto]";

  return (
    <div
      className={`${CARD} overflow-hidden transition hover:shadow-md ${
        expanded ? "ring-blue-600/30" : ""
      }`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50/70 sm:gap-4 sm:px-5"
      >
        <DonutChart
          segments={selectedIsWorkday ? miniSegments : []}
          size={46}
          thickness={6}
        >
          <span className={`text-[11px] font-semibold ${t.text}`}>
            {kelas.nama_kelas?.slice(0, 2).toUpperCase()}
          </span>
        </DonutChart>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
              {kelas.nama_kelas}
            </p>
            <span
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${t.soft} ${t.text} ${t.ring}`}
            >
              {statusLabel}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="h-1.5 w-full max-w-[8rem] flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${t.bar} transition-all duration-500`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="whitespace-nowrap text-xs text-slate-400">
              {records.length}/{siswaKelas.length}
              <span className="hidden sm:inline"> siswa tercatat</span>
            </p>
          </div>
        </div>

        <div className="hidden shrink-0 gap-1.5 lg:flex">
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

        <Icon
          name="chevron"
          className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
          {siswaKelas.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              Belum ada data siswa di kelas ini.
            </p>
          ) : !selectedIsWorkday ? (
            <div className="rounded-xl bg-white px-4 py-5 text-center text-sm text-slate-500 ring-1 ring-slate-200/70">
              Tanggal ini bukan hari kerja efektif. Tidak ada absensi untuk
              dicatat.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Ringkasan status — tampil di mobile (chip header disembunyikan) */}
              <div className="flex flex-wrap gap-1.5 lg:hidden">
                {STATUS_ORDER.map((s) =>
                  counts[s] > 0 ? (
                    <span
                      key={s}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} ${STATUS_CONFIG[s].ring}`}
                    >
                      {STATUS_CONFIG[s].label} {counts[s]}
                    </span>
                  ) : null,
                )}
              </div>

              {belumTercatat > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 ring-1 ring-rose-200">
                  <Icon name="alert" className="h-4 w-4" />
                  {belumTercatat} siswa belum tercatat pada tanggal ini.
                </div>
              )}

              <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200/70">
                <div
                  className={`${ROW_GRID} border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-slate-400`}
                >
                  <span>#</span>
                  <span>Nama siswa</span>
                  <span className="hidden sm:block">NIS</span>
                  <span>Status</span>
                </div>

                {rows.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    Tidak ada siswa yang cocok dengan filter.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rows.map((s, idx) => {
                      const status = statusBySiswaId.get(s.id);
                      const cfg = status ? STATUS_CONFIG[status] : null;
                      return (
                        <li
                          key={s.id}
                          className={`${ROW_GRID} px-4 py-3 transition hover:bg-slate-50`}
                        >
                          <span className="text-xs text-slate-400">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {s.nama_siswa}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-400 sm:hidden">
                              {s.nis || "-"}
                            </p>
                          </div>
                          <span className="hidden truncate text-sm text-slate-500 sm:block">
                            {s.nis || "-"}
                          </span>
                          {cfg ? (
                            <span
                              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}
                              />
                              {cfg.label}
                            </span>
                          ) : (
                            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-400">
                              Belum
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
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
  const [summary, setSummary] = useState({
    persen: 0,
    text: "",
    isWorkday: true,
    loading: true,
  });

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const loadBaseData = useCallback(async () => {
    setLoadingBase(true);
    setErrorBase("");
    try {
      const [kelas, siswa, hariLibur] = await Promise.all([
        db.getFullList("kelas", {
          sort: "tingkat,nama_kelas",
          fields: "id,nama_kelas,tingkat",
          requestKey: null,
        }),
        db.getFullList("siswa", {
          sort: "nama_siswa",
          fields: "id,nis,nama_siswa,jenis_kelamin,kelas_id",
          requestKey: null,
        }),
        db.getFullList("hari_libur", { requestKey: null }).catch(() => []),
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
    <div className="min-h-screen w-full min-w-0 max-w-full overflow-x-hidden text-slate-900">
      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <HeroHeader
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          user={user}
          canExport={!loadingBase && !errorBase}
          onExport={() => setExportOpen(true)}
          onRefresh={loadBaseData}
          persenLengkap={summary.persen}
          lengkapText={summary.text}
          isWorkday={summary.isWorkday}
          loading={loadingBase || summary.loading}
        />

        {errorBase && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {errorBase}
          </div>
        )}

        {loadingBase ? (
          <LoadingState label="Memuat data..." />
        ) : errorBase ? null : (
          <AbsensiContent
            selectedDate={selectedDate}
            kelasList={kelasList}
            siswaPerKelas={siswaPerKelas}
            totalSiswa={totalSiswa}
            hariLiburList={hariLiburList}
            onSummary={setSummary}
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