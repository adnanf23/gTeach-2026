"use client";

import { getGuruMapelDashboard } from "@/actions/guru-mapel.action";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, isAuthenticated } from "@/lib/pocketbase";

const ALLOWED_ROLES = ["guru mapel", "admin", "ict"];

// ---------------------------------------------------------------------------
// Helper tanggal
// ---------------------------------------------------------------------------
const HARI_KEY = [
  "minggu",
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
];
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
const HARI_PANJANG = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
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
function hariIndo(date = new Date()) {
  return `${HARI_PANJANG[date.getDay()]}, ${date.getDate()} ${
    BULAN[date.getMonth()]
  } ${date.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Komponen kecil UI
// ---------------------------------------------------------------------------
function Card({ title, subtitle, children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {title && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function Avatar({ name }) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
      {initials}
    </div>
  );
}

function StatusPill({ ok, yesLabel, noLabel, neutral, neutralLabel }) {
  if (neutral) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600 ring-1 ring-slate-200">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {neutralLabel}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        ok
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          ok ? "bg-emerald-500" : "bg-rose-500"
        }`}
      />
      {ok ? yesLabel : noLabel}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Chart: agenda mengajar Anda vs rata-rata per guru sekolah
// ---------------------------------------------------------------------------
function AgendaTrendChart({ weeklyData, monthlyData, viewMode, onViewChange }) {
  const data = viewMode === "weekly" ? weeklyData : monthlyData;
  const isMonthly = viewMode === "monthly";

  if (!data || data.length === 0) return null;

  const maxVal = Math.max(1, ...data.flatMap((d) => [d.saya, d.avg]));

  const n = data.length || 1;
  const sumSaya = data.reduce((s, d) => s + d.saya, 0);
  const sumSekolah = data.reduce((s, d) => s + d.avg, 0);
  const avgSaya = sumSaya / n;
  const avgSekolah = sumSekolah / n;
  const diff = avgSaya - avgSekolah;

  const barMinWidth = isMonthly ? 26 : 38;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
            Agenda Anda
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
            Rata-rata Agenda / Guru di Sekolah
          </span>
        </div>
        <div className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => onViewChange("weekly")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              viewMode === "weekly"
                ? "bg-indigo-500 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Per Minggu
          </button>
          <button
            type="button"
            onClick={() => onViewChange("monthly")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              viewMode === "monthly"
                ? "bg-indigo-500 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Per Bulan
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-4 sm:gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Agenda Anda
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-indigo-600 sm:text-xl">
            {avgSaya.toFixed(1)}
          </p>
          <p className="text-[10px] text-slate-400">agenda / hari</p>
        </div>
        <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-3">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Rata-rata Sekolah
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-slate-700 sm:text-xl">
            {avgSekolah.toFixed(1)}
          </p>
          <p className="text-[10px] text-slate-400">agenda / guru / hari</p>
        </div>
        <div className="min-w-0 border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:border-slate-200 sm:pl-3 sm:pt-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Selisih
          </p>
          <p
            className={`mt-0.5 text-lg font-bold leading-tight sm:text-xl ${
              diff >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {diff >= 0 ? "+" : ""}
            {diff.toFixed(1)}
          </p>
          <p className="text-[10px] text-slate-400">
            {diff >= 0 ? "di atas rata-rata" : "di bawah rata-rata"}
          </p>
        </div>
        <div className="min-w-0 border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:border-slate-200 sm:pl-3 sm:pt-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Total Agenda
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-slate-700 sm:text-xl">
            {sumSaya}
          </p>
          <p className="text-[10px] text-slate-400">
            {isMonthly ? "bulan ini" : "7 hari terakhir"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          className="flex items-end gap-1.5 sm:gap-3"
          style={{ minWidth: `${data.length * barMinWidth}px` }}
        >
          {data.map((d) => (
            <div
              key={d.key}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-40 w-full items-end justify-center gap-0.5">
                <div
                  className="w-1/2 max-w-[14px] rounded-t-md bg-indigo-500 transition-all"
                  style={{
                    height: `${Math.max(
                      (d.saya / maxVal) * 100,
                      d.saya > 0 ? 4 : 0,
                    )}%`,
                  }}
                  title={`Agenda Anda (${d.label}): ${d.saya}`}
                />
                <div
                  className="w-1/2 max-w-[14px] rounded-t-md bg-slate-300 transition-all"
                  style={{
                    height: `${Math.max(
                      (d.avg / maxVal) * 100,
                      d.avg > 0 ? 4 : 0,
                    )}%`,
                  }}
                  title={`Rata-rata sekolah (${d.label}): ${d.avg.toFixed(
                    1,
                  )} agenda/guru`}
                />
              </div>
              <div className="text-center leading-tight">
                <p className="text-[10px] font-medium text-slate-500">
                  {d.label}
                </p>
                {!isMonthly && (
                  <p className="text-[9px] text-slate-300">{d.dateLabel}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Halaman utama
// ---------------------------------------------------------------------------
export default function OverviewGuruMapelPage() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);

  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [guru, setGuru] = useState(null);
  const [hariLiburList, setHariLiburList] = useState([]);

  const [jumlahKelas, setJumlahKelas] = useState(0);
  const [jumlahMapel, setJumlahMapel] = useState(0);
  const [jumlahSiswa, setJumlahSiswa] = useState(0);

  const [jadwalHariIni, setJadwalHariIni] = useState([]);
  const [agendaHariIni, setAgendaHariIni] = useState([]);

  const [rankingSiswa, setRankingSiswa] = useState([]);
  const [rataRataPerMapel, setRataRataPerMapel] = useState([]);

  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [trendView, setTrendView] = useState("weekly");

  // Cek auth
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!isAuthenticated() || !currentUser) {
      router.push("/login");
      return;
    }
    if (!ALLOWED_ROLES.includes(currentUser.role)) {
      setUnauthorized(true);
      setAuthChecked(true);
      setLoading(false);
      return;
    }
    setGuru(currentUser);
    setAuthChecked(true);
  }, [router]);

  // Load dashboard
  useEffect(() => {
    if (!authChecked || unauthorized || !guru) return;
    let isMounted = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setErrorMsg("");

        // Seluruh pengambilan data + agregasi dilakukan di server action.
        const res = await getGuruMapelDashboard({
          userId: guru.id,
          todayIso: toISODate(today),
        });
        if (!isMounted) return;

        if (res.error) {
          setErrorMsg(res.error);
          setLoading(false);
          return;
        }

        setHariLiburList(res.hariLiburList);
        setJadwalHariIni(res.jadwalHariIni);
        setJumlahKelas(res.jumlahKelas);
        setJumlahMapel(res.jumlahMapel);
        setJumlahSiswa(res.jumlahSiswa);
        setAgendaHariIni(res.agendaHariIni);
        setRankingSiswa(res.rankingSiswa);
        setRataRataPerMapel(res.rataRataPerMapel);
        setWeeklyTrend(res.weeklyTrend);
        setMonthlyTrend(res.monthlyTrend);
        setLoading(false);
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setErrorMsg(
            "Terjadi kesalahan saat memuat data dashboard. Coba muat ulang halaman.",
          );
          setLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized, guru, today]);

  const todayIsWorkday = useMemo(() => {
    if (isWeekend(today)) return false;
    if (isHoliday(today, hariLiburList)) return false;
    return true;
  }, [today, hariLiburList]);

  const totalJadwalHariIni = jadwalHariIni.length;
  const sudahAgendaHariIni = agendaHariIni.length > 0;
  const agendaHariIniLengkap =
    totalJadwalHariIni === 0 || agendaHariIni.length >= totalJadwalHariIni;

  function getGreetingByTime() {
    const hours = new Date().getHours();
    if (hours >= 4 && hours < 11) return "Selamat Pagi";
    if (hours >= 11 && hours < 15) return "Selamat Siang";
    if (hours >= 15 && hours < 18) return "Selamat Sore";
    return "Selamat Malam";
  }

  const top5 = rankingSiswa.slice(0, 5);
  const bottom5 =
    rankingSiswa.length > 0 ? [...rankingSiswa].slice(-5).reverse() : [];

  const nilaiTertinggi = rankingSiswa[0] || null;
  const nilaiTerendah =
    rankingSiswa.length > 0 ? rankingSiswa[rankingSiswa.length - 1] : null;

  // ---------------------------------------------------------------------
  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-medium text-amber-700">
            Anda tidak memiliki akses ke halaman ini.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-slate-500">Memuat data mengajar...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-medium text-rose-700">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
            {hariIndo()}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {getGreetingByTime()}, {guru?.nama_lengkap || "Guru"} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Guru Mata Pelajaran &middot; {jumlahMapel} mapel &middot;{" "}
            {jumlahKelas} kelas &middot; {jumlahSiswa} siswa
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Peringatan / status agenda hari ini */}
        {todayIsWorkday && totalJadwalHariIni > 0 && !agendaHariIniLengkap && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
              !
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-800">
                Agenda mengajar hari ini belum lengkap
              </p>
              <p className="mt-0.5 text-xs text-rose-700">
                Anda memiliki {totalJadwalHariIni} jadwal mengajar hari ini,
                tetapi baru {agendaHariIni.length} agenda yang diisi. Segera
                lengkapi di halaman{" "}
                <span className="font-semibold">Agenda Mengajar</span>.
              </p>
            </div>
          </div>
        )}

        {todayIsWorkday && totalJadwalHariIni > 0 && agendaHariIniLengkap && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
              ✓
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-800">
                Semua agenda mengajar hari ini sudah diisi 🎉
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                {agendaHariIni.length} agenda tercatat dari {totalJadwalHariIni}{" "}
                jadwal mengajar hari ini.
              </p>
            </div>
          </div>
        )}

        {/* BARIS 1 — Ringkasan */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-xs font-medium text-slate-400">
              Kelas yang Diajar
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {jumlahKelas}
            </p>
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Mata Pelajaran Diampu
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {jumlahMapel}
            </p>
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Agenda Mengajar Hari Ini
            </p>
            <div className="mt-2">
              {!todayIsWorkday ? (
                <StatusPill
                  neutral
                  neutralLabel={isWeekend(today) ? "Akhir pekan" : "Hari libur"}
                />
              ) : totalJadwalHariIni === 0 ? (
                <StatusPill neutral neutralLabel="Tidak ada jadwal" />
              ) : (
                <StatusPill
                  ok={agendaHariIniLengkap}
                  yesLabel="Lengkap"
                  noLabel={sudahAgendaHariIni ? "Belum lengkap" : "Belum diisi"}
                />
              )}
            </div>
            {todayIsWorkday && totalJadwalHariIni > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                {agendaHariIni.length} dari {totalJadwalHariIni} jadwal
              </p>
            )}
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Nilai Rata-rata Tertinggi
            </p>
            {nilaiTertinggi ? (
              <>
                <p className="mt-2 truncate text-lg font-bold text-slate-900">
                  {nilaiTertinggi.siswa?.nama_siswa || "-"}
                </p>
                <p className="text-xs font-semibold text-emerald-600">
                  Rata-rata {nilaiTertinggi.rataRata}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Belum ada data</p>
            )}
          </Card>
        </div>

        {/* BARIS 2 — Chart agenda mengajar */}
        <Card
          title="Statistik Agenda Mengajar"
          subtitle="Jumlah agenda yang Anda isi dibandingkan rata-rata per guru di sekolah"
        >
          {weeklyTrend.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada data.</p>
          ) : (
            <AgendaTrendChart
              weeklyData={weeklyTrend}
              monthlyData={monthlyTrend}
              viewMode={trendView}
              onViewChange={setTrendView}
            />
          )}
        </Card>

        {/* BARIS 3 — Siswa nilai tertinggi & perlu perhatian */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title="Siswa Nilai Tertinggi"
            subtitle="Rata-rata nilai tertinggi (formatif, sumatif, ujian) pada mapel yang Anda ajar"
          >
            {top5.length === 0 ? (
              <p className="text-sm text-slate-400">
                Belum ada nilai untuk mapel yang Anda ajar.
              </p>
            ) : (
              <ul className="space-y-3">
                {top5.map((r, i) => (
                  <li key={r.siswa.id} className="flex items-center gap-3">
                    <span className="w-5 text-center text-xs font-semibold text-slate-400">
                      {i + 1}
                    </span>
                    <Avatar name={r.siswa.nama_siswa} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {r.siswa.nama_siswa}
                      </p>
                      <p className="text-xs text-slate-400">
                        {r.jumlahNilai} nilai tercatat
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {r.rataRata}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Perlu Perhatian"
            subtitle="Rata-rata nilai terendah pada mapel yang Anda ajar"
          >
            {bottom5.length === 0 ? (
              <p className="text-sm text-slate-400">
                Belum ada nilai untuk mapel yang Anda ajar.
              </p>
            ) : (
              <ul className="space-y-3">
                {bottom5.map((r) => (
                  <li key={r.siswa.id} className="flex items-center gap-3">
                    <Avatar name={r.siswa.nama_siswa} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {r.siswa.nama_siswa}
                      </p>
                      <p className="text-xs text-slate-400">
                        {r.jumlahNilai} nilai tercatat
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                      {r.rataRata}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* BARIS 4 — Nilai siswa tertinggi / terendah */}
        <Card
          title="Rata-rata Nilai Siswa"
          subtitle="Dihitung dari rata-rata seluruh nilai (formatif, sumatif, ujian) per siswa pada mapel yang Anda ajar"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] font-medium text-emerald-600">
                Siswa Rata-rata Tertinggi
              </p>
              {nilaiTertinggi ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <Avatar name={nilaiTertinggi.siswa?.nama_siswa} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-semibold leading-tight text-slate-800">
                      {nilaiTertinggi.siswa?.nama_siswa || "-"}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Dari {nilaiTertinggi.jumlahNilai} nilai tercatat
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-bold text-emerald-600">
                    {nilaiTertinggi.rataRata.toFixed(1)}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Belum ada data</p>
              )}
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-[11px] font-medium text-rose-600">
                Siswa Rata-rata Terendah
              </p>
              {nilaiTerendah ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <Avatar name={nilaiTerendah.siswa?.nama_siswa} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-semibold leading-tight text-slate-800">
                      {nilaiTerendah.siswa?.nama_siswa || "-"}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Dari {nilaiTerendah.jumlahNilai} nilai tercatat
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-bold text-rose-600">
                    {nilaiTerendah.rataRata.toFixed(1)}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Belum ada data</p>
              )}
            </div>
          </div>
        </Card>

        {/* BARIS 5 — Rata-rata nilai per mapel */}
        <Card
          title="Rata-rata Nilai per Mata Pelajaran"
          subtitle="Diurutkan dari yang tertinggi, berdasarkan seluruh nilai (formatif, sumatif, ujian) yang Anda input"
        >
          {rataRataPerMapel.length === 0 ? (
            <p className="text-sm text-slate-400">
              Belum ada nilai untuk mapel yang Anda ajar.
            </p>
          ) : (
            <ul className="space-y-2">
              {rataRataPerMapel.map((r, i) => {
                const isTertinggi = i === 0;
                return (
                  <li
                    key={r.mapel.id}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                      isTertinggi ? "bg-emerald-50 ring-1 ring-emerald-200" : ""
                    }`}
                  >
                    <span
                      className={`w-6 text-center text-xs font-semibold ${
                        isTertinggi ? "text-emerald-600" : "text-slate-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm ${
                          isTertinggi
                            ? "font-semibold text-emerald-700"
                            : "text-slate-700"
                        }`}
                      >
                        {r.mapel?.nama_mapel || "-"}
                        {isTertinggi && " (Tertinggi)"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {r.jumlahNilai} nilai tercatat
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            isTertinggi ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                          style={{ width: `${Math.min(r.rataRata, 100)}%` }}
                        />
                      </div>
                      <span
                        className={`w-10 text-right text-xs font-semibold ${
                          isTertinggi ? "text-emerald-700" : "text-slate-600"
                        }`}
                      >
                        {r.rataRata}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
