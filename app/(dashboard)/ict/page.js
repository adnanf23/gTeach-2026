"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { pb } from "@/lib/pocketbase";

// =========================================================
// Konstanta & helper
// =========================================================
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

const AVATAR_STYLES = [
  "bg-indigo-100 text-indigo-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
];

function avatarStyle(seed = "") {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_STYLES[h % AVATAR_STYLES.length];
}

function initialsOf(name = "") {
  const out = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return out || "?";
}

// PocketBase mengirim "2026-10-07 03:21:45.123Z" (pakai spasi). Ganti ke "T"
// supaya aman di semua browser (termasuk Safari).
function parseCreated(created) {
  return new Date(String(created).replace(" ", "T"));
}

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Helper: ambil nama & role dari record user yang di-expand.
// Menyesuaikan beberapa kemungkinan nama field di koleksi "users"
// supaya tetap tampil walau field belum pasti.
function getUserInfo(userRecord) {
  if (!userRecord) {
    return { name: "System / Guest", role: "SYSTEM" };
  }
  const name =
    userRecord.nama_lengkap ||
    userRecord.name ||
    userRecord.nama ||
    userRecord.username ||
    userRecord.email ||
    "Unknown User";
  const role = userRecord.role || "USER";
  return { name, role };
}

// Helper: format payload_json biar rapi & tidak meledak kalau kosong/invalid
function formatPayload(payload) {
  if (payload === null || payload === undefined) return "-";
  if (typeof payload === "string") return payload || "-";
  try {
    const str = JSON.stringify(payload);
    return str === "{}" || str === "[]" ? "-" : str;
  } catch {
    return "-";
  }
}

// Level log: dipakai untuk filter & warna
function getLevel(statusCode, type) {
  const code = Number(statusCode);
  if (!Number.isNaN(code) && code >= 500) return "error";
  if ((!Number.isNaN(code) && code >= 400) || type === "warning")
    return "warning";
  return "ok";
}

// Helper: tentukan warna badge status berdasarkan status_code (prioritas)
// dengan fallback ke field "type" kalau status_code tidak ada
function getStatusStyle(statusCode, type) {
  const code = Number(statusCode);

  if (!Number.isNaN(code) && code > 0) {
    if (code >= 500) {
      return {
        badge: "bg-red-50 text-red-700 ring-1 ring-red-200",
        dot: "bg-red-500",
        text: "text-red-600",
      };
    }
    if (code >= 400) {
      return {
        badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
        dot: "bg-amber-500",
        text: "text-amber-600",
      };
    }
    return {
      badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      dot: "bg-emerald-500",
      text: "text-emerald-600",
    };
  }

  if (type === "succes") {
    return {
      badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      dot: "bg-emerald-500",
      text: "text-emerald-600",
    };
  }
  if (type === "warning") {
    return {
      badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
      dot: "bg-amber-500",
      text: "text-amber-600",
    };
  }
  return {
    badge: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
    dot: "bg-sky-500",
    text: "text-sky-600",
  };
}

// Label tipe yang ramah dibaca (typo "succes" di DB tetap dipertahankan
// sebagai nilai, hanya tampilannya yang dirapikan)
const TYPE_LABEL = {
  succes: "Sukses",
  warning: "Peringatan",
  error: "Error",
  info: "Info",
};

// Helper: susun satu objek log siap-pakai dari record PocketBase (baik dari
// getList maupun dari event realtime), supaya logikanya tidak ditulis 2x
function buildLogEntry(record) {
  const { name, role } = getUserInfo(record.expand?.user_id);
  const created = parseCreated(record.created);
  const statusCode =
    record.status_code ??
    (record.type === "succes" ? 200 : record.type === "warning" ? 400 : 200);

  return {
    id: record.id,
    userName: name,
    userRole: role,
    aktivitas: record.aktivitas || record.msg || "Tidak ada aktivitas tercatat",
    endpoint: record.endpoint || "-",
    payload: formatPayload(record.payload_json),
    payloadRaw: record.payload_json ?? null,
    fullTime: created.toLocaleString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    statusCode,
    type: record.type || "info",
    level: getLevel(statusCode, record.type),
    time: created.toLocaleTimeString("id-ID"),
    date: created.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  };
}

