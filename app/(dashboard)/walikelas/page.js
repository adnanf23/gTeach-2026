"use client";

import { getWalikelasDashboard } from "@/actions/walikelas.action";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, isAuthenticated } from "@/lib/pocketbase";

const ALLOWED_ROLES = ["guru walikelas", "guru pendamping", "admin", "ict"];

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
function formatShort(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}
// ---------------------------------------------------------------------------
// Komponen kecil UI
// ---------------------------------------------------------------------------
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

function Card({ title, subtitle, children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
            )}
          </div>
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

// ---------------------------------------------------------------------------
// Chart: kehadiran kelas Anda vs rata-rata per kelas sekolah
// Toggle: per minggu (7 hari) / per bulan (1..akhir bulan)
// ---------------------------------------------------------------------------
function KehadiranTrendChart({
  weeklyData,
  monthlyData,
  viewMode,
  onViewChange,
}) {
  const data = viewMode === "weekly" ? weeklyData : monthlyData;
  const isMonthly = viewMode === "monthly";

  if (!data || data.length === 0) return null;

  const maxVal = Math.max(1, ...data.flatMap((d) => [d.hadirSaya, d.hadirAvg]));

  // Ringkasan
  const n = data.length || 1;
  const sumSaya = data.reduce((s, d) => s + d.hadirSaya, 0);
  const sumSekolah = data.reduce((s, d) => s + d.hadirAvg, 0);
  const avgSaya = sumSaya / n;
  const avgSekolah = sumSekolah / n;
  const diff = avgSaya - avgSekolah;

  const barMinWidth = isMonthly ? 26 : 38;

  return (
    <div>
      {/* Toggle + Legend */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
            Siswa Hadir — Kelas Anda
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
            Rata-rata Siswa Hadir / Kelas di Sekolah
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

      {/* Ringkasan — grid 2x2 di mobile, 4 kolom di desktop */}
      <div className="mb-5 grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-4 sm:gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Kelas Anda
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-indigo-600 sm:text-xl">
            {avgSaya.toFixed(1)}
          </p>
          <p className="text-[10px] text-slate-400">siswa hadir / hari</p>
        </div>
        <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-3">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Rata-rata Sekolah
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-slate-700 sm:text-xl">
            {avgSekolah.toFixed(1)}
          </p>
          <p className="text-[10px] text-slate-400">siswa / kelas / hari</p>
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
            Total Kehadiran
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-slate-700 sm:text-xl">
            {sumSaya}
          </p>
          <p className="text-[10px] text-slate-400">
            {isMonthly ? "bulan ini" : "7 hari terakhir"}
          </p>
        </div>
      </div>

      {/* Chart — selalu bisa discroll horizontal */}
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
                      (d.hadirSaya / maxVal) * 100,
                      d.hadirSaya > 0 ? 4 : 0,
                    )}%`,
                  }}
                  title={`Kelas Anda (${d.label}): ${d.hadirSaya} siswa hadir`}
                />
                <div
                  className="w-1/2 max-w-[14px] rounded-t-md bg-slate-300 transition-all"
                  style={{
                    height: `${Math.max(
                      (d.hadirAvg / maxVal) * 100,
                      d.hadirAvg > 0 ? 4 : 0,
                    )}%`,
                  }}
                  title={`Rata-rata sekolah (${d.label}): ${d.hadirAvg.toFixed(
                    1,
                  )} siswa/kelas`}
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
export default function OverviewWaliKelasPage() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);

  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [guru, setGuru] = useState(null);
  const [kelas, setKelas] = useState(null);
  const [totalSiswa, setTotalSiswa] = useState(0);

  const [hariLiburList, setHariLiburList] = useState([]);

  const [absensiHariIni, setAbsensiHariIni] = useState([]);
  const [agendaHariIni, setAgendaHariIni] = useState([]);

  const [periodeMulai, setPeriodeMulai] = useState(null);
  const [periodeLabel, setPeriodeLabel] = useState("");
  const [incompleteDaysPeriode, setIncompleteDaysPeriode] = useState([]);
  const [totalHariKerjaPeriode, setTotalHariKerjaPeriode] = useState(0);

  const [rankingSiswa, setRankingSiswa] = useState([]);
  const [rankingKelas, setRankingKelas] = useState([]);
  const [posisiKelasSaya, setPosisiKelasSaya] = useState(null);

  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [trendView, setTrendView] = useState("weekly");

  const [nilaiTertinggi, setNilaiTertinggi] = useState(null);
  const [nilaiTerendah, setNilaiTerendah] = useState(null);

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
        const res = await getWalikelasDashboard({
          userId: guru.id,
          todayIso: toISODate(today),
        });
        if (!isMounted) return;

        if (!res.found) {
          setErrorMsg(
            "Anda belum terdaftar sebagai wali kelas pada kelas manapun.",
          );
          setLoading(false);
          return;
        }

        setHariLiburList(res.hariLiburList);
        setKelas(res.kelas);
        setTotalSiswa(res.totalSiswa);
        setAbsensiHariIni(res.absensiHariIni);
        setAgendaHariIni(res.agendaHariIni);
        setPeriodeMulai(res.periodeMulai);
        setPeriodeLabel(res.periodeLabel);
        setIncompleteDaysPeriode(res.incompleteDaysPeriode);
        setTotalHariKerjaPeriode(res.totalHariKerjaPeriode);
        setRankingSiswa(res.rankingSiswa);
        setRankingKelas(res.rankingKelas);
        setPosisiKelasSaya(res.posisiKelasSaya);
        setWeeklyTrend(res.weeklyTrend);
        setMonthlyTrend(res.monthlyTrend);
        setNilaiTertinggi(res.nilaiTertinggi);
        setNilaiTerendah(res.nilaiTerendah);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, unauthorized, guru]);

  const todayIsWorkday = useMemo(() => {
    if (isWeekend(today)) return false;
    if (isHoliday(today, hariLiburList)) return false;
    return true;
  }, [today, hariLiburList]);

  const totalSiswaDiabsen = absensiHariIni.length;
  const absensiHariIniLengkap =
    !todayIsWorkday || (totalSiswa > 0 && totalSiswaDiabsen >= totalSiswa);
  const sudahAgendaHariIni = agendaHariIni.length > 0;

  function getGreetingByTime() {
    const hours = new Date().getHours();
    if (hours >= 4 && hours < 11) return "Selamat Pagi";
    if (hours >= 11 && hours < 15) return "Selamat Siang";
    if (hours >= 15 && hours < 18) return "Selamat Sore";
    return "Selamat Malam";
  }

  const top5Rajin = rankingSiswa.slice(0, 5);
  const bottom5 = [...rankingSiswa]
    .sort((a, b) => a.persen - b.persen || b.total - a.total)
    .filter((r) => r.total > 0)
    .slice(0, 5);

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
          <p className="text-sm text-slate-500">Memuat data kelas...</p>
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

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
            {hariIndo()}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {getGreetingByTime()}, {guru?.nama_lengkap || "Guru"} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {guru?.role}{" "}
            <span className="font-semibold text-slate-700">
              {kelas?.nama_kelas || "-"}
            </span>{" "}
            &middot; {totalSiswa} siswa
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Peringatan */}
        {totalSiswa > 0 && incompleteDaysPeriode.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
              !
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-800">
                Ada {incompleteDaysPeriode.length} hari pembelajaran yang belum
                diabsen lengkap
              </p>
              <p className="mt-0.5 text-xs text-rose-700">
                Periode {periodeLabel} · {formatShort(periodeMulai)} –{" "}
                {formatShort(toISODate(today))}. Sabtu, Minggu, dan hari libur
                tidak dihitung. Segera lengkapi di halaman{" "}
                <span className="font-semibold">Absensi</span>.
              </p>
            </div>
          </div>
        )}

        {totalSiswa > 0 &&
          totalHariKerjaPeriode > 0 &&
          incompleteDaysPeriode.length === 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                ✓
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">
                  Semua {totalHariKerjaPeriode} hari kerja sudah diabsen lengkap
                  🎉
                </p>
                <p className="mt-0.5 text-xs text-emerald-700">
                  Periode {periodeLabel} · {formatShort(periodeMulai)} –{" "}
                  {formatShort(toISODate(today))}.
                </p>
              </div>
            </div>
          )}

        {/* BARIS 1 — Ringkasan */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-xs font-medium text-slate-400">Total Siswa</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalSiswa}
            </p>
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Absensi Hari Ini
            </p>
            <div className="mt-2">
              {!todayIsWorkday ? (
                <StatusPill
                  neutral
                  neutralLabel={isWeekend(today) ? "Akhir pekan" : "Hari libur"}
                />
              ) : (
                <StatusPill
                  ok={absensiHariIniLengkap}
                  yesLabel="Lengkap"
                  noLabel={
                    totalSiswaDiabsen > 0 ? "Belum lengkap" : "Belum diisi"
                  }
                />
              )}
            </div>
            {todayIsWorkday && totalSiswaDiabsen > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                {totalSiswaDiabsen} dari {totalSiswa} siswa tercatat
              </p>
            )}
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Agenda Mengajar Hari Ini
            </p>
            <div className="mt-2">
              <StatusPill
                ok={sudahAgendaHariIni}
                yesLabel="Sudah diisi"
                noLabel="Belum diisi"
              />
            </div>
            {sudahAgendaHariIni && (
              <p className="mt-2 text-xs text-slate-400">
                {agendaHariIni.length} entri agenda tercatat
              </p>
            )}
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Peringkat Kehadiran Kelas
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {posisiKelasSaya ? `#${posisiKelasSaya}` : "-"}
              <span className="ml-1 text-sm font-normal text-slate-400">
                / {rankingKelas.length || 0} kelas
              </span>
            </p>
            {rankingKelas.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                Bulan ini · berbasis hari efektif
              </p>
            )}
          </Card>
        </div>

        {/* BARIS 2 — Chart kehadiran */}
        <Card
          title="Statistik Kehadiran Kelas"
          subtitle="Jumlah siswa hadir kelas Anda dibandingkan rata-rata per kelas di sekolah"
        >
          {weeklyTrend.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada data.</p>
          ) : (
            <KehadiranTrendChart
              weeklyData={weeklyTrend}
              monthlyData={monthlyTrend}
              viewMode={trendView}
              onViewChange={setTrendView}
            />
          )}
        </Card>

        {/* BARIS 3 — Siswa paling rajin & perlu perhatian */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title="Siswa Paling Rajin"
            subtitle="Persentase kehadiran bulan ini (berbasis hari efektif)"
          >
            {top5Rajin.length === 0 ? (
              <p className="text-sm text-slate-400">
                Belum ada data absensi bulan ini.
              </p>
            ) : (
              <ul className="space-y-3">
                {top5Rajin.map((r, i) => (
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
                        {r.hadir} hari hadir
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {r.persen}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Perlu Perhatian"
            subtitle="Persentase kehadiran terendah bulan ini"
          >
            {bottom5.length === 0 ? (
              <p className="text-sm text-slate-400">
                Belum ada data absensi bulan ini.
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
                        {r.hadir} hari hadir
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                      {r.persen}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* BARIS 4 — Rata-rata nilai akhir siswa */}
        <Card
          title="Rata-rata Nilai Akhir Siswa"
          subtitle="Berdasarkan rata-rata nilai akhir rapor seluruh mapel — sama dengan halaman Leger"
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
                      Dari {nilaiTertinggi.jumlahMapel} mapel
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
                      Dari {nilaiTerendah.jumlahMapel} mapel
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
      </div>
    </div>
  );
}
