"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// Role yang boleh mengakses halaman ini
const ALLOWED_ROLES = ["guru walikelas", "guru pendamping"];

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

export default function KelasSayaPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [kelasList, setKelasList] = useState([]);
  const [siswaByKelas, setSiswaByKelas] = useState({});
  const [mapelByKelas, setMapelByKelas] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  // Sub-menu Utama: 'overview', 'siswa', atau 'mapel'
  const [activeTab, setActiveTab] = useState("overview");

  // 1. Cek auth & role
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

    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // 2. Ambil data kelas + siswa + mata_pelajaran
  useEffect(() => {
    if (!authChecked || unauthorized || !user?.id) return;

    let isMounted = true;

    async function fetchData() {
      setLoading(true);
      setError("");

      try {
        const kelasFilter = `walikelas_id = "${user.id}" || pendamping_id = "${user.id}"`;
        const kelasRecords = await pb.collection("kelas").getFullList({
          filter: kelasFilter,
          sort: "tingkat,nama_kelas",
          expand: "tahun_ajaran_id,walikelas_id,pendamping_id",
          requestKey: null,
        });

        if (kelasRecords.length === 0) {
          if (isMounted) {
            setKelasList([]);
            setSiswaByKelas({});
            setMapelByKelas({});
            setLoading(false);
          }
          return;
        }

        const kelasIds = kelasRecords.map((k) => k.id);
        const distinctTingkat = Array.from(
          new Set(kelasRecords.map((k) => String(k.tingkat))),
        );

        const siswaFilter = kelasIds
          .map((kid) => `kelas_id = "${kid}"`)
          .join(" || ");

        const [siswaRecords, spesifikMapel, kandidatUmumMapel] =
          await Promise.all([
            pb.collection("siswa").getFullList({
              filter: siswaFilter,
              sort: "nama_siswa",
              requestKey: null,
            }),
            // Mapel yang eksplisit di-assign ke salah satu kelas guru ini.
            pb
              .collection("mata_pelajaran")
              .getFullList({
                filter: kelasIds
                  .map((kid) => `spesifik_kelas_id ~ "${kid}"`)
                  .join(" || "),
                requestKey: null,
              })
              .catch(() => []),
            // Kandidat mapel "umum" untuk tingkat-tingkat kelas guru ini.
            // Expand spesifik_kelas_id supaya kita tahu tingkat dari tiap
            // kelas yang sudah di-spesifik-kan (buat cek per-tingkat).
            pb
              .collection("mata_pelajaran")
              .getFullList({
                filter: distinctTingkat
                  .map((t) => `target_tingkat ~ "${t}"`)
                  .join(" || "),
                expand: "spesifik_kelas_id",
                requestKey: null,
              })
              .catch(() => []),
          ]);

        const groupedSiswa = {};
        for (const s of siswaRecords) {
          const kid = firstOf(s.kelas_id);
          if (!kid) continue;
          if (!groupedSiswa[kid]) groupedSiswa[kid] = [];
          groupedSiswa[kid].push(s);
        }

        // Untuk tiap kelas, tentukan mapel mana yang berlaku:
        // - spesifik: kelas ini eksplisit ada di spesifik_kelas_id mapel
        // - umum: tingkat kelas ini ADA di target_tingkat mapel, DAN
        //   tidak ada satupun kelas di spesifik_kelas_id mapel yang
        //   tingkatnya sama dengan tingkat kelas ini (kalau ada, berarti
        //   tingkat itu sudah "diperebutkan" kelas lain -> bukan umum lagi
        //   untuk tingkat tsb).
        const groupedMapel = {};
        for (const kelas of kelasRecords) {
          const tingkat = String(kelas.tingkat);
          const applied = [];
          const seen = new Set();

          for (const m of spesifikMapel) {
            const ids = Array.isArray(m.spesifik_kelas_id)
              ? m.spesifik_kelas_id
              : m.spesifik_kelas_id
                ? [m.spesifik_kelas_id]
                : [];
            if (ids.includes(kelas.id) && !seen.has(m.id)) {
              applied.push({ ...m, __khusus: true });
              seen.add(m.id);
            }
          }

          for (const m of kandidatUmumMapel) {
            if (seen.has(m.id)) continue;
            if (!(m.target_tingkat || []).includes(tingkat)) continue;

            const spesifikRecords = Array.isArray(m.expand?.spesifik_kelas_id)
              ? m.expand.spesifik_kelas_id
              : m.expand?.spesifik_kelas_id
                ? [m.expand.spesifik_kelas_id]
                : [];
            const adaRestriksiUntukTingkatIni = spesifikRecords.some(
              (k) => String(k.tingkat) === tingkat,
            );

            if (!adaRestriksiUntukTingkatIni) {
              applied.push({ ...m, __khusus: false });
              seen.add(m.id);
            }
          }

          groupedMapel[kelas.id] = applied.sort((a, b) =>
            (a.nama_mapel || "").localeCompare(b.nama_mapel || ""),
          );
        }

        if (isMounted) {
          setKelasList(kelasRecords);
          setSiswaByKelas(groupedSiswa);
          setMapelByKelas(groupedMapel);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        if (isMounted) {
          setError("Gagal memuat data kelas atau mata pelajaran Anda.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized, user]);

  // Handler ganti tab yang aman tanpa tabrakan state pencarian
  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    setSearchTerm("");
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        Memeriksa sesi login...
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">Akses Ditolak</h1>
        <p className="mt-2 text-sm text-red-600">
          Halaman ini hanya dapat diakses oleh guru walikelas atau guru
          pendamping.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 text-xs text-slate-400 flex items-center gap-2">
        <span>ICT</span> <span>/</span>{" "}
        <span className="text-slate-600 font-medium">Kelas Saya</span>
      </div>

      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between sm:pb-2">
        {/* Container Tab Navigation */}
        <div className="flex flex-row items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 no-scrollbar w-full sm:w-auto relative z-20">
          <button
            type="button"
            onClick={() => handleTabChange("overview")}
            className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer select-none outline-none min-w-[100px] flex-1 sm:flex-initial ${
              activeTab === "overview"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            }`}
          >
            <svg
              className="h-4 w-4 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"
              />
            </svg>
            <span>Overview Kelas</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("siswa")}
            className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer select-none outline-none min-w-[100px] flex-1 sm:flex-initial ${
              activeTab === "siswa"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            }`}
          >
            <svg
              className="h-4 w-4 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <span>Data Siswa</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("mapel")}
            className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer select-none outline-none min-w-[100px] flex-1 sm:flex-initial ${
              activeTab === "mapel"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            }`}
          >
            <svg
              className="h-4 w-4 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <span>Mata Pelajaran</span>
          </button>
        </div>

        {/* Input Pencarian Konten */}
        {activeTab !== "overview" && kelasList.length > 0 && (
          <div className="relative w-full sm:w-64 z-10">
            <input
              type="text"
              placeholder={
                activeTab === "siswa"
                  ? "Cari nama siswa / NIS..."
                  : "Cari kode / nama mata pelajaran..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 pl-9 text-xs outline-none focus:border-blue-500 transition shadow-sm"
            />
            <svg
              className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : kelasList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
          Anda belum ditugaskan sebagai wali kelas atau guru pendamping di kelas
          manapun.
        </div>
      ) : (
        <div className="space-y-8 relative z-10">
          {kelasList.map((kelas) => {
            const siswaList = siswaByKelas[kelas.id] || [];
            const mapelList = mapelByKelas[kelas.id] || [];

            const filteredSiswa = siswaList.filter((s) => {
              if (!searchTerm.trim()) return true;
              const q = searchTerm.toLowerCase();
              return (
                s.nama_siswa?.toLowerCase().includes(q) ||
                s.nis?.toLowerCase().includes(q) ||
                s.nisn?.toLowerCase().includes(q)
              );
            });

            const filteredMapel = mapelList.filter((m) => {
              if (!searchTerm.trim()) return true;
              const q = searchTerm.toLowerCase();
              return (
                m.nama_mapel?.toLowerCase().includes(q) ||
                m.kode_mapel?.toLowerCase().includes(q)
              );
            });

            const jumlahL = filteredSiswa.filter(
              (s) => s.jenis_kelamin === "L",
            ).length;
            const jumlahP = filteredSiswa.filter(
              (s) => s.jenis_kelamin === "P",
            ).length;
            const tahunAjaran = kelas.expand?.tahun_ajaran_id;

            const namaWali =
              kelas.expand?.walikelas_id?.nama_lengkap || "Belum Ditentukan";
            const usernameWali = kelas.expand?.walikelas_id?.username || "—";
            const namaPendamping =
              kelas.expand?.pendamping_id?.nama_lengkap || "Belum Ditentukan";
            const usernamePendamping =
              kelas.expand?.pendamping_id?.username || "—";

            const isWaliKelas = kelas.walikelas_id === user?.id;
            const isGuruPendamping = kelas.pendamping_id === user?.id;

            return (
              <div
                key={kelas.id}
                className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-5"
              >
                {/* HEADER INFO UTAMA KELAS */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white uppercase text-sm shadow-sm">
                      {kelas.nama_kelas?.substring(0, 2) ||
                        `${kelas.tingkat || 1}A`}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                        {kelas.nama_kelas}
                        <span className="text-[11px] font-mono font-normal text-slate-400 bg-white border px-1.5 py-0.5 rounded">
                          ID: {kelas.id}
                        </span>
                      </h2>
                      <div className="flex gap-1.5 mt-1">
                        {isWaliKelas && (
                          <span className="rounded bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                            Wali Kelas Anda
                          </span>
                        )}
                        {isGuruPendamping && (
                          <span className="rounded bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                            Guru Pendamping Anda
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 sm:text-right font-medium">
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      Tahun Ajaran
                    </p>
                    <p className="text-slate-700 font-semibold mt-0.5">
                      {tahunAjaran
                        ? `${tahunAjaran.tahun} · Sem. ${tahunAjaran.semester}`
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* ================= AREA KONTEN AKTIF ================= */}
                {activeTab === "overview" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          Penugasan Wali Kelas
                        </span>
                        <h3 className="text-sm font-bold text-slate-800 mt-2">
                          {namaWali}
                        </h3>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-500 font-mono">
                        <span className="text-slate-400">Username:</span>
                        <span className="text-slate-700 font-semibold">
                          @{usernameWali}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          Penugasan Guru Pendamping
                        </span>
                        <h3 className="text-sm font-bold text-slate-800 mt-2">
                          {namaPendamping}
                        </h3>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-500 font-mono">
                        <span className="text-slate-400">Username:</span>
                        <span className="text-slate-700 font-semibold">
                          @{usernamePendamping}
                        </span>
                      </div>
                    </div>

                    <div className="md:col-span-2 rounded-xl border border-slate-50 bg-slate-50/50 p-4 text-[11px] text-slate-500 flex justify-between flex-wrap gap-4">
                      <p>
                        Tingkat Kelas:{" "}
                        <span className="font-bold text-slate-700">
                          {kelas.tingkat || "—"}
                        </span>
                      </p>
                      <p>
                        Total Murid Terdaftar:{" "}
                        <span className="font-bold text-slate-700">
                          {siswaList.length} Anak
                        </span>
                      </p>
                      <p>
                        Jumlah Mata Pelajaran Kurikulum:{" "}
                        <span className="font-bold text-slate-700">
                          {mapelList.length} Pelajaran
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "siswa" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                      <span className="uppercase tracking-wider">
                        Daftar Murid Aktif
                      </span>
                      <span>
                        {filteredSiswa.length} ditemukan (L: {jumlahL} · P:{" "}
                        {jumlahP})
                      </span>
                    </div>

                    {filteredSiswa.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200">
                        {searchTerm.trim()
                          ? "Tidak ada nama siswa yang cocok."
                          : "Belum ada siswa terdaftar."}
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
                        <table className="w-full min-w-[500px] text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-left uppercase tracking-wider text-slate-400 text-[10px] font-semibold border-b border-slate-100">
                              <th className="px-4 py-2.5 text-center w-12">
                                No
                              </th>
                              <th className="px-4 py-2.5">
                                Nama Lengkap Siswa
                              </th>
                              <th className="px-4 py-2.5">NIS</th>
                              <th className="px-4 py-2.5">NISN</th>
                              <th className="px-4 py-2.5 text-center w-16">
                                L/P
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-600 bg-white">
                            {filteredSiswa.map((s, idx) => (
                              <tr
                                key={s.id}
                                className="hover:bg-slate-50/40 transition"
                              >
                                <td className="px-4 py-2.5 text-center text-slate-400 font-mono">
                                  {idx + 1}
                                </td>
                                <td className="px-4 py-2.5 font-semibold text-slate-700">
                                  {s.nama_siswa}
                                </td>
                                <td className="px-4 py-2.5 text-slate-500 font-mono">
                                  {s.nis || "—"}
                                </td>
                                <td className="px-4 py-2.5 text-slate-500 font-mono">
                                  {s.nisn || "—"}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span
                                    className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                                      s.jenis_kelamin === "L"
                                        ? "bg-sky-50 text-sky-600 border border-sky-100"
                                        : s.jenis_kelamin === "P"
                                          ? "bg-pink-50 text-pink-600 border border-pink-100"
                                          : "bg-slate-50 text-slate-500"
                                    }`}
                                  >
                                    {s.jenis_kelamin || "—"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "mapel" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                      <span className="uppercase tracking-wider">
                        Mata Pelajaran Kurikulum Terdaftar
                      </span>
                      <span>{filteredMapel.length} Mata Pelajaran Aktif</span>
                    </div>

                    {filteredMapel.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200">
                        {searchTerm.trim()
                          ? "Tidak ada mata pelajaran yang cocok."
                          : "Belum ada kurikulum didaftarkan."}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredMapel.map((m) => (
                          <div
                            key={m.id}
                            className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-between hover:border-blue-200 transition"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                                  {m.kode_mapel || "MPL"}
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono">
                                  ID: {m.id}
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-slate-800 mt-2 line-clamp-1">
                                {m.nama_mapel}
                              </h4>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                              <span>
                                Tingkat:{" "}
                                {(m.target_tingkat || []).join(", ") || "—"}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                                  m.__khusus
                                    ? "text-amber-700 bg-amber-50"
                                    : "text-blue-600 bg-blue-50"
                                }`}
                              >
                                {m.__khusus ? "Khusus kelas ini" : "Umum"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 animate-pulse rounded-xl bg-slate-100 w-1/3" />
      {[1, 2].map((i) => (
        <div
          key={i}
          className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
        >
          <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-xl bg-slate-50" />
        </div>
      ))}
    </div>
  );
}
