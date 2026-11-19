"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { pb } from "@/lib/pocketbase";
import {
  getSystemLogCounts,
  getLogCounts,
} from "@/actions/ict-system-logs.action";
import { cacheIncomingLog, seedCache } from "@/lib/system-log-cache";

// =========================================================
// Konstanta
// =========================================================
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const MODES = [
  { value: "week", label: "Mingguan" },
  { value: "month", label: "Bulanan" },
];

const TYPE_META = [
  {
    key: "succes",
    label: "Sukses",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
  },
  {
    key: "warning",
    label: "Peringatan",
    bar: "bg-amber-400",
    dot: "bg-amber-400",
  },
  { key: "info", label: "Info", bar: "bg-sky-400", dot: "bg-sky-400" },
  { key: "error", label: "Error", bar: "bg-rose-500", dot: "bg-rose-500" },
];

// =========================================================
// Helper tanggal & angka
// =========================================================
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function ddmm(d) {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function fmtDate(d) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtTime(d) {
  return d.toLocaleTimeString("id-ID", { hour12: false });
}

function fmt(n) {
  return Number(n || 0).toLocaleString("id-ID");
}

function fmtSigned(n) {
  return `${n > 0 ? "+" : ""}${fmt(n)}`;
}

function delta(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function fmtDelta(pct) {
  if (pct === null || pct === undefined) return "–";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function tone(n) {
  if (n > 0) return "text-emerald-600";
  if (n < 0) return "text-rose-600";
  return "text-slate-400";
}

// =========================================================
// Perbandingan: minggu ini vs minggu kemarin, bulan ini vs bulan kemarin
// =========================================================
function buildComparison(mode, now = new Date()) {
  const today = startOfDay(now);
  const pairs = [];

  if (mode === "week") {
    // Hari yang sudah berjalan pekan ini (Senin s/d hari ini) dibandingkan
    // dengan hari yang sama pada pekan sebelumnya — adil, bukan 4 hari vs 7.
    const dow = today.getDay();
    const mondayOffset = (dow + 6) % 7;
    const thisMonday = addDays(today, -mondayOffset);
    const daysToShow = mondayOffset + 1;

    for (let i = 0; i < daysToShow; i++) {
      const curStart = addDays(thisMonday, i);
      const prevStart = addDays(curStart, -7);
      pairs.push({
        key: `d${i}`,
        label: HARI[curStart.getDay()],
        sub: ddmm(curStart),
        curStart,
        curEnd: addDays(curStart, 1),
        prevStart,
        prevEnd: addDays(prevStart, 1),
      });
    }

    const firstCur = pairs[0].curStart;
    const lastCur = pairs[pairs.length - 1].curStart;
    const firstPrev = pairs[0].prevStart;
    const lastPrev = pairs[pairs.length - 1].prevStart;

    return {
      pairs,
      curLabel: `Minggu ini (${ddmm(firstCur)} – ${ddmm(lastCur)})`,
      prevLabel: `Minggu kemarin (${ddmm(firstPrev)} – ${ddmm(lastPrev)})`,
      curRange: { start: firstCur, end: addDays(lastCur, 1) },
      prevRange: { start: firstPrev, end: addDays(lastPrev, 1) },
    };
  }

  // Bulanan: tanggal 1..N bulan ini vs tanggal 1..N bulan kemarin
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthDays = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
  ).getDate();
  const daysToShow = Math.min(today.getDate(), prevMonthDays);

  for (let i = 0; i < daysToShow; i++) {
    const curStart = addDays(curMonthStart, i);
    const prevStart = addDays(prevMonthStart, i);
    pairs.push({
      key: `d${i}`,
      label: String(i + 1),
      sub: "",
      curStart,
      curEnd: addDays(curStart, 1),
      prevStart,
      prevEnd: addDays(prevStart, 1),
    });
  }

  return {
    pairs,
    curLabel: `${BULAN[curMonthStart.getMonth()]} ${curMonthStart.getFullYear()}`,
    prevLabel: `${BULAN[prevMonthStart.getMonth()]} ${prevMonthStart.getFullYear()}`,
    curRange: { start: curMonthStart, end: addDays(today, 1) },
    prevRange: {
      start: prevMonthStart,
      end: addDays(prevMonthStart, daysToShow),
    },
  };
}

// =========================================================
// Ikon
// =========================================================
const ICON_PATHS = {
  refresh: (
    <>
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  printer: (
    <>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </>
  ),
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
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// =========================================================
// Komponen kecil
// =========================================================
function Segmented({ value, onChange, options, ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg bg-slate-100 p-0.5"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Realtime
    </span>
  );
}

function DeltaBadge({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-slate-400">–</span>;
  }
  const cls =
    value > 0
      ? "bg-emerald-50 text-emerald-700"
      : value < 0
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-500";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}
    >
      {fmtDelta(value)}
    </span>
  );
}

function Kpi({ label, value, caption, deltaValue, loading, strong = false }) {
  return (
    <div className="kpi-cell bg-white p-4">
      <p className="truncate text-xs text-slate-500">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p
          className={`text-2xl font-semibold tabular-nums tracking-tight ${
            strong ? "text-slate-900" : "text-slate-700"
          }`}
        >
          {loading ? "–" : fmt(value)}
        </p>
        {deltaValue !== undefined && !loading && (
          <DeltaBadge value={deltaValue} />
        )}
      </div>
      <p className="mt-1 truncate text-[11px] text-slate-400">{caption}</p>
    </div>
  );
}

function Card({ title, subtitle, aside, children, className = "" }) {
  return (
    <section
      className={`sheet-card rounded-2xl border border-slate-200 bg-white ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

// =========================================================
// Chart perbandingan berdampingan
// =========================================================
function ComparisonChart({ pairs, curCounts, prevCounts, loading }) {
  const max = Math.max(
    0,
    ...pairs.map((p) =>
      Math.max(curCounts[p.key] || 0, prevCounts[p.key] || 0),
    ),
  );
  const maxScale = Math.max(4, Math.ceil(max / 4) * 4);
  const dense = pairs.length > 12;
  const minWidth = pairs.length > 20 ? 24 : 44;

  return (
    <div className="flex gap-2">
      <div className="chart-area relative h-44 w-7 flex-shrink-0 text-right text-[10px] tabular-nums text-slate-400 sm:h-56">
        <span className="absolute right-0 top-0 -translate-y-1/2">
          {maxScale}
        </span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2">
          {maxScale / 2}
        </span>
        <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
      </div>

      <div className="no-scrollbar scroll-area min-w-0 flex-1 overflow-x-auto pb-1">
        <div
          className="chart-inner"
          style={{ minWidth: `${pairs.length * minWidth}px` }}
        >
          <div className="chart-area relative h-44 sm:h-56">
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              <div className="h-px bg-slate-100" />
              <div className="h-px bg-slate-100" />
              <div className="h-px bg-slate-200" />
            </div>

            <div className="absolute inset-0 flex items-end gap-1">
              {pairs.map((p) => {
                const c = curCounts[p.key] || 0;
                const pr = prevCounts[p.key] || 0;
                return (
                  <div
                    key={p.key}
                    className="flex h-full flex-1 items-end justify-center gap-[2px]"
                    title={`${p.label} ${p.sub}: periode ini ${fmt(c)} · sebelumnya ${fmt(pr)}`}
                  >
                    <div
                      className="w-1/2 max-w-[14px] rounded-t bg-slate-900 transition-[height] duration-300 hover:opacity-80"
                      style={{
                        height: `${c > 0 ? Math.max((c / maxScale) * 100, 2) : 0}%`,
                      }}
                    />
                    <div
                      className="w-1/2 max-w-[14px] rounded-t bg-slate-300 transition-[height] duration-300 hover:opacity-80"
                      style={{
                        height: `${pr > 0 ? Math.max((pr / maxScale) * 100, 2) : 0}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex gap-1">
            {pairs.map((p, i) => (
              <div key={p.key} className="flex-1 text-center leading-tight">
                <p className="text-[10px] font-medium text-slate-500">
                  {dense && i % 2 === 1 ? "" : p.label}
                </p>
                {p.sub && <p className="text-[9px] text-slate-400">{p.sub}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!loading && max === 0 && (
        <p className="sr-only">Belum ada log pada periode ini.</p>
      )}
    </div>
  );
}

// =========================================================
// PAGE
// =========================================================
export default function LogStatistikPage() {
  const [mode, setMode] = useState("week");
  const [report, setReport] = useState(() => buildComparison("week"));
  const [counts, setCounts] = useState({
    cur: {},
    prev: {},
    typesCur: {},
    typesPrev: {},
    totalCur: 0,
    totalPrev: 0,
    totalAll: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);

  const reqId = useRef(0);

  // ── Ambil data perbandingan ──────────────────────────────────────────────
  const fetchData = useCallback(
    async (nextMode, { refreshSummary = true } = {}) => {
      const id = ++reqId.current;
      const built = buildComparison(nextMode);
      setLoading(true);
      setError(null);

      const iso = (d) => d.toISOString();
      const ranges = [
        ...built.pairs.flatMap((p) => [
          { key: `cur:${p.key}`, start: iso(p.curStart), end: iso(p.curEnd) },
          {
            key: `prev:${p.key}`,
            start: iso(p.prevStart),
            end: iso(p.prevEnd),
          },
        ]),
        {
          key: "total:cur",
          start: iso(built.curRange.start),
          end: iso(built.curRange.end),
        },
        {
          key: "total:prev",
          start: iso(built.prevRange.start),
          end: iso(built.prevRange.end),
        },
        ...TYPE_META.flatMap((t) => [
          {
            key: `typecur:${t.key}`,
            start: iso(built.curRange.start),
            end: iso(built.curRange.end),
            type: t.key,
          },
          {
            key: `typeprev:${t.key}`,
            start: iso(built.prevRange.start),
            end: iso(built.prevRange.end),
            type: t.key,
          },
        ]),
      ];

      try {
        const [countRes, allRes] = await Promise.all([
          getLogCounts(ranges),
          refreshSummary ? getSystemLogCounts() : { totalAll: null },
        ]);

        if (id !== reqId.current) return;
        if (countRes.error) {
          console.error("Gagal mengambil statistik log:", countRes.error);
          setError(countRes.error);
          return;
        }

        const c = countRes.counts;
        const pick = (prefix) =>
          Object.fromEntries(
            Object.entries(c)
              .filter(([k]) => k.startsWith(prefix))
              .map(([k, v]) => [k.slice(prefix.length), v]),
          );

        setReport(built);
        setCounts((prev) => ({
          cur: pick("cur:"),
          prev: pick("prev:"),
          typesCur: pick("typecur:"),
          typesPrev: pick("typeprev:"),
          totalCur: c["total:cur"] || 0,
          totalPrev: c["total:prev"] || 0,
          totalAll:
            allRes && !allRes.error && allRes.totalAll !== null
              ? allRes.totalAll
              : prev.totalAll,
        }));

        // Simpan angka hasil query ke cache supaya log realtime berikutnya
        // hanya menambah di atas nilai ini, tanpa query ulang.
        seedCache({
          totalAll:
            allRes && !allRes.error && allRes.totalAll !== null
              ? allRes.totalAll
              : undefined,
          typeCounts: pick("typecur:"),
        });

        setGeneratedAt(new Date());
      } catch (e) {
        console.error("Gagal mengambil statistik log:", e);
        if (id === reqId.current) setError("Gagal memuat statistik.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchData(mode);
  }, [mode, fetchData]);

  // ── Realtime: tambah hitungan lokal ──────────────────────────────────────
  useEffect(() => {
    if (!pb.authStore.isValid) return;

    const current = buildComparison(mode);

    pb.collection("system_log").subscribe("*", (e) => {
      if (e.action !== "create") return;
      const nowMs = Date.now();

      const curPair = current.pairs.find(
        (p) => nowMs >= p.curStart.getTime() && nowMs < p.curEnd.getTime(),
      );
      const prevPair = current.pairs.find(
        (p) => nowMs >= p.prevStart.getTime() && nowMs < p.prevEnd.getTime(),
      );
      const type = TYPE_META.some((t) => t.key === e.record.type)
        ? e.record.type
        : null;

      // Log yang masuk disimpan ke cache dulu (dedupe by id), baru dipakai
      // untuk menaikkan counter di layar.
      cacheIncomingLog(e.record, { bucketKey: curPair?.key });

      setCounts((p) => {
        // Total seluruh log selalu bertambah, apa pun periodenya.
        const next = { ...p, totalAll: p.totalAll + 1 };
        if (curPair) {
          next.cur = { ...p.cur, [curPair.key]: (p.cur[curPair.key] || 0) + 1 };
          next.totalCur = p.totalCur + 1;
          if (type) {
            next.typesCur = {
              ...p.typesCur,
              [type]: (p.typesCur[type] || 0) + 1,
            };
          }
        }
        if (prevPair) {
          next.prev = {
            ...p.prev,
            [prevPair.key]: (p.prev[prevPair.key] || 0) + 1,
          };
          next.totalPrev = p.totalPrev + 1;
          if (type) {
            next.typesPrev = {
              ...p.typesPrev,
              [type]: (p.typesPrev[type] || 0) + 1,
            };
          }
        }
        return next;
      });
    });

    return () => {
      pb.collection("system_log").unsubscribe("*");
    };
  }, [mode]);

  // ── Turunan ──────────────────────────────────────────────────────────────
  const isWeek = mode === "week";
  const curName = isWeek ? "Minggu ini" : "Bulan ini";
  const prevName = isWeek ? "Minggu kemarin" : "Bulan kemarin";

  const curSeries = useMemo(
    () => report.pairs.map((p) => counts.cur[p.key] || 0),
    [report, counts],
  );
  const prevSeries = useMemo(
    () => report.pairs.map((p) => counts.prev[p.key] || 0),
    [report, counts],
  );

  const curTotal = counts.totalCur;
  const prevTotal = counts.totalPrev;
  const deltaTotal = delta(curTotal, prevTotal);
  const peakCur = Math.max(0, ...curSeries);
  const peakPrev = Math.max(0, ...prevSeries);
  const avgCur = curSeries.length ? curTotal / curSeries.length : 0;
  const avgPrev = prevSeries.length ? prevTotal / prevSeries.length : 0;

  const periodRows = report.pairs.map((p, i) => ({
    ...p,
    cur: curSeries[i],
    prev: prevSeries[i],
    delta: delta(curSeries[i], prevSeries[i]),
  }));

  const typeRows = TYPE_META.map((t) => {
    const cur = counts.typesCur[t.key] || 0;
    const prev = counts.typesPrev[t.key] || 0;
    return { ...t, cur, prev, delta: delta(cur, prev) };
  });

  const busiest = periodRows.reduce(
    (best, r) => (r.cur > best.cur ? r : best),
    { label: "", sub: "", cur: 0 },
  );

  const chartStats = [
    { label: "Tertinggi periode ini", value: fmt(peakCur) },
    { label: "Tertinggi sebelumnya", value: fmt(peakPrev) },
    {
      label: "Hari tersibuk",
      value: busiest.cur > 0 ? `${busiest.label} ${busiest.sub}`.trim() : "–",
    },
    {
      label: "Selisih rata-rata/hari",
      value: `${avgCur >= avgPrev ? "+" : ""}${(avgCur - avgPrev).toFixed(1)}`,
    },
  ];

  const modeLabel = isWeek ? "Mingguan" : "Bulanan";
  const printedAt = new Date();

  return (
    <div className="report-root space-y-4 pb-10 text-slate-900 sm:space-y-5">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .print-only { display: none; }

        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html, body { background: #fff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          .report-root { font-size: 11px; padding-bottom: 0 !important; }
          .report-root > * + * { margin-top: 8px !important; }

          .print-hide { display: none !important; }
          .print-only { display: block !important; }

          /* Kartu lebih padat, tanpa bayangan */
          .sheet-card { box-shadow: none !important; border-radius: 8px !important; }
          .sheet-card > header { padding: 8px 10px 0 !important; }
          .sheet-body { padding: 6px 10px 8px !important; }
          .kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
          .kpi-cell { padding: 8px 10px !important; }
          .kpi-cell p:nth-child(2) { font-size: 16px !important; }

          /* Chart + komposisi bersanding supaya hemat tinggi */
          .print-split {
            display: grid !important;
            grid-template-columns: 1.7fr 1fr !important;
            gap: 8px !important;
            align-items: stretch;
          }
          .chart-area { height: 120px !important; }
          .chart-inner { min-width: 0 !important; }
          .scroll-area { overflow: visible !important; max-height: none !important; }

          /* Tabel boleh pindah halaman, tapi baris tidak terpotong */
          .print-table th, .print-table td {
            padding-top: 2px !important; padding-bottom: 2px !important;
            font-size: 10.5px !important;
          }
          .print-table .col-selisih { display: table-cell !important; }
          .print-table thead { display: table-header-group; }
          .print-table tfoot { display: table-row-group; }
          .print-table tr { break-inside: avoid; page-break-inside: avoid; }

          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            Laporan Statistik Aktivitas Sistem
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {modeLabel} · {report.curLabel} dibanding {report.prevLabel}
          </p>
          <p className="print-only mt-1 text-[10px] text-slate-400">
            Dibuat {fmtDate(printedAt)} {fmtTime(printedAt)} · Sumber koleksi
            system_log · Total seluruh log {fmt(counts.totalAll)} entri
          </p>
        </div>

        <div className="print-hide flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <LiveBadge />
          <button
            type="button"
            onClick={() => fetchData(mode)}
            disabled={loading}
            aria-label="Muat ulang statistik"
            title="Muat ulang"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
          >
            <Icon
              name="refresh"
              className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={loading || !!error}
            className="ml-auto inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:opacity-60 sm:ml-0"
          >
            <Icon name="printer" />
            Export PDF
          </button>
        </div>
      </header>

      {/* ── Pilih periode ── */}
      <div className="print-hide flex flex-wrap items-center justify-between gap-2">
        <Segmented
          ariaLabel="Periode perbandingan"
          value={mode}
          onChange={setMode}
          options={MODES}
        />
        <p className="text-[11px] text-slate-400">
          {generatedAt ? `Diperbarui ${fmtTime(generatedAt)}` : "Memuat data…"}
          <span className="hidden sm:inline">
            {" "}
            · Total seluruh log {fmt(counts.totalAll)} entri
          </span>
        </p>
      </div>

      {error ? (
        <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <Icon name="alert" className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm font-semibold text-slate-800">
            Gagal memuat statistik
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {String(error)}
          </p>
          <button
            type="button"
            onClick={() => fetchData(mode)}
            className="mt-5 inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Icon name="refresh" />
            Coba lagi
          </button>
        </div>
      ) : (
        <>
          {/* ── Ringkasan ── */}
          <section
            aria-label="Ringkasan"
            className="avoid-break grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 lg:grid-cols-4 kpi-grid"
            style={{ breakInside: "avoid" }}
          >
            <Kpi
              strong
              label={report.curLabel}
              value={curTotal}
              caption="Total log periode ini"
              loading={loading}
            />
            <Kpi
              label={report.prevLabel}
              value={prevTotal}
              caption="Total log periode sebelumnya"
              loading={loading}
            />
            <Kpi
              label="Perubahan"
              value={curTotal - prevTotal}
              caption="Dibanding periode sebelumnya"
              deltaValue={deltaTotal}
              loading={loading}
            />
            <Kpi
              label="Rata-rata per hari"
              value={Number(avgCur.toFixed(1))}
              caption={`Sebelumnya ${avgPrev.toFixed(1)} log/hari`}
              deltaValue={delta(avgCur, avgPrev)}
              loading={loading}
            />
          </section>

          {/* ── Chart + komposisi ── */}
          <div className="print-split grid grid-cols-1 gap-4 lg:grid-cols-3 sm:gap-5">
            <Card
              className="avoid-break lg:col-span-2"
              title="Volume log per hari"
              aside={
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-900" />
                    {curName}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
                    {prevName}
                  </span>
                </div>
              }
            >
              <div className="sheet-body px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                <ComparisonChart
                  pairs={report.pairs}
                  curCounts={counts.cur}
                  prevCounts={counts.prev}
                  loading={loading}
                />

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4">
                  {chartStats.map((s) => (
                    <div key={s.label} className="min-w-0">
                      <dt className="truncate text-[11px] text-slate-500">
                        {s.label}
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">
                        {loading ? "–" : s.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>

            <Card
              className="avoid-break"
              title="Komposisi tipe log"
              subtitle={`${curName} vs ${prevName.toLowerCase()}`}
            >
              <div className="sheet-body space-y-4 px-4 pb-4 pt-4 sm:px-5 sm:pb-5 print:space-y-2">
                {typeRows.map((t) => {
                  const base = Math.max(t.cur, t.prev, 1);
                  return (
                    <div key={t.key}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2 font-medium text-slate-700">
                          <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                          {t.label}
                        </span>
                        <span className="flex items-center gap-1.5 tabular-nums text-slate-500">
                          <span className="font-semibold text-slate-800">
                            {fmt(t.cur)}
                          </span>
                          <span className="text-slate-300">/</span>
                          <span>{fmt(t.prev)}</span>
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-[width] duration-300 ${t.bar}`}
                            style={{ width: `${(t.cur / base) * 100}%` }}
                          />
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-slate-300 transition-[width] duration-300"
                            style={{ width: `${(t.prev / base) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                  Batang atas: periode ini · batang bawah: periode sebelumnya.
                </p>
              </div>
            </Card>
          </div>

          {/* ── Tabel rincian ── */}
          <Card
            title={`Rincian per ${isWeek ? "hari" : "tanggal"}`}
            subtitle="Jumlah log pada masing-masing periode"
          >
            <div className="scroll-area mt-3 max-h-[28rem] overflow-auto">
              <table className="print-table w-full border-collapse text-left text-[12.5px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-y border-slate-100 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="px-4 py-2.5 font-medium sm:px-5">
                      {isWeek ? "Hari" : "Tanggal"}
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      {curName}
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      {prevName}
                    </th>
                    <th className="col-selisih hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                      Selisih
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium sm:pr-5">
                      Perubahan
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periodRows.map((r) => (
                    <tr key={r.key} className="tabular-nums hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-700 sm:px-5">
                        {r.label}
                        {r.sub ? (
                          <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                            {r.sub}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                        {fmt(r.cur)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {fmt(r.prev)}
                      </td>
                      <td
                        className={`col-selisih hidden px-3 py-2.5 text-right sm:table-cell ${tone(r.cur - r.prev)}`}
                      >
                        {fmtSigned(r.cur - r.prev)}
                      </td>
                      <td className="px-4 py-2.5 text-right sm:pr-5">
                        <DeltaBadge value={r.delta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0">
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                    <td className="px-4 py-3 sm:px-5">Total</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {fmt(curTotal)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {fmt(prevTotal)}
                    </td>
                    <td className="col-selisih hidden px-3 py-3 text-right tabular-nums sm:table-cell">
                      {fmtSigned(curTotal - prevTotal)}
                    </td>
                    <td className="px-4 py-3 text-right sm:pr-5">
                      <DeltaBadge value={deltaTotal} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* ── Footer laporan (hanya cetak) ── */}
          <p className="print-only text-[10px] text-slate-400">
            Laporan ini dihasilkan otomatis oleh sistem gTeach pada{" "}
            {fmtDate(printedAt)} {fmtTime(printedAt)}.
          </p>
        </>
      )}
    </div>
  );
}
