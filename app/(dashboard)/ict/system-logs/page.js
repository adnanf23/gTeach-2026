"use client";

import { useState, useEffect, useCallback } from "react";
import { pb } from "@/lib/pocketbase";

// ─── Highlight animation (injected once into <head>) ─────────────────────────

const HIGHLIGHT_STYLE = `
  @keyframes highlightFade {
    0%   { background-color: #d1fae5; }
    60%  { background-color: #d1fae5; }
    100% { background-color: transparent; }
  }
  .log-new-row { animation: highlightFade 2.5s ease forwards; }
`;

function InjectStyle() {
  useEffect(() => {
    if (document.getElementById("log-highlight-style")) return;
    const el = document.createElement("style");
    el.id = "log-highlight-style";
    el.textContent = HIGHLIGHT_STYLE;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
  return null;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

const formatLogDate = (dateString) => {
  if (!dateString) return { time: "-", date: "-" };
  try {
    const date = new Date(dateString);
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
    return { time, date: dateStr };
  } catch {
    return { time: dateString, date: "" };
  }
};

const getInitials = (name) => {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
};

const AVATAR_COLORS = [
  "bg-blue-50 text-blue-500",
  "bg-violet-50 text-violet-500",
  "bg-emerald-50 text-emerald-600",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-500",
];

const BADGE_MAP = {
  succes: "bg-emerald-50 text-emerald-700 border-emerald-100",
  warning: "bg-amber-50   text-amber-700   border-amber-100",
  info: "bg-blue-50    text-blue-700    border-blue-100",
  error: "bg-rose-50    text-rose-700    border-rose-100",
};

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "succes", label: "Success" },
  { key: "warning", label: "Warning" },
  { key: "info", label: "Info" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 select-none">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      Live stream aktif
    </div>
  );
}

function StatCard({ label, value, sub, dotColor }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-1 border border-gray-100">
      <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`}
        />
        {label}
      </div>
      <div className="text-2xl font-semibold text-gray-800 tracking-tight tabular-nums">
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

function Avatar({ name }) {
  const idx = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
        name ? AVATAR_COLORS[idx] : "bg-gray-100 text-gray-400"
      }`}
    >
      {getInitials(name)}
    </div>
  );
}

// Fixed typo safe rendering for display
function TypeBadge({ type }) {
  const label = type === "succes" ? "success" : (type ?? "info");
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-md text-[10.5px] font-semibold border uppercase tracking-wide ${BADGE_MAP[type] ?? BADGE_MAP.info}`}
    >
      {label}
    </span>
  );
}

// Fixed validation boundary check
function StatusCode({ code }) {
  if (!code) return <span className="text-gray-300 font-mono text-xs">—</span>;
  const ok = code >= 200 && code < 300;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[12.5px] font-bold ${ok ? "text-emerald-500" : "text-rose-500"}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`}
      />
      {code}
    </span>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
        active
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ loading }) {
  return (
    <tr>
      <td colSpan="6" className="py-20 text-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-gray-300"
          >
            <path d="M9 12h6M9 16h4M5 8h14M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
          </svg>
          <span className="text-sm font-medium">
            {loading
              ? "Menghubungkan stream data logs..."
              : "Belum ada rekaman aktivitas sistem."}
          </span>
        </div>
      </td>
    </tr>
  );
}

