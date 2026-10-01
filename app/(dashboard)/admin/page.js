"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, getCurrentUser, isAuthenticated } from "@/lib/pocketbase";

const ALLOWED_ROLES = ["admin", "ict"];

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  return { start: fmt(start), end: fmt(end) };
}

function getGreetingByTime() {
  const now = new Date();
  const hours = now.getHours();

  if (hours >= 4 && hours < 11) {
    return "Selamat Pagi";
  } else if (hours >= 11 && hours < 15) {
    return "Selamat Siang";
  } else if (hours >= 15 && hours < 18) {
    return "Selamat Sore";
  } else {
    return "Selamat Malam";
  }
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  return { start: fmt(start), end: fmt(end) };
}

function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 7 hari terakhir
function last7Days() {
  const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const key = toISODate(d);
    days.push({
      key,
      label: HARI[d.getDay()],
      dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
      start: `${key} 00:00:00`,
      end: `${toISODate(end)} 00:00:00`,
    });
  }
  return days;
}

// Tanggal 1 s/d akhir bulan berjalan
function monthBuckets() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days = [];
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
  for (let i = 1; i <= lastDay; i++) {
    const d = new Date(year, month, i);
    const next = new Date(year, month, i + 1);
    const key = toISODate(d);
    days.push({
      key,
      label: String(i),
      dateLabel: BULAN_SHORT[month],
      start: `${key} 00:00:00`,
      end: `${toISODate(next)} 00:00:00`,
    });
  }
  return days;
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
  return `${hari[now.getDay()]}, ${now.getDate()} ${
    bulan[now.getMonth()]
  } ${now.getFullYear()}`;
}

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

