"use client";

import { useEffect, useState } from "react";
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
  ConfirmDeleteModal,
  ImportModal,
  FormMentahan,
  Input,
  Field,
} from "@/components/organism/dashboard Comp/component";
import { pb } from "@/lib/pocketbase";
import { createSystemLog } from "@/lib/logger";

export default function DataSiswaPage() {
  const [loading, setLoading] = useState(false);
  const [loadData, setLoadData] = useState(false);
  const [dataSiswa, setDataSiswa] = useState([]);
  const [kelasList, setKelasList] = useState([]);
  const [toast, setToast] = useState(null);
  const [EditTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);

  // Filter & search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTingkat, setSelectedTingkat] = useState("semua");

  // Modal
  const [openModal, setOpenModal] = useState(false);
  const [modalMode, setModalMode] = useState(null);

  const [form, setForm] = useState({
    nama_siswa: "",
    nis: "",
    nisn: "",
    kelas_id: "",
    jenis_kelamin: "",
  });

  const currentUser = () => pb.authStore.model;
  const currentPath = () =>
    typeof window !== "undefined" ? window.location.pathname : "-";

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  async function fetchSiswa() {
    try {
      setLoadData(true);
      const data = await pb.collection("siswa").getFullList({
        expand: "kelas_id",
        requestKey: null,
      });

      const dataFormated = data.map((siswa) => {
        let jkFull = siswa.jenis_kelamin;
        if (siswa.jenis_kelamin) {
          const jkLower = siswa.jenis_kelamin.toLowerCase();
          if (jkLower === "l") jkFull = "Laki-Laki";
          if (jkLower === "p") jkFull = "Perempuan";
        }
        return { ...siswa, jenis_kelamin: jkFull };
      });

      setDataSiswa(dataFormated);
    } catch (error) {
      console.log("Data gagal diambil:", error);
    } finally {
      setLoadData(false);
    }
  }

  async function fetchKelas() {
    try {
      const data = await pb
        .collection("kelas")
        .getFullList({ requestKey: null });
      setKelasList(data);
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    fetchKelas();
    fetchSiswa();
  }, []);

  // ─── Filter ──────────────────────────────────────────────────────────────────

  const filteredSiswa = dataSiswa.filter((item) => {
    const matchTingkat =
      selectedTingkat === "semua" ||
      String(item.expand?.kelas_id?.tingkat) === selectedTingkat;

    const search = searchQuery.toLowerCase();
    const namaSiswa = item.nama_siswa?.toLowerCase() || "";
    const nis = item.nis?.toLowerCase() || "";
    const nisn = item.nisn?.toLowerCase() || "";
    const namaKelas = item.expand?.kelas_id?.nama_kelas?.toLowerCase() || "";

    const matchSearch =
      namaSiswa.includes(search) ||
      nis.includes(search) ||
      nisn.includes(search) ||
      namaKelas.includes(search);

    return matchTingkat && matchSearch;
  });

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  function handleCloseModal() {
    setOpenModal(false);
    setModalMode(null);
    setEditTarget(null);
    setDeleteTarget(null);
    setForm({
      nama_siswa: "",
      nis: "",
      nisn: "",
      kelas_id: "",
      jenis_kelamin: "",
    });
  }

  function OpenModalForm() {
    setModalMode("tambah");
    setOpenModal(true);
  }

  function openImport() {
    setModalMode("import");
    setOpenModal(true);
  }

  function openDelete(item) {
    setDeleteTarget(item.id);
    setModalMode("hapus");
    setOpenModal(true);
  }

  function openDetail(item) {
    setDetailTarget(item);
  }
  function closeDetail() {
    setDetailTarget(null);
  }

  function handleEdit(item) {
    setEditTarget(item.id);
    setModalMode("edit");

    let jkValue = item.jenis_kelamin || "";
    if (jkValue === "Laki-Laki") jkValue = "L";
    if (jkValue === "Perempuan") jkValue = "P";

    setForm({
      nama_siswa: item.nama_siswa || "",
      nis: item.nis || "",
      nisn: item.nisn || "",
      kelas_id: item.kelas_id || "",
      jenis_kelamin: jkValue,
    });
    setOpenModal(true);
  }

  const handlSubmit = async (e) => {
    e.preventDefault();
    const isEdit = modalMode === "edit";
    try {
      setLoading(true);
      if (isEdit) {
        await pb.collection("siswa").update(EditTarget, form);
        const user = currentUser();
        await createSystemLog({
          type: "succes",
          msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' berhasil Mengubah data Siswa.`,
          endpoint: currentPath(),
          statusCode: 200,
          payload: { form },
        });
        showToast("Berhasil mengubah data");
      } else {
        await pb.collection("siswa").create(form);
        const user = currentUser();
        await createSystemLog({
          type: "succes",
          msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' berhasil Menambahkan data Siswa.`,
          endpoint: currentPath(),
          statusCode: 200,
          payload: { form },
        });
        showToast("Berhasil tambah data");
      }
      handleCloseModal();
      fetchSiswa();
    } catch (error) {
      console.log("gagal memproses data :", error);
      showToast("Gagal memproses data", "error");
      const user = currentUser();
      await createSystemLog({
        type: "error",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' gagal memproses data Siswa.`,
        endpoint: currentPath(),
        statusCode: 400,
        payload: { form },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    try {
      await pb.collection("siswa").delete(deleteTarget);
      showToast("Berhasil menghapus data siswa");
      handleCloseModal();
      fetchSiswa();
    } catch (error) {
      console.log("Gagal menghapus:", error);
      showToast("Gagal menghapus data", "error");
    }
  };

  async function handleDownloadTemplate() {
    const XLSX = await import("xlsx");
    const templateData = [
      { nama_siswa: "", nis: "", nisn: "", jenis_kelamin: "", kelas_id: "" },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws["!cols"] = [
      { wch: 27 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 27 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Siswa");
    XLSX.writeFile(wb, "Template Import_Data Siswa.xlsx");
  }

  const formatID = (dateString) => {
    if (!dateString) return "";

    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "long", // Pilihan: 'short', 'medium', 'long', 'full'
      timeStyle: "medium", // Pilihan: 'short', 'medium', 'long'
      timeZone: "Asia/Jakarta", // Menyesuaikan ke WIB (Gunakan 'Asia/Makassar' untuk WITA / 'Asia/Jayapura' untuk WIT)
    }).format(new Date(dateString));
  };

  async function handleImport(rows) {
    const allKelas = await pb.collection("kelas").getFullList();
    for (const row of rows) {
      try {
        const cariKelas = row.expand?.kelas_id?.nama_kelas || row["kelas_id"];
        const kelas = allKelas.find((d) => d.nama_kelas === cariKelas);
        let jkClean = row.jenis_kelamin;
        if (jkClean) {
          const jkUpper = jkClean.toString().trim().toUpperCase();
          if (jkUpper.startsWith("L")) jkClean = "L";
          else if (jkUpper.startsWith("P")) jkClean = "P";
        }
        await pb.collection("siswa").create({
          nama_siswa: row.nama_siswa,
          nis: row.nis,
          nisn: row.nisn,
          jenis_kelamin: jkClean || "",
          kelas_id: kelas ? kelas.id : "",
        });
      } catch (error) {
        console.log("Gagal import baris:", error);
      }
    }
    showToast("Proses import selesai");
    fetchSiswa();
    handleCloseModal();
  }

  async function handleExportDefault() {
    if (dataSiswa.length === 0) {
      showToast("Tidak ada data untuk diexport.", "error");
      return;
    }
    const XLSX = await import("xlsx");
    const data = dataSiswa.map((item) => ({
      NAMA_SISWA: item.nama_siswa || "",
      NIS: item.nis || "",
      NISN: item.nisn || "",
      JENIS_KELAMIN: item.jenis_kelamin || "",
      KELAS: item.expand?.kelas_id?.nama_kelas || "",
      CREATED: formatID(item.created) || "",
      UPDATED: formatID(item.updated) || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 27 },
      { wch: 27 },
      { wch: 27 },
      { wch: 27 },
      { wch: 27 },
      { wch: 27 },
      { wch: 27 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Siswa");
    XLSX.writeFile(
      wb,
      `Data Siswa_export_at ${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <Toast toast={toast} />

      {/* Header toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <KelasToolbarButtons
          onTambah={OpenModalForm}
          onTemplate={handleDownloadTemplate}
          onImport={openImport}
          onExport={handleExportDefault}
        />
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200/60">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Cari nama, NIS, NISN, atau kelas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder-gray-400 transition-all"
          />
        </div>
        <Select
          value={selectedTingkat}
          onChange={(e) => setSelectedTingkat(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="semua">Semua Tingkat</option>
          {Object.entries(TINGKAT_CONFIG).map(([value, config]) => (
            <option key={value} value={value}>
              {config.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Table */}
      <div className="w-full bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                {[
                  "Nama Siswa",
                  "NIS",
                  "NISN",
                  "Jenis Kelamin",
                  "Tingkat",
                  "Kelas",
                  "Aksi",
                ].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "px-5 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider",
                      h === "Aksi" && "text-center",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadData ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-gray-400"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[13px]">Mengambil data...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredSiswa.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-gray-400"
                  >
                    <div className="text-2xl mb-2">📁</div>
                    <p className="font-medium text-gray-500 text-sm">
                      Data tidak ditemukan
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Coba ubah filter atau tambah siswa baru
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSiswa.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-blue-50/30 transition-colors group"
                  >
                    {/* Nama */}
                    <td className="px-5 py-3.5 text-gray-600">
                      <div className="flex items-center gap-2">
                        <Avatar name={item.nama_siswa || "?"} size="sm" />
                        <strong>
                          {item.nama_siswa || (
                            <span className="text-gray-400 italic font-normal">
                              Belum ditetapkan
                            </span>
                          )}
                        </strong>
                      </div>
                    </td>

                    {/* NIS */}
                    <td className="px-5 py-3.5 text-gray-600">
                      {item.nis || "-"}
                    </td>

                    {/* NISN */}
                    <td className="px-5 py-3.5 text-gray-600">
                      {item.nisn || "-"}
                    </td>

                    {/* Jenis Kelamin */}
                    <td className="px-5 py-3.5 text-gray-600">
                      {item.jenis_kelamin || "-"}
                    </td>

                    {/* Tingkat */}
                    <td className="px-5 py-3.5">
                      <Badge
                        variant={
                          TINGKAT_CONFIG[String(item.expand?.kelas_id?.tingkat)]
                            ?.variant || "default"
                        }
                      >
                        {TINGKAT_CONFIG[String(item.expand?.kelas_id?.tingkat)]
                          ?.label || `Kelas ${item.expand?.kelas_id?.tingkat}`}
                      </Badge>
                    </td>

                    {/* Kelas */}
                    <td className="px-5 py-3.5 text-gray-600">
                      {item.expand?.kelas_id?.nama_kelas || "-"}
                    </td>

                    {/* Aksi */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-0.5">
                        <ActionIconBtn
                          onClick={() => openDetail(item)}
                          title="Lihat Detail"
                          color="blue"
                          label="Detail"
                        >
                          <svg
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </ActionIconBtn>
                        <div className="w-px h-4 bg-gray-200 mx-0.5" />
                        <ActionIconBtn
                          onClick={() => handleEdit(item)}
                          title="Edit"
                          color="amber"
                          label="Edit"
                        >
                          <svg
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path d="m11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </ActionIconBtn>
                        <ActionIconBtn
                          onClick={() => openDelete(item)}
                          title="Hapus"
                          color="red"
                          label="Hapus"
                        >
                          <svg
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
                          </svg>
                        </ActionIconBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal CRUD */}
        <Modal
          isOpen={openModal}
          title={
            modalMode === "hapus"
              ? "Hapus Siswa"
              : modalMode === "import"
                ? "Import Data Siswa"
                : modalMode === "edit"
                  ? "Edit Data Siswa"
                  : "Tambah Siswa"
          }
          onClose={handleCloseModal}
        >
          {modalMode === "hapus" ? (
            <ConfirmDeleteModal
              kelas={deleteTarget}
              onConfirm={handleDelete}
              onCancel={handleCloseModal}
            />
          ) : modalMode === "import" ? (
            <ImportModal onClose={handleCloseModal} onImport={handleImport} />
          ) : (
            <FormMentahan onSubmit={handlSubmit}>
              <Field label="Nama Lengkap">
                <Input
                  name="nama_siswa"
                  value={form.nama_siswa}
                  onChange={handleChange}
                  required
                />
              </Field>
              <Field label="NIS">
                <Input
                  name="nis"
                  value={form.nis}
                  onChange={handleChange}
                  required
                />
              </Field>
              <Field label="NISN">
                <Input
                  name="nisn"
                  value={form.nisn}
                  onChange={handleChange}
                  required
                />
              </Field>
              <Field label="Kelas">
                <Select
                  name="kelas_id"
                  value={form.kelas_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">Pilih Kelas</option>
                  {kelasList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama_kelas}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Jenis Kelamin">
                <Select
                  name="jenis_kelamin"
                  value={form.jenis_kelamin}
                  onChange={handleChange}
                  required
                >
                  <option value="">Pilih Jenis Kelamin</option>
                  <option value="L">Laki-Laki</option>
                  <option value="P">Perempuan</option>
                </Select>
              </Field>
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={loading}
                  className="px-4 py-2 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition shadow-sm disabled:bg-blue-400"
                >
                  {loading ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </FormMentahan>
          )}
        </Modal>

        {/* Modal Detail */}
        <DetailSiswaModal
          item={detailTarget}
          onClose={closeDetail}
          onEditSiswa={handleEdit}
          onDeleteSiswa={openDelete}
        />

        {/* Footer */}
        <div className="bg-gray-50/50 border-t border-gray-100 px-5 py-3 text-[12px] text-gray-500 flex justify-between items-center">
          <span>
            Menampilkan <strong>{filteredSiswa.length}</strong> dari{" "}
            <strong>{dataSiswa.length}</strong> Siswa
          </span>
          {selectedTingkat !== "semua" && (
            <button
              onClick={() => {
                setSelectedTingkat("semua");
                setSearchQuery("");
              }}
              className="text-[12px] text-blue-500 hover:text-blue-700 transition"
            >
              Reset filter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Siswa Modal ───────────────────────────────────────────────────────

function DetailSiswaModal({ item, onClose, onEditSiswa, onDeleteSiswa }) {
  if (!item) return null;
  const tingkat = TINGKAT_CONFIG[String(item.expand?.kelas_id?.tingkat)];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-4">
      <div
        className="absolute inset-0 bg-black/10 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm h-[90vh] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <span className="text-[13px] font-semibold text-gray-700">
            Detail Siswa
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Avatar & nama */}
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-bold">
              {item.nama_siswa
                ?.split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase() || "?"}
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold text-gray-900">
                {item.nama_siswa || "-"}
              </p>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {item.expand?.kelas_id?.nama_kelas || "Kelas belum ditetapkan"}
              </p>
            </div>
            {tingkat && (
              <Badge variant={tingkat.variant}>{tingkat.label}</Badge>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* Info rows */}
          {[
            { label: "NIS", value: item.nis || "-" },
            { label: "NISN", value: item.nisn || "-" },
            { label: "Jenis Kelamin", value: item.jenis_kelamin || "-" },
            { label: "Kelas", value: item.expand?.kelas_id?.nama_kelas || "-" },
            { label: "Tingkat", value: tingkat?.label || "-" },
            { label: "ID Record", value: item.id },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-start gap-4">
              <span className="text-[12px] text-gray-400 shrink-0">
                {label}
              </span>
              <span className="text-[13px] font-medium text-gray-800 text-right break-all">
                {value}
              </span>
            </div>
          ))}

          <hr className="border-gray-100" />

          {/* Timestamps */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
              Timestamps
            </p>
            {[
              { label: "Dibuat", value: item.created },
              { label: "Diperbarui", value: item.updated },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-[12px] text-gray-400">{label}</span>
                <span className="text-[12px] text-gray-600 font-mono">
                  {value
                    ? new Date(value).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "-"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-2">
          <button
            onClick={() => {
              onClose();
              onEditSiswa(item);
            }}
            className="flex-1 py-2 text-[13px] font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100 transition"
          >
            Edit
          </button>
          <button
            onClick={() => {
              onClose();
              onDeleteSiswa(item);
            }}
            className="flex-1 py-2 text-[13px] font-medium text-red-700 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition"
          >
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}