function LogRow({ log, isNew }) {
  const user = log.expand?.user_id;
  const { time, date } = formatLogDate(log.created);

  return (
    <tr
      className={`transition-colors hover:bg-gray-50/60 ${isNew ? "log-new-row" : ""}`}
    >
      {/* USER */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={user?.nama_lengkap || user?.username || null} />
          <div className="min-w-0">
            <div className="font-medium text-gray-800 truncate text-[13px]">
              {user?.nama_lengkap || user?.username || (
                <span className="text-gray-400 italic font-normal text-[12.5px]">
                  Sistem / Anonim
                </span>
              )}
            </div>
            {user?.role && (
              <div className="text-[10.5px] text-gray-400 uppercase tracking-wide mt-0.5">
                {user.role}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* AKTIVITAS */}
      <td className="px-5 py-4 text-gray-600 leading-relaxed break-words whitespace-normal text-[13px]">
        {log.aktivitas}
      </td>

      {/* ENDPOINT */}
      <td className="px-5 py-4">
        {log.endpoint ? (
          <span className="inline-block font-mono text-[11px] text-gray-500 bg-gray-50 px-2 py-1 rounded-md border border-gray-100 truncate max-w-[180px]">
            {log.endpoint}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-5 py-4">{JSON.stringify(log.payload_json)}</td>

      {/* STATUS CODE */}
      <td className="px-5 py-4 text-center">
        <StatusCode code={log.status_code} />
      </td>

      {/* TYPE BADGE */}
      <td className="px-5 py-4 text-center">
        <TypeBadge type={log.type} />
      </td>

      {/* WAKTU */}
      <td className="px-5 py-4 text-right" suppressHydrationWarning>
        <div className="text-[12px] font-mono text-gray-700 tabular-nums">
          {time}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">{date}</div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SystemLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [newIds, setNewIds] = useState(new Set());

  // 1. State baru untuk mengatur sorting order PocketBase ("-created" = terbaru, "created" = terlama)
  const [sortOrder, setSortOrder] = useState("-created");

  const perPage = 15;

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchLogs = useCallback(
    async (page) => {
      try {
        setLoading(true);
        const filterParts = [];
        if (activeFilter !== "all")
          filterParts.push(`type = "${activeFilter}"`);
        if (search.trim()) filterParts.push(`aktivitas ~ "${search.trim()}"`);

        const result = await pb
          .collection("system_logs")
          .getList(page, perPage, {
            expand: "user_id",
            requestKey: null,
            sort: sortOrder, // 2. Gunakan state sortOrder secara dinamis di sini
            filter: filterParts.join(" && ") || undefined,
          });

        setLogs(result.items);
        setTotalItems(result.totalItems);
        setTotalPages(Math.ceil(result.totalItems / perPage) || 1);
      } catch (error) {
        if (!error.isAbort) console.error("Gagal mengambil data log:", error);
      } finally {
        setLoading(false);
      }
    },
    [activeFilter, search, sortOrder],
  ); // 3. Masukkan sortOrder ke dependency array

  useEffect(() => {
    fetchLogs(currentPage);
  }, [currentPage, activeFilter, sortOrder]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchLogs(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Real-time ─────────────────────────────────────────────────────────────

  useEffect(() => {
    pb.collection("system_logs").subscribe("*", async (e) => {
      if (e.action !== "create") return;

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

      // Realtime insertion log hanya berjalan otomatis di page 1 jika sorting sedang mencari yang terbaru
      if (currentPage === 1 && sortOrder === "-created") {
        setLogs((prev) => [record, ...prev.slice(0, perPage - 1)]);
        setNewIds((prev) => new Set([...prev, record.id]));
        setTotalItems((prev) => prev + 1);
        setTimeout(
          () =>
            setNewIds((prev) => {
              const s = new Set(prev);
              s.delete(record.id);
              return s;
            }),
          2500,
        );
      } else if (sortOrder === "created") {
        // Jika sedang mengurutkan dari yang terlama, log baru tidak langsung naik ke atas agar tidak merusak struktur urutan bawah.
        setTotalItems((prev) => prev + 1);
      }
    });

    return () => pb.collection("system_logs").unsubscribe("*");
  }, [currentPage, sortOrder]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats = {
    total: totalItems,
    success: logs.filter((l) => l.type === "succes").length,
    warning: logs.filter((l) => l.type === "warning").length,
    info: logs.filter((l) => l.type === "info").length,
  };

  // 4. Fungsi handler untuk mengubah arah urutan data waktu ketika kolom di-klik
  const toggleSort = () => {
    setCurrentPage(1); // Reset kembali ke halaman pertama saat melakukan sorting
    setSortOrder((prev) => (prev === "-created" ? "created" : "-created"));
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <InjectStyle />

      <div className="w-full min-w-0 flex flex-col gap-5 p-1 text-black">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <LiveIndicator />
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Log"
            value={totalItems.toLocaleString("id-ID")}
            sub="Semua entri"
            dotColor="bg-gray-400"
          />
          <StatCard
            label="Sukses"
            value={stats.success.toLocaleString("id-ID")}
            sub="2xx responses"
            dotColor="bg-emerald-400"
          />
          <StatCard
            label="Warning"
            value={stats.warning.toLocaleString("id-ID")}
            sub="Perlu perhatian"
            dotColor="bg-amber-400"
          />
          <StatCard
            label="Info"
            value={stats.info.toLocaleString("id-ID")}
            sub="Notifikasi sistem"
            dotColor="bg-blue-400"
          />
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari aktivitas, endpoint, atau user..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition"
            />
          </div>
          {/* Filter chips */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {FILTERS.map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                active={activeFilter === f.key}
                onClick={() => {
                  setActiveFilter(f.key);
                  setCurrentPage(1);
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Table Card ── */}
        <div className="w-full bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
            <table className="w-full min-w-[940px] text-left border-collapse text-[13px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3.5 w-[20%] text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                    User
                  </th>
                  <th className="px-5 py-3.5 w-[33%] text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                    Aktivitas
                  </th>
                  <th className="px-5 py-3.5 w-[18%] text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                    Endpoint
                  </th>
                  <th className="px-5 py-3.5 w-[18%] text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                    Payload
                  </th>

                  <th className="px-5 py-3.5 w-[10%] text-[11px] font-semibold text-gray-400 uppercase tracking-widest text-center">
                    Status
                  </th>
                  <th className="px-5 py-3.5 w-[10%] text-[11px] font-semibold text-gray-400 uppercase tracking-widest text-center">
                    Tipe
                  </th>

                  {/* 5. Modifikasi header Waktu agar bisa di-klik dan memiliki indikator arah panah */}
                  <th
                    onClick={toggleSort}
                    className="px-5 py-3.5 w-[9%] text-[11px] font-semibold text-gray-400 uppercase tracking-widest text-right cursor-pointer hover:bg-gray-100/70 transition-colors select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      Waktu
                      <span className="text-gray-500 font-normal text-[10px]">
                        {sortOrder === "-created" ? "↓" : "↑"}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && logs.length === 0 ? (
                  <EmptyState loading={true} />
                ) : logs.length === 0 ? (
                  <EmptyState loading={false} />
                ) : (
                  logs.map((log) => (
                    <LogRow key={log.id} log={log} isNew={newIds.has(log.id)} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination Footer ── */}
          <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <div className="text-[12px] text-gray-400">
              Halaman{" "}
              <span className="font-semibold text-gray-700">{currentPage}</span>{" "}
              dari{" "}
              <span className="font-semibold text-gray-700">{totalPages}</span>
              <span className="hidden sm:inline">
                {" "}
                ·{" "}
                <span className="font-semibold text-gray-700">
                  {totalItems.toLocaleString("id-ID")}
                </span>{" "}
                entri
              </span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1 || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-[12px] font-medium shadow-sm cursor-pointer"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Sebelumnya
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(p + 1, totalPages))
                }
                disabled={currentPage === totalPages || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-[12px] font-medium shadow-sm cursor-pointer"
              >
                Selanjutnya
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="m9 18 6-6 6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
