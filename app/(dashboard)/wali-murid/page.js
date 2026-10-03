"use client";

import { useEffect, /* useMemo, */ useState } from "react";
import { useRouter } from "next/navigation";
import { pb, getCurrentUser, isAuthenticated } from "@/lib/pocketbase";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getGreetingByTime() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return "Selamat Pagi";
  if (h >= 11 && h < 15) return "Selamat Siang";
  if (h >= 15 && h < 18) return "Selamat Sore";
  return "Selamat Malam";
}

function hariIndo() {
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulan = [
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
  const now = new Date();
  return `${hari[now.getDay()]}, ${now.getDate()} ${bulan[now.getMonth()]} ${now.getFullYear()}`;
}

// Field multi-select / multi-relation di PocketBase selalu berupa array,
// tapi kita jaga-jaga kalau datanya string tunggal.
function toArr(v) {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

/* ===== ABSENSI (di-comment, buka lagi kalau mau dipakai) =====================

function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  return { start: fmt(start), end: fmt(end) };
}

function prevMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  return { start: fmt(start), end: fmt(end) };
}

const BULAN_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function last7Days() {
  const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = toISODate(d);
    days.push({
      key,
      label: HARI[d.getDay()],
      dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
    });
  }
  return days;
}

function monthBuckets(offset = 0) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 1; i <= lastDay; i++) {
    const d = new Date(year, month, i);
    const key = toISODate(d);
    days.push({
      key,
      label: String(i),
      dateLabel: BULAN_SHORT[month],
    });
  }
  return days;
}

============================================================================= */

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
export function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <div
      className={`rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(99,120,200,0.10)] ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[15px] font-bold leading-tight text-gray-900">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-[12px] text-gray-400">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// Ilustrasi kertas raport terkunci: belum ada raport yang dibuka
function EmptyRaporIllustration() {
  return (
    <svg
      viewBox="0 0 160 160"
      className="h-36 w-auto"
      role="img"
      aria-label="Kertas raport terkunci, belum ada raport yang dibuka"
    >
      <circle cx="80" cy="80" r="70" fill="#EEF2FF" />

      {/* kertas */}
      <rect
        x="48"
        y="30"
        width="64"
        height="86"
        rx="8"
        fill="#ffffff"
        stroke="#A5B4FC"
        strokeWidth="2.5"
      />
      <rect x="58" y="44" width="30" height="5" rx="2.5" fill="#C7D2FE" />
      <rect x="58" y="58" width="44" height="4" rx="2" fill="#E0E7FF" />
      <rect x="58" y="69" width="44" height="4" rx="2" fill="#E0E7FF" />
      <rect x="58" y="80" width="32" height="4" rx="2" fill="#E0E7FF" />

      {/* gembok */}
      <circle cx="112" cy="112" r="22" fill="#6366F1" />
      <rect x="103" y="110" width="18" height="14" rx="3" fill="#ffffff" />
      <path
        d="M107 110 v-3 a5 5 0 0 1 10 0 v3"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="112" cy="117" r="2" fill="#6366F1" />
    </svg>
  );
}

function EmptyRapor() {
  return (
    <div className="flex flex-col items-center px-2 py-6 text-center">
      <EmptyRaporIllustration />
      <h3 className="mt-3 text-base font-bold text-slate-800">
        Belum ada raport yang dibuka
      </h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Raport akan muncul di sini setelah sekolah membuka akses raport untuk
        ujian. Silakan cek kembali nanti.
      </p>
    </div>
  );
}

function RaporItem({ ujian }) {
  const jenis = toArr(ujian.jenis_ujian).join(", ");

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4">
      {/* Baris Atas: Status Badge */}
      <div className="flex justify-end">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Dibuka
        </span>
      </div>

      {/* Baris Bawah: Ikon dan Teks */}
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-lg ring-2 ring-indigo-100">
          📄
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-slate-800">
            {ujian.nama_ujian}
          </p>
          <p className="mt-0.5 break-words text-xs text-slate-400">
            {jenis ? `Jenis ujian: ${jenis.toUpperCase()}` : "Raport ujian"}
          </p>
        </div>
      </div>
    </li>
  );
}

/* ===== ABSENSI UI (di-comment) ===============================================

const STATUS_META = {
  hadir: {
    label: "Hadir",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    height: 100,
    emoji: "✓",
  },
  sakit: {
    label: "Sakit",
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    dot: "bg-amber-400",
    bar: "bg-amber-400",
    height: 60,
    emoji: "🤒",
  },
  izin: {
    label: "Izin",
    bg: "bg-sky-50",
    text: "text-sky-700",
    ring: "ring-sky-200",
    dot: "bg-sky-400",
    bar: "bg-sky-400",
    height: 60,
    emoji: "📝",
  },
  alpha: {
    label: "Alpha",
    bg: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
    height: 25,
    emoji: "✕",
  },
  none: {
    label: "Belum",
    bg: "bg-slate-50",
    text: "text-slate-500",
    ring: "ring-slate-200",
    dot: "bg-slate-300",
    bar: "bg-slate-200",
    height: 8,
    emoji: "–",
  },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.none;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${m.bg} ${m.text} ring-1 ${m.ring}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function MiniStat({ label, value, tone = "slate", suffix = "" }) {
  const toneMap = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    sky: "text-sky-600",
    rose: "text-rose-600",
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold leading-tight ${toneMap[tone]}`}>
        {value}
        {suffix && (
          <span className="ml-0.5 text-xs font-normal text-slate-400">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function AttendanceTrendChart({
  weeklyData,
  monthlyData,
  lastMonthData,
  viewMode,
  onViewChange,
}) {
  const data =
    viewMode === "weekly"
      ? weeklyData
      : viewMode === "lastMonth"
        ? lastMonthData
        : monthlyData;

  const showDateLabel = viewMode === "weekly";
  const colMin = showDateLabel ? 44 : 26;

  const total = data.length;
  const counts = data.reduce(
    (acc, d) => {
      if (d.status) acc[d.status] = (acc[d.status] || 0) + 1;
      return acc;
    },
    { hadir: 0, sakit: 0, izin: 0, alpha: 0 },
  );
  const daysWithData = counts.hadir + counts.sakit + counts.izin + counts.alpha;
  const persenHadir =
    daysWithData > 0 ? Math.round((counts.hadir / daysWithData) * 100) : 0;

  const TAB = [
    { id: "weekly", label: "Minggu Ini" },
    { id: "monthly", label: "Bulan Ini" },
    { id: "lastMonth", label: "Bulan Lalu" },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
          {["hadir", "sakit", "izin", "alpha"].map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className={`h-2.5 w-2.5 rounded-sm ${STATUS_META[s].bar}`}
              />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>
        <div className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-0.5">
          {TAB.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onViewChange(t.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                viewMode === t.id
                  ? "bg-indigo-500 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-4 sm:gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Kehadiran
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-emerald-600 sm:text-xl">
            {persenHadir}%
          </p>
          <p className="text-[10px] text-slate-400">
            {viewMode === "weekly"
              ? "7 hari terakhir"
              : viewMode === "lastMonth"
                ? "bulan lalu"
                : "bulan ini"}
          </p>
        </div>
        <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-3">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Hadir
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-slate-700 sm:text-xl">
            {counts.hadir}
          </p>
          <p className="text-[10px] text-slate-400">hari</p>
        </div>
        <div className="min-w-0 border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:border-slate-200 sm:pl-3 sm:pt-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Tidak Hadir
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-slate-700 sm:text-xl">
            {counts.sakit + counts.izin + counts.alpha}
          </p>
          <p className="text-[10px] text-slate-400">hari</p>
        </div>
        <div className="min-w-0 border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:border-slate-200 sm:pl-3 sm:pt-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Total Hari
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-slate-700 sm:text-xl">
            {total}
          </p>
          <p className="text-[10px] text-slate-400">hari</p>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          className="flex items-end gap-1.5 sm:gap-2"
          style={{ minWidth: `${data.length * colMin}px` }}
        >
          {data.map((d) => {
            const s = d.status || "none";
            const meta = STATUS_META[s];
            const h = meta.height;
            return (
              <div
                key={d.key}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="flex h-48 w-full items-end justify-center">
                  <div
                    className={`w-full max-w-[18px] rounded-t-md ${meta.bar} transition-all duration-300 ${
                      s === "none" ? "opacity-40" : "opacity-100"
                    }`}
                    style={{ height: `${h}%` }}
                    title={
                      s === "none"
                        ? `${d.dateLabel} • tidak ada data`
                        : `${d.dateLabel} • ${meta.label}`
                    }
                  />
                </div>
                <div className="text-center leading-tight">
                  <p className="text-[10px] font-medium text-slate-500">
                    {d.label}
                  </p>
                  {showDateLabel && (
                    <p className="text-[9px] text-slate-300">{d.dateLabel}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

============================================================================= */

// ---------------------------------------------------------------------------
// Halaman Utama
// ---------------------------------------------------------------------------
export default function OverviewWaliMuridPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [wali, setWali] = useState(null);
  const [siswa, setSiswa] = useState(null);
  const [kelas, setKelas] = useState(null);

  // Raport: daftar ujian yang akses raportnya dibuka untuk anak ini
  const [raporList, setRaporList] = useState([]);

  /* ----- state absensi (di-comment) -----
  const [absensiBulanIni, setAbsensiBulanIni] = useState([]);
  const [absensiHariIni, setAbsensiHariIni] = useState(null);

  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [lastMonthTrend, setLastMonthTrend] = useState([]);
  const [trendView, setTrendView] = useState("weekly");
  ---------------------------------------- */

  // Auth
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!isAuthenticated() || !currentUser) {
      router.push("/login");
      return;
    }
    setWali(currentUser);
    setAuthChecked(true);
  }, [router]);

  // Data
  useEffect(() => {
    if (!authChecked || !wali) return;
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setErrorMsg("");

        const siswaId = Array.isArray(wali.siswa_id)
          ? wali.siswa_id[0]
          : wali.siswa_id;
        if (!siswaId) {
          setErrorMsg(
            "Akun Anda belum ditautkan ke data siswa. Silakan hubungi admin sekolah.",
          );
          setLoading(false);
          return;
        }

        const siswaData = await pb.collection("siswa").getOne(siswaId);
        if (isMounted) setSiswa(siswaData);

        let kelasData = null;
        const kelasId = Array.isArray(siswaData.kelas_id)
          ? siswaData.kelas_id[0]
          : siswaData.kelas_id;
        if (kelasId) {
          try {
            kelasData = await pb.collection("kelas").getOne(kelasId);
            if (isMounted) setKelas(kelasData);
          } catch (e) {
            console.warn("Gagal memuat kelas:", e);
          }
        }

        // ===== RAPORT =====
        // Ujian yang akses raportnya dibuka (akses_rapor = true)
        const ujianBuka = await pb.collection("pengaturan_ujian").getFullList({
          filter: "akses_rapor=true",
          sort: "nama_ujian",
        });

        // Cocokkan dengan tingkat / kelas anak.
        // target_tingkat & target_kelas_id keduanya multi-value (array).
        const tingkat =
          kelasData?.tingkat != null ? String(kelasData.tingkat) : null;

        const ujianUntukAnak = ujianBuka.filter((u) => {
          const tingkatList = toArr(u.target_tingkat).map(String);
          const kelasList = toArr(u.target_kelas_id);
          const cocokTingkat =
            tingkatList.length === 0 ||
            (tingkat && tingkatList.includes(tingkat));
          const cocokKelas =
            kelasList.length === 0 || (kelasId && kelasList.includes(kelasId));
          return cocokTingkat && cocokKelas;
        });

        if (isMounted) setRaporList(ujianUntukAnak);

        /* ===== ABSENSI (di-comment) ==========================================
        const now = new Date();
        const todayStart = `${toISODate(now)} 00:00:00`;
        const tomorrow = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
        );
        const todayEnd = `${toISODate(tomorrow)} 00:00:00`;
        const { start: monthStart, end: monthEnd } = monthRange();

        const [todayList, bulanList] = await Promise.all([
          pb.collection("absensi").getFullList({
            filter: `siswa_id="${siswaId}" && tanggal>="${todayStart}" && tanggal<"${todayEnd}"`,
          }),
          pb.collection("absensi").getFullList({
            filter: `siswa_id="${siswaId}" && tanggal>="${monthStart}" && tanggal<"${monthEnd}"`,
            sort: "-tanggal",
          }),
        ]);

        if (isMounted) {
          setAbsensiHariIni(todayList[0] || null);
          setAbsensiBulanIni(bulanList);
        }

        // Trend: minggu ini, bulan ini, bulan lalu
        const weekly = last7Days();
        const monthly = monthBuckets(0);
        const lastMonth = monthBuckets(-1);

        const minStart =
          [weekly[0].key, monthly[0].key, lastMonth[0].key].sort()[0] +
          " 00:00:00";
        const maxEnd =
          [
            weekly[weekly.length - 1].key,
            monthly[monthly.length - 1].key,
            lastMonth[lastMonth.length - 1].key,
          ]
            .sort()
            .pop() + " 23:59:59";

        const absensiRange = await pb.collection("absensi").getFullList({
          filter: `siswa_id="${siswaId}" && tanggal>="${minStart}" && tanggal<="${maxEnd}"`,
        });

        const byDate = {};
        absensiRange.forEach((a) => {
          const key = (a.tanggal || "").slice(0, 10);
          if (!key) return;
          byDate[key] = a.status;
        });

        function buildTrend(buckets) {
          return buckets.map((b) => ({
            key: b.key,
            label: b.label,
            dateLabel: b.dateLabel,
            status: byDate[b.key] || null,
          }));
        }

        if (isMounted) {
          setWeeklyTrend(buildTrend(weekly));
          setMonthlyTrend(buildTrend(monthly));
          setLastMonthTrend(buildTrend(lastMonth));
        }
        ======================================================================= */

        if (isMounted) setLoading(false);
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setErrorMsg(
            "Terjadi kesalahan saat memuat data. Coba muat ulang halaman.",
          );
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [authChecked, wali]);

  /* ----- statistik absensi bulan ini (di-comment) -----
  const stats = useMemo(() => {
    const s = { hadir: 0, sakit: 0, izin: 0, alpha: 0, total: 0 };
    absensiBulanIni.forEach((a) => {
      if (s[a.status] !== undefined) s[a.status] += 1;
      s.total += 1;
    });
    s.persenHadir = s.total > 0 ? Math.round((s.hadir / s.total) * 100) : 0;
    return s;
  }, [absensiBulanIni]);

  const persen = (v) =>
    stats.total > 0 ? Math.round((v / stats.total) * 100) : 0;
  ----------------------------------------------------- */

  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-slate-500">Memuat data anak...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-medium text-amber-700">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
            {hariIndo()}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {getGreetingByTime()}, Ayah atau Mama! 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pantau perkembangan & raport anak Anda di sekolah
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Profil anak */}
        <Card>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-700">
                {(siswa?.nama_siswa || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Nama Siswa</p>
                <p className="text-lg font-bold text-slate-900">
                  {siswa?.nama_siswa || "-"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  NIS {siswa?.nis || "-"} • Kelas {kelas?.nama_kelas || "-"}
                  {siswa?.jenis_kelamin ? ` • ${siswa.jenis_kelamin}` : ""}
                </p>
              </div>
            </div>

            {/* Absensi hari ini (di-comment)
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-center">
              <p className="text-[11px] font-medium text-slate-500">
                Absensi Hari Ini
              </p>
              <div className="mt-1">
                {absensiHariIni ? (
                  <StatusBadge status={absensiHariIni.status} />
                ) : (
                  <span className="text-xs text-slate-400">Belum ada data</span>
                )}
              </div>
            </div>
            */}
          </div>
        </Card>

        {/* Raport */}
        <Card
          title="Raport"
          subtitle={
            raporList.length > 0
              ? "Raport yang sudah dibuka oleh sekolah"
              : undefined
          }
        >
          {raporList.length === 0 ? (
            <EmptyRapor />
          ) : (
            <>
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3.5">
                <span className="text-lg leading-none">🔔</span>
                <p className="text-sm text-indigo-900">
                  Raport sudah dibuka. Silakan lihat di menu Rapor.
                </p>
              </div>
              <ul className="space-y-2.5">
                {raporList.map((ujian) => (
                  <RaporItem key={ujian.id} ujian={ujian} />
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* ===== ABSENSI (di-comment) =========================================

        Statistik absen bulan ini
        <Card
          title="Statistik Absensi Bulan Ini"
          subtitle={`Total ${stats.total} catatan absensi bulan ini`}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat
              label="Hadir"
              value={stats.hadir}
              tone="emerald"
              suffix={`(${persen(stats.hadir)}%)`}
            />
            <MiniStat
              label="Sakit"
              value={stats.sakit}
              tone="amber"
              suffix={`(${persen(stats.sakit)}%)`}
            />
            <MiniStat
              label="Izin"
              value={stats.izin}
              tone="sky"
              suffix={`(${persen(stats.izin)}%)`}
            />
            <MiniStat
              label="Alpha"
              value={stats.alpha}
              tone="rose"
              suffix={`(${persen(stats.alpha)}%)`}
            />
          </div>

          <div className="mt-4">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="bg-emerald-500"
                style={{ width: `${persen(stats.hadir)}%` }}
              />
              <div
                className="bg-amber-400"
                style={{ width: `${persen(stats.sakit)}%` }}
              />
              <div
                className="bg-sky-400"
                style={{ width: `${persen(stats.izin)}%` }}
              />
              <div
                className="bg-rose-400"
                style={{ width: `${persen(stats.alpha)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Persentase kehadiran bulan ini:{" "}
              <span
                className={`font-bold ${
                  stats.persenHadir >= 90
                    ? "text-emerald-600"
                    : stats.persenHadir >= 75
                      ? "text-amber-600"
                      : "text-rose-600"
                }`}
              >
                {stats.persenHadir}%
              </span>
            </p>
          </div>
        </Card>

        Chart panjang + shortcut bulan lalu
        <Card
          title="Riwayat Kehadiran"
          subtitle="Klik tab untuk melihat minggu ini, bulan ini, atau bulan lalu"
        >
          <AttendanceTrendChart
            weeklyData={weeklyTrend}
            monthlyData={monthlyTrend}
            lastMonthData={lastMonthTrend}
            viewMode={trendView}
            onViewChange={setTrendView}
          />
        </Card>

        Riwayat absensi terbaru
        <Card
          title="Riwayat Absensi Terbaru"
          subtitle="10 catatan absensi terakhir bulan ini"
        >
          {absensiBulanIni.length === 0 ? (
            <p className="text-sm text-slate-400">
              Belum ada data absensi bulan ini.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {absensiBulanIni.slice(0, 10).map((a) => {
                const meta = STATUS_META[a.status] || STATUS_META.none;
                const tgl = (a.tanggal || "").slice(0, 10);
                const d = tgl ? new Date(tgl + "T00:00:00") : null;
                const hariNama = d
                  ? d.toLocaleDateString("id-ID", { weekday: "long" })
                  : "-";
                const tanggalFull = d
                  ? d.toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "-";

                return (
                  <li
                    key={a.id}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold ${meta.bg} ${meta.text} ring-2 ${meta.ring}`}
                      >
                        {meta.emoji}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {hariNama}
                        </p>
                        <p className="text-xs text-slate-400">{tanggalFull}</p>
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        ===================================================================== */}
      </div>
    </div>
  );
}
