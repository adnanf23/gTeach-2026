"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";
import { createSystemLog } from "@/lib/logger";

// =========================================================
// Helper
// =========================================================
function pad(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

function formatShort(d) {
  if (!d) return "";
  const date = new Date(d);
  const bulan = [
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
  return `${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
}

function rawDateOnly(v) {
  if (!v) return "";
  return String(v).includes(" ") ? v.split(" ")[0] : v.split("T")[0];
}

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

const SURAT_DIBERIKAN = [
  "Tidak ada surat",
  "SP 1",
  "SP 2",
  "SP 3",
  "Surat Home Visit",
  "Surat pengunduran diri",
];

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
// Modal Form Catatan Kasus
// =========================================================
function CatatanKasusModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  siswaList,
  kelasNama,
  tahunAjaranLabel,
}) {
  const [loading, setLoading] = useState(false);

  const [siswaId, setSiswaId] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [jenisKasus, setJenisKasus] = useState("");
  const [suratDiberikan, setSuratDiberikan] = useState("Tidak ada surat");
  const [tindakLanjut, setTindakLanjut] = useState("");

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Reset form tiap kali modal dibuka
  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setSiswaId(initialData.siswa_id || "");
      setDate(rawDateOnly(initialData.date) || toISODate(new Date()));
      setJenisKasus(initialData.jenis_kasus || "");
      setSuratDiberikan(initialData.surat_diberikan || "Tidak ada surat");
      setTindakLanjut(initialData.tindak_lanjut || "");
    } else {
      setSiswaId("");
      setDate(toISODate(new Date()));
      setJenisKasus("");
      setSuratDiberikan("Tidak ada surat");
      setTindakLanjut("");
    }
  }, [initialData, isOpen]);

  // Ambil riwayat kasus siswa terpilih
  useEffect(() => {
    if (!isOpen || !siswaId) {
      setHistory([]);
      return;
    }
    let cancelled = false;

    async function fetchHistory() {
      setLoadingHistory(true);
      try {
        const filter = initialData
          ? `siswa_id="${siswaId}" && id != "${initialData.id}"`
          : `siswa_id="${siswaId}"`;
        const records = await pb.collection("catatan_kasus").getFullList({
          filter,
          sort: "-date",
          requestKey: null,
        });
        if (!cancelled) setHistory(records);
      } catch (e) {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [siswaId, isOpen, initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!siswaId || !date || !jenisKasus) return;

    setLoading(true);
    try {
      const data = {
        siswa_id: siswaId,
        date,
        jenis_kasus: jenisKasus,
        surat_diberikan: suratDiberikan,
        tindak_lanjut: tindakLanjut.trim(),
      };
      if (initialData) data.id = initialData.id;

      await onSubmit(data);
      onClose();
    } catch (err) {
      console.error("Error submitting catatan kasus:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedSiswa = siswaList.find((s) => s.id === siswaId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:px-4">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {initialData ? "Edit Catatan Kasus" : "Tambah Catatan Kasus"}
            </h2>
            <p className="text-xs text-slate-400">
              {kelasNama}
              {tahunAjaranLabel ? ` • ${tahunAjaranLabel}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Tutup"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 overflow-y-auto px-5 py-5 sm:px-6"
        >
          <div>
            <label
              htmlFor="siswa_id"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Nama Siswa <span className="text-red-500">*</span>
            </label>
            <select
              id="siswa_id"
              value={siswaId}
              onChange={(e) => setSiswaId(e.target.value)}
              disabled={!!initialData}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
              required
            >
              <option value="" disabled>
                Pilih siswa...
              </option>
              {siswaList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama_siswa} {s.nis ? `(${s.nis})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Riwayat pelanggaran siswa terpilih */}
          {siswaId && (
            <div
              className={`rounded-lg border p-3 ${
                loadingHistory
                  ? "border-slate-200 bg-slate-50"
                  : history.length > 0
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
              }`}
            >
              {loadingHistory ? (
                <p className="text-xs text-slate-500">Memuat riwayat...</p>
              ) : history.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <span aria-hidden>✓</span>
                  Ini merupakan kasus pertama untuk{" "}
                  {selectedSiswa?.nama_siswa || "siswa ini"}.
                </p>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-semibold text-amber-800">
                    Riwayat pelanggaran — {history.length} kasus sebelumnya
                  </p>
                  <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
                    {history.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-start gap-2 rounded-md bg-white/70 px-2 py-1.5 text-xs"
                      >
                        <span
                          className={`mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                            JENIS_KASUS[h.jenis_kasus]?.dot || "bg-slate-400"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-slate-700">
                              {formatShort(h.date)}
                            </span>
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-600">
                              {JENIS_KASUS[h.jenis_kasus]?.label ||
                                h.jenis_kasus}
                            </span>
                          </div>
                          {h.tindak_lanjut && (
                            <p className="mt-0.5 truncate text-slate-500">
                              {h.tindak_lanjut}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="date"
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                Tanggal Kejadian <span className="text-red-500">*</span>
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label
                htmlFor="jenis_kasus"
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                Jenis Kasus <span className="text-red-500">*</span>
              </label>
              <select
                id="jenis_kasus"
                value={jenisKasus}
                onChange={(e) => setJenisKasus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="" disabled>
                  Pilih jenis
                </option>
                {Object.entries(JENIS_KASUS).map(([key, v]) => (
                  <option key={key} value={key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="surat_diberikan"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Surat yang Diberikan
            </label>
            <select
              id="surat_diberikan"
              value={suratDiberikan}
              onChange={(e) => setSuratDiberikan(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {SURAT_DIBERIKAN.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="tindak_lanjut"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Tindak Lanjut / Kronologi
            </label>
            <textarea
              id="tindak_lanjut"
              value={tindakLanjut}
              onChange={(e) => setTindakLanjut(e.target.value)}
              placeholder="Jelaskan kronologi kejadian dan tindak lanjut yang diberikan..."
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading
                ? "Menyimpan..."
                : initialData
                  ? "Update"
                  : "Simpan Catatan"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
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
// Main Page
// =========================================================
export default function CatatanKasusPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);

  const [kelas, setKelas] = useState(null);
  const [noKelasAssigned, setNoKelasAssigned] = useState(false);
  const [resolvingKelas, setResolvingKelas] = useState(true);

  const [tahunAjaran, setTahunAjaran] = useState(null);

  const [siswaList, setSiswaList] = useState([]);
  const [catatanList, setCatatanList] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [search, setSearch] = useState("");
  const [filterJenis, setFilterJenis] = useState("semua");

  const [message, setMessage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

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
  // Resolve kelas milik walikelas / pendamping yang login
  // =========================================================
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function resolve() {
      setResolvingKelas(true);
      setNoKelasAssigned(false);
      try {
        const rec = await pb
          .collection("kelas")
          .getFirstListItem(
            `walikelas_id="${user.id}" || pendamping_id="${user.id}"`,
            { requestKey: null },
          );
        if (!cancelled) setKelas(rec);
      } catch (e) {
        if (!cancelled) setNoKelasAssigned(true);
      } finally {
        if (!cancelled) setResolvingKelas(false);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // =========================================================
  // Tahun ajaran aktif
  // =========================================================
  useEffect(() => {
    let cancelled = false;

    async function fetchTahunAjaran() {
      try {
        const rec = await pb
          .collection("tahun_ajaran")
          .getFirstListItem(`is_aktif=true`, { requestKey: null });
        if (!cancelled) setTahunAjaran(rec);
      } catch (e) {
        if (!cancelled) {
          setTahunAjaran(null);
          setMessage({
            type: "error",
            text: "Tahun ajaran aktif belum diatur. Hubungi admin/ICT.",
          });
        }
      }
    }

    fetchTahunAjaran();
    return () => {
      cancelled = true;
    };
  }, []);

  // =========================================================
  // Load siswa & catatan kasus untuk kelas ini
  // =========================================================
  const loadData = useCallback(async () => {
    if (!kelas) return;
    setLoadingData(true);
    try {
      const [siswaRes, catatanRes] = await Promise.all([
        pb.collection("siswa").getFullList({
          filter: `kelas_id="${kelas.id}"`,
          sort: "nama_siswa",
          requestKey: null,
        }),
        pb.collection("catatan_kasus").getFullList({
          filter: `kelas_id="${kelas.id}"`,
          expand: "siswa_id",
          sort: "-date",
          requestKey: null,
        }),
      ]);
      setSiswaList(siswaRes);
      setCatatanList(catatanRes);
    } catch (e) {
      setMessage({ type: "error", text: "Gagal memuat data catatan kasus." });
    } finally {
      setLoadingData(false);
    }
  }, [kelas]);

  useEffect(() => {
    if (kelas) loadData();
  }, [kelas, loadData]);

  // =========================================================
  // CRUD
  // =========================================================
  const handleCreate = async (data) => {
    try {
      await pb.collection("catatan_kasus").create(
        {
          siswa_id: data.siswa_id,
          date: data.date,
          jenis_kasus: data.jenis_kasus,
          surat_diberikan: data.surat_diberikan,
          tindak_lanjut: data.tindak_lanjut,
          kelas_id: kelas.id,
          tahun_ajaran_id: tahunAjaran?.id || null,
          sync_sias: false,
        },
        { requestKey: null },
      );

      await createSystemLog({
        type: "succes",
        msg: `User '${user.nama_lengkap} (${user.role})' berhasil membuat catatan kasus.`,
        endpoint: "/walikelas/catatan-kasus",
        statusCode: 200,
        payload: {
          ...data,
          kelas_id: kelas.id,
          tahun_ajaran_id: tahunAjaran?.id,
        },
      });

      setMessage({ type: "success", text: "Catatan kasus berhasil disimpan." });
      await loadData();
    } catch (err) {
      console.error("Error creating catatan kasus:", err);
      setMessage({ type: "error", text: "Gagal menyimpan catatan kasus." });
      await createSystemLog({
        type: "warning",
        msg: `User '${user.nama_lengkap} (${user.role})' gagal membuat catatan kasus.`,
        endpoint: "/walikelas/catatan-kasus",
        statusCode: err.status || 400,
        payload: data,
      });
      throw err;
    }
  };

  const handleUpdate = async (data) => {
    if (!editingItem) return;
    try {
      await pb.collection("catatan_kasus").update(
        editingItem.id,
        {
          date: data.date,
          jenis_kasus: data.jenis_kasus,
          surat_diberikan: data.surat_diberikan,
          tindak_lanjut: data.tindak_lanjut,
        },
        { requestKey: null },
      );

      await createSystemLog({
        type: "succes",
        msg: `User '${user.nama_lengkap} (${user.role})' berhasil update catatan kasus.`,
        endpoint: "/walikelas/catatan-kasus",
        statusCode: 200,
        payload: data,
      });

      setMessage({
        type: "success",
        text: "Catatan kasus berhasil diperbarui.",
      });
      await loadData();
    } catch (err) {
      console.error("Error updating catatan kasus:", err);
      setMessage({ type: "error", text: "Gagal memperbarui catatan kasus." });
      await createSystemLog({
        type: "warning",
        msg: `User '${user.nama_lengkap} (${user.role})' gagal update catatan kasus.`,
        endpoint: "/walikelas/catatan-kasus",
        statusCode: err.status || 400,
        payload: data,
      });
      throw err;
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Yakin ingin menghapus catatan kasus ini?")) return;
    try {
      await pb.collection("catatan_kasus").delete(id, { requestKey: null });
      setMessage({ type: "success", text: "Catatan kasus berhasil dihapus." });
      await loadData();
    } catch (err) {
      console.error("Error deleting catatan kasus:", err);
      setMessage({ type: "error", text: "Gagal menghapus catatan kasus." });
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  // =========================================================
  // Filter & pencarian
  // =========================================================
  const filteredCatatan = useMemo(() => {
    return catatanList.filter((item) => {
      const namaSiswa = item.expand?.siswa_id?.nama_siswa || "";
      const matchSearch = namaSiswa
        .toLowerCase()
        .includes(search.trim().toLowerCase());
      const matchJenis =
        filterJenis === "semua" || item.jenis_kasus === filterJenis;
      return matchSearch && matchJenis;
    });
  }, [catatanList, search, filterJenis]);

  const stats = useMemo(() => {
    const totalKasus = catatanList.length;
    const totalBerat = catatanList.filter(
      (c) => c.jenis_kasus === "pelanggaran berat",
    ).length;
    const siswaTerlibat = new Set(catatanList.map((c) => c.siswa_id)).size;
    return { totalKasus, totalBerat, siswaTerlibat };
  }, [catatanList]);

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

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Toast toast={message} onClose={() => setMessage(null)} />

      <div className="mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        {/* Header */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight text-slate-900 sm:text-xl">
                Catatan Kasus Siswa
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {kelas?.nama_kelas}
                </span>
                {tahunAjaran && (
                  <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {tahunAjaran.tahun} • Semester {tahunAjaran.semester}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={openAddModal}
            className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
          >
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Tambah Catatan Kasus
          </button>

          {/* Ringkasan */}
          <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
            <div className="text-center">
              <p className="text-lg font-bold text-slate-800">
                {stats.totalKasus}
              </p>
              <p className="text-[11px] text-slate-500">Total Kasus</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-rose-600">
                {stats.totalBerat}
              </p>
              <p className="text-[11px] text-slate-500">Pelanggaran Berat</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-800">
                {stats.siswaTerlibat}
              </p>
              <p className="text-[11px] text-slate-500">Siswa Terlibat</p>
            </div>
          </div>
        </div>

        {/* Search & filter */}
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama siswa..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1.5">
            {[
              { key: "semua", label: "Semua" },
              { key: "pelanggaran ringan", label: "Ringan" },
              { key: "pelanggaran berat", label: "Berat" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterJenis(f.key)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition sm:flex-none ${
                  filterJenis === f.key
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Daftar catatan kasus */}
        {loadingData ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : filteredCatatan.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-400">
              {catatanList.length === 0
                ? "Belum ada catatan kasus untuk kelas ini."
                : "Tidak ada catatan yang cocok dengan pencarian."}
            </p>
            {catatanList.length === 0 && (
              <button
                onClick={openAddModal}
                className="mt-2 text-sm font-semibold text-blue-600 hover:underline"
              >
                Tambah catatan kasus sekarang
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCatatan.map((item) => {
              const jenis = JENIS_KASUS[item.jenis_kasus];
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1.5">
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
                      </div>

                      <p className="text-xs text-slate-500">
                        {formatLong(rawDateOnly(item.date))}
                      </p>

                      {item.tindak_lanjut && (
                        <p className="text-sm text-slate-700">
                          {item.tindak_lanjut}
                        </p>
                      )}

                      {item.surat_diberikan && (
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${suratBadgeClass(
                            item.surat_diberikan,
                          )}`}
                        >
                          {item.surat_diberikan}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-1 self-end sm:self-start">
                      <button
                        onClick={() => openEditModal(item)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 active:scale-95"
                        title="Edit"
                        aria-label="Edit catatan"
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
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 active:scale-95"
                        title="Hapus"
                        aria-label="Hapus catatan"
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
              );
            })}
          </div>
        )}
      </div>

      <CatatanKasusModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
        onSubmit={editingItem ? handleUpdate : handleCreate}
        initialData={editingItem}
        siswaList={siswaList}
        kelasNama={kelas?.nama_kelas}
        tahunAjaranLabel={
          tahunAjaran
            ? `${tahunAjaran.tahun} • Semester ${tahunAjaran.semester}`
            : ""
        }
      />
    </div>
  );
}
