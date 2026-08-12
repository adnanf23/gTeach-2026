"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, getCurrentUser, isAuthenticated } from "@/lib/pocketbase";

const ALLOWED_ROLES = ["guru mapel", "admin", "ict"];

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

export default function OverviewGuruMapelPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [guru, setGuru] = useState(null);
  const [jumlahKelas, setJumlahKelas] = useState(0);
  const [jumlahMapel, setJumlahMapel] = useState(0);
  const [rataRataPerMapel, setRataRataPerMapel] = useState([]); // [{mapel, rataRata, jumlahNilai}]

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

    setGuru(currentUser);
    setAuthChecked(true);
  }, [router]);

  // Ambil data dashboard setelah auth lolos
  useEffect(() => {
    if (!authChecked || unauthorized || !guru) return;

    let isMounted = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setErrorMsg("");

        const user = guru;

        // Ambil semua ploting mengajar guru ini (mapel + kelas yang diampu)
        const plotingSaya = await pb.collection("ploting_guru").getFullList({
          filter: `guru_id="${user.id}"`,
          expand: "mapel_id",
        });

        // Hitung jumlah kelas unik yang diajar
        const kelasIdSet = new Set();
        plotingSaya.forEach((p) => {
          const kelasIds = Array.isArray(p.kelas_id)
            ? p.kelas_id
            : p.kelas_id
              ? [p.kelas_id]
              : [];
          kelasIds.forEach((id) => kelasIdSet.add(id));
        });
        if (isMounted) setJumlahKelas(kelasIdSet.size);

        // Hitung jumlah mapel unik yang diajar
        const mapelMap = {};
        plotingSaya.forEach((p) => {
          const mapelId = Array.isArray(p.mapel_id)
            ? p.mapel_id[0]
            : p.mapel_id;
          if (mapelId && p.expand?.mapel_id) {
            mapelMap[mapelId] = p.expand.mapel_id;
          }
        });
        if (isMounted) setJumlahMapel(Object.keys(mapelMap).length);

        // Ambil semua nilai harian yang diinput oleh guru ini
        const nilaiHarianSaya = await pb
          .collection("nilai_harian")
          .getFullList({
            filter: `guru_id="${user.id}"`,
          });

        // Rata-rata nilai per mapel yang diampu
        const rekapPerMapel = {};
        Object.entries(mapelMap).forEach(([mapelId, mapelData]) => {
          rekapPerMapel[mapelId] = { mapel: mapelData, total: 0, jumlah: 0 };
        });
        nilaiHarianSaya.forEach((n) => {
          const mapelId = Array.isArray(n.mapel_id)
            ? n.mapel_id[0]
            : n.mapel_id;
          if (!rekapPerMapel[mapelId]) return;
          rekapPerMapel[mapelId].total += n.nilai;
          rekapPerMapel[mapelId].jumlah += 1;
        });

        const rataRataHitung = Object.values(rekapPerMapel)
          .map((r) => ({
            mapel: r.mapel,
            jumlahNilai: r.jumlah,
            rataRata:
              r.jumlah > 0 ? Math.round((r.total / r.jumlah) * 10) / 10 : 0,
          }))
          .sort((a, b) => b.rataRata - a.rataRata);

        if (isMounted) setRataRataPerMapel(rataRataHitung);

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

  const mapelTertinggi = rataRataPerMapel[0] || null;

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
    <div className="min-h-screen  pb-16">
      {/* Header */}
      <div className="border-b border-slate-200 ">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
            {hariIndo()}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {getGreetingByTime()} {guru?.nama_lengkap || "Guru"} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Guru Mata Pelajaran &middot; {jumlahMapel} mapel &middot;{" "}
            {jumlahKelas} kelas
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Ringkasan */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              Mapel dengan Rata-rata Tertinggi
            </p>
            {mapelTertinggi ? (
              <>
                <p className="mt-2 truncate text-lg font-bold text-slate-900">
                  {mapelTertinggi.mapel?.nama_mapel || "-"}
                </p>
                <p className="text-xs text-emerald-600 font-semibold">
                  Rata-rata {mapelTertinggi.rataRata}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Belum ada data</p>
            )}
          </Card>
        </div>

        {/* Rata-rata nilai per mapel */}
        <Card
          title="Rata-rata Nilai per Mata Pelajaran"
          subtitle="Diurutkan dari yang tertinggi, berdasarkan seluruh nilai harian yang Anda input"
        >
          {rataRataPerMapel.length === 0 ? (
            <p className="text-sm text-slate-400">
              Belum ada nilai harian yang diinput.
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
