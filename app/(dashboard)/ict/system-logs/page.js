"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { pb } from "@/lib/pocketbase";

// =========================================================
// Konstanta
// =========================================================
const PER_PAGE = 15;

const TYPE_STYLE = {
  // "succes" (typo) dipertahankan karena itu nilai yang tersimpan di database
  succes: {
    label: "Sukses",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  warning: {
    label: "Peringatan",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    dot: "bg-amber-500",
  },
  info: {
    label: "Info",
    badge: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
    dot: "bg-sky-500",
  },
  error: {
    label: "Error",
    badge: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    dot: "bg-rose-500",
  },
};

const FILTERS = [
  { value: "all", label: "Semua" },
  { value: "succes", label: "Sukses" },
  { value: "warning", label: "Peringatan" },
  { value: "info", label: "Info" },
  { value: "error", label: "Error" },
];

const COUNT_TYPES = ["succes", "warning", "info", "error"];

const AVATAR_STYLES = [
  "bg-indigo-100 text-indigo-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
];

// =========================================================
// Helper
// =========================================================
function avatarStyle(seed = "") {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_STYLES[h % AVATAR_STYLES.length];
}

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// PocketBase mengirim "2026-10-07 03:21:45.123Z" (pakai spasi). Ganti ke "T"
// supaya aman di semua browser (termasuk Safari).
function parseCreated(created) {
  return new Date(String(created).replace(" ", "T"));
}

function formatLogDate(dateString) {
  if (!dateString) return { time: "-", date: "-", full: "-" };
  try {
    const date = parseCreated(dateString);
    const time = new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
    const dateStr = new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
    const full = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
    return { time, date: dateStr, full };
  } catch {
    return { time: String(dateString), date: "", full: String(dateString) };
  }
}

// Payload dirapikan (pretty-print) untuk panel detail
function prettyPayload(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string") {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  try {
    const str = JSON.stringify(raw, null, 2);
    return str === "{}" || str === "[]" ? null : str;
  } catch {
    return null;
  }
}

// Escape tanda kutip/backslash agar input pencarian tidak merusak filter PocketBase
function escapeFilter(str) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getPageItems(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("…");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push("…");
  items.push(total);
  return items;
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
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  arrowDown: (
    <>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </>
  ),
  terminal: (
    <>
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
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
      className="inline-flex flex-shrink-0 rounded-xl bg-slate-100 p-1"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
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
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live stream aktif
    </span>
  );
}

function StatCard({
  label,
  value,
  caption,
  dot,
  dark = false,
  className = "",
}) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-sm sm:p-5 ${
        dark
          ? "bg-slate-900 text-white"
          : "border border-slate-200 bg-white text-slate-900"
      } ${className}`}
    >
      <p
        className={`flex items-center gap-2 text-xs font-medium ${
          dark ? "text-slate-400" : "text-slate-500"
        }`}
      >
        {dot && (
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
        )}
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-slate-400">{caption}</p>
    </div>
  );
}

function StatusPill({ type, code }) {
  const style = TYPE_STYLE[type] || TYPE_STYLE.info;
  const label = TYPE_STYLE[type] ? style.label : type || "Info";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {code ? <span>{code}</span> : null}
      <span className={code ? "font-medium opacity-80" : ""}>{label}</span>
    </span>
  );
}

function UserCell({ user, size = "h-9 w-9" }) {
  const name = user?.nama_lengkap || user?.username || null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={`flex ${size} flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          name ? avatarStyle(name) : "bg-slate-100 text-slate-400"
        }`}
      >
        {getInitials(name)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-slate-800">
          {name || (
            <span className="font-normal italic text-slate-400">
              Sistem / Anonim
            </span>
          )}
        </p>
        {user?.role && (
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-slate-400">
            {user.role}
          </p>
        )}
      </div>
    </div>
  );
}

// Panel detail: endpoint, waktu lengkap, payload
function LogDetail({ log, fullTime }) {
  const payload = prettyPayload(log.payload_json);
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Endpoint
          </dt>
          <dd className="mt-1 break-all font-mono text-[11.5px] text-slate-700">
            {log.endpoint || "-"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Waktu lengkap
          </dt>
          <dd className="mt-1 text-[12px] text-slate-700">{fullTime}</dd>
        </div>
      </dl>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Payload
        </p>
        {payload ? (
          <pre className="mt-1 max-h-52 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
            {payload}
          </pre>
        ) : (
          <p className="mt-1 text-[12px] text-slate-400">
            Tidak ada payload pada log ini.
          </p>
        )}
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, totalItems, loading, onChange }) {
  const from = totalItems === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, totalItems);
  const items = getPageItems(page, totalPages);

  const navBtn =
    "inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-xs text-slate-500">
        Menampilkan{" "}
        <span className="font-semibold tabular-nums text-slate-800">
          {from}–{to}
        </span>{" "}
        dari{" "}
        <span className="font-semibold tabular-nums text-slate-800">
          {totalItems.toLocaleString("id-ID")}
        </span>{" "}
        entri
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1 || loading}
          className={navBtn}
          aria-label="Halaman sebelumnya"
        >
          <Icon name="chevronLeft" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </button>

        {/* Nomor halaman (layar sedang ke atas) */}
        <div className="hidden items-center gap-1 sm:flex">
          {items.map((it, idx) =>
            it === "…" ? (
              <span
                key={`gap-${idx}`}
                className="w-6 text-center text-xs text-slate-400"
              >
                …
              </span>
            ) : (
              <button
                key={it}
                type="button"
                onClick={() => onChange(it)}
                disabled={loading}
                aria-current={it === page ? "page" : undefined}
                className={`h-9 min-w-9 rounded-lg px-2 text-xs font-medium tabular-nums transition ${
                  it === page
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {it}
              </button>
            ),
          )}
        </div>
        <span className="px-2 text-xs tabular-nums text-slate-500 sm:hidden">
          {page} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages || loading}
          className={navBtn}
          aria-label="Halaman berikutnya"
        >
          <span className="hidden sm:inline">Selanjutnya</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// =========================================================
