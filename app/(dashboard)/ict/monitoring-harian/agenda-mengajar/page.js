"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { pb, getCurrentUser } from "@/lib/pocketbase";

// ------------------------------------------------------------------
// Helper tanggal
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

// ------------------------------------------------------------------
// METODE_CONFIG — monokrom abu, variasi kegelapan
// ------------------------------------------------------------------
const METODE_CONFIG = {
  praktikum: {
    label: "Praktikum",
    text: "text-gray-900",
    bg: "bg-gray-100",
    ring: "ring-gray-300",
  },
  diskusi: {
    label: "Diskusi",
    text: "text-gray-800",
    bg: "bg-gray-100",
    ring: "ring-gray-300",
  },
  presentasi: {
    label: "Presentasi",
    text: "text-gray-800",
    bg: "bg-gray-100",
    ring: "ring-gray-200",
  },
  "student centered": {
    label: "Student centered",
    text: "text-gray-700",
    bg: "bg-gray-100",
    ring: "ring-gray-200",
  },
  "teacher centered": {
    label: "Teacher centered",
    text: "text-gray-700",
    bg: "bg-gray-100",
    ring: "ring-gray-200",
  },
  assesmen: {
    label: "Asesmen",
    text: "text-gray-800",
    bg: "bg-gray-100",
    ring: "ring-gray-300",
  },
  refleksi: {
    label: "Refleksi",
    text: "text-gray-700",
    bg: "bg-gray-100",
    ring: "ring-gray-200",
  },
  ceramah: {
    label: "Ceramah",
    text: "text-slate-700",
    bg: "bg-slate-100",
    ring: "ring-slate-200",
  },
};
const JAM_SLOTS = [
  "1 dan 2",
  "2 dan 3",
  "3 dan 4",
  "4 dan 5",
  "5 dan 6",
  "6 dan 7",
  "7 dan 8",
];

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
// Export helper — Excel monokrom abu
// ------------------------------------------------------------------
const EXPORT_FONT = { name: "Calibri" };
const BORDER_THIN = {
  top: { style: "thin", color: { rgb: "BFBFBF" } },
  bottom: { style: "thin", color: { rgb: "BFBFBF" } },
  left: { style: "thin", color: { rgb: "BFBFBF" } },
  right: { style: "thin", color: { rgb: "BFBFBF" } },
};

