"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { pb, getCurrentUser, isAuthenticated } from "@/lib/pocketbase";

const ALLOWED_ROLES = ["guru walikelas", "guru pendamping", "admin", "ict"];

// ---------------------------------------------------------------------------
// Helper kecil untuk tanggal
// ---------------------------------------------------------------------------
function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  return { start: fmt(start), end: fmt(end) };
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

// ---------------------------------------------------------------------------
// Komponen kecil UI
// ---------------------------------------------------------------------------
function StatusPill({ ok, yesLabel, noLabel }) {
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
// Halaman utama
// ---------------------------------------------------------------------------
export default function OverviewWaliKelasPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [guru, setGuru] = useState(null);
  const [kelas, setKelas] = useState(null);
  const [totalSiswa, setTotalSiswa] = useState(0);

  const [absensiHariIni, setAbsensiHariIni] = useState([]);
  const [agendaHariIni, setAgendaHariIni] = useState([]);

  const [rankingSiswa, setRankingSiswa] = useState([]); // [{siswa, hadir, total, persen}]
  const [rankingKelas, setRankingKelas] = useState([]); // [{kelas, persen}]
  const [posisiKelasSaya, setPosisiKelasSaya] = useState(null);

  const [nilaiTertinggi, setNilaiTertinggi] = useState(null);
  const [nilaiTerendah, setNilaiTerendah] = useState(null);

  // Cek autentikasi & role, sama seperti pola di halaman lain
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

  // Setelah auth lolos, baru ambil data dashboard
  useEffect(() => {
    if (!authChecked || unauthorized || !guru) return;

    let isMounted = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setErrorMsg("");

        const user = guru;

        // Ambil kelas yang diwalikan oleh guru ini
        const kelasSaya = await pb
          .collection("kelas")
          .getFirstListItem(
            `walikelas_id="${user.id}" || pendamping_id="${user.id}"`,
          )
          .catch(() => null);

        if (!kelasSaya) {
          setErrorMsg(
            "Anda belum terdaftar sebagai wali kelas pada kelas manapun.",
          );
          setLoading(false);
          return;
        }
        if (isMounted) setKelas(kelasSaya);

        // Data siswa di kelas saya
        const siswaKelasSaya = await pb.collection("siswa").getFullList({
          filter: `kelas_id="${kelasSaya.id}"`,
        });
        if (isMounted) setTotalSiswa(siswaKelasSaya.length);

        const { start: todayStart, end: todayEnd } = todayRange();
        const { start: monthStart, end: monthEnd } = monthRange();

        // Absensi hari ini untuk kelas saya (cek sudah/belum diisi)
        const absensiToday = await pb.collection("absensi").getFullList({
          filter: `kelas_id="${kelasSaya.id}" && tanggal>="${todayStart}" && tanggal<"${todayEnd}"`,
        });
        if (isMounted) setAbsensiHariIni(absensiToday);

        // Agenda mengajar hari ini untuk kelas saya (cek sudah/belum diisi)
        const agendaToday = await pb.collection("agenda_mengajar").getFullList({
          filter: `kelas_id="${kelasSaya.id}" && date>="${todayStart}" && date<"${todayEnd}"`,
        });
        if (isMounted) setAgendaHariIni(agendaToday);

        // 6) Rekap absensi bulan berjalan untuk kelas saya -> ranking siswa terajin
        const absensiBulanIni = await pb.collection("absensi").getFullList({
          filter: `kelas_id="${kelasSaya.id}" && tanggal>="${monthStart}" && tanggal<"${monthEnd}"`,
        });

        const rekapPerSiswa = {};
        siswaKelasSaya.forEach((s) => {
          rekapPerSiswa[s.id] = { siswa: s, hadir: 0, total: 0 };
        });
        absensiBulanIni.forEach((a) => {
          if (!rekapPerSiswa[a.siswa_id]) return;
          rekapPerSiswa[a.siswa_id].total += 1;
          if (a.status === "hadir") rekapPerSiswa[a.siswa_id].hadir += 1;
        });
        const rankingSiswaHitung = Object.values(rekapPerSiswa)
          .map((r) => ({
            ...r,
            persen: r.total > 0 ? Math.round((r.hadir / r.total) * 100) : 0,
          }))
          .sort((a, b) => b.persen - a.persen || b.hadir - a.hadir);
        if (isMounted) setRankingSiswa(rankingSiswaHitung);

        // Ranking kehadiran kelas saya vs semua kelas lain (bulan berjalan)
        const semuaKelas = await pb.collection("kelas").getFullList();

        const absensiSemuaKelas = await pb.collection("absensi").getFullList({
          filter: `tanggal>="${monthStart}" && tanggal<"${monthEnd}"`,
        });

        const rekapPerKelas = {};
        semuaKelas.forEach((k) => {
          rekapPerKelas[k.id] = { kelas: k, hadir: 0, total: 0 };
        });
        absensiSemuaKelas.forEach((a) => {
          const kid = Array.isArray(a.kelas_id) ? a.kelas_id[0] : a.kelas_id;
          if (!rekapPerKelas[kid]) return;
          rekapPerKelas[kid].total += 1;
          if (a.status === "hadir") rekapPerKelas[kid].hadir += 1;
        });

        const rankingKelasHitung = Object.values(rekapPerKelas)
          .map((r) => ({
            ...r,
            persen: r.total > 0 ? Math.round((r.hadir / r.total) * 100) : 0,
          }))
          .sort((a, b) => b.persen - a.persen);

        if (isMounted) {
          setRankingKelas(rankingKelasHitung);
          const idx = rankingKelasHitung.findIndex(
            (r) => r.kelas.id === kelasSaya.id,
          );
          setPosisiKelasSaya(idx >= 0 ? idx + 1 : null);
        }

        // Nilai tertinggi & terendah (nilai harian) untuk siswa di kelas saya
        const nilaiHarianKelas = await pb
          .collection("nilai_harian")
          .getFullList({
            filter: `kelas_id="${kelasSaya.id}"`,
            expand: "siswa_id,mapel_id",
          });

        if (isMounted && nilaiHarianKelas.length > 0) {
          const tertinggi = nilaiHarianKelas.reduce((max, n) =>
            n.nilai > max.nilai ? n : max,
          );
          const terendah = nilaiHarianKelas.reduce((min, n) =>
            n.nilai < min.nilai ? n : min,
          );
          setNilaiTertinggi(tertinggi);
          setNilaiTerendah(terendah);
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
  }, [authChecked, unauthorized, guru]);

  const siswaSudahDiabsen = useMemo(() => {
    const idTerdata = new Set(absensiHariIni.map((a) => a.siswa_id));
    return idTerdata.size;
  }, [absensiHariIni]);

  // Tambahkan fungsi untuk menentukan sapaan berdasarkan waktu
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

  const sudahAbsensiHariIni = absensiHariIni.length > 0;
  const sudahAgendaHariIni = agendaHariIni.length > 0;

  const top5Rajin = rankingSiswa.slice(0, 5);
  const bottom5 = [...rankingSiswa]
    .sort((a, b) => a.persen - b.persen || b.total - a.total)
    .filter((r) => r.total > 0)
    .slice(0, 5);

  // ---------------------------------------------------------------------
  // Belum selesai cek auth, atau redirect ke /login sedang berjalan
  // ---------------------------------------------------------------------
  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Role tidak diizinkan mengakses halaman ini
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------
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
  // Dashboard
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
        {/* Ringkasan status hari ini */}
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
              <StatusPill
                ok={sudahAbsensiHariIni}
                yesLabel="Sudah diisi"
                noLabel="Belum diisi"
              />
            </div>
            {sudahAbsensiHariIni && (
              <p className="mt-2 text-xs text-slate-400">
                {siswaSudahDiabsen} dari {totalSiswa} siswa tercatat
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
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Siswa terajin */}
          <Card
            title="Siswa Paling Rajin"
            subtitle="Berdasarkan persentase kehadiran bulan ini"
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
                        {r.hadir}/{r.total} hari hadir
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

          {/* Siswa perlu perhatian (kehadiran rendah) */}
          <Card
            title="Perlu Perhatian"
            subtitle="Siswa dengan persentase kehadiran terendah bulan ini"
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
                        {r.hadir}/{r.total} hari hadir
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Peringkat antar kelas */}
          <Card
            title="Peringkat Kehadiran Antar Kelas"
            subtitle="Persentase hadir bulan ini, dibandingkan seluruh kelas"
          >
            {rankingKelas.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada data absensi.</p>
            ) : (
              (() => {
                const dataKelasSaya = rankingKelas.find(
                  (r) => r.kelas.id === kelas?.id,
                );
                const persenKelasSaya = dataKelasSaya?.persen ?? 0;
                return (
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-4xl font-bold text-indigo-600">
                        #{posisiKelasSaya ?? "-"}
                      </p>
                      <p className="text-xs text-slate-400">
                        dari {rankingKelas.length} kelas
                      </p>
                    </div>
                    <div className="h-10 w-px bg-slate-200" />
                    <div className="flex-1">
                      <p className="text-2xl font-bold text-slate-800">
                        {persenKelasSaya}%
                      </p>
                      <p className="text-xs text-slate-400">
                        rata-rata kehadiran kelas
                      </p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${persenKelasSaya}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </Card>

          {/* Nilai tertinggi & terendah */}
          <Card
            title="Nilai Harian Tertinggi & Terendah"
            subtitle="Dari seluruh input nilai harian di kelas ini"
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-medium text-emerald-600">
                  Nilai Tertinggi
                </p>
                {nilaiTertinggi ? (
                  <div className="mt-1 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {nilaiTertinggi.expand?.siswa_id?.nama_siswa || "-"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {nilaiTertinggi.expand?.mapel_id?.nama_mapel || "-"}
                      </p>
                    </div>
                    <span className="text-2xl font-bold text-emerald-600">
                      {nilaiTertinggi.nilai}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">Belum ada data</p>
                )}
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-xs font-medium text-rose-600">
                  Nilai Terendah
                </p>
                {nilaiTerendah ? (
                  <div className="mt-1 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {nilaiTerendah.expand?.siswa_id?.nama_siswa || "-"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {nilaiTerendah.expand?.mapel_id?.nama_mapel || "-"}
                      </p>
                    </div>
                    <span className="text-2xl font-bold text-rose-600">
                      {nilaiTerendah.nilai}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">Belum ada data</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
