"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
// Sesuaikan path import berikut dengan lokasi file pocketbase client di project-mu
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// =========================================================
// Konfigurasi status absensi (warna & label)
// =========================================================
const STATUS_CONFIG = {
  hadir: {
    label: "Hadir",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    active: "bg-emerald-600 text-white border-emerald-600",
    idle: "bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50",
  },
  izin: {
    label: "Izin",
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 border border-sky-200",
    active: "bg-sky-600 text-white border-sky-600",
    idle: "bg-white text-sky-700 border border-sky-200 hover:bg-sky-50",
  },
  sakit: {
    label: "Sakit",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 border border-amber-200",
    active: "bg-amber-600 text-white border-amber-600",
    idle: "bg-white text-amber-700 border border-amber-200 hover:bg-amber-50",
  },
  alpha: {
    label: "Alpha",
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 border border-rose-200",
    active: "bg-rose-600 text-white border-rose-600",
    idle: "bg-white text-rose-700 border border-rose-200 hover:bg-rose-50",
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
  // dateStr: 'YYYY-MM-DD'
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

// =========================================================
// Popup notifikasi (toast) untuk status berhasil / gagal
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

export default function AbsensiPage() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);

  // ---------------- Auth ----------------
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getCurrentUser());
    setCheckingAuth(false);
  }, [router]);

  // ---------------- Resolusi kelas ----------------
  // Logika: kelas_id di absensi mengikuti kelas dimana user login
  // tercatat sebagai walikelas_id ATAU pendamping_id.
  // Untuk admin/ict/guru mapel, kelas dipilih manual dari dropdown.
  const [kelas, setKelas] = useState(null);
  const [kelasOptions, setKelasOptions] = useState([]);
  const [needsKelasPicker, setNeedsKelasPicker] = useState(false);
  const [noKelasAssigned, setNoKelasAssigned] = useState(false);
  const [resolvingKelas, setResolvingKelas] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function resolve() {
      setResolvingKelas(true);
      setNoKelasAssigned(false);
      const role = user.role;

      if (role === "guru walikelas" || role === "guru pendamping") {
        try {
          const rec = await pb
            .collection("kelas")
            .getFirstListItem(
              `walikelas_id="${user.id}" || pendamping_id="${user.id}"`,
              { requestKey: null },
            );
          if (!cancelled) {
            setKelas(rec);
            setNeedsKelasPicker(false);
          }
        } catch (e) {
          if (!cancelled) setNoKelasAssigned(true);
        }
      } else {
        try {
          const list = await pb.collection("kelas").getFullList({
            sort: "nama_kelas",
            requestKey: null,
          });
          if (!cancelled) {
            setKelasOptions(list);
            setNeedsKelasPicker(true);
          }
        } catch (e) {
          if (!cancelled)
            setMessage({ type: "error", text: "Gagal memuat daftar kelas." });
        }
      }
      if (!cancelled) setResolvingKelas(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---------------- Daftar siswa di kelas terpilih ----------------
  const [siswaList, setSiswaList] = useState([]);
  const [loadingSiswa, setLoadingSiswa] = useState(false);

  useEffect(() => {
    if (!kelas) {
      setSiswaList([]);
      return;
    }
    let cancelled = false;

    async function load() {
      setLoadingSiswa(true);
      try {
        const list = await pb.collection("siswa").getFullList({
          filter: `kelas_id="${kelas.id}"`,
          sort: "nama_siswa",
          requestKey: null,
        });
        if (!cancelled) setSiswaList(list);
      } catch (e) {
        if (!cancelled)
          setMessage({ type: "error", text: "Gagal memuat daftar siswa." });
      } finally {
        if (!cancelled) setLoadingSiswa(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [kelas]);

  // ---------------- Tab aktif: Kalender / Rekap ----------------
  const [activeTab, setActiveTab] = useState("kalender"); // "kalender" | "rekap"

  // ---------------- Kalender ----------------
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [monthAbsensi, setMonthAbsensi] = useState({}); // { 'YYYY-MM-DD': [record,...] }
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }

  const loadMonth = useCallback(async () => {
    if (!kelas) return;
    setLoadingCalendar(true);
    try {
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const startStr = `${toISODate(first)} 00:00:00`;
      const endStr = `${toISODate(last)} 23:59:59`;

      const records = await pb.collection("absensi").getFullList({
        filter: `kelas_id="${kelas.id}" && tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
        requestKey: null,
      });

      const grouped = {};
      for (const r of records) {
        const key = toISODate(new Date(r.tanggal));
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      }
      setMonthAbsensi(grouped);
    } catch (e) {
      setMessage({
        type: "error",
        text: "Gagal memuat data absensi bulan ini.",
      });
    } finally {
      setLoadingCalendar(false);
    }
  }, [kelas, viewDate]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  function daySummary(date) {
    const key = toISODate(date);
    const records = monthAbsensi[key] || [];
    if (records.length === 0) return null;
    const counts = { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
    for (const r of records) {
      if (counts[r.status] !== undefined) counts[r.status]++;
    }
    return { total: records.length, counts };
  }

  // ---------------- Detail / form absensi harian ----------------
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailRows, setDetailRows] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  // isEditingDay: false berarti panel tampil read-only (karena hari itu SUDAH diabsen)
  // dan harus klik "Edit Absensi" dulu sebelum bisa diubah. true berarti bisa diisi/diedit.
  const [isEditingDay, setIsEditingDay] = useState(false);

  const openDetail = useCallback(
    async (date) => {
      setSelectedDate(date);
      setMessage(null);
      if (!kelas || siswaList.length === 0) {
        setDetailRows([]);
        return;
      }
      setLoadingDetail(true);
      try {
        const dateStr = toISODate(date);
        const existing = monthAbsensi[dateStr] || [];
        const byStudent = {};
        for (const r of existing) byStudent[r.siswa_id] = r;

        const rows = siswaList.map((s) => ({
          siswaId: s.id,
          nama: s.nama_siswa,
          nis: s.nis,
          recordId: byStudent[s.id]?.id || null,
          status: byStudent[s.id]?.status || "hadir",
        }));
        setDetailRows(rows);
        // Kalau belum ada satupun record untuk tanggal ini -> langsung mode isi.
        // Kalau sudah ada (sebagian/semua) -> tampilkan read-only dulu, wajib klik Edit.
        const hasAny = rows.some((r) => r.recordId);
        setIsEditingDay(!hasAny);
      } finally {
        setLoadingDetail(false);
      }
    },
    [kelas, siswaList, monthAbsensi],
  );

  function updateRowStatus(siswaId, status) {
    setDetailRows((prev) =>
      prev.map((r) => (r.siswaId === siswaId ? { ...r, status } : r)),
    );
  }

  function markAllHadir() {
    setDetailRows((prev) => prev.map((r) => ({ ...r, status: "hadir" })));
  }

  function startEditDay() {
    setIsEditingDay(true);
  }

  function cancelEditDay() {
    // Batalkan perubahan yang belum disimpan dengan memuat ulang data asli
    if (selectedDate) openDetail(selectedDate);
  }

  async function handleSubmitAbsensi() {
    if (!kelas || !selectedDate) return;
    setSaving(true);
    setMessage(null);
    try {
      const dateStr = toISODate(selectedDate);
      const startStr = `${dateStr} 00:00:00`;
      const endStr = `${dateStr} 23:59:59`;

      // Validasi ulang langsung ke server tepat sebelum menyimpan: cek apakah
      // sudah ada record absensi untuk tanggal ini. Kalau sudah ada, WAJIB
      // update record tsb (bukan bikin baru) -- ini mencegah data absensi ganda
      // untuk siswa & tanggal yang sama, walaupun ada perubahan dari sesi/perangkat lain.
      const existingNow = await pb.collection("absensi").getFullList({
        filter: `kelas_id="${kelas.id}" && tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
        requestKey: null,
      });
      const existingByStudent = {};
      for (const r of existingNow) existingByStudent[r.siswa_id] = r;

      // PENTING: requestKey: null wajib dipakai di sini. Tanpa ini, PocketBase SDK
      // otomatis meng-cancel request yang dianggap "duplikat" (create/update ke
      // collection yang sama secara bersamaan), sehingga sebagian data siswa
      // gagal tersimpan (contoh: 21 dari 27 siswa) meskipun tidak ada error nyata.
      await Promise.all(
        detailRows.map(async (row) => {
          const existing = existingByStudent[row.siswaId];
          if (existing) {
            // Sudah pernah diabsen untuk tanggal ini -> update, BUKAN tambah data baru
            await pb
              .collection("absensi")
              .update(
                existing.id,
                { status: row.status },
                { requestKey: null },
              );
          } else {
            await pb.collection("absensi").create(
              {
                kelas_id: kelas.id,
                siswa_id: row.siswaId,
                tanggal: dateStr,
                status: row.status,
              },
              { requestKey: null },
            );
          }
        }),
      );

      setMessage({ type: "success", text: "Absensi berhasil disimpan." });
      await loadMonth();
      await openDetail(selectedDate);
    } catch (e) {
      setMessage({
        type: "error",
        text: "Gagal menyimpan absensi. Silakan coba lagi.",
      });
    } finally {
      setSaving(false);
      location.reload();
    }
  }

  // ---------------- Bangun grid kalender ----------------
  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = (firstOfMonth.getDay() + 6) % 7; // Senin = index 0

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
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    openDetail(today);
  }

  // =========================================================
  // ---------------- Tab Rekap ----------------
  // =========================================================
  const [rekapStart, setRekapStart] = useState(() =>
    toISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [rekapEnd, setRekapEnd] = useState(() => toISODate(today));
  const [rekapRecords, setRekapRecords] = useState([]);
  const [loadingRekap, setLoadingRekap] = useState(false);
  const [rekapError, setRekapError] = useState(null);

  const loadRekap = useCallback(async () => {
    if (!kelas) return;
    if (!rekapStart || !rekapEnd) return;
    setLoadingRekap(true);
    setRekapError(null);
    try {
      const startStr = `${rekapStart} 00:00:00`;
      const endStr = `${rekapEnd} 23:59:59`;
      const records = await pb.collection("absensi").getFullList({
        filter: `kelas_id="${kelas.id}" && tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
        requestKey: null,
      });
      setRekapRecords(records);
    } catch (e) {
      setRekapError("Gagal memuat data rekap absensi.");
    } finally {
      setLoadingRekap(false);
    }
  }, [kelas, rekapStart, rekapEnd]);

  useEffect(() => {
    if (activeTab === "rekap") loadRekap();
  }, [activeTab, loadRekap]);

  // Rekap per siswa: akumulasi hadir/izin/sakit/alpha + persentase
  const rekapPerSiswa = useMemo(() => {
    const bySiswa = {};
    for (const s of siswaList) {
      bySiswa[s.id] = {
        siswaId: s.id,
        nama: s.nama_siswa,
        nis: s.nis,
        counts: { hadir: 0, izin: 0, sakit: 0, alpha: 0 },
      };
    }
    for (const r of rekapRecords) {
      if (
        bySiswa[r.siswa_id] &&
        bySiswa[r.siswa_id].counts[r.status] !== undefined
      ) {
        bySiswa[r.siswa_id].counts[r.status]++;
      }
    }

    // Jumlah hari efektif = jumlah tanggal unik yang sudah pernah diabsen dalam rentang ini
    const uniqueDates = new Set(
      rekapRecords.map((r) => toISODate(new Date(r.tanggal))),
    );
    const totalHariEfektif = uniqueDates.size;

    const list = Object.values(bySiswa).map((s) => {
      const totalTercatat =
        s.counts.hadir + s.counts.izin + s.counts.sakit + s.counts.alpha;
      const denom = totalHariEfektif > 0 ? totalHariEfektif : totalTercatat;
      const persenHadir = denom > 0 ? (s.counts.hadir / denom) * 100 : 0;
      const persenTidakHadir = denom > 0 ? 100 - persenHadir : 0;
      return {
        ...s,
        totalTercatat,
        persenHadir,
        persenTidakHadir,
      };
    });

    // Urutkan berdasar % hadir tertinggi -> "paling rajin"
    list.sort(
      (a, b) =>
        b.persenHadir - a.persenHadir || b.counts.hadir - a.counts.hadir,
    );

    return { list, totalHariEfektif };
  }, [rekapRecords, siswaList]);

  // Total akumulasi seluruh kelas
  const rekapTotals = useMemo(() => {
    const totals = { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
    for (const s of rekapPerSiswa.list) {
      totals.hadir += s.counts.hadir;
      totals.izin += s.counts.izin;
      totals.sakit += s.counts.sakit;
      totals.alpha += s.counts.alpha;
    }
    const totalSemua = totals.hadir + totals.izin + totals.sakit + totals.alpha;
    const persenHadir = totalSemua > 0 ? (totals.hadir / totalSemua) * 100 : 0;
    const persenTidakHadir = totalSemua > 0 ? 100 - persenHadir : 0;
    return { ...totals, totalSemua, persenHadir, persenTidakHadir };
  }, [rekapPerSiswa]);

  const siswaPalingRajin = useMemo(
    () => rekapPerSiswa.list.filter((s) => s.totalTercatat > 0).slice(0, 3),
    [rekapPerSiswa],
  );

  function exportRekapToExcel() {
    if (!kelas) return;

    const rows = rekapPerSiswa.list.map((s, i) => ({
      No: i + 1,
      "Nama Siswa": s.nama,
      NIS: s.nis || "-",
      Hadir: s.counts.hadir,
      Izin: s.counts.izin,
      Sakit: s.counts.sakit,
      Alpha: s.counts.alpha,
      "Total Hari Tercatat": s.totalTercatat,
      "% Hadir": Number(s.persenHadir.toFixed(1)),
      "% Tidak Hadir": Number(s.persenTidakHadir.toFixed(1)),
    }));

    // Baris ringkasan di paling bawah
    rows.push({});
    rows.push({
      No: "",
      "Nama Siswa": "TOTAL KELAS",
      NIS: "",
      Hadir: rekapTotals.hadir,
      Izin: rekapTotals.izin,
      Sakit: rekapTotals.sakit,
      Alpha: rekapTotals.alpha,
      "Total Hari Tercatat": rekapPerSiswa.totalHariEfektif,
      "% Hadir": Number(rekapTotals.persenHadir.toFixed(1)),
      "% Tidak Hadir": Number(rekapTotals.persenTidakHadir.toFixed(1)),
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 4 },
      { wch: 24 },
      { wch: 12 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 18 },
      { wch: 10 },
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");

    const namaKelas = (kelas.nama_kelas || "kelas").replace(
      /[^a-z0-9]+/gi,
      "-",
    );
    const fileName = `Rekap-Absensi-${namaKelas}_${rekapStart}_sd_${rekapEnd}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  // =========================================================
  // Render
  // =========================================================
  if (checkingAuth || resolvingKelas) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Memuat...</p>
      </div>
    );
  }

  if (noKelasAssigned) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="font-medium text-rose-700">
            Anda belum ditugaskan ke kelas manapun.
          </p>
          <p className="mt-1 text-sm text-rose-600">
            Hubungi admin atau ICT untuk mengatur kelas sebagai wali kelas /
            guru pendamping.
          </p>
        </div>
      </div>
    );
  }

  const totalSiswa = siswaList.length;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Toast toast={message} onClose={() => setMessage(null)} />

      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Pemilih kelas (admin / ict / guru mapel) */}
        {needsKelasPicker && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Pilih Kelas
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={kelas?.id || ""}
              onChange={(e) => {
                const found = kelasOptions.find((k) => k.id === e.target.value);
                setKelas(found || null);
                setSelectedDate(null);
                setDetailRows([]);
              }}
            >
              <option value="" disabled>
                -- Pilih kelas --
              </option>
              {kelasOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama_kelas}
                </option>
              ))}
            </select>
          </div>
        )}

        {kelas && (
          <>
            {/* Navigasi tab */}
            <div className="mb-4 flex gap-2 rounded-xl border border-slate-200 bg-white p-1">
              <button
                onClick={() => setActiveTab("kalender")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  activeTab === "kalender"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Kalender
              </button>
              <button
                onClick={() => setActiveTab("rekap")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  activeTab === "rekap"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Rekap
              </button>
            </div>

            {/* ================= TAB KALENDER ================= */}
            {activeTab === "kalender" && (
              <>
                {/* Kartu kalender */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  {/* Navigasi bulan */}
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-2 sm:justify-between">
                    <div className="order-1 flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto">
                      <span className="text-base font-semibold text-slate-900 sm:text-sm md:text-base">
                        {BULAN[viewDate.getMonth()]} {viewDate.getFullYear()}
                      </span>
                      <button
                        onClick={goToToday}
                        className="flex-shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
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
                        if (!date)
                          return <div key={i} className="aspect-square" />;

                        const isFuture = date > today;
                        const isToday = isSameDate(date, today);
                        const isSelected =
                          selectedDate && isSameDate(date, selectedDate);
                        const summary = daySummary(date);
                        const isUnfilled =
                          !isFuture &&
                          (!summary || summary.total < totalSiswa) &&
                          totalSiswa > 0;

                        return (
                          <button
                            key={i}
                            disabled={isFuture}
                            onClick={() => openDetail(date)}
                            className={`relative flex aspect-square min-w-0 flex-col items-center justify-start overflow-hidden rounded-md border p-0.5 text-left transition sm:rounded-lg sm:p-1
                              ${isFuture ? "cursor-not-allowed border-transparent text-slate-300" : "cursor-pointer border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40"}
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

                            {/* Badge status */}
                            {summary && (
                              <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 sm:mt-1">
                                {STATUS_ORDER.filter(
                                  (s) => summary.counts[s] > 0,
                                ).map((s) => (
                                  <span
                                    key={s}
                                    title={`${STATUS_CONFIG[s].label}: ${summary.counts[s]}`}
                                    className={`h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5 ${STATUS_CONFIG[s].dot}`}
                                  />
                                ))}
                              </div>
                            )}
                            {isUnfilled && !summary && (
                              <span className="mt-0.5 h-1 w-1 rounded-full border border-slate-300 sm:mt-1 sm:h-1.5 sm:w-1.5" />
                            )}
                            {isUnfilled && summary && (
                              <span className="mt-0.5 text-[8px] font-medium text-amber-600 sm:text-[9px]">
                                {summary.total}/{totalSiswa}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>

                  {/* Legenda */}
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

                {/* Panel detail absensi harian */}
                {selectedDate && (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Detail Absensi
                        </h2>
                        <p className="text-sm text-slate-500">
                          {formatLong(selectedDate)}
                        </p>
                      </div>
                      {!loadingDetail && totalSiswa > 0 && (
                        <>
                          {isEditingDay ? (
                            <div className="flex gap-2">
                              <button
                                onClick={markAllHadir}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                              >
                                Tandai semua Hadir
                              </button>
                              {detailRows.some((r) => r.recordId) && (
                                <button
                                  onClick={cancelEditDay}
                                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                >
                                  Batal
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={startEditDay}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                            >
                              Edit Absensi
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {loadingSiswa || loadingDetail ? (
                      <p className="py-6 text-center text-sm text-slate-400">
                        Memuat data siswa...
                      </p>
                    ) : totalSiswa === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-400">
                        Belum ada siswa terdaftar di kelas ini.
                      </p>
                    ) : !isEditingDay ? (
                      // ---------- MODE LIHAT (read-only): tanggal ini sudah pernah diabsen ----------
                      <>
                        <div className="mb-3 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                            ✓
                          </span>
                          Tanggal ini sudah diabsen (
                          {detailRows.filter((r) => r.recordId).length}/
                          {totalSiswa} siswa). Klik
                          <span className="font-semibold">
                            &nbsp;Edit Absensi&nbsp;
                          </span>
                          untuk mengubah.
                        </div>
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
                              {row.recordId ? (
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
                        <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                          <button
                            onClick={() => setSelectedDate(null)}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                          >
                            Tutup
                          </button>
                        </div>
                      </>
                    ) : (
                      // ---------- MODE EDIT/ISI ----------
                      <>
                        <div className="divide-y divide-slate-100">
                          {detailRows.map((row) => (
                            <div
                              key={row.siswaId}
                              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
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
                              <div className="flex flex-wrap gap-1.5">
                                {STATUS_ORDER.map((s) => (
                                  <button
                                    key={s}
                                    onClick={() =>
                                      updateRowStatus(row.siswaId, s)
                                    }
                                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                                      row.status === s
                                        ? STATUS_CONFIG[s].active
                                        : STATUS_CONFIG[s].idle
                                    }`}
                                  >
                                    {STATUS_CONFIG[s].label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                          <button
                            onClick={() =>
                              detailRows.some((r) => r.recordId)
                                ? cancelEditDay()
                                : setSelectedDate(null)
                            }
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                          >
                            {detailRows.some((r) => r.recordId)
                              ? "Batal"
                              : "Tutup"}
                          </button>
                          <button
                            onClick={handleSubmitAbsensi}
                            disabled={saving}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {saving
                              ? "Menyimpan..."
                              : detailRows.some((r) => r.recordId)
                                ? "Perbarui Absensi"
                                : "Simpan Absensi"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ================= TAB REKAP ================= */}
            {activeTab === "rekap" && (
              <div className="space-y-6">
                {/* Filter rentang tanggal + export */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Dari tanggal
                      </label>
                      <input
                        type="date"
                        value={rekapStart}
                        max={rekapEnd}
                        onChange={(e) => setRekapStart(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Sampai tanggal
                      </label>
                      <input
                        type="date"
                        value={rekapEnd}
                        min={rekapStart}
                        max={toISODate(today)}
                        onChange={(e) => setRekapEnd(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      onClick={loadRekap}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Muat Ulang
                    </button>
                    <button
                      onClick={exportRekapToExcel}
                      disabled={loadingRekap || totalSiswa === 0}
                      className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Export ke Excel
                    </button>
                  </div>
                  {rekapError && (
                    <p className="mt-2 text-xs text-rose-600">{rekapError}</p>
                  )}
                </div>

                {loadingRekap ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                    Memuat data rekap...
                  </div>
                ) : totalSiswa === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                    Belum ada siswa terdaftar di kelas ini.
                  </div>
                ) : (
                  <>
                    {/* Kartu ringkasan akumulasi */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {STATUS_ORDER.map((s) => (
                        <div
                          key={s}
                          className="rounded-xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${STATUS_CONFIG[s].dot}`}
                            />
                            <span className="text-xs font-medium text-slate-500">
                              {STATUS_CONFIG[s].label}
                            </span>
                          </div>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {rekapTotals[s]}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Persentase kehadiran vs ketidakhadiran */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">
                        Persentase Kehadiran Kelas
                      </h3>
                      <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-rose-100">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${rekapTotals.persenHadir}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1.5 text-emerald-700">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Hadir: {rekapTotals.persenHadir.toFixed(1)}%
                        </span>
                        <span className="flex items-center gap-1.5 text-rose-700">
                          <span className="h-2 w-2 rounded-full bg-rose-400" />
                          Tidak Hadir (Izin+Sakit+Alpha):{" "}
                          {rekapTotals.persenTidakHadir.toFixed(1)}%
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        Periode {formatShort(rekapStart)} –{" "}
                        {formatShort(rekapEnd)} ·{" "}
                        {rekapPerSiswa.totalHariEfektif} hari tercatat
                      </p>
                    </div>

                    {/* Ranking paling rajin */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">
                        🏆 Siswa Paling Rajin
                      </h3>
                      {siswaPalingRajin.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          Belum ada data absensi pada periode ini.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {siswaPalingRajin.map((s, i) => (
                            <div
                              key={s.siswaId}
                              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                                    i === 0
                                      ? "bg-amber-400"
                                      : i === 1
                                        ? "bg-slate-400"
                                        : "bg-amber-700"
                                  }`}
                                >
                                  {i + 1}
                                </span>
                                <div>
                                  <p className="text-sm font-medium text-slate-800">
                                    {s.nama}
                                  </p>
                                  {s.nis && (
                                    <p className="text-xs text-slate-400">
                                      NIS: {s.nis}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                {s.persenHadir.toFixed(1)}% hadir
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tabel rekap per siswa */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                      <h3 className="mb-3 text-sm font-semibold text-slate-900">
                        Rekap per Siswa
                      </h3>
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs text-slate-500">
                            <th className="py-2 pr-2">Nama</th>
                            <th className="px-2 py-2 text-center">Hadir</th>
                            <th className="px-2 py-2 text-center">Izin</th>
                            <th className="px-2 py-2 text-center">Sakit</th>
                            <th className="px-2 py-2 text-center">Alpha</th>
                            <th className="px-2 py-2 text-center">% Hadir</th>
                            <th className="pl-2 py-2 text-center">
                              % Tidak Hadir
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rekapPerSiswa.list.map((s) => (
                            <tr key={s.siswaId}>
                              <td className="py-2 pr-2">
                                <p className="font-medium text-slate-800">
                                  {s.nama}
                                </p>
                                {s.nis && (
                                  <p className="text-xs text-slate-400">
                                    NIS: {s.nis}
                                  </p>
                                )}
                              </td>
                              <td className="px-2 py-2 text-center text-emerald-700">
                                {s.counts.hadir}
                              </td>
                              <td className="px-2 py-2 text-center text-sky-700">
                                {s.counts.izin}
                              </td>
                              <td className="px-2 py-2 text-center text-amber-700">
                                {s.counts.sakit}
                              </td>
                              <td className="px-2 py-2 text-center text-rose-700">
                                {s.counts.alpha}
                              </td>
                              <td className="px-2 py-2 text-center font-medium text-slate-800">
                                {s.persenHadir.toFixed(1)}%
                              </td>
                              <td className="pl-2 py-2 text-center text-slate-500">
                                {s.persenTidakHadir.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