async function exportAgendaWorkbook({
  kelasList,
  kelasId,
  startDate,
  endDate,
}) {
  const XLSX = await import("xlsx-js-style");

  const isSpecificClass = kelasId !== "semua";
  const kelasFilter = isSpecificClass ? ` && kelas_id = "${kelasId}"` : "";
  const filter = `date >= "${startDate} 00:00:00" && date <= "${endDate} 23:59:59"${kelasFilter}`;

  const records = await pb.collection("agenda_mengajar").getFullList({
    filter,
    expand: "kelas_id,mapel_id",
    sort: "date,jam_mapel",
    requestKey: null,
  });

  const targetKelas = isSpecificClass
    ? kelasList.filter((k) => k.id === kelasId)
    : kelasList;
  const kelasLabel = isSpecificClass
    ? targetKelas[0]?.nama_kelas || "Kelas"
    : "Semua Kelas";

  const allDates = [];
  {
    const c = new Date(`${startDate}T00:00:00`);
    const e = new Date(`${endDate}T00:00:00`);
    while (c <= e) {
      allDates.push(
        `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`,
      );
      c.setDate(c.getDate() + 1);
    }
  }

  const byDate = new Map();
  for (const r of records) {
    const rawDate = r.date || "";
    const d = rawDate.includes(" ")
      ? rawDate.split(" ")[0]
      : rawDate.split("T")[0];
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
  }

  const HEADERS = isSpecificClass
    ? ["Tanggal", "Jam", "Elemen", "Keterangan"]
    : ["Tanggal", "Jam", "Kelas", "Elemen", "Keterangan"];
  const COLS = HEADERS.length;
  const elemenColIdx = isSpecificClass ? 2 : 3;

  const aoa = [
    ["AGENDA MENGAJAR PESERTA DIDIK"],
    [
      `Kelas: ${kelasLabel}    •    Periode: ${formatTanggalID(startDate)}  —  ${formatTanggalID(endDate)}`,
    ],
    [],
    HEADERS,
  ];

  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
  ];

  allDates.forEach((d) => {
    const dayRecords = byDate.get(d) || [];
    const blockStart = aoa.length;

    if (isSpecificClass) {
      const slotMap = new Map();
      for (const r of dayRecords) {
        if (r.jam_mapel) slotMap.set(r.jam_mapel, r);
      }

      JAM_SLOTS.forEach((slot, i) => {
        const e = slotMap.get(slot);
        const tanggalVal = i === 0 ? formatTanggalID(d) : "";
        const mapel = e?.expand?.mapel_id?.nama_mapel || "";

        aoa.push([tanggalVal, slot, "Mapel", mapel]);
        aoa.push(["", "", "Metode", e?.metode || ""]);
        aoa.push(["", "", "Topik", e?.topik || ""]);
        aoa.push(["", "", "Detail", e?.deskripsi || ""]);
      });

      const blockEnd = aoa.length - 1;
      merges.push({ s: { r: blockStart, c: 0 }, e: { r: blockEnd, c: 0 } });
      JAM_SLOTS.forEach((_, i) => {
        const rStart = blockStart + i * 4;
        merges.push({ s: { r: rStart, c: 1 }, e: { r: rStart + 3, c: 1 } });
      });
    } else {
      let isFirstRowOfDate = true;
      let rowCursor = blockStart;

      JAM_SLOTS.forEach((slot) => {
        const entries = dayRecords
          .filter((r) => r.jam_mapel === slot)
          .sort((a, b) =>
            (a.expand?.kelas_id?.nama_kelas || "").localeCompare(
              b.expand?.kelas_id?.nama_kelas || "",
            ),
          );

        const slotStart = rowCursor;

        if (entries.length === 0) {
          aoa.push([
            isFirstRowOfDate ? formatTanggalID(d) : "",
            slot,
            "",
            "Mapel",
            "",
          ]);
          aoa.push(["", "", "", "Metode", ""]);
          aoa.push(["", "", "", "Topik", ""]);
          aoa.push(["", "", "", "Detail", ""]);
          rowCursor += 4;
          isFirstRowOfDate = false;
        } else {
          entries.forEach((e) => {
            const entryStart = rowCursor;
            const kelasNama = e.expand?.kelas_id?.nama_kelas || "";
            const mapel = e.expand?.mapel_id?.nama_mapel || "";

            aoa.push([
              isFirstRowOfDate ? formatTanggalID(d) : "",
              slot,
              kelasNama,
              "Mapel",
              mapel,
            ]);
            aoa.push(["", "", "", "Metode", e.metode || ""]);
            aoa.push(["", "", "", "Topik", e.topik || ""]);
            aoa.push(["", "", "", "Detail", e.deskripsi || ""]);

            merges.push({
              s: { r: entryStart, c: 2 },
              e: { r: entryStart + 3, c: 2 },
            });

            rowCursor += 4;
            isFirstRowOfDate = false;
          });
        }

        merges.push({
          s: { r: slotStart, c: 1 },
          e: { r: rowCursor - 1, c: 1 },
        });
      });

      const blockEnd = aoa.length - 1;
      merges.push({ s: { r: blockStart, c: 0 }, e: { r: blockEnd, c: 0 } });
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!merges"] = merges;
  ws["!cols"] = isSpecificClass
    ? [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 55 }]
    : [{ wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 50 }];
  ws["!rows"] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 6 }, { hpt: 22 }];
  ws["!freeze"] = "A5";

  // Warna monokrom
  const GRAY_DARK = "FFE5E7EB";
  const GRAY_MED = "FFD1D5DB";
  const GRAY_LIGHT = "FFF3F4F6";

  const sTitle = {
    font: { ...EXPORT_FONT, bold: true, sz: 15, color: { rgb: "000000" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const sMeta = {
    font: { ...EXPORT_FONT, italic: true, sz: 10, color: { rgb: "6B7280" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const sHead = {
    font: { ...EXPORT_FONT, bold: true, sz: 11 },
    fill: { fgColor: { rgb: GRAY_DARK } },
    alignment: { horizontal: "center", vertical: "center" },
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
  const sElemenMapel = {
    ...sCell,
    font: { ...EXPORT_FONT, sz: 11, bold: true },
    fill: { fgColor: { rgb: GRAY_DARK } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  const sElemenMetode = {
    ...sCell,
    font: { ...EXPORT_FONT, sz: 11, italic: true, color: { rgb: "374151" } },
    fill: { fgColor: { rgb: GRAY_MED } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  const sElemenTopik = {
    ...sCell,
    font: { ...EXPORT_FONT, sz: 11, italic: true, color: { rgb: "374151" } },
    fill: { fgColor: { rgb: GRAY_LIGHT } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  const sElemenDetail = {
    ...sCell,
    font: { ...EXPORT_FONT, sz: 11, italic: true, color: { rgb: "374151" } },
    alignment: { horizontal: "left", vertical: "center" },
  };

  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };

      if (R === 0) {
        ws[addr].s = sTitle;
      } else if (R === 1) {
        ws[addr].s = sMeta;
      } else if (R === 3) {
        ws[addr].s = sHead;
      } else if (R >= 4) {
        if (C === 0 || C === 1 || (C === 2 && !isSpecificClass)) {
          ws[addr].s = sCellC;
        } else if (C === elemenColIdx) {
          if (ws[addr].v === "Mapel") ws[addr].s = sElemenMapel;
          else if (ws[addr].v === "Metode") ws[addr].s = sElemenMetode;
          else if (ws[addr].v === "Topik") ws[addr].s = sElemenTopik;
          else ws[addr].s = sElemenDetail;
        } else {
          ws[addr].s = sCell;
        }
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "AGENDA");

  const kelasSlug = isSpecificClass
    ? (targetKelas[0]?.nama_kelas || "kelas").replace(/\s+/g, "_")
    : "semua-kelas";
  XLSX.writeFile(wb, `agenda_${kelasSlug}_${startDate}_${endDate}.xlsx`);
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
  clipboard:
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  layers: "M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5M3 16l9 5 9-5",
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

function ChipPanel({ title, count, tone, items, emptyText }) {
  const t = TONES[tone];
  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${t.dot}`} />
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.soft} ${t.text}`}
        >
          {count}
        </span>
      </header>
      {items.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-5 text-center text-sm text-slate-400">
          {emptyText}
        </p>
      ) : (
        <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
          {items.map((item, idx) => (
            <span
              key={idx}
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${t.soft} ${t.text} ${t.ring}`}
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </section>
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
function ExportModal({ kelasList, defaultKelasId = "semua", onClose }) {
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
      await exportAgendaWorkbook({
        kelasList,
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
              Export Agenda Mengajar
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Rekap agenda mengajar (mapel, metode, topik, detail) per kelas.
            </p>
          </div>
          <button
            onClick={() => !exporting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="x" />
          </button>
        </div>

        {/* Warning — tetap merah */}
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
    { key: "sudah", label: "Sudah" },
    { key: "belum", label: "Belum" },
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
// Konten Agenda Mengajar
// ------------------------------------------------------------------
function AgendaContent({
  selectedDate,
  kelasList,
  siswaPerKelas,
  hariLiburList,
}) {
  const [agendaRange, setAgendaRange] = useState([]);
  const [agendaTanggal, setAgendaTanggal] = useState([]);
  const [loadingRange, setLoadingRange] = useState(true);
  const [loadingTanggal, setLoadingTanggal] = useState(false);
  const [plotingGuruList, setPlotingGuruList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [mapelList, setMapelList] = useState([]);

  const [expandedKelas, setExpandedKelas] = useState(() => new Set());
  const [filterKelas, setFilterKelas] = useState("semua");
  const [filterStatus, setFilterStatus] = useState("semua");
  const [searchKelas, setSearchKelas] = useState("");

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

  const loadPlotingGuru = useCallback(async () => {
    try {
      const records = await pb.collection("ploting_guru").getFullList({
        expand: "guru_id,mapel_id,kelas_id",
        requestKey: null,
      });
      setPlotingGuruList(records);

      const [users, mapels] = await Promise.all([
        pb.collection("users").getFullList({
          filter:
            'role ?= "guru mapel" || role ?= "guru walikelas" || role ?= "guru pendamping"',
          requestKey: null,
        }),
        pb.collection("mata_pelajaran").getFullList({
          requestKey: null,
        }),
      ]);
      setUsersList(users);
      setMapelList(mapels);
    } catch (err) {
      console.error("Gagal load ploting_guru:", err);
      setPlotingGuruList([]);
      setUsersList([]);
      setMapelList([]);
    }
  }, []);

  useEffect(() => {
    loadPlotingGuru();
  }, [loadPlotingGuru]);

  const loadRange = useCallback(async () => {
    setLoadingRange(true);
    try {
      const records = await pb.collection("agenda_mengajar").getFullList({
        filter: `date >= "${daysAgoStr(30)} 00:00:00" && date <= "${todayStr()} 23:59:59"`,
        sort: "-date",
        requestKey: null,
      });
      setAgendaRange(records);
    } catch (err) {
      console.error(err);
      setAgendaRange([]);
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
      const records = await pb.collection("agenda_mengajar").getFullList({
        filter: `date >= "${dateStr} 00:00:00" && date <= "${dateStr} 23:59:59"`,
        expand: "kelas_id,mapel_id",
        requestKey: null,
      });
      setAgendaTanggal(records);
    } catch (err) {
      console.error(err);
      setAgendaTanggal([]);
    } finally {
      setLoadingTanggal(false);
    }
  }, []);

  useEffect(() => {
    loadTanggal(selectedDate);
  }, [selectedDate, loadTanggal]);

  const userMap = useMemo(() => {
    const map = new Map();
    for (const u of usersList) map.set(u.id, u);
    return map;
  }, [usersList]);

  const mapelMap = useMemo(() => {
    const map = new Map();
    for (const m of mapelList) map.set(m.id, m);
    return map;
  }, [mapelList]);

  const guruPerMapel = useMemo(() => {
    const map = new Map();
    for (const pg of plotingGuruList) {
      const mapelId = firstOf(pg.mapel_id);
      const guruId = firstOf(pg.guru_id);
      if (mapelId && guruId) {
        const guru = userMap.get(guruId);
        if (guru) {
          if (!map.has(mapelId)) map.set(mapelId, []);
          map.get(mapelId).push(guru.nama_lengkap || "Guru");
        }
      }
    }
    return map;
  }, [plotingGuruList, userMap]);

  const semuaGuru = useMemo(() => {
    const names = new Set();
    for (const pg of plotingGuruList) {
      const guruId = firstOf(pg.guru_id);
      if (guruId) {
        const guru = userMap.get(guruId);
        if (guru) names.add(guru.nama_lengkap || "Guru");
      }
    }
    return Array.from(names);
  }, [plotingGuruList, userMap]);

  const agendaPerKelas = useMemo(() => {
    const map = new Map();
    for (const a of agendaTanggal) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      if (!map.has(kid)) map.set(kid, []);
      map.get(kid).push(a);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          JAM_SLOTS.indexOf(a.jam_mapel) - JAM_SLOTS.indexOf(b.jam_mapel),
      );
    }
    return map;
  }, [agendaTanggal]);

  const guruSudahMengisi = useMemo(() => {
    const names = new Set();
    for (const a of agendaTanggal) {
      const mapelId = firstOf(a.mapel_id);
      if (mapelId && guruPerMapel.has(mapelId)) {
        for (const guru of guruPerMapel.get(mapelId)) names.add(guru);
      }
    }
    return Array.from(names);
  }, [agendaTanggal, guruPerMapel]);

  const guruBelumMengisi = useMemo(() => {
    const sudah = new Set(guruSudahMengisi);
    return semuaGuru.filter((g) => !sudah.has(g));
  }, [semuaGuru, guruSudahMengisi]);

  const kelasSudahIds = useMemo(
    () => new Set(agendaPerKelas.keys()),
    [agendaPerKelas],
  );
  const kelasSudah = useMemo(
    () =>
      selectedIsWorkday ? kelasList.filter((k) => kelasSudahIds.has(k.id)) : [],
    [kelasList, kelasSudahIds, selectedIsWorkday],
  );
  const kelasBelum = useMemo(
    () =>
      selectedIsWorkday
        ? kelasList.filter((k) => !kelasSudahIds.has(k.id))
        : [],
    [kelasList, kelasSudahIds, selectedIsWorkday],
  );

  const mapelSudah = useMemo(() => {
    const names = new Set();
    for (const a of agendaTanggal) {
      const mapelId = firstOf(a.mapel_id);
      if (mapelId) {
        const mapel = mapelMap.get(mapelId);
        if (mapel) names.add(mapel.nama_mapel);
      }
    }
    return Array.from(names);
  }, [agendaTanggal, mapelMap]);

  const mapelBelum = useMemo(() => {
    const semuaMapel = new Set();
    for (const pg of plotingGuruList) {
      const mapelId = firstOf(pg.mapel_id);
      if (mapelId) {
        const mapel = mapelMap.get(mapelId);
        if (mapel) semuaMapel.add(mapel.nama_mapel);
      }
    }
    const sudah = new Set(mapelSudah);
    return Array.from(semuaMapel).filter((m) => !sudah.has(m));
  }, [plotingGuruList, mapelMap, mapelSudah]);

  const rankingAktivitas = useMemo(() => {
    const map = new Map();
    for (const a of agendaRange) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      map.set(kid, (map.get(kid) || 0) + 1);
    }
    const result = [];
    for (const k of kelasList) {
      const count = map.get(k.id) || 0;
      if (count === 0) continue;
      result.push({ kelas: k, count });
    }
    result.sort((a, b) => b.count - a.count);
    const max = result.length ? result[0].count : 1;
    return result.map((r) => ({
      kelas: r.kelas,
      rate: (r.count / max) * 100,
      display: `${r.count}x`,
    }));
  }, [agendaRange, kelasList]);

  const teraktif = rankingAktivitas.slice(0, 5);
  const terpasif = useMemo(() => {
    const map = new Map();
    for (const a of agendaRange) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      map.set(kid, (map.get(kid) || 0) + 1);
    }
    const arr = kelasList.map((k) => ({ kelas: k, count: map.get(k.id) || 0 }));
    arr.sort((a, b) => a.count - b.count);
    const max = Math.max(1, ...arr.map((r) => r.count));
    return arr.slice(0, 5).map((r) => ({
      kelas: r.kelas,
      rate: max ? (r.count / max) * 100 : 0,
      display: `${r.count}x`,
    }));
  }, [agendaRange, kelasList]);

  const totalEntriHariIni = agendaTanggal.length;
  const persenSudah =
    kelasList.length && selectedIsWorkday
      ? Math.round((kelasSudah.length / kelasList.length) * 100)
      : 0;

  const filteredKelas = useMemo(() => {
    let list =
      filterKelas === "semua"
        ? kelasList
        : kelasList.filter((k) => k.id === filterKelas);
    if (filterStatus === "sudah")
      list = list.filter((k) => kelasSudahIds.has(k.id));
    else if (filterStatus === "belum")
      list = list.filter((k) => !kelasSudahIds.has(k.id));
    if (searchKelas.trim()) {
      const q = searchKelas.trim().toLowerCase();
      list = list.filter((k) => {
        if (k.nama_kelas.toLowerCase().includes(q)) return true;
        return (agendaPerKelas.get(k.id) || []).some(
          (a) =>
            a.topik?.toLowerCase().includes(q) ||
            a.expand?.mapel_id?.nama_mapel?.toLowerCase().includes(q),
        );
      });
    }
    return list;
  }, [
    kelasList,
    filterKelas,
    filterStatus,
    searchKelas,
    kelasSudahIds,
    agendaPerKelas,
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
      .getElementById("agenda-list-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const statusCounts = {
    semua: kelasList.length,
    sudah: selectedIsWorkday ? kelasSudah.length : 0,
    belum: selectedIsWorkday ? kelasBelum.length : 0,
  };

  const kelasBelumNama = kelasBelum.map((k) => k.nama_kelas);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Banner status hari — warning pakai rose (merah) */}
      {!selectedIsWorkday ? (
        <Banner
          tone="slate"
          icon="info"
          title={selectedIsWeekend ? "Akhir pekan" : "Hari libur"}
        >
          Tanggal {formatTanggalID(selectedDate)} bukan hari kerja efektif.
          Agenda mengajar tidak dihitung sebagai kewajiban.
        </Banner>
      ) : kelasBelum.length > 0 ? (
        <Banner
          tone="rose"
          icon="alert"
          title={`${kelasBelum.length} kelas belum mengisi agenda pada ${formatTanggalID(selectedDate)}`}
        >
          {kelasBelumNama.slice(0, 20).join(", ")}
          {kelasBelumNama.length > 20 &&
            ` +${kelasBelumNama.length - 20} kelas lain`}
        </Banner>
      ) : kelasList.length > 0 ? (
        <Banner
          tone="emerald"
          icon="check"
          title="Semua kelas sudah mengisi agenda hari ini 🎉"
        />
      ) : null}

      {/* Statistik */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Kelas"
          value={kelasList.length}
          sub={`${kelasList.reduce((s, k) => s + (siswaPerKelas.get(k.id)?.length || 0), 0)} siswa`}
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
            label="Sudah Isi Agenda"
            value={loadingTanggal ? "…" : kelasSudah.length}
            sub={`${persenSudah}% dari seluruh kelas`}
            icon="check"
            tone="indigo"
            progress={persenSudah}
          />
        )}
        {!selectedIsWorkday ? (
          <StatCard
            label="Total Entri"
            value="—"
            sub="Tidak dihitung"
            icon="layers"
            tone="slate"
          />
        ) : (
          <StatCard
            label="Belum Isi Agenda"
            value={loadingTanggal ? "…" : kelasBelum.length}
            sub="perlu ditindaklanjuti"
            icon="alert"
            tone="rose"
          />
        )}
        <StatCard
          label="Entri Hari Ini"
          value={loadingTanggal ? "…" : totalEntriHariIni}
          sub="semua jam pelajaran"
          icon="clipboard"
          tone="emerald"
        />
      </div>

      {/* Guru & mapel — warning (belum) pakai rose */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <ChipPanel
          title="Guru Sudah Mengisi"
          count={guruSudahMengisi.length}
          tone="emerald"
          items={guruSudahMengisi}
          emptyText="Belum ada guru yang mengisi agenda hari ini"
        />
        <ChipPanel
          title="Guru Belum Mengisi"
          count={guruBelumMengisi.length}
          tone="rose"
          items={guruBelumMengisi}
          emptyText="Semua guru sudah mengisi agenda hari ini 🎉"
        />
        <ChipPanel
          title="Mapel Sudah Diisi"
          count={mapelSudah.length}
          tone="indigo"
          items={mapelSudah}
          emptyText="Belum ada mapel yang diisi"
        />
        <ChipPanel
          title="Mapel Belum Diisi"
          count={mapelBelum.length}
          tone="rose"
          items={mapelBelum}
          emptyText="Semua mapel sudah diisi 🎉"
        />
      </div>

      {/* Status kelas */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        {selectedIsWorkday ? (
          <>
            <StatusListCard
              title="Sudah Isi Agenda"
              kelasArr={kelasSudah}
              siswaPerKelas={siswaPerKelas}
              onLihatSemua={() => goToDetail(null, "sudah")}
              onLihatDetail={(id) => goToDetail(id, null)}
              emptyText="Belum ada kelas yang mengisi agenda"
              tone="indigo"
            />
            <StatusListCard
              title="Belum Isi Agenda"
              kelasArr={kelasBelum}
              siswaPerKelas={siswaPerKelas}
              onLihatSemua={() => goToDetail(null, "belum")}
              onLihatDetail={(id) => goToDetail(id, null)}
              emptyText="Semua kelas sudah mengisi agenda"
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
              efektif, jadi tidak dihitung dalam monitoring.
            </p>
          </section>
        )}
      </div>

      {/* Ranking — "terendah" tetap merah */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <RankingCard
          title="Kelas Paling Aktif"
          subtitle="Jumlah entri agenda, 30 hari terakhir"
          data={teraktif}
          tone="emerald"
        />
        <RankingCard
          title="Kelas Paling Jarang Isi"
          subtitle="Jumlah entri agenda, 30 hari terakhir"
          data={terpasif}
          tone="rose"
        />
      </div>

      {/* Daftar kelas */}
      <div id="agenda-list-section" className="scroll-mt-6 space-y-3">
        <Toolbar
          title="Agenda per Kelas"
          searchValue={searchKelas}
          setSearchValue={setSearchKelas}
          searchPlaceholder="Cari kelas / topik / mapel"
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          statusCounts={statusCounts}
          filterKelas={filterKelas}
          setFilterKelas={setFilterKelas}
          kelasList={kelasList}
        />

        {loadingTanggal ? (
          <LoadingState label="Memuat agenda..." />
        ) : filteredKelas.length === 0 ? (
          <div className={`${CARD} p-10 text-center`}>
            <p className="text-sm text-slate-400">
              Tidak ada kelas yang cocok.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredKelas.map((k) => (
              <KelasAgendaCard
                key={k.id}
                kelas={k}
                entries={agendaPerKelas.get(k.id) || []}
                sudahIsi={kelasSudahIds.has(k.id)}
                expanded={expandedKelas.has(k.id)}
                onToggle={() => toggleExpand(k.id)}
                guruPerMapel={guruPerMapel}
                mapelMap={mapelMap}
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

function KelasAgendaCard({
  kelas,
  entries,
  sudahIsi,
  expanded,
  onToggle,
  guruPerMapel,
  mapelMap,
  selectedIsWorkday,
  selectedIsWeekend,
}) {
  const entryBySlot = new Map();
  for (const e of entries) {
    if (e.jam_mapel) entryBySlot.set(e.jam_mapel, e);
  }
  const jumlahTerisi = JAM_SLOTS.filter((slot) => entryBySlot.has(slot)).length;

  const guruKelas = useMemo(() => {
    const names = new Set();
    for (const e of entries) {
      const mapelId = firstOf(e.mapel_id);
      if (mapelId && guruPerMapel.has(mapelId)) {
        for (const guru of guruPerMapel.get(mapelId)) names.add(guru);
      }
    }
    return Array.from(names);
  }, [entries, guruPerMapel]);

  const statusLabel = !selectedIsWorkday
    ? selectedIsWeekend
      ? "Akhir pekan"
      : "Libur"
    : sudahIsi
      ? "Sudah"
      : "Belum";

  // "Belum" pakai rose (warning), "Sudah" pakai indigo (monokrom gray-900)
  const tone = !selectedIsWorkday ? "slate" : sudahIsi ? "indigo" : "rose";
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
            <p className="truncate text-xs text-slate-400">
              {jumlahTerisi}/{JAM_SLOTS.length} jam terisi
              {guruKelas.length > 0 && (
                <span className="text-slate-500">
                  {" "}
                  · {guruKelas.join(", ")}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden gap-1 sm:flex">
            {JAM_SLOTS.map((slot) => (
              <span
                key={slot}
                title={slot}
                className={`h-1.5 w-5 rounded-full ${entryBySlot.has(slot) ? "bg-gray-900" : "bg-slate-200"}`}
              />
            ))}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {JAM_SLOTS.map((slot) => {
              const entry = entryBySlot.get(slot);
              const metode = entry?.metode && METODE_CONFIG[entry.metode];
              return (
                <div
                  key={slot}
                  className={`rounded-xl border p-3.5 ${
                    entry
                      ? "border-slate-200 bg-white"
                      : "border-dashed border-slate-200 bg-transparent"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <Icon name="clock" className="h-3.5 w-3.5" />
                      Jam ke {slot}
                    </span>
                    {metode && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${metode.bg} ${metode.text} ${metode.ring}`}
                      >
                        {metode.label}
                      </span>
                    )}
                  </div>
                  {entry ? (
                    <>
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {entry.expand?.mapel_id?.nama_mapel ||
                          mapelMap.get(firstOf(entry.mapel_id))?.nama_mapel ||
                          "Mapel tidak diketahui"}
                      </p>
                      {entry.topik && (
                        <p className="mt-1 truncate text-xs text-slate-600">
                          <span className="text-slate-400">Topik · </span>
                          {entry.topik}
                        </p>
                      )}
                      {entry.deskripsi && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {entry.deskripsi}
                        </p>
                      )}
                      {entry.siswa_tidak_hadir && (
                        // Warning — tetap merah
                        <p className="mt-2 truncate rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-700 ring-1 ring-rose-200">
                          Tidak hadir: {entry.siswa_tidak_hadir}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Belum diisi</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Halaman utama
// ------------------------------------------------------------------
export default function AgendaMengajarPage() {
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

  return (
    <div className="min-h-screen text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader
          eyebrow="Monitoring"
          title="Agenda Mengajar"
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          user={user}
          canExport={!loadingBase && !errorBase}
          onExport={() => setExportOpen(true)}
          onRefresh={loadBaseData}
        />

        {/* Error base — tetap merah */}
        {errorBase && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {errorBase}
          </div>
        )}

        {loadingBase ? (
          <LoadingState label="Memuat data..." />
        ) : (
          <AgendaContent
            selectedDate={selectedDate}
            kelasList={kelasList}
            siswaPerKelas={siswaPerKelas}
            hariLiburList={hariLiburList}
          />
        )}

        {exportOpen && (
          <ExportModal
            kelasList={kelasList}
            onClose={() => setExportOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