// ---------------------------------------------------------
// Deteksi log "login berhasil".
// Dikenali dari teks aktivitas/msg yang mengandung "login" (kata "logout"
// tidak ikut cocok) atau endpoint yang berakhiran "/login". Login yang gagal
// (teks "gagal", type warning/error, atau status >= 400) tidak dihitung.
// Kalau format pesan log login di aplikasimu berbeda, ubah fungsi ini saja.
// ---------------------------------------------------------
function isSuccessfulLogin(rec) {
  const text = String(rec.aktivitas || rec.msg || "").toLowerCase();
  const endpoint = String(rec.endpoint || "").toLowerCase();
  const looksLikeLogin = text.includes("login") || endpoint.endsWith("/login");
  if (!looksLikeLogin) return false;
  if (text.includes("gagal")) return false;
  if (rec.type === "warning" || rec.type === "error") return false;
  const code = Number(rec.status_code);
  if (!Number.isNaN(code) && code >= 400) return false;
  return true;
}

function slimLogin(rec) {
  const payload =
    rec.payload_json && typeof rec.payload_json === "object"
      ? rec.payload_json
      : null;
  return {
    id: rec.id,
    created: rec.created,
    userKey: rec.user_id || payload?.username || "",
  };
}

// Data tren login: "weekly" = 7 hari terakhir, "monthly" = bulan berjalan
function buildLoginTrend(logins, mode) {
  const today = new Date();
  const todayKey = toDateKey(today);
  const days = [];

  if (mode === "weekly") {
    for (let i = 6; i >= 0; i--) {
      days.push(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() - i),
      );
    }
  } else {
    const last = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    ).getDate();
    for (let i = 1; i <= last; i++) {
      days.push(new Date(today.getFullYear(), today.getMonth(), i));
    }
  }

  const perDay = {};
  logins.forEach((l) => {
    const key = toDateKey(parseCreated(l.created));
    if (!perDay[key]) perDay[key] = { total: 0, users: new Set() };
    perDay[key].total += 1;
    if (l.userKey) perDay[key].users.add(l.userKey);
  });

  const periodUsers = new Set();
  let total = 0;

  const data = days.map((d) => {
    const key = toDateKey(d);
    const v = perDay[key];
    if (v) {
      total += v.total;
      v.users.forEach((u) => periodUsers.add(u));
    }
    return {
      key,
      label: mode === "weekly" ? HARI_SHORT[d.getDay()] : String(d.getDate()),
      dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
      total: v ? v.total : 0,
      unik: v ? v.users.size : 0,
      isToday: key === todayKey,
    };
  });

  const elapsedDays = mode === "weekly" ? 7 : today.getDate();

  return {
    data,
    total,
    uniqueUsers: periodUsers.size,
    todayCount: perDay[todayKey]?.total || 0,
    avg: total / elapsedDays,
  };
}

