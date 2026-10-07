"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";
import { createSystemLog } from "@/lib/logger";

// =========================================================
// Konstanta
// =========================================================
const ALLOWED_ROLES = ["admin", "ict"];

const JENIS_KASUS = {
  "pelanggaran ringan": {
    label: "Pelanggaran Ringan",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    bar: "bg-amber-400",
  },
  "pelanggaran berat": {
    label: "Pelanggaran Berat",
    badge: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    bar: "bg-rose-500",
  },
};

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
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

function suratBadgeClass(surat) {
  switch (surat) {
    case "SP 1":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "SP 2":
      return "bg-orange-50 text-orange-700 ring-1 ring-orange-200";
    case "SP 3":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    case "Surat Home Visit":
      return "bg-rose-100 text-rose-800 ring-1 ring-rose-300";
    case "Surat pengunduran diri":
      return "bg-red-100 text-red-800 ring-1 ring-red-300";
    default:
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  }
}

// =========================================================
// Helper
// =========================================================
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function formatLong(d) {
  if (!d) return "";
  const date = new Date(d);
  return `${HARI[date.getDay()]}, ${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`;
}

function rawDateOnly(v) {
  if (!v) return "";
  const s = String(v);
  return s.includes(" ") ? s.split(" ")[0] : s.split("T")[0];
}

function getKelasBadge(kelas) {
  if (!kelas) return "-";
  const nama = kelas.nama_kelas || "";
  const match = nama.match(/(\d+[A-Za-z]+)$/);
  if (match) return match[1].toUpperCase();
  const tingkat = kelas.tingkat || "";
  const firstChar = nama.replace(/\d+/g, "").trim().charAt(0) || "A";
  return `${tingkat}${firstChar}`;
}

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Ringkasan jumlah per status SIAS & kategori kasus
function summarize(records) {
  const total = records.length;
  const sudah = records.filter((r) => r.sync_sias).length;
  const ringan = records.filter(
    (r) => r.jenis_kasus === "pelanggaran ringan",
  ).length;
  const berat = records.filter(
    (r) => r.jenis_kasus === "pelanggaran berat",
  ).length;
  return { total, sudah, belum: total - sudah, ringan, berat };
}

// Data tren: "weekly" = 7 hari terakhir, "monthly" = semua hari di bulan ini
// Data tren: "weekly" = 7 hari terakhir, "monthly" = bulan ini, "yearly" = 12 bulan tahun terpilih
function buildTrend(records, mode, year) {
  const today = new Date();
  const todayKey = toDateKey(today);
  const buckets = [];

  if (mode === "weekly") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - i,
      );
      buckets.push({
        key: toDateKey(d),
        label: HARI_SHORT[d.getDay()],
        dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
        isToday: toDateKey(d) === todayKey,
      });
    }
  } else if (mode === "monthly") {
    const last = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    ).getDate();
    for (let i = 1; i <= last; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), i);
      buckets.push({
        key: toDateKey(d),
        label: String(d.getDate()),
        dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
        isToday: toDateKey(d) === todayKey,
      });
    }
  } else {
    // yearly — 12 bulan
    const y = year || today.getFullYear();
    for (let m = 0; m < 12; m++) {
      buckets.push({
        key: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: BULAN[m].slice(0, 3),
        dateLabel: BULAN[m],
        isToday: y === today.getFullYear() && m === today.getMonth(),
      });
    }
  }

  const map = {};
  records.forEach((r) => {
    const raw = rawDateOnly(r.date);
    if (!raw) return;
    const [y, m] = raw.split("-");
    const k = mode === "yearly" ? `${y}-${m}` : raw;
    if (!map[k]) map[k] = { ringan: 0, berat: 0 };
    if (r.jenis_kasus === "pelanggaran berat") map[k].berat += 1;
    else if (r.jenis_kasus === "pelanggaran ringan") map[k].ringan += 1;
  });

  return buckets.map((b) => {
    const v = map[b.key] || { ringan: 0, berat: 0 };
    return {
      ...b,
      ringan: v.ringan,
      berat: v.berat,
      total: v.ringan + v.berat,
    };
  });
}

