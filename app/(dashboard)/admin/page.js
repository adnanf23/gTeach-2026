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

export default function OverviewAdminPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [admin, setAdmin] = useState(null);
  const [totalSiswa, setTotalSiswa] = useState(0);
  const [totalKelas, setTotalKelas] = useState(0);

  const [statusAbsensiPerKelas, setStatusAbsensiPerKelas] = useState([]); // [{kelas, sudah}]
  const [statusAgendaPerKelas, setStatusAgendaPerKelas] = useState([]); // [{kelas, sudah}]
  const [rankingKehadiran, setRankingKehadiran] = useState([]); // [{kelas, persen}]

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

  // Ambil data dashboard setelah auth lolos
  useEffect(() => {
    if (!authChecked || unauthorized || !admin) return;

    let isMounted = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setErrorMsg("");

        // Data dasar: semua kelas & semua siswa
        const semuaKelas = await pb.collection("kelas").getFullList();
        const semuaSiswa = await pb.collection("siswa").getFullList();

        if (isMounted) {
          setTotalKelas(semuaKelas.length);
          setTotalSiswa(semuaSiswa.length);
        }

        const { start: todayStart, end: todayEnd } = todayRange();
        const { start: monthStart, end: monthEnd } = monthRange();

        // Absensi hari ini -> kelas mana yang sudah/belum diisi
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

        // Agenda mengajar hari ini -> kelas mana yang sudah/belum diisi
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

        // Rekap kehadiran bulan ini per kelas -> ranking terbaik & terendah
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
