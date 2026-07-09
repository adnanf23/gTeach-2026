"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSystemLog } from "@/lib/logger";
import {
  cn,
  TINGKAT_CONFIG,
  Badge,
  Avatar,
  Select,
  ActionIconBtn,
  KelasToolbarButtons,
  Modal,
  Toast,
  FormKelas,
  ConfirmDeleteModal,
  ImportModal,
  SiswaCount,
} from "@/components/organism/dashboard Comp/component";

// ─── Kelas Card ───────────────────────────────────────────────────────────────

function KelasCard({ item, onDetail, onEdit, onDelete }) {
  const tingkat = TINGKAT_CONFIG[String(item.tingkat)];

  // Strip color per tingkat
  const stripColor = {
    blue:   "from-blue-400 to-indigo-500",
    green:  "from-emerald-400 to-teal-500",
    amber:  "from-amber-400 to-orange-500",
    red:    "from-rose-400 to-pink-500",
    purple: "from-purple-400 to-violet-500",
  }[tingkat?.variant] || "from-gray-300 to-gray-400";

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col">

      {/* Color strip */}
      <div className={cn("h-1.5 w-full bg-gradient-to-r", stripColor)} />

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">

        {/* Header: nama kelas + badge tingkat */}
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={() => onDetail(item)}
            className="text-[15px] font-bold text-gray-900 hover:text-blue-700 text-left leading-tight transition-colors"
          >
            {item.nama_kelas}
          </button>
          {tingkat && (
            <Badge variant={tingkat.variant} className="shrink-0 text-[10px] mt-0.5">
              {tingkat.label}
            </Badge>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* Wali Kelas */}
        <div className="flex items-center gap-2.5">
          <Avatar
            name={item.expand?.walikelas_id?.nama_lengkap || "?"}
            size="sm"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">
              Wali Kelas
            </p>
            <p className="text-[13px] text-gray-700 font-medium truncate">
              {item.expand?.walikelas_id?.nama_lengkap || (
                <span className="text-gray-400 italic font-normal">Belum ditetapkan</span>
              )}
            </p>
          </div>
        </div>

        {/* Jumlah Siswa */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <svg width="13" height="13" fill="none" stroke="#2563eb" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Total Siswa</p>
            <div className="text-[13px] font-semibold text-gray-800">
              <SiswaCount kelasId={item.id} pb={pb} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => onDetail(item)}
          className="flex-1 py-1.5 text-[12px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition"
        >
          Detail
        </button>
        <button
          onClick={() => onEdit(item)}
          className="flex-1 py-1.5 text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100 transition"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(item)}
          className="w-8 h-[30px] flex items-center justify-center text-red-500 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition"
          title="Hapus"
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6"/>
            <path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Card Skeleton ─────────────────────────────────────────────────────────────

function KelasCardSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden animate-pulse flex flex-col">
      <div className="h-1.5 bg-gray-200" />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-5 bg-gray-100 rounded-full w-16" />
        </div>
        <div className="border-t border-gray-100" />
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-2.5 bg-gray-100 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
        <div className="h-12 bg-gray-100 rounded-xl" />
      </div>
      <div className="px-4 pb-4 flex gap-2">
        <div className="flex-1 h-7 bg-gray-100 rounded-lg" />
        <div className="flex-1 h-7 bg-gray-100 rounded-lg" />
        <div className="w-8 h-7 bg-gray-100 rounded-lg" />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DataKelasPage() {
  const router = useRouter();

  const [kelas, setKelas]         = useState([]);
  const [guruList, setGuruList]   = useState([]);
  const [loading, setLoading]     = useState(false);

  const [searchQuery, setSearchQuery]         = useState("");
  const [selectedTingkat, setSelectedTingkat] = useState("semua");

  const [modalTambah, setModalTambah] = useState(false);
  const [modalEdit, setModalEdit]     = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [modalDelete, setModalDelete] = useState(false);

  const [editTarget, setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [toast, setToast]                 = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const currentUser = () => pb.authStore.model;
  const currentPath = () =>
    typeof window !== "undefined" ? window.location.pathname : "-";

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await pb.collection("kelas").getFullList({
        expand: "walikelas_id",
        requestKey: null,
      });
      setKelas(data);
    } catch (err) {
      console.error("Gagal mengambil data kelas:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGuru = async () => {
    try {
      const data = await pb.collection("users").getList(1, 100, {
        filter: 'role = "guru_walikelas"',
        requestKey: null,
      });
      setGuruList(data.items);
    } catch (err) {
      console.error("Gagal mengambil data guru:", err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchGuru();
  }, []);

  // ─── Filter ───────────────────────────────────────────────────────────────

  const filteredKelas = kelas.filter((item) => {
    const matchTingkat =
      selectedTingkat === "semua" || String(item.tingkat) === selectedTingkat;
    const namaKelas = item.nama_kelas?.toLowerCase() || "";
    const namaWali  = item.expand?.walikelas_id?.nama_lengkap?.toLowerCase() || "";
    const search    = searchQuery.toLowerCase();
    return matchTingkat && (namaKelas.includes(search) || namaWali.includes(search));
  });

  // ─── CRUD ────────────────────────────────────────────────────────────────

  const handleTambah = async (form) => {
    try {
      setSubmitLoading(true);
      await pb.collection("kelas").create(form);
      const user = currentUser();
      await createSystemLog({
        type: "succes",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' berhasil Menambahkan data kelas.`,
        endpoint: currentPath(), statusCode: 200, payload: { form },
      });
      showToast("Kelas berhasil ditambahkan!");
      setModalTambah(false);
      fetchData();
    } catch (err) {
      console.error(err);
      showToast("Gagal menambahkan kelas.", "error");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEdit = async (form) => {
    try {
      setSubmitLoading(true);
      await pb.collection("kelas").update(editTarget.id, form);
      showToast("Data kelas berhasil diperbarui!");
      setModalEdit(false);
      const user = currentUser();
      await createSystemLog({
        type: "succes",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' berhasil Mengedit data kelas.`,
        endpoint: currentPath(), statusCode: 200,
        payload: { id_kelas: editTarget.id, data_baru: form },
      });
      setEditTarget(null);
      fetchData();
    } catch (err) {
      console.error(err);
      showToast("Gagal memperbarui kelas.", "error");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setSubmitLoading(true);
      await pb.collection("kelas").delete(deleteTarget.id);
      const user = currentUser();
      await createSystemLog({
        type: "succes",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' berhasil Menghapus data kelas.`,
        endpoint: currentPath(), statusCode: 200, payload: {},
      });
      showToast("Kelas berhasil dihapus.");
      setModalDelete(false);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      console.error(err);
      showToast("Gagal menghapus kelas.", "error");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleImport = async (rows) => {
    try {
      setSubmitLoading(true);
      let success = 0;
      const allUsers = await pb.collection("users").getFullList();
      for (const row of rows) {
        try {
          const waliNama = row.expand?.walikelas_id?.nama_lengkap || row["walikelas_id"] || "";
          const pendampingNama = row.expand?.walikelas_id?.nama_lengkap || row["pendamping_id"] || "";
          const waliUser = allUsers.find((u) => u.nama_lengkap === waliNama);
           const pendampingUser = allUsers.find((u) => u.nama_lengkap === pendampingNama);
          await pb.collection("kelas").create({
            nama_kelas:   row.nama_kelas || row["nama kelas"] || "",
            walikelas_id: waliUser?.id || "",
            pendamping_id: pendampingUser ?.id || "",
            tingkat:      row.tingkat || 1,
          });
          success++;
        } catch (e) {
          console.warn("Baris gagal diimpor:", row, e);
        }
      }
      showToast(`${success} dari ${rows.length} baris berhasil diimpor.`);
      setModalImport(false);
      fetchData();
    } catch (err) {
      showToast("Gagal import data.", "error");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleExport = async () => {
    if (filteredKelas.length === 0) {
      showToast("Tidak ada data untuk diexport.", "error");
      return;
    }
    const XLSX = await import("xlsx");
    const data = filteredKelas.map((item) => ({
      "Nama Kelas":    item.nama_kelas || "",
      "Wali Kelas":    item.expand?.walikelas_id?.nama_lengkap || "-",
      "ID Wali Kelas": item.walikelas_id || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Kelas");
    XLSX.writeFile(wb, `Data_Kelas_${new Date().toISOString().split("T")[0]}.xlsx`);
    showToast("Data berhasil diexport ke Excel.");
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const templateData = [
      { nama_kelas: "1A", walikelas_id: "id_guru_pocketbase", tingkat: "1" },
      { nama_kelas: "2B", walikelas_id: "id_guru_pocketbase_2", tingkat: "2" },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws["!cols"] = [{ wch: 27 }, { wch: 27 }, { wch: 27 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Kelas");
    XLSX.writeFile(wb, "template_import_kelas.xlsx");
  };

  const openEdit   = (item) => { setEditTarget(item);   setModalEdit(true);   };
  const openDelete = (item) => { setDeleteTarget(item); setModalDelete(true); };
  const openDetail = (item) => router.push(`/ict/data-kelas/${item.id}`);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <Toast toast={toast} />

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <KelasToolbarButtons
          onTemplate={handleDownloadTemplate}
          onImport={() => setModalImport(true)}
          onExport={handleExport}
          onTambah={() => setModalTambah(true)}
        />
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Cari nama kelas atau wali kelas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder-gray-400 transition-all"
          />
        </div>
        <Select
          value={selectedTingkat}
          onChange={(e) => setSelectedTingkat(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="semua">Semua Tingkat</option>
          {Object.entries(TINGKAT_CONFIG).map(([value, config]) => (
            <option key={value} value={value}>{config.label}</option>
          ))}
        </Select>
      </div>

      {/* Card Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <KelasCardSkeleton key={i} />)}
        </div>
      ) : filteredKelas.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl py-16 text-center">
          <div className="text-3xl mb-3">📁</div>
          <p className="font-medium text-gray-500 text-sm">Data tidak ditemukan</p>
          <p className="text-xs text-gray-400 mt-1">Coba ubah filter atau tambah kelas baru</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredKelas.map((item) => (
            <KelasCard
              key={item.id}
              item={item}
              onDetail={openDetail}
              onEdit={openEdit}
              onDelete={openDelete}
            />
          ))}
        </div>
      )}

      {/* Footer info */}
      <div className="flex justify-between items-center text-[12px] text-gray-500 px-1">
        <span>
          Menampilkan <strong>{filteredKelas.length}</strong> dari{" "}
          <strong>{kelas.length}</strong> kelas
        </span>
        {selectedTingkat !== "semua" && (
          <button
            onClick={() => { setSelectedTingkat("semua"); setSearchQuery(""); }}
            className="text-[12px] text-blue-500 hover:text-blue-700 transition"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Modals */}
      <Modal isOpen={modalTambah} onClose={() => setModalTambah(false)} title="Tambah Kelas Baru">
        <FormKelas
          onSubmit={handleTambah}
          onCancel={() => setModalTambah(false)}
          loading={submitLoading}
          guruList={guruList}
        />
      </Modal>

      <Modal isOpen={modalEdit} onClose={() => setModalEdit(false)} title={`Edit Kelas — ${editTarget?.nama_kelas}`}>
        <FormKelas
          initial={
            editTarget
              ? {
                  nama_kelas:   editTarget.nama_kelas,
                  tingkat:      String(editTarget.tingkat),
                  walikelas_id: editTarget.walikelas_id,
                }
              : undefined
          }
          onSubmit={handleEdit}
          onCancel={() => setModalEdit(false)}
          loading={submitLoading}
          guruList={guruList}
        />
      </Modal>

      <Modal isOpen={modalImport} onClose={() => setModalImport(false)} title="Import Data Kelas dari Excel" size="lg">
        <ImportModal
          onImport={handleImport}
          onCancel={() => setModalImport(false)}
          loading={submitLoading}
        />
      </Modal>

      <Modal isOpen={modalDelete} onClose={() => setModalDelete(false)} title="Konfirmasi Hapus" size="sm">
        <ConfirmDeleteModal
          kelas={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setModalDelete(false)}
          loading={submitLoading}
        />
      </Modal>
    </div>
  );
}