// =========================================================
// Ikon (inline SVG)
// =========================================================
const ICON_PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12 5 5 9-10" />,
  alert: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  swap: (
    <>
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h14" />
      <path d="m17 20 4-4-4-4" />
      <path d="M21 16H7" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  users: (
    <>
      <path d="M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
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
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  const isSuccess = toast.type === "success";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-sm animate-[toast-in_0.25s_ease-out] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl shadow-slate-900/10 motion-reduce:animate-none"
      >
        <span
          className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white ${
            isSuccess ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          <Icon name={isSuccess ? "check" : "alert"} className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {isSuccess ? "Berhasil" : "Terjadi masalah"}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">{toast.text}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Tutup notifikasi"
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}

// Segmented control
function Segmented({ value, onChange, options, ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-shrink-0 rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              active
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {o.label}
            {o.count != null && (
              <span className="text-[10px] tabular-nums text-slate-400">
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Bar proporsi dua segmen
function SplitBar({ a, b, aClass, bClass }) {
  const total = a + b;
  const aPct = total ? (a / total) * 100 : 0;
  const bPct = total ? (b / total) * 100 : 0;
  return (
    <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`${aClass} transition-all`}
        style={{ width: `${aPct}%` }}
      />
      <div
        className={`${bClass} transition-all`}
        style={{ width: `${bPct}%` }}
      />
    </div>
  );
}

function StatPair({ dot, label, value }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}

// Statistik: total, per status SIAS, per kategori kasus
function StatsOverview({ records, loading }) {
  const s = useMemo(() => summarize(records), [records]);
  const sudahPct = s.total ? Math.round((s.sudah / s.total) * 100) : 0;

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {/* Total — gradient hitam */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-5 text-white shadow-sm">
        <div className="pointer-events-none absolute -right-8 -bottom-10 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative">
          <p className="text-xs font-medium text-slate-400">
            Total catatan kasus
          </p>
          <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">
            {s.total}
          </p>
          <p className="mt-3 text-xs text-slate-400">
            <span className="font-semibold text-white">{sudahPct}%</span> sudah
            tersinkron ke SIAS
          </p>
        </div>
      </div>

      {/* Status SIAS */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Status SIAS</p>
        <div className="mt-3 flex gap-4">
          <StatPair dot="bg-emerald-500" label="Sudah sync" value={s.sudah} />
          <StatPair dot="bg-slate-300" label="Belum sync" value={s.belum} />
        </div>
        <SplitBar
          a={s.sudah}
          b={s.belum}
          aClass="bg-emerald-500"
          bClass="bg-slate-300"
        />
      </div>

      {/* Kategori kasus */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Kategori kasus</p>
        <div className="mt-3 flex gap-4">
          <StatPair dot="bg-amber-400" label="Ringan" value={s.ringan} />
          <StatPair dot="bg-rose-500" label="Berat" value={s.berat} />
        </div>
        <SplitBar
          a={s.ringan}
          b={s.berat}
          aClass="bg-amber-400"
          bClass="bg-rose-500"
        />
      </div>
    </div>
  );
}

// Grafik tren
function TrendChart({
  records,
  mode,
  onModeChange,
  year,
  onYearChange,
  loading,
}) {
  const availableYears = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      const raw = rawDateOnly(r.date);
      if (!raw) return;
      const y = Number(raw.split("-")[0]);
      if (y) set.add(y);
    });
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [records]);

  const data = useMemo(
    () => buildTrend(records, mode, year),
    [records, mode, year],
  );

  const totalPeriode = data.reduce((s, d) => s + d.total, 0);
  const ringanPeriode = data.reduce((s, d) => s + d.ringan, 0);
  const beratPeriode = data.reduce((s, d) => s + d.berat, 0);
  const hariAdaKasus = data.filter((d) => d.total > 0).length;

  const maxTotal = Math.max(0, ...data.map((d) => d.total));
  const maxScale = Math.max(4, Math.ceil(maxTotal / 4) * 4);
  const barMinWidth = mode === "monthly" ? 22 : 40;

  const now = new Date();
  const periodeLabel =
    mode === "weekly"
      ? "7 hari terakhir"
      : mode === "monthly"
        ? `${BULAN[now.getMonth()]} ${now.getFullYear()}`
        : `Tahun ${year ?? now.getFullYear()}`;

  const summary = [
    { label: "Total kasus", value: totalPeriode, tone: "text-slate-900" },
    { label: "Ringan", value: ringanPeriode, tone: "text-amber-600" },
    { label: "Berat", value: beratPeriode, tone: "text-rose-600" },
    {
      label: mode === "yearly" ? "Bulan ada kasus" : "Hari ada kasus",
      value: hariAdaKasus,
      tone: "text-slate-900",
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Tren catatan kasus
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">{periodeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
              Ringan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
              Berat
            </span>
          </div>

          {/* Dropdown tahun — hanya tampil di mode Tahunan */}
          {mode === "yearly" && (
            <select
              value={year ?? new Date().getFullYear()}
              onChange={(e) => onYearChange(Number(e.target.value))}
              aria-label="Pilih tahun"
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          <Segmented
            ariaLabel="Periode grafik"
            value={mode}
            onChange={onModeChange}
            options={[
              { value: "weekly", label: "7 Hari" },
              { value: "monthly", label: "Bulan Ini" },
              { value: "yearly", label: "Tahunan" },
            ]}
          />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl bg-slate-50/60 p-3 sm:grid-cols-4">
        {summary.map((item, i) => (
          <div
            key={item.label}
            className={`min-w-0 ${
              i > 0 ? "sm:border-l sm:border-slate-200 sm:pl-3" : ""
            }`}
          >
            <p className="truncate text-[11px] font-medium text-slate-500">
              {item.label}
            </p>
            <p
              className={`mt-0.5 text-xl font-semibold tabular-nums leading-tight ${item.tone}`}
            >
              {loading ? "–" : item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative h-44 w-6 flex-shrink-0 text-right text-[10px] tabular-nums text-slate-400">
          <span className="absolute right-0 top-0 -translate-y-1/2">
            {maxScale}
          </span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">
            {maxScale / 2}
          </span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>

        <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto pb-1">
          <div style={{ minWidth: `${data.length * barMinWidth}px` }}>
            <div className="relative h-44">
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                <div className="h-px bg-slate-100" />
                <div className="h-px bg-slate-100" />
                <div className="h-px bg-slate-200" />
              </div>

              <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
                {data.map((d) => (
                  <div
                    key={d.key}
                    className="flex h-full flex-1 items-end justify-center"
                    title={`${d.dateLabel}: ${d.ringan} ringan, ${d.berat} berat`}
                  >
                    {d.total === 0 ? (
                      <div className="h-0.5 w-full max-w-[22px] rounded bg-slate-100" />
                    ) : (
                      <div
                        className="flex w-full max-w-[22px] flex-col overflow-hidden rounded-t-md transition-all hover:opacity-80"
                        style={{ height: `${(d.total / maxScale) * 100}%` }}
                      >
                        {d.berat > 0 && (
                          <div
                            className="min-h-[3px] bg-rose-500"
                            style={{ flex: `${d.berat} 1 0%` }}
                          />
                        )}
                        {d.ringan > 0 && (
                          <div
                            className="min-h-[3px] bg-amber-400"
                            style={{ flex: `${d.ringan} 1 0%` }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2 flex gap-1 sm:gap-2">
              {data.map((d) => (
                <div key={d.key} className="flex-1 text-center leading-tight">
                  <p
                    className={`text-[10px] ${
                      d.isToday
                        ? "font-bold text-slate-900"
                        : "font-medium text-slate-500"
                    }`}
                  >
                    {d.label}
                  </p>
                  {mode === "weekly" && (
                    <p className="text-[9px] text-slate-300">{d.dateLabel}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!loading && totalPeriode === 0 && (
        <p className="mt-3 text-center text-xs text-slate-400">
          Belum ada catatan kasus pada periode ini.
        </p>
      )}
    </div>
  );
}

// =========================================================
// PAGE
// =========================================================
export default function AdminCatatanKasusPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [kelasList, setKelasList] = useState([]);
  const [siswaCountMap, setSiswaCountMap] = useState({});
  const [allCatatan, setAllCatatan] = useState([]);
  const [loadingKelas, setLoadingKelas] = useState(true);

  const [selectedKelasId, setSelectedKelasId] = useState(null);

  const [search, setSearch] = useState("");
  const [filterTingkat, setFilterTingkat] = useState("");
  const [onlyBelumSync, setOnlyBelumSync] = useState(false);

  const [catatanList, setCatatanList] = useState([]);
  const [siswaList, setSiswaList] = useState([]);
  const [loadingCatatan, setLoadingCatatan] = useState(false);

  const [searchCatatan, setSearchCatatan] = useState("");
  const [filterJenis, setFilterJenis] = useState("semua");
  const [filterSync, setFilterSync] = useState("semua");

  const [trendMode, setTrendMode] = useState("weekly");
  const [togglingId, setTogglingId] = useState(null);

  const [message, setMessage] = useState(null);
  const closeToast = useCallback(() => setMessage(null), []);

  const selectedKelas = useMemo(
    () => kelasList.find((k) => k.id === selectedKelasId) || null,
    [kelasList, selectedKelasId],
  );

  // =========================================================
  // Auth
  // =========================================================
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    const currentUser = getCurrentUser();
    if (!currentUser || !ALLOWED_ROLES.includes(currentUser.role)) {
      setUnauthorized(true);
      setAuthChecked(true);
      setLoadingKelas(false);
      return;
    }
    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // =========================================================
  // Load kelas + count siswa + ringkasan semua catatan kasus
  // =========================================================
  useEffect(() => {
    if (!authChecked || unauthorized || !user) return;
    let cancelled = false;

    async function loadKelas() {
      setLoadingKelas(true);
      try {
        const [kelasData, siswaData, catatanData] = await Promise.all([
          pb.collection("kelas").getFullList({
            sort: "tingkat,nama_kelas",
            requestKey: null,
          }),
          pb.collection("siswa").getFullList({
            fields: "id,kelas_id",
            requestKey: null,
          }),
          pb.collection("catatan_kasus").getFullList({
            fields: "id,kelas_id,jenis_kasus,sync_sias,date",
            requestKey: null,
          }),
        ]);

        const countMap = {};
        siswaData.forEach((s) => {
          const kid = firstOf(s.kelas_id);
          if (kid) countMap[kid] = (countMap[kid] || 0) + 1;
        });

        if (cancelled) return;
        setKelasList(kelasData);
        setSiswaCountMap(countMap);
        setAllCatatan(catatanData);
      } catch (err) {
        console.error("Gagal memuat kelas:", err);
      } finally {
        if (!cancelled) setLoadingKelas(false);
      }
    }

    loadKelas();
    return () => {
      cancelled = true;
    };
  }, [authChecked, unauthorized, user]);

  // =========================================================
  // Load catatan kasus kelas terpilih
  // =========================================================
  const loadCatatan = useCallback(async () => {
    if (!selectedKelasId) return;
    setLoadingCatatan(true);
    try {
      const [catatanRes, siswaRes] = await Promise.all([
        pb.collection("catatan_kasus").getFullList({
          filter: `kelas_id="${selectedKelasId}"`,
          expand: "siswa_id,tahun_ajaran_id",
          sort: "-date",
          requestKey: null,
        }),
        pb.collection("siswa").getFullList({
          filter: `kelas_id="${selectedKelasId}"`,
          sort: "nama_siswa",
          requestKey: null,
        }),
      ]);
      setCatatanList(catatanRes);
      setSiswaList(siswaRes);
    } catch (err) {
      console.error("Gagal memuat catatan kasus:", err);
      setMessage({ type: "error", text: "Gagal memuat catatan kasus." });
    } finally {
      setLoadingCatatan(false);
    }
  }, [selectedKelasId]);

  useEffect(() => {
    if (selectedKelasId) loadCatatan();
    else {
      setCatatanList([]);
      setSiswaList([]);
    }
  }, [selectedKelasId, loadCatatan]);

  // =========================================================
  // Toggle sync_sias
  // =========================================================
  async function handleToggleSync(item) {
    const newValue = !item.sync_sias;
    setTogglingId(item.id);
    try {
      await pb
        .collection("catatan_kasus")
        .update(item.id, { sync_sias: newValue }, { requestKey: null });

      setCatatanList((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, sync_sias: newValue } : c)),
      );
      setAllCatatan((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, sync_sias: newValue } : c)),
      );

      setMessage({
        type: "success",
        text: newValue
          ? "Catatan kasus ditandai sudah sync SIAS."
          : "Catatan kasus ditandai belum sync SIAS.",
      });

      await createSystemLog({
        type: "succes",
        msg: `User '${user.nama_lengkap} (${user.role})' mengubah status sync SIAS catatan kasus menjadi ${newValue ? "sudah" : "belum"}.`,
        endpoint: "/admin/catatan-kasus",
        statusCode: 200,
        payload: { id: item.id, sync_sias: newValue },
      });
    } catch (err) {
      console.error("Gagal update sync_sias:", err);
      setMessage({
        type: "error",
        text: "Gagal mengubah status sync SIAS.",
      });
      await createSystemLog({
        type: "warning",
        msg: `User '${user.nama_lengkap} (${user.role})' gagal mengubah status sync SIAS catatan kasus.`,
        endpoint: "/admin/catatan-kasus",
        statusCode: err.status || 400,
        payload: { id: item.id },
      });
    } finally {
      setTogglingId(null);
    }
  }

  // =========================================================
  // Turunan data
  // =========================================================
  const tingkatOptions = useMemo(() => {
    const set = new Set(kelasList.map((k) => String(k.tingkat || "")));
    return Array.from(set)
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));
  }, [kelasList]);

  const kasusPerKelas = useMemo(() => {
    const map = {};
    allCatatan.forEach((c) => {
      const kid = firstOf(c.kelas_id);
      if (!kid) return;
      if (!map[kid]) map[kid] = { total: 0, belum: 0, berat: 0 };
      map[kid].total += 1;
      if (!c.sync_sias) map[kid].belum += 1;
      if (c.jenis_kasus === "pelanggaran berat") map[kid].berat += 1;
    });
    return map;
  }, [allCatatan]);

  const filteredKelas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kelasList.filter((k) => {
      if (filterTingkat && String(k.tingkat) !== filterTingkat) return false;
      if (q && !(k.nama_kelas || "").toLowerCase().includes(q)) return false;
      if (onlyBelumSync && !(kasusPerKelas[k.id]?.belum > 0)) return false;
      return true;
    });
  }, [kelasList, search, filterTingkat, onlyBelumSync, kasusPerKelas]);

  const filteredCatatan = useMemo(() => {
    const q = searchCatatan.trim().toLowerCase();
    return catatanList.filter((item) => {
      const namaSiswa = item.expand?.siswa_id?.nama_siswa || "";
      if (q && !namaSiswa.toLowerCase().includes(q)) return false;
      if (filterJenis !== "semua" && item.jenis_kasus !== filterJenis)
        return false;
      if (filterSync === "sudah" && !item.sync_sias) return false;
      if (filterSync === "belum" && item.sync_sias) return false;
      return true;
    });
  }, [catatanList, searchCatatan, filterJenis, filterSync]);

  const stats = useMemo(() => summarize(catatanList), [catatanList]);

  // =========================================================
  // Render
  // =========================================================
  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-slate-500">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
        Memeriksa sesi login...
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <Icon name="lock" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-rose-700">
          Akses ditolak
        </h1>
        <p className="mt-1.5 text-sm text-rose-600">
          Halaman ini hanya dapat diakses oleh Admin / ICT.
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 lg:p-10">
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
      <Toast toast={message} onClose={closeToast} />

      {/* HEADER — gradient hitam */}
      <div>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-6 text-white shadow-lg md:p-8">
          <div className="pointer-events-none absolute -right-10 -bottom-20 h-80 w-80 rounded-full bg-white/5" />
          <div className="relative z-10 space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
              Catatan Kasus
            </span>
            <h1 className="text-2xl font-extrabold uppercase tracking-wide md:text-3xl">
              Monitoring Catatan Kasus
            </h1>
            <p className="text-sm text-slate-400">
              Pantau catatan kasus semua kelas dan kelola status sinkronisasi ke
              SIAS.
            </p>
          </div>
        </div>

        {/* Breadcrumb */}
        <nav
          aria-label="Langkah"
          className="mt-4 flex flex-wrap items-center gap-1.5 text-xs"
        >
          <button
            type="button"
            onClick={() => setSelectedKelasId(null)}
            className={
              selectedKelas
                ? "text-slate-400 transition hover:text-slate-900"
                : "font-semibold text-slate-900"
            }
          >
            Semua kelas
          </button>
          {selectedKelas && (
            <>
              <Icon name="chevronRight" className="h-3 w-3 text-slate-300" />
              <span className="font-semibold text-slate-900">
                {selectedKelas.nama_kelas}
              </span>
            </>
          )}
        </nav>
      </div>

      {/* ============ STEP 1: SEMUA KELAS ============ */}
      {!selectedKelas && (
        <>
          <StatsOverview records={allCatatan} loading={loadingKelas} />
          <TrendChart
            records={allCatatan}
            mode={trendMode}
            onModeChange={setTrendMode}
            loading={loadingKelas}
          />

          <div className="pt-1">
            <h2 className="text-base font-semibold text-slate-900">
              Pilih kelas
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Pilih kelas untuk melihat dan mengelola catatan kasusnya.
            </p>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <Icon name="search" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama kelas..."
                aria-label="Cari nama kelas"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <select
              value={filterTingkat}
              onChange={(e) => setFilterTingkat(e.target.value)}
              aria-label="Filter tingkat"
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 sm:w-48"
            >
              <option value="">Semua tingkat</option>
              {tingkatOptions.map((t) => (
                <option key={t} value={t}>
                  Tingkat {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={onlyBelumSync}
              onClick={() => setOnlyBelumSync((v) => !v)}
              className={`inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-medium shadow-sm transition ${
                onlyBelumSync
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              Belum sync saja
            </button>
          </div>

          {/* Grid Kelas */}
          {loadingKelas ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          ) : filteredKelas.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Icon name="search" className="h-6 w-6" />
              </span>
              <p className="mt-4 text-sm font-semibold text-slate-800">
                {kelasList.length === 0
                  ? "Belum ada kelas terdaftar"
                  : "Tidak ada kelas yang cocok"}
              </p>
              {kelasList.length > 0 && (
                <p className="mt-1 text-sm text-slate-500">
                  Coba ubah kata kunci atau filter.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredKelas.map((kelas) => {
                const info = kasusPerKelas[kelas.id] || {
                  total: 0,
                  belum: 0,
                  berat: 0,
                };
                return (
                  <button
                    key={kelas.id}
                    type="button"
                    onClick={() => setSelectedKelasId(kelas.id)}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-slate-900 hover:bg-slate-900 hover:shadow-lg hover:shadow-slate-300 active:scale-[0.98]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-900 transition-colors duration-300 group-hover:text-white">
                          {kelas.nama_kelas}
                        </h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 transition-colors duration-300 group-hover:text-slate-300">
                          <span className="flex items-center gap-1">
                            <Icon
                              name="user"
                              className="h-3.5 w-3.5 text-slate-400 transition-colors duration-300 group-hover:text-slate-400"
                            />
                            Tingkat {kelas.tingkat}
                          </span>
                          <span className="flex items-center gap-1">
                            <Icon
                              name="users"
                              className="h-3.5 w-3.5 text-slate-400 transition-colors duration-300 group-hover:text-slate-400"
                            />
                            {siswaCountMap[kelas.id] || 0} siswa
                          </span>
                        </div>
                      </div>

                      <span className="flex h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600 transition-colors duration-300 group-hover:bg-white/20 group-hover:text-white">
                        {getKelasBadge(kelas)}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 transition-colors duration-300 group-hover:border-white/20">
                      {info.total === 0 ? (
                        <span className="text-xs text-slate-400 transition-colors duration-300 group-hover:text-slate-300">
                          Belum ada kasus
                        </span>
                      ) : (
                        <>
                          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white transition-colors duration-300 group-hover:bg-white group-hover:text-slate-900">
                            {info.total} kasus
                          </span>
                          {info.berat > 0 && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
                              {info.berat} berat
                            </span>
                          )}
                          {info.belum > 0 && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors duration-300 group-hover:bg-white/20 group-hover:text-white">
                              {info.belum} belum sync
                            </span>
                          )}
                        </>
                      )}
                      <span className="ml-auto text-slate-300 transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-white">
                        <Icon name="chevronRight" className="h-4 w-4" />
                      </span>
                    </div>

                    {/* Shimmer */}
                    <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/15 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============ STEP 2: CATATAN KASUS KELAS ============ */}
      {selectedKelas && (
        <>
          {/* Header kelas */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900 px-2 text-sm font-semibold text-white shadow-sm">
                {getKelasBadge(selectedKelas)}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-slate-900">
                  {selectedKelas.nama_kelas}
                </h2>
                <p className="text-xs text-slate-500">
                  Tingkat {selectedKelas.tingkat} • {siswaList.length} siswa •{" "}
                  {catatanList.length} catatan kasus
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedKelasId(null)}
              className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 sm:self-center"
            >
              <Icon name="swap" />
              Ganti kelas
            </button>
          </div>

          <StatsOverview records={catatanList} loading={loadingCatatan} />
          <TrendChart
            records={catatanList}
            mode={trendMode}
            onModeChange={setTrendMode}
            loading={loadingCatatan}
          />

          {/* Search & filter catatan */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <Icon name="search" />
              </span>
              <input
                type="text"
                value={searchCatatan}
                onChange={(e) => setSearchCatatan(e.target.value)}
                placeholder="Cari nama siswa..."
                aria-label="Cari nama siswa"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Segmented
                ariaLabel="Filter kategori kasus"
                value={filterJenis}
                onChange={setFilterJenis}
                options={[
                  { value: "semua", label: "Semua", count: stats.total },
                  {
                    value: "pelanggaran ringan",
                    label: "Ringan",
                    count: stats.ringan,
                  },
                  {
                    value: "pelanggaran berat",
                    label: "Berat",
                    count: stats.berat,
                  },
                ]}
              />
              <Segmented
                ariaLabel="Filter status SIAS"
                value={filterSync}
                onChange={setFilterSync}
                options={[
                  { value: "semua", label: "Semua", count: stats.total },
                  { value: "sudah", label: "Sudah sync", count: stats.sudah },
                  { value: "belum", label: "Belum sync", count: stats.belum },
                ]}
              />
            </div>
          </div>

          {/* List catatan */}
          {loadingCatatan ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          ) : filteredCatatan.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Icon
                  name={catatanList.length === 0 ? "file" : "search"}
                  className="h-6 w-6"
                />
              </span>
              <p className="mt-4 text-sm font-semibold text-slate-800">
                {catatanList.length === 0
                  ? "Belum ada catatan kasus"
                  : "Tidak ada catatan yang cocok"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {catatanList.length === 0
                  ? "Kelas ini belum memiliki catatan kasus."
                  : "Coba ubah pencarian atau filter."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCatatan.map((item) => {
                const jenis = JENIS_KASUS[item.jenis_kasus];
                const isToggling = togglingId === item.id;
                const synced = !!item.sync_sias;
                return (
                  <div
                    key={item.id}
                    className={`relative overflow-hidden rounded-2xl border bg-white py-4 pl-5 pr-4 shadow-sm transition ${
                      synced
                        ? "border-emerald-200"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <span
                      className={`absolute inset-y-0 left-0 w-1 ${
                        jenis?.bar || "bg-slate-300"
                      }`}
                    />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-900">
                            {item.expand?.siswa_id?.nama_siswa ||
                              "Siswa tidak diketahui"}
                          </span>
                          {jenis && (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${jenis.badge}`}
                            >
                              {jenis.label}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500">
                          {formatLong(rawDateOnly(item.date))}
                        </p>

                        {item.tindak_lanjut && (
                          <p className="text-sm leading-relaxed text-slate-700">
                            {item.tindak_lanjut}
                          </p>
                        )}

                        {(item.surat_diberikan ||
                          item.expand?.tahun_ajaran_id) && (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {item.surat_diberikan && (
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${suratBadgeClass(
                                  item.surat_diberikan,
                                )}`}
                              >
                                {item.surat_diberikan}
                              </span>
                            )}
                            {item.expand?.tahun_ajaran_id && (
                              <span className="text-[11px] text-slate-400">
                                TA {item.expand.tahun_ajaran_id.tahun} • Sem{" "}
                                {item.expand.tahun_ajaran_id.semester}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Switch sync SIAS */}
                      <div className="flex flex-shrink-0 items-center gap-2.5 self-start rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200 sm:self-start">
                        <div className="text-right leading-tight">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            Sync SIAS
                          </p>
                          <p
                            className={`text-xs font-semibold ${
                              synced ? "text-emerald-600" : "text-slate-500"
                            }`}
                          >
                            {synced ? "Sudah" : "Belum"}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={synced}
                          aria-label={
                            synced
                              ? "Tandai belum sync SIAS"
                              : "Tandai sudah sync SIAS"
                          }
                          title={
                            synced
                              ? "Tandai belum sync SIAS"
                              : "Tandai sudah sync SIAS"
                          }
                          onClick={() => handleToggleSync(item)}
                          disabled={isToggling}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60 ${
                            synced ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform ${
                              synced ? "translate-x-[22px]" : "translate-x-0.5"
                            }`}
                          >
                            {isToggling && (
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                            )}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
