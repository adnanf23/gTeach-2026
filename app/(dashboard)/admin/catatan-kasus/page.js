"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";
import { createSystemLog } from "@/lib/logger";

// =========================================================
// Konstanta
// =========================================================
const ALLOWED_ROLES = ["admin", "ict"];

const JENIS_KASUS = {
  "pelanggaran ringan": {
    label: "Pelanggaran Ringan",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
  "pelanggaran berat": {
    label: "Pelanggaran Berat",
    badge: "bg-rose-100 text-rose-700",
    dot: "bg-rose-500",
  },
};

function suratBadgeClass(surat) {
  switch (surat) {
    case "SP 1":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "SP 2":
      return "bg-orange-50 text-orange-700 border border-orange-200";
    case "SP 3":
      return "bg-rose-50 text-rose-700 border border-rose-200";
    case "Surat Home Visit":
      return "bg-rose-100 text-rose-800 border border-rose-300";
    case "Surat pengunduran diri":
      return "bg-red-100 text-red-800 border border-red-300";
    default:
      return "bg-slate-100 text-slate-600 border border-slate-200";
  }
}

// =========================================================
// Helper
// =========================================================
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function formatLong(d) {
  if (!d) return "";
  const date = new Date(d);
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
  return `${hari[date.getDay()]}, ${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
}

function rawDateOnly(v) {
  if (!v) return "";
  return String(v).includes(" ") ? v.split(" ")[0] : v.split("T")[0];
}

function getKelasBadge(kelas) {
  if (!kelas) return "-";
  const nama = kelas.nama_kelas || "";
  const match = nama.match(/(\d+[A-Za-z]+)$/);
  if (match) return match[1].toUpperCase();
  const tingkat = kelas.tingkat || "";
  const firstChar = nama.replace(/\d+/g, "").trim().charAt(0) || "A";
  return `${tingkat}${firstChar}`;
}

// =========================================================
// Toast
// =========================================================
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  const isSuccess = toast.type === "success";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="alert"
        className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-[toast-in_0.2s_ease-out] ${
          isSuccess
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}
      >
        <span
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            isSuccess ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {isSuccess ? "✓" : "!"}
        </span>
        <p className="flex-1 text-sm font-medium">{toast.text}</p>
        <button
          onClick={onClose}
          className="text-lg leading-none text-current opacity-50 hover:opacity-100"
          aria-label="Tutup notifikasi"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// =========================================================
// PAGE
// =========================================================
export default function AdminCatatanKasusPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  // Data kelas
  const [kelasList, setKelasList] = useState([]);
  const [siswaCountMap, setSiswaCountMap] = useState({});
  const [loadingKelas, setLoadingKelas] = useState(true);

  // Step
  const [selectedKelasId, setSelectedKelasId] = useState(null);

  // Search & filter pilih kelas
  const [search, setSearch] = useState("");
  const [filterTingkat, setFilterTingkat] = useState("");

  // Data catatan kasus kelas terpilih
  const [catatanList, setCatatanList] = useState([]);
  const [siswaList, setSiswaList] = useState([]);
  const [loadingCatatan, setLoadingCatatan] = useState(false);

  // Search & filter catatan
  const [searchCatatan, setSearchCatatan] = useState("");
  const [filterJenis, setFilterJenis] = useState("semua");
  const [filterSync, setFilterSync] = useState("semua");

  // Toggle state
  const [togglingId, setTogglingId] = useState(null);

  const [message, setMessage] = useState(null);

  const selectedKelas = useMemo(
    () => kelasList.find((k) => k.id === selectedKelasId) || null,
    [kelasList, selectedKelasId],
  );

  // =========================================================
  // Auth
  // =========================================================
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    const currentUser = getCurrentUser();
    if (!currentUser || !ALLOWED_ROLES.includes(currentUser.role)) {
      setUnauthorized(true);
      setAuthChecked(true);
      setLoadingKelas(false);
      return;
    }
    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // =========================================================
  // Load kelas + count siswa
  // =========================================================
  useEffect(() => {
    if (!authChecked || unauthorized || !user) return;
    let cancelled = false;

    async function loadKelas() {
      setLoadingKelas(true);
      try {
        const [kelasData, siswaData] = await Promise.all([
          pb.collection("kelas").getFullList({
            sort: "tingkat,nama_kelas",
            requestKey: null,
          }),
          pb.collection("siswa").getFullList({
            fields: "id,kelas_id",
            requestKey: null,
          }),
        ]);

        const countMap = {};
        siswaData.forEach((s) => {
          const kid = firstOf(s.kelas_id);
          if (kid) countMap[kid] = (countMap[kid] || 0) + 1;
        });

        if (cancelled) return;
        setKelasList(kelasData);
        setSiswaCountMap(countMap);
      } catch (err) {
        console.error("Gagal memuat kelas:", err);
      } finally {
        if (!cancelled) setLoadingKelas(false);
      }
    }

    loadKelas();
    return () => {
      cancelled = true;
    };
  }, [authChecked, unauthorized, user]);

  // =========================================================
  // Load catatan kasus kelas terpilih
  // =========================================================
  const loadCatatan = useCallback(async () => {
    if (!selectedKelasId) return;
    setLoadingCatatan(true);
    try {
      const [catatanRes, siswaRes] = await Promise.all([
        pb.collection("catatan_kasus").getFullList({
          filter: `kelas_id="${selectedKelasId}"`,
          expand: "siswa_id,tahun_ajaran_id",
          sort: "-date",
          requestKey: null,
        }),
        pb.collection("siswa").getFullList({
          filter: `kelas_id="${selectedKelasId}"`,
          sort: "nama_siswa",
          requestKey: null,
        }),
      ]);
      setCatatanList(catatanRes);
      setSiswaList(siswaRes);
    } catch (err) {
      console.error("Gagal memuat catatan kasus:", err);
      setMessage({ type: "error", text: "Gagal memuat catatan kasus." });
    } finally {
      setLoadingCatatan(false);
    }
  }, [selectedKelasId]);

  useEffect(() => {
    if (selectedKelasId) loadCatatan();
    else {
      setCatatanList([]);
      setSiswaList([]);
    }
  }, [selectedKelasId, loadCatatan]);

  // =========================================================
  // Toggle sync_sias
  // =========================================================
  async function handleToggleSync(item) {
    const newValue = !item.sync_sias;
    setTogglingId(item.id);
    try {
      await pb
        .collection("catatan_kasus")
        .update(item.id, { sync_sias: newValue }, { requestKey: null });

      // Update state lokal
      setCatatanList((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, sync_sias: newValue } : c)),
      );

      setMessage({
        type: "success",
        text: newValue
          ? "Catatan kasus ditandai sudah sync SIAS."
          : "Catatan kasus ditandai belum sync SIAS.",
      });

      await createSystemLog({
        type: "succes",
        msg: `User '${user.nama_lengkap} (${user.role})' mengubah status sync SIAS catatan kasus menjadi ${newValue ? "sudah" : "belum"}.`,
        endpoint: "/admin/catatan-kasus",
        statusCode: 200,
        payload: { id: item.id, sync_sias: newValue },
      });
    } catch (err) {
      console.error("Gagal update sync_sias:", err);
      setMessage({
        type: "error",
        text: "Gagal mengubah status sync SIAS.",
      });
      await createSystemLog({
        type: "warning",
        msg: `User '${user.nama_lengkap} (${user.role})' gagal mengubah status sync SIAS catatan kasus.`,
        endpoint: "/admin/catatan-kasus",
        statusCode: err.status || 400,
        payload: { id: item.id },
      });
    } finally {
      setTogglingId(null);
    }
  }

  // =========================================================
  // Filter
  // =========================================================
  const tingkatOptions = useMemo(() => {
    const set = new Set(kelasList.map((k) => String(k.tingkat || "")));
    return Array.from(set)
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));
  }, [kelasList]);

  const filteredKelas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kelasList.filter((k) => {
      if (filterTingkat && String(k.tingkat) !== filterTingkat) return false;
      if (q && !(k.nama_kelas || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [kelasList, search, filterTingkat]);

  const filteredCatatan = useMemo(() => {
    const q = searchCatatan.trim().toLowerCase();
    return catatanList.filter((item) => {
      const namaSiswa = item.expand?.siswa_id?.nama_siswa || "";
      if (q && !namaSiswa.toLowerCase().includes(q)) return false;
      if (filterJenis !== "semua" && item.jenis_kasus !== filterJenis)
        return false;
      if (filterSync === "sudah" && !item.sync_sias) return false;
      if (filterSync === "belum" && item.sync_sias) return false;
      return true;
    });
  }, [catatanList, searchCatatan, filterJenis, filterSync]);

  const stats = useMemo(() => {
    const total = catatanList.length;
    const sync = catatanList.filter((c) => c.sync_sias).length;
    const belumSync = total - sync;
    return { total, sync, belumSync };
  }, [catatanList]);

  // =========================================================
  // Render
  // =========================================================
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
          Halaman ini hanya dapat diakses oleh Admin / ICT.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
      <Toast toast={message} onClose={() => setMessage(null)} />

      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        {/* HEADER */}
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-3 text-xs font-semibold text-slate-500 hover:text-blue-600 inline-flex items-center gap-1"
        >
          ← Kembali
        </button>

        <div className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 p-5 text-white shadow-sm sm:p-6">
          <div className="absolute right-0 bottom-0 h-64 w-64 translate-x-10 translate-y-16 rounded-full bg-white/5 pointer-events-none" />
          <div className="relative z-10">
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-blue-200">
              Admin • Catatan Kasus
            </span>
            <h1 className="mt-0.5 text-xl font-extrabold tracking-wide uppercase sm:text-2xl">
              Monitoring Catatan Kasus
            </h1>
            <p className="mt-1 text-xs text-blue-100">
              Lihat catatan kasus semua kelas dan kelola status sinkronisasi ke
              SIAS.
            </p>
          </div>
        </div>

        {/* Breadcrumb step */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => setSelectedKelasId(null)}
            className={
              selectedKelas
                ? "cursor-pointer hover:text-slate-600"
                : "font-medium text-slate-600"
            }
          >
            Pilih Kelas
          </button>
          {selectedKelas && (
            <>
              <span>/</span>
              <span className="font-medium text-slate-600">
                {selectedKelas.nama_kelas}
              </span>
            </>
          )}
        </div>

        {/* ============ STEP 1: PILIH KELAS ============ */}
        {!selectedKelas && (
          <>
            <div className="mb-4">
              <h2 className="mb-1 text-lg font-bold text-slate-800">
                Pilih Kelas
              </h2>
              <p className="text-xs text-slate-500">
                Pilih kelas untuk melihat catatan kasusnya.
              </p>
            </div>

            {/* Search & Filter */}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                  />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama kelas..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="sm:w-56">
                <select
                  value={filterTingkat}
                  onChange={(e) => setFilterTingkat(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Semua Tingkat</option>
                  {tingkatOptions.map((t) => (
                    <option key={t} value={t}>
                      Tingkat {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grid Kelas */}
            {loadingKelas ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl bg-slate-100"
                  />
                ))}
              </div>
            ) : filteredKelas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                {kelasList.length === 0
                  ? "Belum ada kelas terdaftar."
                  : "Tidak ada kelas yang cocok dengan pencarian/filter."}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredKelas.map((kelas) => (
                  <button
                    key={kelas.id}
                    type="button"
                    onClick={() => setSelectedKelasId(kelas.id)}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-200 active:scale-[0.98]"
                  >
                    <h3 className="text-base font-semibold text-slate-900 transition-colors duration-300 group-hover:text-white">
                      {kelas.nama_kelas}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 transition-colors duration-300 group-hover:text-blue-100">
                      <span className="flex items-center gap-1">
                        <svg
                          className="h-3.5 w-3.5 text-slate-400 transition-colors duration-300 group-hover:text-blue-200"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2"
                          />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        Tingkat {kelas.tingkat}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg
                          className="h-3.5 w-3.5 text-slate-400 transition-colors duration-300 group-hover:text-blue-200"
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
                        {siswaCountMap[kelas.id] || 0} siswa
                      </span>
                    </div>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-white">
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                    <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/15 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
                    <div className="absolute right-12 top-3 text-[10px] font-medium text-slate-400 transition-colors duration-300 group-hover:text-blue-200">
                      {getKelasBadge(kelas)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ============ STEP 2: CATATAN KASUS KELAS ============ */}
        {selectedKelas && (
          <>
            {/* Header kelas + aksi */}
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-800">
                    {selectedKelas.nama_kelas}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Tingkat {selectedKelas.tingkat} • {siswaList.length} siswa •{" "}
                    {catatanList.length} catatan kasus
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
                  >
                    ← Kembali
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedKelasId(null)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
                  >
                    🔄 Ganti Kelas
                  </button>
                </div>
              </div>

              {/* Ringkasan */}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">
                    {stats.total}
                  </p>
                  <p className="text-[11px] text-slate-500">Total Kasus</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-emerald-600">
                    {stats.sync}
                  </p>
                  <p className="text-[11px] text-slate-500">Sudah Sync SIAS</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-rose-600">
                    {stats.belumSync}
                  </p>
                  <p className="text-[11px] text-slate-500">Belum Sync</p>
                </div>
              </div>
            </div>

            {/* Search & filter catatan */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={searchCatatan}
                  onChange={(e) => setSearchCatatan(e.target.value)}
                  placeholder="Cari nama siswa..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <select
                value={filterJenis}
                onChange={(e) => setFilterJenis(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 sm:w-44"
              >
                <option value="semua">Semua Jenis</option>
                <option value="pelanggaran ringan">Pelanggaran Ringan</option>
                <option value="pelanggaran berat">Pelanggaran Berat</option>
              </select>
              <select
                value={filterSync}
                onChange={(e) => setFilterSync(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-blue-500 sm:w-44"
              >
                <option value="semua">Semua Status SIAS</option>
                <option value="sudah">Sudah Sync</option>
                <option value="belum">Belum Sync</option>
              </select>
            </div>

            {/* List catatan */}
            {loadingCatatan ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
                  />
                ))}
              </div>
            ) : filteredCatatan.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                {catatanList.length === 0
                  ? "Belum ada catatan kasus untuk kelas ini."
                  : "Tidak ada catatan yang cocok dengan pencarian/filter."}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCatatan.map((item) => {
                  const jenis = JENIS_KASUS[item.jenis_kasus];
                  const isToggling = togglingId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border bg-white p-4 transition ${
                        item.sync_sias
                          ? "border-emerald-200"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {/* Nama + badge jenis */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-slate-800">
                              {item.expand?.siswa_id?.nama_siswa ||
                                "Siswa tidak diketahui"}
                            </span>
                            {jenis && (
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${jenis.badge}`}
                              >
                                {jenis.label}
                              </span>
                            )}
                            {/* Badge sync SIAS */}
                            {item.sync_sias ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Sudah Sync SIAS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                Belum Sync
                              </span>
                            )}
                          </div>

                          {/* Tanggal */}
                          <p className="text-xs text-slate-500">
                            {formatLong(rawDateOnly(item.date))}
                          </p>

                          {/* Tindak lanjut */}
                          {item.tindak_lanjut && (
                            <p className="text-sm text-slate-700">
                              {item.tindak_lanjut}
                            </p>
                          )}

                          {/* Surat */}
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {item.surat_diberikan && (
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${suratBadgeClass(
                                  item.surat_diberikan,
                                )}`}
                              >
                                {item.surat_diberikan}
                              </span>
                            )}
                            {item.expand?.tahun_ajaran_id && (
                              <span className="text-[11px] text-slate-400">
                                TA {item.expand.tahun_ajaran_id.tahun} • Sem{" "}
                                {item.expand.tahun_ajaran_id.semester}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Aksi toggle sync */}
                        <div className="flex flex-shrink-0 items-center gap-2 self-end sm:self-start">
                          <button
                            type="button"
                            onClick={() => handleToggleSync(item)}
                            disabled={isToggling}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition active:scale-[0.97] disabled:opacity-50 ${
                              item.sync_sias
                                ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                : "bg-emerald-600 text-white hover:bg-emerald-700"
                            }`}
                            title={
                              item.sync_sias
                                ? "Tandai belum sync SIAS"
                                : "Tandai sudah sync SIAS"
                            }
                          >
                            {isToggling ? (
                              <>
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ...
                              </>
                            ) : item.sync_sias ? (
                              <>↺ Batalkan Sync</>
                            ) : (
                              <>✓ Tandai Sudah Sync</>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
