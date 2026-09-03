"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ============================================================
// Tampilkan daftar presentase, tambah, edit, hapus
// ============================================================
export default function PengaturanPresentasePage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [editingId, setEditingId] = useState(null);
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

      // Reset form & refresh
      setForm({
        nama_presentase: "",
        angka_presentase: "",
        kategori: "nilai utama",
      });
      setEditingId(null);
      await fetchData();
    } catch (error) {
      console.error("Gagal menyimpan:", error);
      setMessage({ type: "error", text: "Gagal menyimpan presentase." });
    } finally {
      setIsSaving(false);
    }
  };

  // ================= EDIT =================
  const handleEdit = (record) => {
    setEditingId(record.id);
    setForm({
      nama_presentase: record.nama_presentase || "",
      angka_presentase: record.angka_presentase ?? "",
      kategori: record.kategori || "nilai utama",
    });
    setMessage({ type: "", text: "" });
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

  // ================= BATAL EDIT =================
  const cancelEdit = () => {
    setEditingId(null);
    setForm({
      nama_presentase: "",
      angka_presentase: "",
      kategori: "nilai utama",
    });
    setMessage({ type: "", text: "" });
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-800">
          Pengaturan Presentase Penilaian
        </h1>
        <button
          onClick={() => router.back()}
          className="text-sm font-semibold text-slate-600 hover:text-blue-600"
        >
          ← Kembali
        </button>
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

      {/* Form Tambah / Edit */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                onChange={(e) => setForm({ ...form, kategori: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="nilai utama">Nilai Utama</option>
                <option value="nilai tambahan">Nilai Tambahan</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-6 py-2.5 rounded-lg"
            >
              {isSaving ? "Menyimpan..." : editingId ? "Perbarui" : "Tambah"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700"
              >
                Batal
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Tabel Daftar Presentase */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {data.length === 0 ? (
          <div className="p-8 text-center text-gray-400 font-medium text-sm">
            Belum ada data presentase. Tambahkan sekarang.
          </div>
        ) : (
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
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs font-bold text-red-500 hover:text-red-700"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </section>
  );
}
