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

// Label tingkat romawi untuk sheet export
const TINGKAT_ROMAWI = {
  1: "Tingkat I",
  2: "Tingkat II",
  3: "Tingkat III",
  4: "Tingkat IV",
  5: "Tingkat V",
  6: "Tingkat VI",
};

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
  const [selectedKelas, setSelectedKelas] = useState("semua");

  // Sorting (nama siswa)
  const [sortOrder, setSortOrder] = useState("asc"); // "asc" (A-Z) | "desc" (Z-A)

  // Modal
  const [openModal, setOpenModal] = useState(false);
  const [modalMode, setModalMode] = useState(null);

  // Import progress
  const [importState, setImportState] = useState("idle"); // idle | processing | success
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
  });

  // Export progress
  const [exporting, setExporting] = useState(false);

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

  // ─── Kelas list terurut (Tingkat -> Nama Kelas) ─────────────────────────────

  const sortedKelasList = [...kelasList].sort((a, b) => {
    const tingkatA = Number(a.tingkat) || 0;
    const tingkatB = Number(b.tingkat) || 0;
    if (tingkatA !== tingkatB) return tingkatA - tingkatB;
    return (a.nama_kelas || "").localeCompare(b.nama_kelas || "", "id", {
      numeric: true,
      sensitivity: "base",
    });
  });

  // Kalau tingkat dipilih, opsi kelas ikut mengecil ke tingkat itu saja
  const kelasOptionsForFilter = sortedKelasList.filter(
    (k) => selectedTingkat === "semua" || String(k.tingkat) === selectedTingkat,
  );

  // ─── Filter + Sort ───────────────────────────────────────────────────────────

  const filteredSiswa = dataSiswa
    .filter((item) => {
      const matchTingkat =
        selectedTingkat === "semua" ||
        String(item.expand?.kelas_id?.tingkat) === selectedTingkat;

      const matchKelas =
        selectedKelas === "semua" || item.kelas_id === selectedKelas;

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

      return matchTingkat && matchKelas && matchSearch;
    })
    .sort((a, b) => {
      const namaA = a.nama_siswa || "";
      const namaB = b.nama_siswa || "";
      const compare = namaA.localeCompare(namaB, "id", {
        sensitivity: "base",
      });
      return sortOrder === "asc" ? compare : -compare;
    });

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  function handleCloseModal() {
    if (importState === "processing") return; // cegah tutup saat import berjalan
    setOpenModal(false);
    setModalMode(null);
    setEditTarget(null);
    setDeleteTarget(null);
    setImportState("idle");
    setImportProgress({ current: 0, total: 0 });
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
    setImportState("idle");
    setImportProgress({ current: 0, total: 0 });
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
    setImportState("processing");
    setImportProgress({ current: 0, total: rows.length });

    const allKelas = await pb.collection("kelas").getFullList();
    let successCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
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
        successCount++;
      } catch (error) {
        console.log("Gagal import baris:", error);
      } finally {
        setImportProgress((prev) => ({ ...prev, current: i + 1 }));
      }
    }

    setImportState("success");
    const user = currentUser();
    await createSystemLog({
      type: "succes",
      msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' berhasil Import data Siswa (${successCount}/${rows.length}).`,
      endpoint: currentPath(),
      statusCode: 200,
      payload: { total: rows.length, success: successCount },
    });
    fetchSiswa();

    setTimeout(() => {
      showToast(`Berhasil import ${successCount} dari ${rows.length} data`);
      setOpenModal(false);
      setModalMode(null);
      setImportState("idle");
      setImportProgress({ current: 0, total: 0 });
    }, 1300);
  }

  // Urutkan data: Tingkat (1,2,3,...) -> Nama Kelas (1A, 1B, ... 2A, 2B, ...) -> Nama Siswa (A-Z)
  function sortSiswaForExport(list) {
    return [...list].sort((a, b) => {
      const tingkatA = Number(a.expand?.kelas_id?.tingkat) || 0;
      const tingkatB = Number(b.expand?.kelas_id?.tingkat) || 0;
      if (tingkatA !== tingkatB) return tingkatA - tingkatB;

      const kelasA = a.expand?.kelas_id?.nama_kelas || "";
      const kelasB = b.expand?.kelas_id?.nama_kelas || "";
      const kelasCompare = kelasA.localeCompare(kelasB, "id", {
        numeric: true,
        sensitivity: "base",
      });
      if (kelasCompare !== 0) return kelasCompare;

      const namaA = a.nama_siswa || "";
      const namaB = b.nama_siswa || "";
      return namaA.localeCompare(namaB, "id", { sensitivity: "base" });
    });
  }

  // ─── Export multi-sheet (All Data + per Tingkat) dengan header kuning ──────
  //
  // NOTE: Butuh package "exceljs" karena "xlsx" (SheetJS community) tidak
  // mendukung styling warna cell. Install dulu:
  //   npm install exceljs
  //
  async function handleExportDefault() {
    if (dataSiswa.length === 0) {
      showToast("Tidak ada data untuk diexport.", "error");
      return;
    }

    try {
      setExporting(true);
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "gTeach";
      wb.created = new Date();

      const headers = [
        "NAMA_SISWA",
        "JENIS_KELAMIN",
        "NIS",
        "NISN",
        "KELAS",
        "CREATED",
        "UPDATED",
      ];
      // Lebar minimum per kolom (fallback), akan membesar otomatis
      // mengikuti isi terpanjang di seluruh data (bukan fix).
      const minColWidths = [22, 16, 14, 14, 12, 28, 28];

      function buildRows(list) {
        return sortSiswaForExport(list).map((item) => [
          item.nama_siswa || "",
          item.jenis_kelamin || "",
          item.nis || "",
          item.nisn || "",
          item.expand?.kelas_id?.nama_kelas || "",
          formatID(item.created) || "",
          formatID(item.updated) || "",
        ]);
      }

      // Hitung lebar kolom otomatis dari isi TERPANJANG di seluruh data,
      // supaya konsisten di semua sheet (All Data & tiap Tingkat) dan
      // kolom seperti KELAS tidak lagi kepotong sempit.
      const allRowsForWidth = buildRows(dataSiswa);
      const colWidths = headers.map((h, colIdx) => {
        const headerLen = h.length;
        const maxContentLen = allRowsForWidth.reduce((max, r) => {
          const len = String(r[colIdx] ?? "").length;
          return len > max ? len : max;
        }, 0);
        const fit = Math.max(headerLen, maxContentLen) + 4; // padding
        return Math.max(minColWidths[colIdx], fit);
      });

      function addSheet(sheetName, list) {
        const sheet = wb.addWorksheet(sheetName, {
          views: [{ state: "frozen", ySplit: 1 }],
        });

        sheet.columns = colWidths.map((w) => ({ width: w }));

        // Header
        const headerRow = sheet.addRow(headers);
        headerRow.height = 22;
        headerRow.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFD500" }, // kuning
          };
          cell.font = { bold: true, color: { argb: "FF1F2937" }, size: 11 };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.border = {
            top: { style: "thin", color: { argb: "FFB8860B" } },
            bottom: { style: "thin", color: { argb: "FFB8860B" } },
            left: { style: "thin", color: { argb: "FFB8860B" } },
            right: { style: "thin", color: { argb: "FFB8860B" } },
          };
        });

        // Data rows
        const rows = buildRows(list);
        rows.forEach((r, idx) => {
          const row = sheet.addRow(r);
          const isEven = idx % 2 === 1;
          row.eachCell((cell, colNumber) => {
            cell.border = {
              top: { style: "thin", color: { argb: "FFE5E7EB" } },
              bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
              left: { style: "thin", color: { argb: "FFE5E7EB" } },
              right: { style: "thin", color: { argb: "FFE5E7EB" } },
            };
            cell.alignment = {
              vertical: "middle",
              horizontal: colNumber === 1 ? "left" : "center",
            };
            if (isEven) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFAFAFA" },
              };
            }
          });
        });

        // Footer info jumlah data
        sheet.addRow([]);
        const infoRow = sheet.addRow([`Total: ${rows.length} siswa`]);
        infoRow.getCell(1).font = {
          italic: true,
          color: { argb: "FF9CA3AF" },
          size: 10,
        };
      }

      // Sheet 1: All Data (semua kelas 1A - 6 dst)
      addSheet("All Data", dataSiswa);

      // Sheet per tingkat (I - VI)
      for (let t = 1; t <= 6; t++) {
        const listTingkat = dataSiswa.filter(
          (item) => Number(item.expand?.kelas_id?.tingkat) === t,
        );
        addSheet(TINGKAT_ROMAWI[t] || `Tingkat ${t}`, listTingkat);
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Data Siswa_export_at ${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("Berhasil export data siswa");
    } catch (error) {
      console.log("Gagal export:", error);
      showToast("Gagal export data", "error");
    } finally {
      setExporting(false);
    }
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
          exportDisabled={exporting}
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
          onChange={(e) => {
            setSelectedTingkat(e.target.value);
            // reset pilihan kelas kalau tingkat berubah dan kelas lama tidak
            // termasuk dalam tingkat baru
            setSelectedKelas("semua");
          }}
          className="w-full sm:w-44"
        >
          <option value="semua">Semua Tingkat</option>
          {Object.entries(TINGKAT_CONFIG).map(([value, config]) => (
            <option key={value} value={value}>
              {config.label}
            </option>
          ))}
        </Select>

        <Select
          value={selectedKelas}
          onChange={(e) => setSelectedKelas(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="semua">Semua Kelas</option>
          {kelasOptionsForFilter.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nama_kelas}
            </option>
          ))}
        </Select>

        <button
          type="button"
          onClick={() =>
            setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
          }
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all whitespace-nowrap"
          title={sortOrder === "asc" ? "Urutkan Z-A" : "Urutkan A-Z"}
        >
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M3 6h6M3 12h4M3 18h2" />
            {sortOrder === "asc" ? (
              <path d="m17 4 4 4-4 4M21 8H9" />
            ) : (
              <path d="m17 20 4-4-4-4M21 16H9" />
            )}
          </svg>
          {sortOrder === "asc" ? "A-Z" : "Z-A"}
        </button>
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
                ? importState === "processing"
                  ? "Mengimport Data..."
                  : importState === "success"
                    ? "Import Selesai"
                    : "Import Data Siswa"
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
            importState === "idle" ? (
              <ImportModal onClose={handleCloseModal} onImport={handleImport} />
            ) : (
              <ImportProgress state={importState} progress={importProgress} />
            )
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
          {(selectedTingkat !== "semua" ||
            selectedKelas !== "semua" ||
            searchQuery) && (
            <button
              onClick={() => {
                setSelectedTingkat("semua");
                setSelectedKelas("semua");
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

// ─── Import Progress ──────────────────────────────────────────────────────────

function ImportProgress({ state, progress }) {
  const circumference = 100.53; // 2 * PI * r(16)
  const percent =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 gap-5">
      {state === "processing" ? (
        <>
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="#E5E7EB"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={
                  circumference - (percent / 100) * circumference
                }
                transform="rotate(-90 18 18)"
                style={{ transition: "stroke-dashoffset 0.25s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-blue-600">
              {percent}%
            </div>
          </div>

          <div className="text-center">
            <p className="text-[13px] font-semibold text-gray-700">
              Mengimport data...
            </p>
            <p className="text-[12px] text-gray-400 mt-1">
              {progress.current} dari {progress.total} baris diproses
            </p>
          </div>

          <div className="w-full max-w-[220px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center animate-[pop_0.3s_ease-out]">
            <svg
              className="w-8 h-8 text-green-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d="M20 6 9 17l-5-5"
                style={{
                  strokeDasharray: 30,
                  strokeDashoffset: 30,
                  animation: "checkDraw 0.4s ease-out forwards",
                }}
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-gray-700">
              Import selesai!
            </p>
            <p className="text-[12px] text-gray-400 mt-1">
              {progress.total} baris berhasil diproses
            </p>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes checkDraw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes pop {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
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