// =========================================================
// Ikon (inline SVG)
// =========================================================
const ICON_PATHS = {
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  terminal: (
    <>
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
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
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
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

function StatCard({
  label,
  icon,
  caption,
  dark = false,
  loading = false,
  children,
}) {
  return (
    <div
      className={`rounded-2xl p-5 shadow-sm ${
        dark
          ? "bg-slate-900 text-white"
          : "border border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={`text-xs font-medium ${
            dark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {label}
        </p>
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
            dark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          <Icon name={icon} />
        </span>
      </div>
      <div className="mt-3">
        {loading ? (
          <span
            className={`inline-block h-8 w-20 animate-pulse rounded-lg ${
              dark ? "bg-white/10" : "bg-slate-100"
            }`}
          />
        ) : (
          children
        )}
      </div>
      <p
        className={`mt-2 text-xs ${dark ? "text-slate-400" : "text-slate-400"}`}
      >
        {caption}
      </p>
    </div>
  );
}

function NumberValue({ value, unit }) {
  return (
    <p className="flex items-baseline gap-1.5 text-3xl font-semibold tabular-nums tracking-tight">
      {value}
      <span className="text-xs font-normal text-slate-400">{unit}</span>
    </p>
  );
}

// Grafik tren jumlah login: bar berdampingan (total login & pengguna unik)
function LoginTrendChart({ logins, mode, onModeChange, loading }) {
  const trend = useMemo(() => buildLoginTrend(logins, mode), [logins, mode]);
  const { data } = trend;

  const maxVal = Math.max(0, ...data.map((d) => Math.max(d.total, d.unik)));
  const maxScale = Math.max(4, Math.ceil(maxVal / 4) * 4);
  const barMinWidth = mode === "monthly" ? 24 : 42;

  const now = new Date();
  const periodeLabel =
    mode === "weekly"
      ? "7 hari terakhir"
      : `${BULAN[now.getMonth()]} ${now.getFullYear()}`;

  const summary = [
    {
      label: "Login hari ini",
      value: trend.todayCount,
      tone: "text-slate-900",
    },
    { label: "Total login", value: trend.total, tone: "text-slate-900" },
    { label: "Pengguna unik", value: trend.uniqueUsers, tone: "text-sky-600" },
    {
      label: "Rata-rata / hari",
      value: trend.avg.toFixed(1),
      tone: "text-slate-900",
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Tren login pengguna
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">{periodeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-900" />
              Total login
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" />
              Pengguna unik
            </span>
          </div>
          <Segmented
            ariaLabel="Periode grafik"
            value={mode}
            onChange={onModeChange}
            options={[
              { value: "weekly", label: "7 Hari" },
              { value: "monthly", label: "Bulan Ini" },
            ]}
          />
        </div>
      </div>

      {/* Ringkasan */}
      <div className="mb-5 grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl bg-slate-50 p-3 sm:grid-cols-4">
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

      {/* Chart */}
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
                    className="flex h-full flex-1 items-end justify-center gap-0.5"
                    title={`${d.dateLabel}: ${d.total} login, ${d.unik} pengguna unik`}
                  >
                    <div
                      className="w-1/2 max-w-[12px] rounded-t-md bg-slate-900 transition-all hover:opacity-80"
                      style={{
                        height: `${Math.max(
                          (d.total / maxScale) * 100,
                          d.total > 0 ? 3 : 0,
                        )}%`,
                      }}
                    />
                    <div
                      className="w-1/2 max-w-[12px] rounded-t-md bg-sky-400 transition-all hover:opacity-80"
                      style={{
                        height: `${Math.max(
                          (d.unik / maxScale) * 100,
                          d.unik > 0 ? 3 : 0,
                        )}%`,
                      }}
                    />
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

      {!loading && trend.total === 0 && (
        <p className="mt-3 text-center text-xs text-slate-400">
          Belum ada login tercatat pada periode ini.
        </p>
      )}
    </div>
  );
}

// Payload dirapikan (pretty-print) untuk ditampilkan di panel detail
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

// Pil status: kode + label tipe dalam satu badge
function StatusPill({ log }) {
  const style = getStatusStyle(log.statusCode, log.type);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {log.statusCode}
      <span className="font-medium opacity-80">
        {TYPE_LABEL[log.type] || log.type}
      </span>
    </span>
  );
}

// Panel detail log: endpoint, waktu lengkap, dan payload
function LogDetail({ log }) {
  const payload = prettyPayload(log.payloadRaw);
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Endpoint
          </dt>
          <dd className="mt-1 break-all font-mono text-[11.5px] text-slate-700">
            {log.endpoint}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Waktu lengkap
          </dt>
          <dd className="mt-1 text-[12px] text-slate-700">{log.fullTime}</dd>
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

// =========================================================
// PAGE
// =========================================================
export default function IctDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeTeachers: 0,
    activeAdmins: 0,
    dbStatus: "CONNECTING",
  });

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Login berhasil (untuk grafik tren)
  const [loginLogs, setLoginLogs] = useState([]);
  const [loginLoading, setLoginLoading] = useState(true);
  const [trendMode, setTrendMode] = useState("weekly");

  // Filter log
  const [logSearch, setLogSearch] = useState("");
  const [logLevel, setLogLevel] = useState("semua");
  const [expandedId, setExpandedId] = useState(null);
  const toggleExpanded = (id) =>
    setExpandedId((cur) => (cur === id ? null : id));

  useEffect(() => {
    if (!pb.authStore.isValid) return;

    async function fetchInitialStats() {
      try {
        const [allUsers, activeTeachers, activeAdmins] = await Promise.all([
          pb.collection("users").getList(1, 1, {
            filter: "is_aktif = true",
            requestKey: null,
          }),
          pb.collection("users").getList(1, 1, {
            // "guru" (bukan "guru_") supaya cocok dengan role berspasi
            // seperti "guru walikelas" / "guru mapel" / "guru pendamping"
            filter: "is_aktif = true && role ~ 'guru'",
            requestKey: null,
          }),
          pb.collection("users").getList(1, 1, {
            filter: "is_aktif = true && role = 'admin'",
            requestKey: null,
          }),
        ]);

        setStats({
          totalUsers: allUsers.totalItems,
          activeTeachers: activeTeachers.totalItems,
          activeAdmins: activeAdmins.totalItems,
          dbStatus: "ONLINE",
        });
      } catch (error) {
        if (!error.isAbort) {
          console.error("Gagal mengambil statistik database:", error);
          setStats((prev) => ({ ...prev, dbStatus: "ERROR" }));
        }
      }
    }

    async function fetchInitialLogs() {
      try {
        const records = await pb.collection("system_log").getList(1, 15, {
          sort: "-created",
          expand: "user_id",
          requestKey: null,
        });

        setLogs(records.items.map(buildLogEntry));
      } catch (error) {
        if (!error.isAbort) {
          console.error("Gagal mengambil data log awal:", error);
        }
      } finally {
        setLogsLoading(false);
      }
    }

    // Ambil log sejak awal bulan / 7 hari terakhir (mana yang lebih awal),
    // lalu saring yang merupakan login berhasil di sisi klien.
    async function fetchLoginLogs() {
      try {
        const now = new Date();
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startWeek = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 6,
        );
        const start = startMonth < startWeek ? startMonth : startWeek;

        const records = await pb.collection("system_log").getFullList({
          filter: `created >= "${start.toISOString().replace("T", " ")}"`,
          fields:
            "id,created,user_id,aktivitas,msg,type,endpoint,status_code,payload_json",
          sort: "-created",
          requestKey: null,
        });

        setLoginLogs(records.filter(isSuccessfulLogin).map(slimLogin));
      } catch (error) {
        if (!error.isAbort) {
          console.error("Gagal mengambil data login:", error);
        }
      } finally {
        setLoginLoading(false);
      }
    }

    fetchInitialStats();
    fetchInitialLogs();
    fetchLoginLogs();

    // Subscribe realtime — expand juga disertakan agar nama user langsung
    // tersedia tanpa perlu fetch ulang tiap ada log baru masuk
    pb.collection("system_log").subscribe(
      "*",
      function (e) {
        if (e.action === "create") {
          const newLog = buildLogEntry(e.record);
          setLogs((prevLogs) => [newLog, ...prevLogs.slice(0, 14)]);

          if (isSuccessfulLogin(e.record)) {
            setLoginLogs((prev) => [slimLogin(e.record), ...prev]);
          }
        }
      },
      { expand: "user_id" },
    );

    return () => {
      pb.collection("system_logs").unsubscribe("*");
    };
  }, []);

  const levelCounts = useMemo(
    () => ({
      ok: logs.filter((l) => l.level === "ok").length,
      warning: logs.filter((l) => l.level === "warning").length,
      error: logs.filter((l) => l.level === "error").length,
    }),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter((l) => {
      if (logLevel !== "semua" && l.level !== logLevel) return false;
      if (!q) return true;
      return (
        l.userName.toLowerCase().includes(q) ||
        l.aktivitas.toLowerCase().includes(q) ||
        l.endpoint.toLowerCase().includes(q)
      );
    });
  }, [logs, logSearch, logLevel]);

  const loadingStats = stats.dbStatus === "CONNECTING";
  const statsError = stats.dbStatus === "ERROR";
  const statValue = (v) => (statsError ? "–" : v);

  const dbDot =
    stats.dbStatus === "ONLINE"
      ? "bg-emerald-400"
      : stats.dbStatus === "CONNECTING"
        ? "bg-amber-400"
        : "bg-red-500";

  return (
    <div className="space-y-5 pb-8 text-slate-900">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      {/* ── ROW 1: KARTU STATISTIK ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          dark
          label="Status database"
          icon="database"
          caption="PocketBase live connection"
        >
          <p className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <span className="relative flex h-2.5 w-2.5">
              {stats.dbStatus !== "ERROR" && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none ${dbDot}`}
                />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dbDot}`}
              />
            </span>
            {stats.dbStatus}
          </p>
        </StatCard>

        <StatCard
          label="Total akun aktif"
          icon="users"
          caption="Seluruh ekosistem gTeach Space"
          loading={loadingStats}
        >
          <NumberValue value={statValue(stats.totalUsers)} unit="user" />
        </StatCard>

        <StatCard
          label="Guru terintegrasi"
          icon="book"
          caption="Mapel, wali kelas, & pendamping"
          loading={loadingStats}
        >
          <NumberValue value={statValue(stats.activeTeachers)} unit="akun" />
        </StatCard>

        <StatCard
          label="Administrator"
          icon="shield"
          caption="Pemegang hak akses manajemen"
          loading={loadingStats}
        >
          <NumberValue value={statValue(stats.activeAdmins)} unit="staff" />
        </StatCard>
      </div>

      {/* ── ROW 2: TREN LOGIN ── */}
      <LoginTrendChart
        logins={loginLogs}
        mode={trendMode}
        onModeChange={setTrendMode}
        loading={loginLoading}
      />

      {/* ── ROW 3: LIVE LOGS ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Icon name="terminal" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Aktivitas sistem terkini
              </h3>
              <p className="text-xs text-slate-500">
                Log tersinkron otomatis dari server tanpa perlu reload halaman
              </p>
            </div>
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-2 self-start rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 sm:self-center">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live stream aktif
          </span>
        </div>

        {/* Toolbar filter */}
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <Icon name="search" />
            </span>
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Cari user, aktivitas, atau endpoint..."
              aria-label="Cari log"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div className="overflow-x-auto">
            <Segmented
              ariaLabel="Filter level log"
              value={logLevel}
              onChange={setLogLevel}
              options={[
                { value: "semua", label: "Semua", count: logs.length },
                { value: "ok", label: "Normal", count: levelCounts.ok },
                {
                  value: "warning",
                  label: "Peringatan",
                  count: levelCounts.warning,
                },
                { value: "error", label: "Error", count: levelCounts.error },
              ]}
            />
          </div>
        </div>

        {/* Isi log */}
        {logsLoading ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Icon
                name={logs.length === 0 ? "terminal" : "search"}
                className="h-6 w-6"
              />
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-800">
              {logs.length === 0
                ? "Belum ada aktivitas tercatat"
                : "Tidak ada log yang cocok"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {logs.length === 0
                ? "Log baru akan muncul di sini secara otomatis."
                : "Coba ubah pencarian atau filter."}
            </p>
          </div>
        ) : (
          <>
            {/* Tampilan tabel (layar sedang ke atas) */}
            <div className="hidden md:block">
              <table className="w-full table-fixed border-collapse text-left text-[12.5px]">
                <colgroup>
                  <col className="w-[27%]" />
                  <col />
                  <col className="w-[150px]" />
                  <col className="w-[120px]" />
                  <col className="w-12" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3">Pengguna</th>
                    <th className="px-4 py-3">Aktivitas</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Waktu</th>
                    <th className="py-3 pr-4">
                      <span className="sr-only">Detail</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map((log) => {
                    const open = expandedId === log.id;
                    return (
                      <Fragment key={log.id}>
                        <tr
                          onClick={() => toggleExpanded(log.id)}
                          className={`cursor-pointer align-top transition-colors hover:bg-slate-50 ${
                            open ? "bg-slate-50" : ""
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarStyle(
                                  log.userName,
                                )}`}
                              >
                                {initialsOf(log.userName)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-800">
                                  {log.userName}
                                </p>
                                <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-slate-400">
                                  {log.userRole}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <p className="break-words leading-relaxed text-slate-700">
                              {log.aktivitas}
                            </p>
                            {log.endpoint !== "-" && (
                              <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                                {log.endpoint}
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <StatusPill log={log} />
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <p className="font-semibold tabular-nums text-slate-700">
                              {log.time}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {log.date}
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
                              <LogDetail log={log} />
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
              {filteredLogs.map((log) => {
                const open = expandedId === log.id;
                return (
                  <li key={log.id} className="space-y-2.5 px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarStyle(
                          log.userName,
                        )}`}
                      >
                        {initialsOf(log.userName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-800">
                          {log.userName}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">
                          {log.userRole}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-[12px] font-semibold tabular-nums text-slate-700">
                          {log.time}
                        </p>
                        <p className="text-[10px] text-slate-400">{log.date}</p>
                      </div>
                    </div>

                    <p className="break-words text-[12.5px] leading-relaxed text-slate-700">
                      {log.aktivitas}
                    </p>

                    <div className="flex items-center justify-between gap-2">
                      <StatusPill log={log} />
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

                    {open && <LogDetail log={log} />}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
