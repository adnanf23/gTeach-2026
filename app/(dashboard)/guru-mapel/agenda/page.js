"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

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

const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
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

// Konstanta Metode Pembelajaran
const METODE_PEMBELAJARAN = {
  praktikum: "Praktikum",
  diskusi: "Diskusi",
  presentasi: "Presentasi",
  "student centered": "Student Centered",
  "teacher centered": "Teacher Centered",
  assesmen: "Asesmen",
  refleksi: "Refleksi",
  ceramah: "Ceramah",
};

// Daftar jam pelajaran sesuai dengan skema database
// Nilai yang tersedia: "1 dan 2", "3 dan 4", "5 dan 6", "7 dan 8"
const JAM_PELAJARAN = [
  { value: "1 dan 2", label: "Jam ke-1 & 2" },
  { value: "3 dan 4", label: "Jam ke-3 & 4" },
  { value: "5 dan 6", label: "Jam ke-5 & 6" },
  { value: "7 dan 8", label: "Jam ke-7 & 8" },
];

// Urutan jam untuk sorting
const JAM_ORDER = ["1 dan 2", "3 dan 4", "5 dan 6", "7 dan 8"];

// =========================================================
// Toast Notifikasi
// =========================================================
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
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
// Modal Form Agenda (Lengkap sesuai database)
// =========================================================
function AgendaModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  defaultDate,
  mapelNama,
  kelasNama,
}) {
  const [loading, setLoading] = useState(false);

  // State terpisah untuk setiap field
  const [deskripsi, setDeskripsi] = useState("");
  const [topik, setTopik] = useState("");
  const [jamMapel, setJamMapel] = useState("");
  const [metode, setMetode] = useState("");
  const [siswaTidakHadir, setSiswaTidakHadir] = useState("");
  const [date, setDate] = useState(defaultDate || toISODate(new Date()));

  // Reset form ketika modal dibuka
  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      // Mode Edit
      setDeskripsi(initialData.deskripsi || "");
      setTopik(initialData.topik || "");
      setJamMapel(initialData.jam_mapel || "");
      setMetode(initialData.metode || "");
      setSiswaTidakHadir(initialData.siswa_tidak_hadir || "");
      setDate(initialData.date || defaultDate || toISODate(new Date()));
    } else {
      // Mode Tambah Baru
      setDeskripsi("");
      setTopik("");
      setJamMapel("");
      setMetode("");
      setSiswaTidakHadir("");
      setDate(defaultDate || toISODate(new Date()));
    }
  }, [initialData, isOpen, defaultDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!deskripsi.trim() || !jamMapel) {
      return;
    }

    setLoading(true);
    try {
      const data = {
        deskripsi: deskripsi.trim(),
        topik: topik.trim(),
        jam_mapel: jamMapel, // Langsung string, tidak perlu parseInt
        metode: metode || null,
        siswa_tidak_hadir: siswaTidakHadir.trim(),
        date: date,
      };

      if (initialData) data.id = initialData.id;

      await onSubmit(data);
      onClose();
    } catch (err) {
      console.error("Error submitting agenda:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            {initialData ? "Edit Agenda Mengajar" : "Tambah Agenda Mengajar"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informasi Mapel & Kelas */}
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-800">{mapelNama}</span>
              <span className="text-slate-300">·</span>
              <span>{kelasNama}</span>
            </div>
          </div>

          {/* Topik Pembelajaran */}
          <div>
            <label
              htmlFor="topik"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Topik Pembelajaran
            </label>
            <input
              id="topik"
              type="text"
              value={topik}
              onChange={(e) => setTopik(e.target.value)}
              placeholder="Masukkan topik pembelajaran..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Deskripsi Kegiatan */}
          <div>
            <label
              htmlFor="deskripsi"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Deskripsi Kegiatan <span className="text-red-500">*</span>
            </label>
            <textarea
              id="deskripsi"
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              placeholder="Masukkan deskripsi kegiatan pembelajaran..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          {/* Jam Pelajaran */}
          <div>
            <label
              htmlFor="jam_mapel"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Jam Pelajaran <span className="text-red-500">*</span>
            </label>
            <select
              id="jam_mapel"
              value={jamMapel}
              onChange={(e) => setJamMapel(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
            >
              <option value="" disabled>
                Pilih Jam Pelajaran
              </option>
              {JAM_PELAJARAN.map((jam) => (
                <option key={jam.value} value={jam.value}>
                  {jam.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-slate-400">
              Pilih sesi jam pelajaran (1-2, 3-4, 5-6, atau 7-8)
            </p>
          </div>

          {/* Metode Pembelajaran */}
          <div>
            <label
              htmlFor="metode"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Metode Pembelajaran
            </label>
            <select
              id="metode"
              value={metode}
              onChange={(e) => setMetode(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Pilih Metode</option>
              {Object.entries(METODE_PEMBELAJARAN)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
            </select>
          </div>

          {/* Siswa Tidak Hadir */}
          <div>
            <label
              htmlFor="siswa_tidak_hadir"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Siswa Tidak Hadir
            </label>
            <input
              id="siswa_tidak_hadir"
              type="text"
              value={siswaTidakHadir}
              onChange={(e) => setSiswaTidakHadir(e.target.value)}
              placeholder="Nama siswa yang tidak hadir (pisahkan dengan koma)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Tanggal */}
          <div>
            <label
              htmlFor="date"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Tanggal <span className="text-red-500">*</span>
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Menyimpan..." : initialData ? "Update" : "Simpan"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================
// Step 1: Pilih Mapel
// =========================================================
function PilihMapelStep({ mapelOptions, onPilih }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold text-slate-900">Agenda Mengajar</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pilih mata pelajaran yang ingin Anda kelola agendanya.
      </p>

      {mapelOptions.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-400">
            Anda belum diploting mengajar mata pelajaran apa pun. Hubungi
            admin/ICT.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mapelOptions
            .sort((a, b) => a.nama_mapel.localeCompare(b.nama_mapel))
            .map((m) => (
              <button
                key={m.id}
                onClick={() => onPilih(m)}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div>
                  <p className="font-semibold text-slate-800">{m.nama_mapel}</p>
                  <p className="text-xs text-slate-400">{m.kode_mapel}</p>
                </div>
                <span className="text-slate-300">→</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
// Step 2: Pilih Kelas
// =========================================================
// =========================================================
// Step 2: Pilih Kelas (dengan desain card seperti gambar + hover biru)
// =========================================================
function PilihKelasStep({ mapel, kelasOptions, onPilih, onBack }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header dengan breadcrumb */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Ganti mata pelajaran
        </button>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pilih Kelas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pilih kelas untuk mengelola penilaian mata pelajaran{" "}
            <span className="font-medium text-slate-700">
              {mapel.nama_mapel}
            </span>
            .
          </p>
        </div>
      </div>

      {/* Grid card kelas */}
      {kelasOptions.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <p className="text-sm text-slate-400">
            Belum ada kelas yang diploting untuk mapel ini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kelasOptions
            .sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas))
            .map((k) => (
              <button
                key={k.id}
                onClick={() => onPilih(k)}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-200 hover:bg-blue-600 active:scale-[0.98]"
              >
                {/* Nama Kelas - putih saat hover */}
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-white transition-colors duration-300">
                  {k.nama_kelas}
                </h3>

                {/* Detail kelas - putih/transparan saat hover */}
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
                    Tingkat {k.tingkat}
                  </span>
                </div>

                {/* Arrow indicator - putih saat hover */}
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

                {/* Efek shimmer/kilau saat hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />

                {/* Badge kecil di pojok kanan atas */}
                <div className="absolute top-3 right-12 text-[10px] font-medium text-slate-400 group-hover:text-blue-200 transition-colors duration-300">
                  {k.tingkat}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// =========================================================
// Main Page
// =========================================================
export default function AgendaMengajarGuruMapelPage() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);

  // Auth
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);

  // Ploting guru (sumber mapel + kelas yang diampu)
  const [plotingList, setPlotingList] = useState([]);
  const [loadingPloting, setLoadingPloting] = useState(true);

  // Step: "mapel" | "kelas" | "kalender"
  const [step, setStep] = useState("mapel");
  const [selectedMapel, setSelectedMapel] = useState(null);
  const [selectedKelas, setSelectedKelas] = useState(null);

  // Kalender
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [monthAgenda, setMonthAgenda] = useState({});
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [message, setMessage] = useState(null);

  // Detail
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [modalDefaultDate, setModalDefaultDate] = useState(null);

  // =========================================================
  // Auth
  // =========================================================
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getCurrentUser());
    setCheckingAuth(false);
  }, [router]);

  // =========================================================
  // Ambil ploting_guru milik user (mapel + kelas yang diampu)
  // =========================================================
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchPloting() {
      setLoadingPloting(true);
      try {
        const records = await pb.collection("ploting_guru").getFullList({
          filter: `guru_id="${user.id}"`,
          expand: "mapel_id,kelas_id",
          requestKey: null,
        });
        if (!cancelled) setPlotingList(records);
      } catch (e) {
        if (!cancelled) {
          setMessage({
            type: "error",
            text: "Gagal memuat data ploting mengajar.",
          });
        }
      } finally {
        if (!cancelled) setLoadingPloting(false);
      }
    }

    fetchPloting();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Daftar mapel unik yang diampu guru ini
  const mapelOptions = useMemo(() => {
    const map = new Map();
    for (const r of plotingList) {
      const m = r.expand?.mapel_id;
      if (m && !map.has(m.id)) map.set(m.id, m);
    }
    return Array.from(map.values());
  }, [plotingList]);

  // Daftar kelas untuk mapel yang sedang dipilih (gabungan dari semua record ploting)
  const kelasOptions = useMemo(() => {
    if (!selectedMapel) return [];
    const map = new Map();
    for (const r of plotingList) {
      if (r.mapel_id !== selectedMapel.id) continue;
      const kelasArr = r.expand?.kelas_id || [];
      for (const k of kelasArr) {
        if (!map.has(k.id)) map.set(k.id, k);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nama_kelas.localeCompare(b.nama_kelas),
    );
  }, [plotingList, selectedMapel]);

  // =========================================================
  // Load Month Agenda (difilter mapel + kelas)
  // =========================================================
  const loadMonth = useCallback(async () => {
    if (!selectedKelas || !selectedMapel) return;

    setLoadingCalendar(true);
    try {
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const startStr = `${toISODate(first)} 00:00:00`;
      const endStr = `${toISODate(last)} 23:59:59`;

      const records = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${selectedKelas.id}" && mapel_id="${selectedMapel.id}" && date >= "${startStr}" && date <= "${endStr}"`,
        sort: "date,jam_mapel",
        expand: "mapel_id,kelas_id",
        requestKey: null,
      });

      const grouped = {};
      for (const r of records) {
        const key = toISODate(new Date(r.date));
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      }
      setMonthAgenda(grouped);
    } catch (e) {
      console.error("Error loading month agenda:", e);
      setMessage({
        type: "error",
        text: "Gagal memuat data agenda bulan ini.",
      });
    } finally {
      setLoadingCalendar(false);
    }
  }, [selectedKelas, selectedMapel, viewDate]);

  useEffect(() => {
    if (step === "kalender") loadMonth();
  }, [loadMonth, step]);

  // =========================================================
  // Day Summary
  // =========================================================
  function daySummary(date) {
    const key = toISODate(date);
    const items = monthAgenda[key] || [];
    return items.length > 0 ? { total: items.length } : null;
  }

  // =========================================================
  // Open Detail
  // =========================================================
  async function openDetail(date) {
    setSelectedDate(date);
    setMessage(null);
    const key = toISODate(date);
    const items = monthAgenda[key] || [];

    // Refresh data dengan expand lengkap
    const refreshedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const fullItem = await pb
            .collection("agenda_mengajar")
            .getOne(item.id, {
              expand: "mapel_id,kelas_id",
              requestKey: null,
            });
          return fullItem;
        } catch {
          return item;
        }
      }),
    );

    // Sort berdasarkan urutan jam yang benar
    const sortedItems = refreshedItems.sort((a, b) => {
      const indexA = JAM_ORDER.indexOf(a.jam_mapel);
      const indexB = JAM_ORDER.indexOf(b.jam_mapel);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    setDetailItems(sortedItems);
  }

  // =========================================================
  // CRUD Operations with Validation
  // =========================================================
  const handleCreate = async (data) => {
    try {
      // Validasi: Cek apakah sudah ada agenda dengan mapel dan jam yang sama di tanggal yang sama
      const existing = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${selectedKelas.id}" && mapel_id="${selectedMapel.id}" && date="${data.date}" && jam_mapel="${data.jam_mapel}"`,
        requestKey: null,
      });

      if (existing.length > 0) {
        setMessage({
          type: "error",
          text: `Mata pelajaran ini sudah memiliki agenda pada ${data.jam_mapel} tanggal ${formatLong(data.date)}.`,
        });
        return;
      }

      // Cek apakah jam tersebut sudah digunakan oleh mapel lain di tanggal yang sama
      const existingJam = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${selectedKelas.id}" && date="${data.date}" && jam_mapel="${data.jam_mapel}"`,
        requestKey: null,
      });

      if (existingJam.length > 0) {
        setMessage({
          type: "error",
          text: `Jam ${data.jam_mapel} sudah digunakan oleh mata pelajaran lain pada tanggal ${formatLong(data.date)}.`,
        });
        return;
      }

      const created = await pb.collection("agenda_mengajar").create(
        {
          deskripsi: data.deskripsi,
          topik: data.topik,
          jam_mapel: data.jam_mapel,
          metode: data.metode,
          siswa_tidak_hadir: data.siswa_tidak_hadir,
          date: data.date,
          kelas_id: selectedKelas.id,
          mapel_id: selectedMapel.id,
        },
        { requestKey: null },
      );

      setMessage({ type: "success", text: "Agenda berhasil ditambahkan!" });
      await loadMonth();

      if (selectedDate && isSameDate(selectedDate, new Date(data.date))) {
        const fullItem = await pb
          .collection("agenda_mengajar")
          .getOne(created.id, {
            expand: "mapel_id,kelas_id",
            requestKey: null,
          });
        setDetailItems((prev) =>
          [...prev, fullItem].sort((a, b) => {
            const indexA = JAM_ORDER.indexOf(a.jam_mapel);
            const indexB = JAM_ORDER.indexOf(b.jam_mapel);
            return (
              (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
            );
          }),
        );
      }
    } catch (err) {
      console.error("Error creating agenda:", err);
      setMessage({ type: "error", text: "Gagal menambahkan agenda." });
      throw err;
    }
  };

  const handleUpdate = async (data) => {
    if (!editingItem) return;
    try {
      // Validasi: Cek apakah ada agenda lain dengan mapel dan jam yang sama
      const existing = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${selectedKelas.id}" && mapel_id="${selectedMapel.id}" && date="${data.date}" && jam_mapel="${data.jam_mapel}" && id != "${editingItem.id}"`,
        requestKey: null,
      });

      if (existing.length > 0) {
        setMessage({
          type: "error",
          text: `Mata pelajaran ini sudah memiliki agenda pada ${data.jam_mapel} tanggal ${formatLong(data.date)}.`,
        });
        return;
      }

      // Cek apakah jam tersebut sudah digunakan oleh mapel lain
      const existingJam = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${selectedKelas.id}" && date="${data.date}" && jam_mapel="${data.jam_mapel}" && id != "${editingItem.id}"`,
        requestKey: null,
      });

      if (existingJam.length > 0) {
        setMessage({
          type: "error",
          text: `Jam ${data.jam_mapel} sudah digunakan oleh mata pelajaran lain pada tanggal ${formatLong(data.date)}.`,
        });
        return;
      }

      const updated = await pb.collection("agenda_mengajar").update(
        editingItem.id,
        {
          deskripsi: data.deskripsi,
          topik: data.topik,
          jam_mapel: data.jam_mapel,
          metode: data.metode,
          siswa_tidak_hadir: data.siswa_tidak_hadir,
          date: data.date,
        },
        { requestKey: null },
      );

      setMessage({ type: "success", text: "Agenda berhasil diperbarui!" });
      await loadMonth();

      const fullItem = await pb
        .collection("agenda_mengajar")
        .getOne(updated.id, {
          expand: "mapel_id,kelas_id",
          requestKey: null,
        });
      setDetailItems((prev) =>
        prev
          .map((it) => (it.id === fullItem.id ? fullItem : it))
          .sort((a, b) => {
            const indexA = JAM_ORDER.indexOf(a.jam_mapel);
            const indexB = JAM_ORDER.indexOf(b.jam_mapel);
            return (
              (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
            );
          }),
      );
    } catch (err) {
      console.error("Error updating agenda:", err);
      setMessage({ type: "error", text: "Gagal memperbarui agenda." });
      throw err;
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Yakin ingin menghapus agenda ini?")) return;

    try {
      await pb.collection("agenda_mengajar").delete(id, { requestKey: null });
      setMessage({ type: "success", text: "Agenda berhasil dihapus!" });
      await loadMonth();
      setDetailItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err) {
      console.error("Error deleting agenda:", err);
      setMessage({ type: "error", text: "Gagal menghapus agenda." });
    }
  };

  // =========================================================
  // Navigation
  // =========================================================
  function goToMonth(offset) {
    setViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    openDetail(today);
  }

  function openAddModal(date) {
    setEditingItem(null);
    setModalDefaultDate(date ? toISODate(date) : toISODate(new Date()));
    setIsModalOpen(true);
  }

  function pilihMapel(m) {
    setSelectedMapel(m);
    setSelectedKelas(null);
    setStep("kelas");
  }

  function pilihKelas(k) {
    setSelectedKelas(k);
    setSelectedDate(null);
    setDetailItems([]);
    setMonthAgenda({});
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setStep("kalender");
  }

  function backKeMapel() {
    setStep("mapel");
    setSelectedMapel(null);
    setSelectedKelas(null);
  }

  function backKeKelas() {
    setStep("kelas");
    setSelectedKelas(null);
    setSelectedDate(null);
    setDetailItems([]);
  }

  // =========================================================
  // Build Calendar Grid
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

  // =========================================================
  // Render
  // =========================================================
  if (checkingAuth || loadingPloting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Memuat...</p>
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
      `}</style>
      <Toast toast={message} onClose={() => setMessage(null)} />

      {step === "mapel" && (
        <PilihMapelStep mapelOptions={mapelOptions} onPilih={pilihMapel} />
      )}

      {step === "kelas" && selectedMapel && (
        <PilihKelasStep
          mapel={selectedMapel}
          kelasOptions={kelasOptions}
          onPilih={pilihKelas}
          onBack={backKeMapel}
        />
      )}

      {step === "kalender" && selectedMapel && selectedKelas && (
        <div className="mx-auto max-w-5xl px-4 py-6">
          {/* Breadcrumb */}
          <div className="mb-4 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            <button
              onClick={backKeMapel}
              className="hover:text-indigo-600 hover:underline"
            >
              {selectedMapel.nama_mapel}
            </button>
            <span>/</span>
            <button
              onClick={backKeKelas}
              className="hover:text-indigo-600 hover:underline"
            >
              {selectedKelas.nama_kelas}
            </button>
          </div>

          {/* Kartu kalender */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-900 sm:text-sm md:text-base">
                  {BULAN[viewDate.getMonth()]} {viewDate.getFullYear()}
                </span>
                <button
                  onClick={goToToday}
                  className="flex-shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Hari ini
                </button>
                <span className="ml-2 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                  {selectedKelas.nama_kelas}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {selectedMapel.nama_mapel}
                </span>
              </div>
              <button
                onClick={() => openAddModal(selectedDate || today)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                + Tambah
              </button>
            </div>

            {/* Navigasi bulan */}
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2 sm:justify-between">
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

            {/* Grid tanggal */}
            <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
              {loadingCalendar &&
                Array.from({ length: 35 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square animate-pulse rounded-lg bg-slate-100"
                  />
                ))}

              {!loadingCalendar &&
                cells.map((date, i) => {
                  if (!date) return <div key={i} className="aspect-square" />;

                  const isFuture = date > today;
                  const isToday = isSameDate(date, today);
                  const isSelected =
                    selectedDate && isSameDate(date, selectedDate);
                  const summary = daySummary(date);

                  return (
                    <button
                      key={i}
                      disabled={isFuture}
                      onClick={() => openDetail(date)}
                      className={`relative flex aspect-square min-w-0 flex-col items-center justify-start overflow-hidden rounded-md border p-0.5 text-left transition sm:rounded-lg sm:p-1
                        ${
                          isFuture
                            ? "cursor-not-allowed border-transparent text-slate-300"
                            : "cursor-pointer border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40"
                        }
                        ${isSelected ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : ""}
                      `}
                    >
                      <span
                        className={`mt-0.5 text-[10px] font-medium sm:text-xs ${
                          isToday
                            ? "flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white sm:h-5 sm:w-5"
                            : "text-slate-700"
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      {summary && summary.total > 0 && (
                        <span className="mt-0.5 text-[8px] font-medium text-indigo-600 sm:text-[9px]">
                          {summary.total} agenda
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Legenda */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 sm:gap-3 sm:text-xs">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                Ada agenda
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full border border-slate-300" />
                Tidak ada agenda
              </span>
            </div>
          </div>

          {/* Panel detail agenda per tanggal */}
          {selectedDate && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Agenda Mengajar
                  </h2>
                  <p className="text-sm text-slate-500">
                    {formatLong(selectedDate)}
                  </p>
                </div>
                <button
                  onClick={() => openAddModal(selectedDate)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  + Tambah Agenda
                </button>
              </div>

              {detailItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <p className="text-sm text-slate-400">
                    Belum ada agenda untuk tanggal ini
                  </p>
                  <button
                    onClick={() => openAddModal(selectedDate)}
                    className="mt-2 text-sm font-semibold text-indigo-600 hover:underline"
                  >
                    Tambah agenda sekarang
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {detailItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-slate-100 p-4 transition hover:border-slate-200"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1 space-y-1.5">
                          {/* Header dengan nomor urut, mapel, dan jam */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                              {index + 1}
                            </span>
                            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                              {item.expand?.mapel_id?.nama_mapel ||
                                item.nama_mapel ||
                                "Tanpa Mapel"}
                            </span>
                            {item.expand?.mapel_id?.kode_mapel && (
                              <span className="text-xs text-slate-400">
                                {item.expand.mapel_id.kode_mapel}
                              </span>
                            )}
                            {item.jam_mapel && (
                              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                                {item.jam_mapel}
                              </span>
                            )}
                          </div>

                          {/* Topik */}
                          {item.topik && (
                            <p className="text-sm font-semibold text-slate-800">
                              📚 {item.topik}
                            </p>
                          )}

                          {/* Deskripsi */}
                          <p className="text-sm text-slate-700">
                            {item.deskripsi}
                          </p>

                          {/* Detail tambahan */}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            {/* Metode */}
                            {item.metode && (
                              <span className="flex items-center gap-1">
                                <span className="text-slate-400">Metode:</span>
                                <span className="font-medium text-slate-700">
                                  {METODE_PEMBELAJARAN[item.metode] ||
                                    item.metode}
                                </span>
                              </span>
                            )}

                            {/* Siswa Tidak Hadir */}
                            {item.siswa_tidak_hadir && (
                              <span className="flex items-center gap-1">
                                <span className="text-slate-400">
                                  Tidak Hadir:
                                </span>
                                <span className="font-medium text-rose-600">
                                  {item.siswa_tidak_hadir}
                                </span>
                              </span>
                            )}
                          </div>

                          {/* Timestamp */}
                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                            <span>
                              Dibuat:{" "}
                              {new Date(item.created).toLocaleString("id-ID", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {item.updated && item.updated !== item.created && (
                              <span>
                                Diperbarui:{" "}
                                {new Date(item.updated).toLocaleString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setModalDefaultDate(null);
                              setIsModalOpen(true);
                            }}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                            title="Edit"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Hapus"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                <button
                  onClick={() => setSelectedDate(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      <AgendaModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
          setModalDefaultDate(null);
        }}
        onSubmit={editingItem ? handleUpdate : handleCreate}
        initialData={editingItem}
        defaultDate={modalDefaultDate || toISODate(today)}
        mapelNama={selectedMapel?.nama_mapel}
        kelasNama={selectedKelas?.nama_kelas}
      />
    </div>
  );
}