function StatusBadge({ ok }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
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
      {ok ? "Sudah" : "Belum"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Chart produktivitas dengan toggle minggu / bulan
// Metrik utama: rata-rata kehadiran siswa (%)
// Pembanding:   persentase kelas yang mengisi agenda (%)
// ---------------------------------------------------------------------------
function TrendBarChart({ weeklyData, monthlyData, viewMode, onViewChange }) {
  const data = viewMode === "weekly" ? weeklyData : monthlyData;
  const isMonthly = viewMode === "monthly";

  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-400">Belum ada data.</p>;
  }

  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.kehadiranPersen, d.agendaPersen]),
  );

  // Ringkasan periode
  const withData = data.filter((d) => d.totalAbsensi > 0);
  const n = withData.length || 1;
  const avgKehadiran = withData.reduce((s, d) => s + d.kehadiranPersen, 0) / n;
  const withAgenda = data.filter((d) => d.totalKelas > 0);
  const nAgenda = withAgenda.length || 1;
  const avgAgenda =
    withAgenda.reduce((s, d) => s + d.agendaPersen, 0) / nAgenda;

  const barMinWidth = isMonthly ? 26 : 38;

  return (
    <div>
      {/* Toggle + Legend */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
            Rata-rata Kehadiran Siswa (%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
            Kelas Sudah Isi Agenda (%)
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
            Minggu Ini
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
            Bulan Ini
          </button>
        </div>
      </div>

      {/* Ringkasan — grid 2x2 di mobile, 4 kolom di desktop */}
      <div className="mb-5 grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-4 sm:gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Kehadiran
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-indigo-600 sm:text-xl">
            {avgKehadiran.toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-400">
            {isMonthly ? "bulan ini" : "7 hari terakhir"}
          </p>
        </div>
        <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-3">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Agenda Terisi
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-emerald-600 sm:text-xl">
            {avgAgenda.toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-400">kelas / hari</p>
        </div>
        <div className="min-w-0 border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:border-slate-200 sm:pl-3 sm:pt-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Hari Absensi
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-slate-700 sm:text-xl">
            {withData.length}
          </p>
          <p className="text-[10px] text-slate-400">hari tercatat</p>
        </div>
        <div className="min-w-0 border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:border-slate-200 sm:pl-3 sm:pt-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            Hari Agenda
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-slate-700 sm:text-xl">
            {withAgenda.length}
          </p>
          <p className="text-[10px] text-slate-400">hari tercatat</p>
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
                      (d.kehadiranPersen / maxVal) * 100,
                      d.kehadiranPersen > 0 ? 4 : 0,
                    )}%`,
                  }}
                  title={
                    d.totalAbsensi > 0
                      ? `Kehadiran ${d.label}: ${d.kehadiranPersen}% (${d.hadir}/${d.totalAbsensi})`
                      : `Kehadiran ${d.label}: belum ada data`
                  }
                />
                <div
                  className="w-1/2 max-w-[14px] rounded-t-md bg-emerald-400 transition-all"
                  style={{
                    height: `${Math.max(
                      (d.agendaPersen / maxVal) * 100,
                      d.agendaPersen > 0 ? 4 : 0,
                    )}%`,
                  }}
                  title={
                    d.totalKelas > 0
                      ? `Agenda ${d.label}: ${d.agendaPersen}% (${d.kelasAgenda}/${d.totalKelas} kelas)`
                      : `Agenda ${d.label}: belum ada data`
                  }
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
export default function OverviewAdminPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [admin, setAdmin] = useState(null);
  const [totalSiswa, setTotalSiswa] = useState(0);
  const [totalKelas, setTotalKelas] = useState(0);

  const [statusAbsensiPerKelas, setStatusAbsensiPerKelas] = useState([]);
  const [statusAgendaPerKelas, setStatusAgendaPerKelas] = useState([]);
  const [rankingKehadiran, setRankingKehadiran] = useState([]);

  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [trendView, setTrendView] = useState("weekly");

  // Cek autentikasi & role
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

    setAdmin(currentUser);
    setAuthChecked(true);
  }, [router]);

  // Ambil data dashboard
  useEffect(() => {
    if (!authChecked || unauthorized || !admin) return;

    let isMounted = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setErrorMsg("");

        // Data dasar
        const semuaKelas = await pb.collection("kelas").getFullList();
        const semuaSiswa = await pb.collection("siswa").getFullList();

        if (isMounted) {
          setTotalKelas(semuaKelas.length);
          setTotalSiswa(semuaSiswa.length);
        }

        const { start: todayStart, end: todayEnd } = todayRange();
        const { start: monthStart, end: monthEnd } = monthRange();

        // Absensi hari ini
        const absensiHariIni = await pb.collection("absensi").getFullList({
          filter: `tanggal>="${todayStart}" && tanggal<"${todayEnd}"`,
        });
        const kelasSudahAbsenSet = new Set(
          absensiHariIni.map((a) =>
            Array.isArray(a.kelas_id) ? a.kelas_id[0] : a.kelas_id,
          ),
        );
        const statusAbsensi = semuaKelas
          .map((k) => ({ kelas: k, sudah: kelasSudahAbsenSet.has(k.id) }))
          .sort((a, b) => Number(a.sudah) - Number(b.sudah));
        if (isMounted) setStatusAbsensiPerKelas(statusAbsensi);

        // Agenda hari ini
        const agendaHariIni = await pb
          .collection("agenda_mengajar")
          .getFullList({
            filter: `date>="${todayStart}" && date<"${todayEnd}"`,
          });
        const kelasSudahAgendaSet = new Set(
          agendaHariIni.map((a) =>
            Array.isArray(a.kelas_id) ? a.kelas_id[0] : a.kelas_id,
          ),
        );
        const statusAgenda = semuaKelas
          .map((k) => ({ kelas: k, sudah: kelasSudahAgendaSet.has(k.id) }))
          .sort((a, b) => Number(a.sudah) - Number(b.sudah));
        if (isMounted) setStatusAgendaPerKelas(statusAgenda);

        // Rekap kehadiran bulan ini
        const absensiBulanIni = await pb.collection("absensi").getFullList({
          filter: `tanggal>="${monthStart}" && tanggal<"${monthEnd}"`,
        });
        const rekapPerKelas = {};
        semuaKelas.forEach((k) => {
          rekapPerKelas[k.id] = { kelas: k, hadir: 0, total: 0 };
        });
        absensiBulanIni.forEach((a) => {
          const kid = Array.isArray(a.kelas_id) ? a.kelas_id[0] : a.kelas_id;
          if (!rekapPerKelas[kid]) return;
          rekapPerKelas[kid].total += 1;
          if (a.status === "hadir") rekapPerKelas[kid].hadir += 1;
        });
        const rankingHitung = Object.values(rekapPerKelas)
          .map((r) => ({
            ...r,
            persen: r.total > 0 ? Math.round((r.hadir / r.total) * 100) : 0,
          }))
          .sort((a, b) => b.persen - a.persen);
        if (isMounted) setRankingKehadiran(rankingHitung);

        // === Trend: minggu ini & bulan ini ===
        const weekly = last7Days();
        const monthly = monthBuckets();
        const totalKelasAktif = semuaKelas.length || 1;

        // Rentang gabungan (supaya 1x query saja)
        const rangeStart =
          weekly[0].start < monthly[0].start
            ? weekly[0].start
            : monthly[0].start;
        const rangeEnd =
          weekly[weekly.length - 1].end > monthly[monthly.length - 1].end
            ? weekly[weekly.length - 1].end
            : monthly[monthly.length - 1].end;

        const [absensiRange, agendaRange] = await Promise.all([
          pb.collection("absensi").getFullList({
            filter: `tanggal>="${rangeStart}" && tanggal<"${rangeEnd}"`,
          }),
          pb.collection("agenda_mengajar").getFullList({
            filter: `date>="${rangeStart}" && date<"${rangeEnd}"`,
          }),
        ]);

        // Bucket absensi per tanggal: { hadir, total }
        const absensiByDate = {};
        absensiRange.forEach((a) => {
          const key = (a.tanggal || "").slice(0, 10);
          if (!key) return;
          if (!absensiByDate[key]) absensiByDate[key] = { hadir: 0, total: 0 };
          absensiByDate[key].total += 1;
          if (a.status === "hadir") absensiByDate[key].hadir += 1;
        });

        // Bucket agenda per tanggal: Set(kelas_id)
        const agendaByDate = {};
        agendaRange.forEach((a) => {
          const key = (a.date || "").slice(0, 10);
          const kid = Array.isArray(a.kelas_id) ? a.kelas_id[0] : a.kelas_id;
          if (!key || !kid) return;
          if (!agendaByDate[key]) agendaByDate[key] = new Set();
          agendaByDate[key].add(kid);
        });

        function buildTrend(buckets) {
          return buckets.map((b) => {
            const abs = absensiByDate[b.key] || { hadir: 0, total: 0 };
            const kehadiranPersen =
              abs.total > 0 ? Math.round((abs.hadir / abs.total) * 100) : 0;

            const agendaSet = agendaByDate[b.key] || new Set();
            const agendaPersen = Math.round(
              (agendaSet.size / totalKelasAktif) * 100,
            );

            return {
              key: b.key,
              label: b.label,
              dateLabel: b.dateLabel,
              hadir: abs.hadir,
              totalAbsensi: abs.total,
              kehadiranPersen,
              kelasAgenda: agendaSet.size,
              totalKelas: totalKelasAktif,
              agendaPersen,
            };
          });
        }

        if (isMounted) {
          setWeeklyTrend(buildTrend(weekly));
          setMonthlyTrend(buildTrend(monthly));
        }

        if (isMounted) setLoading(false);
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
  }, [authChecked, unauthorized, admin]);

  const kelasBelumAbsensi = statusAbsensiPerKelas.filter((s) => !s.sudah);
  const kelasBelumAgenda = statusAgendaPerKelas.filter((s) => !s.sudah);
  const jumlahSudahAbsensi =
    statusAbsensiPerKelas.length - kelasBelumAbsensi.length;
  const jumlahSudahAgenda =
    statusAgendaPerKelas.length - kelasBelumAgenda.length;

  const rankingValid = rankingKehadiran.filter((r) => r.total > 0);
  const kelasTerbaik = rankingValid[0] || null;
  const kelasTerendah = rankingValid[rankingValid.length - 1] || null;

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
          <p className="text-sm text-slate-500">Memuat data sekolah...</p>
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
      {/* Header */}
      <div className="border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
            {hariIndo()}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {getGreetingByTime()} {admin?.nama_lengkap || "Guru"} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ringkasan aktivitas sekolah hari ini
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Ringkasan angka */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-xs font-medium text-slate-400">Total Siswa</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalSiswa}
            </p>
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">Total Kelas</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalKelas}
            </p>
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Kelas Sudah Absensi
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {jumlahSudahAbsensi}
              <span className="ml-1 text-sm font-normal text-slate-400">
                / {totalKelas}
              </span>
            </p>
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Kelas Sudah Isi Agenda
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {jumlahSudahAgenda}
              <span className="ml-1 text-sm font-normal text-slate-400">
                / {totalKelas}
              </span>
            </p>
          </Card>
        </div>

        {/* Statistik Produktivitas (Chart) */}
        <Card
          title="Statistik Produktivitas"
          subtitle="Rata-rata kehadiran siswa dibandingkan kelas yang sudah mengisi agenda"
        >
          {weeklyTrend.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada data.</p>
          ) : (
            <TrendBarChart
              weeklyData={weeklyTrend}
              monthlyData={monthlyTrend}
              viewMode={trendView}
              onViewChange={setTrendView}
            />
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Status absensi per kelas */}
          <Card
            title="Status Absensi Hari Ini"
            subtitle="Kelas yang belum mengisi absensi ditampilkan lebih dulu"
          >
            {statusAbsensiPerKelas.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada data kelas.</p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {statusAbsensiPerKelas.map((s) => (
                  <li
                    key={s.kelas.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50"
                  >
                    <span className="truncate text-sm text-slate-700">
                      {s.kelas.nama_kelas}
                    </span>
                    <StatusBadge ok={s.sudah} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Status agenda per kelas */}
          <Card
            title="Status Agenda Mengajar Hari Ini"
            subtitle="Kelas yang belum mengisi agenda ditampilkan lebih dulu"
          >
            {statusAgendaPerKelas.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada data kelas.</p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {statusAgendaPerKelas.map((s) => (
                  <li
                    key={s.kelas.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50"
                  >
                    <span className="truncate text-sm text-slate-700">
                      {s.kelas.nama_kelas}
                    </span>
                    <StatusBadge ok={s.sudah} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Kelas terbaik & terendah */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card
            title="Kelas dengan Kehadiran Terbaik"
            subtitle="Persentase hadir bulan ini"
          >
            {kelasTerbaik ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    {kelasTerbaik.kelas.nama_kelas}
                  </p>
                  <p className="text-xs text-slate-400">
                    {kelasTerbaik.hadir}/{kelasTerbaik.total} kehadiran tercatat
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-lg font-bold text-emerald-700 ring-1 ring-emerald-200">
                  {kelasTerbaik.persen}%
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Belum ada data absensi bulan ini.
              </p>
            )}
          </Card>

          <Card
            title="Kelas dengan Kehadiran Terendah"
            subtitle="Persentase hadir bulan ini"
          >
            {kelasTerendah ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    {kelasTerendah.kelas.nama_kelas}
                  </p>
                  <p className="text-xs text-slate-400">
                    {kelasTerendah.hadir}/{kelasTerendah.total} kehadiran
                    tercatat
                  </p>
                </div>
                <span className="rounded-full bg-rose-50 px-3 py-1.5 text-lg font-bold text-rose-700 ring-1 ring-rose-200">
                  {kelasTerendah.persen}%
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Belum ada data absensi bulan ini.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