// PAGE
// =========================================================
export default function SystemLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  // "-created" = terbaru dulu, "created" = terlama dulu
  const [sortOrder, setSortOrder] = useState("-created");

  const [newIds, setNewIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);

  // Statistik global per tipe (bukan hanya halaman yang sedang tampil)
  const [totalAll, setTotalAll] = useState(0);
  const [typeCounts, setTypeCounts] = useState({
    succes: 0,
    warning: 0,
    info: 0,
    error: 0,
  });
  const [countsLoading, setCountsLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
  const reqId = useRef(0);

  // ── Fetch daftar log ─────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setLoadError(false);
    try {
      const filterParts = [];
      if (activeFilter !== "all") filterParts.push(`type = "${activeFilter}"`);
      const q = debouncedSearch.trim();
      if (q) {
        const e = escapeFilter(q);
        filterParts.push(
          `(aktivitas ~ "${e}" || endpoint ~ "${e}" || user_id.nama_lengkap ~ "${e}")`,
        );
      }

      const result = await pb
        .collection("system_log")
        .getList(currentPage, PER_PAGE, {
          expand: "user_id",
          requestKey: null,
          sort: sortOrder,
          filter: filterParts.join(" && ") || undefined,
        });

      // Abaikan respons lama kalau sudah ada request yang lebih baru
      if (id !== reqId.current) return;
      setLogs(result.items);
      setTotalItems(result.totalItems);
    } catch (error) {
      if (!error.isAbort) {
        console.error("Gagal mengambil data log:", error);
        if (id === reqId.current) setLoadError(true);
      }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [currentPage, activeFilter, debouncedSearch, sortOrder]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // ── Fetch jumlah per tipe ────────────────────────────────────────────────
  const fetchCounts = useCallback(async () => {
    try {
      const [all, ...perType] = await Promise.all([
        pb.collection("system_log").getList(1, 1, {
          fields: "id",
          requestKey: null,
        }),
        ...COUNT_TYPES.map((t) =>
          pb.collection("system_log").getList(1, 1, {
            fields: "id",
            filter: `type = "${t}"`,
            requestKey: null,
          }),
        ),
      ]);
      setTotalAll(all.totalItems);
      setTypeCounts(
        Object.fromEntries(
          COUNT_TYPES.map((t, i) => [t, perType[i].totalItems]),
        ),
      );
    } catch (error) {
      if (!error.isAbort)
        console.error("Gagal mengambil statistik log:", error);
    } finally {
      setCountsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Debounce pencarian (sekali jalan, tanpa fetch ganda)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Tutup panel detail saat halaman / filter berubah
  useEffect(() => {
    setExpandedId(null);
  }, [currentPage, activeFilter, debouncedSearch, sortOrder]);

  // ── Real-time ─────────────────────────────────────────────────────────────
  // State terbaru disimpan di ref supaya subscribe cukup sekali (tidak
  // subscribe ulang tiap pindah halaman) dan handler tidak memakai state basi.
  const liveRef = useRef({});
  liveRef.current = { currentPage, sortOrder, activeFilter, debouncedSearch };

  useEffect(() => {
    pb.collection("system_log").subscribe("*", async (e) => {
      if (e.action !== "create") return;

      const type = e.record.type;

      // Statistik global selalu ikut bertambah
      setTotalAll((p) => p + 1);
      if (COUNT_TYPES.includes(type)) {
        setTypeCounts((p) => ({ ...p, [type]: p[type] + 1 }));
      }

      const live = liveRef.current;
      const matchesFilter =
        live.activeFilter === "all" || type === live.activeFilter;
      // Saat pencarian aktif, log baru tidak disisipkan (tidak bisa dicocokkan di sini)
      if (!matchesFilter || live.debouncedSearch.trim()) return;

      setTotalItems((p) => p + 1);

      // Sisipkan di atas hanya jika sedang di halaman 1 dan urutan terbaru
      if (live.currentPage !== 1 || live.sortOrder !== "-created") return;

      let record = e.record;
      if (e.record.user_id) {
        try {
          const user = await pb
            .collection("users")
            .getOne(e.record.user_id, { requestKey: null });
          record = { ...record, expand: { user_id: user } };
        } catch (err) {
          console.error("Gagal mengambil relasi realtime user:", err);
        }
      }

      setLogs((prev) => [record, ...prev.slice(0, PER_PAGE - 1)]);
      setNewIds((prev) => new Set([...prev, record.id]));
      setTimeout(
        () =>
          setNewIds((prev) => {
            const s = new Set(prev);
            s.delete(record.id);
            return s;
          }),
        2500,
      );
    });

    return () => {
      pb.collection("system_log").unsubscribe("*");
    };
  }, []);

  // ── Handler ───────────────────────────────────────────────────────────────
  const changeSort = (value) => {
    setCurrentPage(1);
    setSortOrder(value);
  };
  const toggleSort = () =>
    changeSort(sortOrder === "-created" ? "created" : "-created");

  const changeFilter = (value) => {
    setActiveFilter(value);
    setCurrentPage(1);
  };

  const goToPage = (p) => setCurrentPage(Math.min(Math.max(p, 1), totalPages));
  const toggleExpanded = (id) =>
    setExpandedId((cur) => (cur === id ? null : id));

  const refresh = () => {
    fetchLogs();
    fetchCounts();
  };

  const pct = (n) => (totalAll ? Math.round((n / totalAll) * 100) : 0);
  const fmt = (n) => (countsLoading ? "–" : n.toLocaleString("id-ID"));

  const initialLoading = loading && logs.length === 0 && !loadError;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5 pb-10 text-slate-900">
      <style>{`
        @keyframes highlightFade {
          0%, 60% { background-color: #ecfdf5; }
          100% { background-color: transparent; }
        }
        .log-new-row { animation: highlightFade 2.5s ease forwards; }
        @media (prefers-reduced-motion: reduce) { .log-new-row { animation: none; } }
      `}</style>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Rekaman aktivitas seluruh pengguna, diperbarui secara real-time.
        </p>
        <div className="flex items-center gap-2">
          <LiveBadge />
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-label="Muat ulang log"
            title="Muat ulang"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
          >
            <Icon
              name="refresh"
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* ── Statistik ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          dark
          className="col-span-2 lg:col-span-1"
          label="Total log"
          value={fmt(totalAll)}
          caption="Semua entri tercatat"
        />
        <StatCard
          label="Sukses"
          dot="bg-emerald-500"
          value={fmt(typeCounts.succes)}
          caption={`${pct(typeCounts.succes)}% dari total`}
        />
        <StatCard
          label="Peringatan"
          dot="bg-amber-400"
          value={fmt(typeCounts.warning)}
          caption={`${pct(typeCounts.warning)}% dari total`}
        />
        <StatCard
          label="Info"
          dot="bg-sky-400"
          value={fmt(typeCounts.info)}
          caption={`${pct(typeCounts.info)}% dari total`}
        />
        <StatCard
          label="Error"
          dot="bg-rose-500"
          value={fmt(typeCounts.error)}
          caption={`${pct(typeCounts.error)}% dari total`}
        />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <Icon name="search" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari aktivitas, endpoint, atau user..."
            aria-label="Cari log"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto">
            <Segmented
              ariaLabel="Filter tipe log"
              value={activeFilter}
              onChange={changeFilter}
              options={FILTERS}
            />
          </div>
          <Segmented
            ariaLabel="Urutan waktu"
            value={sortOrder}
            onChange={changeSort}
            options={[
              { value: "-created", label: "Terbaru" },
              { value: "created", label: "Terlama" },
            ]}
          />
        </div>
      </div>

      {/* ── Daftar log ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {initialLoading ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <Icon name="alert" className="h-6 w-6" />
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-800">
              Gagal memuat log
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Periksa koneksi lalu coba lagi.
            </p>
            <button
              type="button"
              onClick={refresh}
              className="mt-5 inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <Icon name="refresh" />
              Coba lagi
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Icon
                name={search || activeFilter !== "all" ? "search" : "terminal"}
                className="h-6 w-6"
              />
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-800">
              {search || activeFilter !== "all"
                ? "Tidak ada log yang cocok"
                : "Belum ada rekaman aktivitas"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {search || activeFilter !== "all"
                ? "Coba ubah pencarian atau filter."
                : "Log baru akan muncul di sini secara otomatis."}
            </p>
          </div>
        ) : (
          <div
            className={`transition-opacity ${
              loading ? "opacity-60" : "opacity-100"
            }`}
          >
            {/* Tampilan tabel (layar sedang ke atas) */}
            <div className="hidden md:block">
              <table className="w-full table-fixed border-collapse text-left text-[12.5px]">
                <colgroup>
                  <col className="w-[27%]" />
                  <col />
                  <col className="w-[160px]" />
                  <col className="w-[130px]" />
                  <col className="w-12" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3">Pengguna</th>
                    <th className="px-4 py-3">Aktivitas</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={toggleSort}
                        className="inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-slate-700"
                        title="Ubah urutan waktu"
                      >
                        Waktu
                        <Icon
                          name="arrowDown"
                          className={`h-3 w-3 transition-transform ${
                            sortOrder === "created" ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </th>
                    <th className="py-3 pr-4">
                      <span className="sr-only">Detail</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => {
                    const user = log.expand?.user_id;
                    const { time, date, full } = formatLogDate(log.created);
                    const open = expandedId === log.id;
                    return (
                      <Fragment key={log.id}>
                        <tr
                          onClick={() => toggleExpanded(log.id)}
                          className={`cursor-pointer align-top transition-colors hover:bg-slate-50 ${
                            open ? "bg-slate-50" : ""
                          } ${newIds.has(log.id) ? "log-new-row" : ""}`}
                        >
                          <td className="px-5 py-3.5">
                            <UserCell user={user} />
                          </td>

                          <td className="px-4 py-3.5">
                            <p className="break-words leading-relaxed text-slate-700">
                              {log.aktivitas}
                            </p>
                            {log.endpoint && (
                              <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                                {log.endpoint}
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <StatusPill
                              type={log.type}
                              code={log.status_code}
                            />
                          </td>

                          <td
                            className="px-4 py-3.5 text-right"
                            suppressHydrationWarning
                          >
                            <p className="font-semibold tabular-nums text-slate-700">
                              {time}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {date}
                            </p>
                          </td>

                          <td className="py-3.5 pr-4 text-right">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label={
                                open ? "Tutup detail log" : "Lihat detail log"
                              }
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
                            >
                              <Icon
                                name="chevronDown"
                                className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
                                  open ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          </td>
                        </tr>

                        {open && (
                          <tr className="bg-slate-50">
                            <td colSpan={5} className="px-5 pb-4 pt-0.5">
                              <LogDetail log={log} fullTime={full} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Tampilan kartu (HP) */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {logs.map((log) => {
                const user = log.expand?.user_id;
                const { time, date, full } = formatLogDate(log.created);
                const open = expandedId === log.id;
                return (
                  <li
                    key={log.id}
                    className={`space-y-2.5 px-4 py-3.5 ${
                      newIds.has(log.id) ? "log-new-row" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <UserCell user={user} />
                      </div>
                      <div
                        className="flex-shrink-0 text-right"
                        suppressHydrationWarning
                      >
                        <p className="text-[12px] font-semibold tabular-nums text-slate-700">
                          {time}
                        </p>
                        <p className="text-[10px] text-slate-400">{date}</p>
                      </div>
                    </div>

                    <p className="break-words text-[12.5px] leading-relaxed text-slate-700">
                      {log.aktivitas}
                    </p>

                    <div className="flex items-center justify-between gap-2">
                      <StatusPill type={log.type} code={log.status_code} />
                      <button
                        type="button"
                        onClick={() => toggleExpanded(log.id)}
                        aria-expanded={open}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                      >
                        {open ? "Tutup" : "Detail"}
                        <Icon
                          name="chevronDown"
                          className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>

                    {open && <LogDetail log={log} fullTime={full} />}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ── Pagination ── */}
        {!loadError && (logs.length > 0 || totalItems > 0) && (
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            loading={loading}
            onChange={goToPage}
          />
        )}
      </div>
    </div>
  );
}
