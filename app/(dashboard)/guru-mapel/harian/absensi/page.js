"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// =========================================================
// Konfigurasi status absensi (warna & label)
// =========================================================
const STATUS_CONFIG = {
  hadir: {
    label: "Hadir",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  izin: {
    label: "Izin",
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 border border-sky-200",
  },
  sakit: {
    label: "Sakit",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  alpha: {
    label: "Alpha",
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 border border-rose-200",
  },
};
const STATUS_ORDER = ["hadir", "izin", "sakit", "alpha"];

const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const HARI_PANJANG = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
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

// Role yang boleh mengakses halaman ini
const ALLOWED_ROLES = ["guru mapel"];

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

// =========================================================
// Helper tanggal
// =========================================================
function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isSameDate(a, b) {
  return a && b && toISODate(a) === toISODate(b);
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function formatLong(d) {
  return `${HARI_PANJANG[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}
function formatShort(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

function getKelasBadge(kelas) {
  if (!kelas) return "-";
  const nama = kelas.nama_kelas || "";
  const match = nama.match(/(\d+[A-Za-z]+)$/);
  if (match) {
    return match[1].toUpperCase();
  }
  const tingkat = kelas.tingkat || "";
  const firstChar = nama.replace(/\d+/g, "").trim().charAt(0) || "A";
  return `${tingkat}${firstChar}`;
}

// =========================================================
// Popup notifikasi (toast) – opsional, untuk error
// =========================================================
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="alert"
        className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-[toast-in_0.2s_ease-out] ${
          toast.type === "error"
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        <span
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            toast.type === "error" ? "bg-rose-500" : "bg-emerald-500"
          }`}
        >
          {toast.type === "error" ? "!" : "✓"}
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
// Komponen utama
// =========================================================
export default function MapelAbsensiPage() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);

  // ---------------- Auth ----------------
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");

  // ---------------- Step 1: Pilih mapel (ploting_guru) ----------------
  const [plotingList, setPlotingList] = useState([]);
  const [loadingPloting, setLoadingPloting] = useState(true);
  const [selectedPlotingId, setSelectedPlotingId] = useState(null);

  const selectedPloting = useMemo(
    () => plotingList.find((p) => p.id === selectedPlotingId) || null,
    [plotingList, selectedPlotingId],
  );

  // ---------------- Step 2: Kelas dari ploting terpilih ----------------
  const [kelasOptions, setKelasOptions] = useState([]);
  const [loadingKelasOptions, setLoadingKelasOptions] = useState(false);
  const [selectedKelasId, setSelectedKelasId] = useState(null);

  const selectedKelas = useMemo(
    () =>
      kelasOptions.find((k) => k.kelas.id === selectedKelasId)?.kelas || null,
    [kelasOptions, selectedKelasId],
  );

  // ---------------- Step 3: Data absensi ----------------
  const [siswaList, setSiswaList] = useState([]);
  const [monthAbsensi, setMonthAbsensi] = useState({});
  // monthAbsensi: { 'YYYY-MM-DD': { siswaId: status } }
  const [loadingAbsensi, setLoadingAbsensi] = useState(false);
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [message, setMessage] = useState(null);

  // ---------------- Detail tanggal ----------------
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailRows, setDetailRows] = useState([]);

  // =========================================================
  // 1. Auth check
  // =========================================================
  useEffect(() => {
    const currentUser = getCurrentUser();

    if (!isAuthenticated() || !currentUser) {
      router.push("/login");
      return;
    }

    if (!ALLOWED_ROLES.includes(currentUser.role)) {
      setUnauthorized(true);
      setAuthChecked(true);
      setLoadingPloting(false);
      return;
    }

    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // =========================================================
  // 2. Ambil ploting_guru milik guru ini
  // =========================================================
  useEffect(() => {
    if (!authChecked || unauthorized || !user?.id) return;
    let isMounted = true;

    async function fetchPloting() {
      setLoadingPloting(true);
      setError("");
      try {
        const records = await pb.collection("ploting_guru").getFullList({
          filter: `guru_id = "${user.id}"`,
          expand: "mapel_id,kelas_id",
          requestKey: null,
        });
        records.sort((a, b) =>
          (a.expand?.mapel_id?.nama_mapel || "").localeCompare(
            b.expand?.mapel_id?.nama_mapel || "",
          ),
        );
        if (!isMounted) return;
        setPlotingList(records);
        if (records.length === 1) setSelectedPlotingId(records[0].id);
      } catch (err) {
        console.error("Error fetching ploting_guru:", err);
        if (isMounted) setError("Gagal memuat daftar mata pelajaran Anda.");
      } finally {
        if (isMounted) setLoadingPloting(false);
      }
    }

    fetchPloting();
    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized, user]);

  // =========================================================
  // 3. Bangun daftar kelas dari ploting terpilih
  // =========================================================
  useEffect(() => {
    if (!selectedPloting) {
      setKelasOptions([]);
      setSelectedKelasId(null);
      return;
    }
    let isMounted = true;

    async function fetchKelasOptions() {
      setLoadingKelasOptions(true);
      setError("");
      setSelectedKelasId(null);
      try {
        const kelasArr = Array.isArray(selectedPloting.expand?.kelas_id)
          ? selectedPloting.expand.kelas_id
          : selectedPloting.expand?.kelas_id
            ? [selectedPloting.expand.kelas_id]
            : [];

        const counts = await Promise.all(
          kelasArr.map((k) =>
            pb
              .collection("siswa")
              .getList(1, 1, {
                filter: `kelas_id = "${k.id}"`,
                requestKey: null,
                fields: "id",
              })
              .then((r) => r.totalItems)
              .catch(() => 0),
          ),
        );

        const options = kelasArr
          .map((k, idx) => ({ kelas: k, siswaCount: counts[idx] }))
          .sort((a, b) => {
            const t =
              (Number(a.kelas.tingkat) || 0) - (Number(b.kelas.tingkat) || 0);
            if (t !== 0) return t;
            return (a.kelas.nama_kelas || "").localeCompare(
              b.kelas.nama_kelas || "",
            );
          });

        if (!isMounted) return;
        setKelasOptions(options);
        if (options.length === 1) setSelectedKelasId(options[0].kelas.id);
      } catch (err) {
        console.error("Error building kelas options:", err);
        if (isMounted)
          setError("Gagal memuat daftar kelas untuk mata pelajaran ini.");
      } finally {
        if (isMounted) setLoadingKelasOptions(false);
      }
    }

    fetchKelasOptions();
    return () => {
      isMounted = false;
    };
  }, [selectedPloting]);

  // =========================================================
  // 4. Ambil siswa dan absensi untuk kelas terpilih
  // =========================================================
  const loadMonth = useCallback(async () => {
    if (!selectedKelas) {
      setSiswaList([]);
      setMonthAbsensi({});
      return;
    }

    let isMounted = true;
    setLoadingAbsensi(true);
    setError("");

    try {
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const startStr = `${toISODate(first)} 00:00:00`;
      const endStr = `${toISODate(last)} 23:59:59`;

      // Ambil siswa
      const siswa = await pb.collection("siswa").getFullList({
        filter: `kelas_id = "${selectedKelas.id}"`,
        sort: "nama_siswa",
        requestKey: null,
      });

      // Ambil absensi
      const records = await pb.collection("absensi").getFullList({
        filter: `kelas_id = "${selectedKelas.id}" && tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
        requestKey: null,
      });

      // Group absensi per tanggal: { dateStr: { siswaId: status } }
      const grouped = {};
      for (const r of records) {
        const key = toISODate(new Date(r.tanggal));
        if (!grouped[key]) grouped[key] = {};
        grouped[key][r.siswa_id] = r.status;
      }

      if (!isMounted) return;
      setSiswaList(siswa);
      setMonthAbsensi(grouped);
    } catch (err) {
      console.error("Error loading absensi:", err);
      if (isMounted) setError("Gagal memuat data absensi. Silakan coba lagi.");
    } finally {
      if (isMounted) setLoadingAbsensi(false);
    }
  }, [selectedKelas, viewDate]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  // =========================================================
  // 5. Buka detail tanggal
  // =========================================================
  const openDetail = useCallback(
    (date) => {
      setSelectedDate(date);
      if (!date) {
        setDetailRows([]);
        return;
      }

      const dateStr = toISODate(date);
      const dayData = monthAbsensi[dateStr] || {};

      // Gabungkan dengan daftar siswa
      const rows = siswaList.map((s) => ({
        siswaId: s.id,
        nama: s.nama_siswa,
        nis: s.nis,
        status: dayData[s.id] || null, // null jika belum diabsen
      }));
      setDetailRows(rows);
    },
    [siswaList, monthAbsensi],
  );

  // =========================================================
  // 6. Helper: bangun grid kalender
  // =========================================================
  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = (firstOfMonth.getDay() + 6) % 7;

    const arr = [];
    for (let i = 0; i < leading; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewDate]);

  function goToMonth(offset) {
    setViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
    setSelectedDate(null);
    setDetailRows([]);
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(null);
    setDetailRows([]);
  }

  // =========================================================
  // 7. Render
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
          Halaman ini hanya dapat diakses oleh guru mata pelajaran.
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
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
      <Toast toast={message} onClose={() => setMessage(null)} />

      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => {
              setSelectedPlotingId(null);
              setSelectedKelasId(null);
              setSelectedDate(null);
              setDetailRows([]);
            }}
            className={`${selectedPloting ? "hover:text-slate-600 cursor-pointer" : "text-slate-600 font-medium"}`}
          >
            Absensi
          </button>
          {selectedPloting && (
            <>
              <span>/</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedKelasId(null);
                  setSelectedDate(null);
                  setDetailRows([]);
                }}
                className={`${selectedKelas ? "hover:text-slate-600 cursor-pointer" : "text-slate-600 font-medium"}`}
              >
                {selectedPloting.expand?.mapel_id?.nama_mapel ||
                  "Mata Pelajaran"}
              </button>
            </>
          )}
          {selectedKelas && (
            <>
              <span>/</span>
              <span className="text-slate-600 font-medium">
                {selectedKelas.nama_kelas}
              </span>
            </>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* ============ STEP 1: PILIH MAPEL ============ */}
        {!selectedPloting && (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-800">
              Pilih Mata Pelajaran
            </h1>
            <p className="mb-6 text-xs text-slate-500">
              Pilih mata pelajaran untuk melihat rekap absensi kelas yang Anda
              ampu.
            </p>

            {loadingPloting ? (
              <LoadingGrid />
            ) : plotingList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                Anda belum di-plotting mengajar mata pelajaran apapun.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {plotingList.map((p) => {
                  const mapel = p.expand?.mapel_id;
                  const kelasArr = Array.isArray(p.expand?.kelas_id)
                    ? p.expand.kelas_id
                    : p.expand?.kelas_id
                      ? [p.expand.kelas_id]
                      : [];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlotingId(p.id)}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-200 hover:bg-blue-600 active:scale-[0.98]"
                    >
                      <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase group-hover:bg-white/20 group-hover:text-white transition-colors duration-300">
                        {mapel?.kode_mapel || "MPL"}
                      </span>
                      <h3 className="text-sm font-bold text-slate-800 mt-2 group-hover:text-white transition-colors duration-300">
                        {mapel?.nama_mapel || "—"}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-1 group-hover:text-blue-100 transition-colors duration-300">
                        Diampu di {kelasArr.length} kelas
                      </p>

                      {/* Arrow indicator */}
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-white group-hover:translate-x-1.5 transition-all duration-300">
                        <svg
                          className="w-5 h-5"
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

                      {/* Efek shimmer */}
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ============ STEP 2: PILIH KELAS ============ */}
        {selectedPloting && !selectedKelas && (
          <>
            <div className="mb-6">
              <h1 className="text-lg font-bold text-slate-800">Pilih Kelas</h1>
              <p className="text-xs text-slate-500 mt-1">
                Pilih kelas untuk melihat absensi mata pelajaran{" "}
                <span className="font-semibold text-slate-700">
                  {selectedPloting.expand?.mapel_id?.nama_mapel ||
                    "Mata Pelajaran"}
                </span>
                .
              </p>
            </div>

            {loadingKelasOptions ? (
              <LoadingGrid />
            ) : kelasOptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                Belum ada kelas yang di-plotting untuk mata pelajaran ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {kelasOptions.map(({ kelas, siswaCount }) => (
                  <button
                    key={kelas.id}
                    type="button"
                    onClick={() => setSelectedKelasId(kelas.id)}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-200 hover:bg-blue-600 active:scale-[0.98]"
                  >
                    <h3 className="text-base font-semibold text-slate-900 group-hover:text-white transition-colors duration-300">
                      {kelas.nama_kelas}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 group-hover:text-blue-100 transition-colors duration-300">
                      <span className="flex items-center gap-1">
                        <svg
                          className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-200 transition-colors duration-300"
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
                          className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-200 transition-colors duration-300"
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
                        {siswaCount} siswa
                      </span>
                    </div>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-white group-hover:translate-x-1.5 transition-all duration-300">
                      <svg
                        className="w-5 h-5"
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
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                    <div className="absolute top-3 right-12 text-[10px] font-medium text-slate-400 group-hover:text-blue-200 transition-colors duration-300">
                      {getKelasBadge(kelas)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ============ STEP 3: LIHAT ABSENSI ============ */}
        {selectedPloting && selectedKelas && (
          <>
            {/* Hero header - ubah dari emerald/teal ke blue/indigo */}
            <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-blue-100 font-semibold">
                    {selectedPloting.expand?.mapel_id?.nama_mapel ||
                      "Mata Pelajaran"}
                  </p>
                  <h1 className="text-lg font-bold mt-0.5">
                    {selectedKelas.nama_kelas}
                  </h1>
                  <p className="text-xs text-blue-100 mt-1">
                    Data absensi yang telah diinput oleh wali kelas / pendamping
                  </p>
                </div>
                <div className="flex gap-4 text-center">
                  <div className="rounded-xl bg-white/10 px-4 py-2">
                    <p className="text-[10px] uppercase text-blue-100">Siswa</p>
                    <p className="text-lg font-bold">{siswaList.length}</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-4 py-2">
                    <p className="text-[10px] uppercase text-blue-100">
                      Hari Efektif
                    </p>
                    <p className="text-lg font-bold">
                      {Object.keys(monthAbsensi).length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-4 py-2">
                    <p className="text-[10px] uppercase text-blue-100">Bulan</p>
                    <p className="text-lg font-bold">
                      {BULAN[viewDate.getMonth()]}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Ganti kelas cepat - ubah warna tombol aktif dan hover */}
            {kelasOptions.length > 1 && (
              <div className="mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[11px] font-medium text-slate-400 shrink-0">
                  Ganti kelas:
                </span>
                {kelasOptions.map(({ kelas }) => (
                  <button
                    key={kelas.id}
                    type="button"
                    onClick={() => {
                      setSelectedKelasId(kelas.id);
                      setSelectedDate(null);
                      setDetailRows([]);
                    }}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                      kelas.id === selectedKelasId
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    {kelas.nama_kelas}
                  </button>
                ))}
              </div>
            )}

            {loadingAbsensi ? (
              <LoadingSkeleton />
            ) : (
              <div className="space-y-4">
                {/* Kartu kalender */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  {/* Navigasi bulan - tombol "Hari ini" diubah ke biru */}
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-2 sm:justify-between">
                    <div className="order-1 flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto">
                      <span className="text-base font-semibold text-slate-900 sm:text-sm md:text-base">
                        {BULAN[viewDate.getMonth()]} {viewDate.getFullYear()}
                      </span>
                      <button
                        onClick={goToToday}
                        className="flex-shrink-0 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        Hari ini
                      </button>
                    </div>
                    <button
                      onClick={() => goToMonth(-1)}
                      className="order-2 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 sm:order-none sm:flex-none sm:px-3 sm:text-sm"
                    >
                      <span aria-hidden>←</span>{" "}
                      <span className="hidden sm:inline">Sebelumnya</span>
                    </button>
                    <button
                      onClick={() => goToMonth(1)}
                      className="order-3 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 sm:order-none sm:flex-none sm:px-3 sm:text-sm"
                    >
                      <span className="hidden sm:inline">Berikutnya</span>{" "}
                      <span aria-hidden>→</span>
                    </button>
                  </div>

                  {/* Header hari */}
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-500 sm:gap-1.5 sm:text-xs">
                    {HARI_PENDEK.map((h) => (
                      <div key={h} className="py-1">
                        {h}
                      </div>
                    ))}
                  </div>

                  {/* Grid tanggal - ubah warna hover, border, ring, teks */}
                  <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
                    {loadingAbsensi &&
                      Array.from({ length: 35 }).map((_, i) => (
                        <div
                          key={i}
                          className="aspect-square animate-pulse rounded-lg bg-slate-100"
                        />
                      ))}

                    {!loadingAbsensi &&
                      cells.map((date, i) => {
                        if (!date)
                          return <div key={i} className="aspect-square" />;

                        const isFuture = date > today;
                        const isToday = isSameDate(date, today);
                        const dateStr = toISODate(date);
                        const dayData = monthAbsensi[dateStr] || {};
                        const siswaIds = Object.keys(dayData);
                        const totalSiswa = siswaList.length;

                        return (
                          <button
                            key={i}
                            disabled={isFuture}
                            onClick={() => openDetail(date)}
                            className={`relative flex aspect-square min-w-0 flex-col items-center justify-start overflow-hidden rounded-md border p-0.5 text-left transition sm:rounded-lg sm:p-1 ${
                              isFuture
                                ? "cursor-not-allowed border-transparent bg-slate-50/50 text-slate-300"
                                : "cursor-pointer border-slate-200 hover:border-blue-300 hover:bg-blue-50/40"
                            } ${
                              selectedDate && isSameDate(date, selectedDate)
                                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                                : ""
                            }`}
                          >
                            <span
                              className={`mt-0.5 text-[10px] font-medium sm:text-xs ${
                                isToday
                                  ? "flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white sm:h-5 sm:w-5"
                                  : "text-slate-700"
                              }`}
                            >
                              {date.getDate()}
                            </span>

                            {!isFuture && siswaIds.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 sm:mt-1">
                                {STATUS_ORDER.filter(
                                  (s) =>
                                    siswaIds.filter((sid) => dayData[sid] === s)
                                      .length > 0,
                                ).map((s) => (
                                  <span
                                    key={s}
                                    title={`${STATUS_CONFIG[s].label}: ${siswaIds.filter((sid) => dayData[sid] === s).length}`}
                                    className={`h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5 ${STATUS_CONFIG[s].dot}`}
                                  />
                                ))}
                              </div>
                            )}

                            {!isFuture && siswaIds.length === 0 && (
                              <span className="mt-0.5 h-1 w-1 rounded-full border border-slate-300 sm:mt-1 sm:h-1.5 sm:w-1.5" />
                            )}

                            {!isFuture && siswaIds.length > 0 && (
                              <span className="mt-0.5 text-[8px] font-medium text-blue-600 sm:text-[9px]">
                                {siswaIds.length}/{totalSiswa}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>

                  {/* Legenda - tidak berubah karena warna status tetap */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 sm:gap-3 sm:text-xs">
                    {STATUS_ORDER.map((s) => (
                      <span key={s} className="flex items-center gap-1">
                        <span
                          className={`h-2 w-2 rounded-full ${STATUS_CONFIG[s].dot}`}
                        />
                        {STATUS_CONFIG[s].label}
                      </span>
                    ))}
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full border border-slate-300" />
                      Belum diabsen
                    </span>
                  </div>
                </div>

                {/* Panel detail tanggal - tidak ada perubahan warna di sini karena hanya border dan teks netral */}
                {selectedDate && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Detail Absensi
                        </h2>
                        <p className="text-sm text-slate-500">
                          {formatLong(selectedDate)}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedDate(null);
                          setDetailRows([]);
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Tutup
                      </button>
                    </div>

                    {detailRows.length === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-400">
                        Belum ada siswa terdaftar di kelas ini.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {detailRows.map((row) => (
                          <div
                            key={row.siswaId}
                            className="flex items-center justify-between py-2.5"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-800">
                                {row.nama}
                              </p>
                              {row.nis && (
                                <p className="text-xs text-slate-400">
                                  NIS: {row.nis}
                                </p>
                              )}
                            </div>
                            {row.status ? (
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CONFIG[row.status].chip}`}
                              >
                                {STATUS_CONFIG[row.status].label}
                              </span>
                            ) : (
                              <span className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-400">
                                Belum diabsen
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =========================================================
// Komponen loading
// =========================================================
function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}
