"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ============================================================
// Icon components (inline SVG, tanpa library)
// ============================================================
const IconPlus = ({ className = "w-4 h-4" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconEdit = ({ className = "w-4 h-4" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const IconTrash = ({ className = "w-4 h-4" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const IconClose = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ============================================================
// Halaman Pengaturan Presentase
// ============================================================
export default function PengaturanPresentasePage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    nama_presentase: "",
    angka_presentase: "",
    kategori: "nilai utama",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // ================= AMBIL DATA =================
  const fetchData = async () => {
    try {
      const records = await pb.collection("presentase_penilaian").getFullList({
        sort: "created",
        requestKey: null,
      });
      setData(records);
    } catch (error) {
      console.error("Gagal ambil data:", error);
      setMessage({ type: "error", text: "Gagal memuat data presentase." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || (user.role !== "admin" && user.role !== "ict")) {
      router.push("/dashboard");
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= BUKA MODAL =================
  const openAddModal = () => {
    setEditingId(null);
    setForm({
      nama_presentase: "",
      angka_presentase: "",
      kategori: "nilai utama",
    });
    setMessage({ type: "", text: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingId(record.id);
    setForm({
      nama_presentase: record.nama_presentase || "",
      angka_presentase: record.angka_presentase ?? "",
      kategori: record.kategori || "nilai utama",
    });
    setMessage({ type: "", text: "" });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingId(null);
    setForm({
      nama_presentase: "",
      angka_presentase: "",
      kategori: "nilai utama",
    });
    setMessage({ type: "", text: "" });
  };

  // ================= SIMPAN (TAMBAH / UPDATE) =================
  const handleSubmit = async (e) => {
    e.preventDefault();
    const { nama_presentase, angka_presentase, kategori } = form;

    if (!nama_presentase.trim() || angka_presentase === "") {
      setMessage({
        type: "error",
        text: "Nama dan angka presentase wajib diisi.",
      });
      return;
    }
    const angka = parseFloat(angka_presentase);
    if (isNaN(angka) || angka < 0 || angka > 100) {
      setMessage({
        type: "error",
        text: "Angka presentase harus antara 0–100.",
      });
      return;
    }

    setIsSaving(true);
    setMessage({ type: "", text: "" });

    try {
      const payload = {
        nama_presentase: nama_presentase.trim(),
        angka_presentase: angka,
        kategori: kategori || "nilai utama",
      };

      if (editingId) {
        await pb
          .collection("presentase_penilaian")
          .update(editingId, payload, { requestKey: null });
        setMessage({
          type: "success",
          text: "Presentase berhasil diperbarui.",
        });
      } else {
        await pb
          .collection("presentase_penilaian")
          .create(payload, { requestKey: null });
        setMessage({
          type: "success",
          text: "Presentase berhasil ditambahkan.",
        });
      }

      setIsModalOpen(false);
      setEditingId(null);
      setForm({
        nama_presentase: "",
        angka_presentase: "",
        kategori: "nilai utama",
      });
      await fetchData();
    } catch (error) {
      console.error("Gagal menyimpan:", error);
      setMessage({ type: "error", text: "Gagal menyimpan presentase." });
    } finally {
      setIsSaving(false);
    }
  };

  // ================= HAPUS =================
  const handleDelete = async (id) => {
    if (!confirm("Yakin ingin menghapus presentase ini?")) return;
    try {
      await pb
        .collection("presentase_penilaian")
        .delete(id, { requestKey: null });
      setMessage({ type: "success", text: "Presentase berhasil dihapus." });
      await fetchData();
    } catch (error) {
      console.error("Gagal hapus:", error);
      setMessage({ type: "error", text: "Gagal menghapus presentase." });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="mt-3 text-sm text-slate-500">Memuat data...</p>
        </div>
      </div>
    );
  }

  if (user?.role !== "admin" && user?.role !== "ict") {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">Akses Ditolak</h1>
        <p className="mt-2 text-sm text-red-600">
          Hanya admin/ICT yang dapat mengakses halaman ini.
        </p>
      </div>
    );
  }

  return (
    <section className="py-8 lg:p-10 max-w-4xl mx-auto px-4 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-extrabold text-slate-800">
          Pengaturan Presentase Penilaian
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg shadow-sm"
          >
            <IconPlus />
            Tambah Presentase
          </button>
        </div>
      </div>

      {/* Pesan notifikasi */}
      {message.text && (
        <div
          className={`rounded-xl p-4 text-sm font-semibold ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabel Daftar Presentase */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {data.length === 0 ? (
          <div className="p-8 text-center text-gray-400 font-medium text-sm">
            Belum ada data presentase. Tambahkan sekarang.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-bold">Nama</th>
                  <th className="text-center px-4 py-3 font-bold">Angka (%)</th>
                  <th className="text-center px-4 py-3 font-bold">Kategori</th>
                  <th className="text-right px-4 py-3 font-bold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {item.nama_presentase}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">
                      {item.angka_presentase}%
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-xs">
                        {item.kategori || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          title="Edit"
                          aria-label="Edit"
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition"
                        >
                          <IconEdit />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          title="Hapus"
                          aria-label="Hapus"
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Petunjuk */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold">💡 Catatan:</p>
        <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700">
          <li>
            Nama presentase harus <strong>persis</strong> dengan yang digunakan
            di kode: <br />
            <code className="bg-blue-100 px-1 rounded">Formatif</code>,{" "}
            <code className="bg-blue-100 px-1 rounded">Sumatif</code>,{" "}
            <code className="bg-blue-100 px-1 rounded">
              Ujian Tengah Semester
            </code>
            ,{" "}
            <code className="bg-blue-100 px-1 rounded">
              Ujian Akhir Semester
            </code>
            , <code className="bg-blue-100 px-1 rounded">Kehadiran</code>.
          </li>
          <li>
            Jumlah total presentase tidak harus 100% (bisa kurang/lebih, sesuai
            kebutuhan).
          </li>
          <li>
            Presentase dengan kategori "nilai tambahan" tidak digunakan dalam
            perhitungan rapor utama (opsional).
          </li>
        </ul>
      </div>

      {/* ================= MODAL TAMBAH / EDIT ================= */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? "Edit Presentase" : "Tambah Presentase"}
              </h2>
              <button
                onClick={closeModal}
                aria-label="Tutup"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <IconClose />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">
                {message.text && message.type === "error" && (
                  <div className="rounded-lg p-3 text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                    {message.text}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Nama Presentase <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nama_presentase}
                    onChange={(e) =>
                      setForm({ ...form, nama_presentase: e.target.value })
                    }
                    placeholder="Contoh: Formatif"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Angka (%) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.angka_presentase}
                    onChange={(e) =>
                      setForm({ ...form, angka_presentase: e.target.value })
                    }
                    placeholder="20"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Kategori
                  </label>
                  <select
                    value={form.kategori}
                    onChange={(e) =>
                      setForm({ ...form, kategori: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="nilai utama">Nilai Utama</option>
                    <option value="nilai tambahan">Nilai Tambahan</option>
                  </select>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className="text-sm font-semibold text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-6 py-2.5 rounded-lg shadow-sm"
                >
                  {isSaving
                    ? "Menyimpan..."
                    : editingId
                      ? "Perbarui"
                      : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
