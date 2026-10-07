"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";

/* ═══════════════════════════════════════════════════════════════
   KOMPONEN UI LOKAL — TEMA HITAM
   ═══════════════════════════════════════════════════════════════ */

function cn(...cls) {
  return cls.filter(Boolean).join(" ");
}

function Avatar({ name = "?", size = "md" }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]";
  return (
    <span
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full bg-gray-900 font-semibold text-white",
        sz,
      )}
    >
      {initials}
    </span>
  );
}

function Select({ className = "", children, ...props }) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-800",
        "focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900",
        "transition",
        className,
      )}
    >
      {children}
    </select>
  );
}

function Input({ className = "", ...props }) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-800",
        "placeholder:text-gray-400",
        "focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900",
        "transition",
        className,
      )}
    />
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function IconBtn({ onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-900 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30"
    >
      {children}
    </button>
  );
}

function Modal({ isOpen, title, onClose, children }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Tutup"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ item, onConfirm, onCancel, loading }) {
  const nama = item?.nama_lengkap || item?.nama_siswa || "data ini";
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-gray-600">
        Yakin ingin menghapus <strong className="text-gray-900">{nama}</strong>?
        Tindakan ini tidak dapat dibatalkan.
      </p>
      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-black disabled:bg-gray-400"
        >
          {loading ? "Menghapus..." : "Hapus"}
        </button>
      </div>
    </div>
  );
}

function ImportModal({ onImport, onClose, loading }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
    setRows(json);
  };

  return (
    <div className="space-y-4">
      <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-6 text-center cursor-pointer hover:bg-gray-50">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-gray-400"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-[13px] font-medium text-gray-700">
          {fileName || "Pilih file Excel (.xlsx)"}
        </span>
        <span className="text-[11px] text-gray-400">
          {rows.length > 0
            ? `${rows.length} baris siap diimpor`
            : "Klik untuk memilih file"}
        </span>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          className="hidden"
        />
      </label>

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={() => onImport(rows)}
          disabled={loading || rows.length === 0}
          className="rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-black disabled:bg-gray-400"
        >
          {loading ? "Mengimpor..." : `Impor ${rows.length || ""} Data`}
        </button>
      </div>
    </div>
  );
}

function ToolbarBtn({ onClick, children, variant = "default" }) {
  const styles =
    variant === "primary"
      ? "bg-gray-900 text-white hover:bg-black"
      : "border border-gray-200 text-gray-700 bg-white hover:bg-gray-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-medium transition-colors",
        styles,
      )}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HALAMAN DATA GURU
   ═══════════════════════════════════════════════════════════════ */

export default function DataGuru() {
  const [loadData, setLoadData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dataGuru, setDataGuru] = useState([]);
  const [kelasList, setKelasList] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTingkat, setSelectedTingkat] = useState("semua");

  const [openModal, setOpenModal] = useState(false);
  const [modalMode, setModalMode] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState({
    id: "",
    nama_siswa: "",
    username: "",
    email: "",
    no_whatsapp: "",
    role: "",
    kelas_id: "",
    jenis_kelamin: "",
    password: "",
  });

  const getKelasGuru = (guruId) =>
    kelasList.find(
      (k) => k.walikelas_id === guruId || k.pendamping_id === guruId,
    );

  async function fetchGuruDanKelas() {
    try {
      setLoadData(true);
      setLoading(true);
      const [guru, kelas] = await Promise.all([
        pb.collection("users").getFullList({
          requestKey: null,
          filter: `role = "guru walikelas" || role = "guru pendamping" || role = "guru mapel"`,
        }),
        pb.collection("kelas").getFullList({
          expand: "walikelas_id,pendamping_id",
          requestKey: null,
        }),
      ]);
      setDataGuru(guru);
      setKelasList(kelas);
    } catch (error) {
      console.error("Gagal mengambil data guru & kelas:", error);
    } finally {
      setLoadData(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGuruDanKelas();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm({
      id: "",
      nama_siswa: "",
      username: "",
      email: "",
      no_whatsapp: "",
      role: "",
      kelas_id: "",
      jenis_kelamin: "",
      password: "",
    });
  };

  const OpenModalForm = () => {
    resetForm();
    setModalMode("tambah");
    setOpenModal(true);
  };

  const handleEdit = (item) => {
    const kelasGuru = getKelasGuru(item.id);
    setForm({
      id: item.id,
      nama_siswa: item.nama_lengkap || "",
      username: item.username || "",
      email: item.email || "",
      no_whatsapp: item.no_whatsapp || "",
      role: item.role || "",
      kelas_id: kelasGuru?.id || "",
      jenis_kelamin: item.jenis_kelamin || "",
      password: "",
    });
    setModalMode("edit");
    setOpenModal(true);
    setDetailTarget(null);
  };

  const openDelete = (item) => {
    setDeleteTarget(item);
    setModalMode("hapus");
    setOpenModal(true);
    setDetailTarget(null);
  };

  const openImport = () => {
    setModalMode("import");
    setOpenModal(true);
  };

  const openDetail = (item) => setDetailTarget(item);
  const closeDetail = () => setDetailTarget(null);

  const handleCloseModal = () => {
    setOpenModal(false);
    setModalMode(false);
    setDeleteTarget(null);
    resetForm();
  };

  const handlSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        nama_lengkap: form.nama_siswa,
        username: form.username,
        email: form.email,
        no_whatsapp: form.no_whatsapp,
        role: form.role,
        jenis_kelamin: form.jenis_kelamin,
      };

      let guruRecord;

      if (modalMode === "edit") {
        if (form.password) payload.password = form.password;
        guruRecord = await pb.collection("users").update(form.id, payload);

        const kelasLama = kelasList.filter(
          (k) => k.walikelas_id === form.id || k.pendamping_id === form.id,
        );
        for (const k of kelasLama) {
          const updateData = {};
          if (k.walikelas_id === form.id) updateData.walikelas_id = "";
          if (k.pendamping_id === form.id) updateData.pendamping_id = "";
          await pb.collection("kelas").update(k.id, updateData);
        }

        if (form.kelas_id) {
          const updateKelasPayload = {};
          if (form.role === "guru walikelas")
            updateKelasPayload.walikelas_id = form.id;
          else if (form.role === "guru pendamping")
            updateKelasPayload.pendamping_id = form.id;
          else updateKelasPayload.walikelas_id = form.id;
          await pb
            .collection("kelas")
            .update(form.kelas_id, updateKelasPayload);
        }
      } else {
        payload.password = form.password || "PasswordGuru123";
        payload.passwordConfirm = payload.password;
        guruRecord = await pb.collection("users").create(payload);

        if (form.kelas_id && guruRecord) {
          const updateKelasPayload = {};
          if (form.role === "guru walikelas")
            updateKelasPayload.walikelas_id = guruRecord.id;
          else if (form.role === "guru pendamping")
            updateKelasPayload.pendamping_id = guruRecord.id;
          else updateKelasPayload.walikelas_id = guruRecord.id;
          await pb
            .collection("kelas")
            .update(form.kelas_id, updateKelasPayload);
        }
      }

      await fetchGuruDanKelas();
      handleCloseModal();
    } catch (error) {
      console.error("Gagal menyimpan data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      const kelasTerkait = kelasList.filter(
        (k) =>
          k.walikelas_id === deleteTarget.id ||
          k.pendamping_id === deleteTarget.id,
      );
      for (const k of kelasTerkait) {
        const updateData = {};
        if (k.walikelas_id === deleteTarget.id) updateData.walikelas_id = "";
        if (k.pendamping_id === deleteTarget.id) updateData.pendamping_id = "";
        await pb.collection("kelas").update(k.id, updateData);
      }
      await pb.collection("users").delete(deleteTarget.id);
      await fetchGuruDanKelas();
      handleCloseModal();
    } catch (error) {
      console.error("Gagal menghapus data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (rows) => {
    setLoading(true);
    try {
      let successCount = 0;
      let allUsers = await pb
        .collection("users")
        .getFullList({ requestKey: null });

      for (const row of rows) {
        try {
          const nama_lengkap = (
            row.nama_lengkap ||
            row["Nama Lengkap"] ||
            row["nama"] ||
            ""
          ).trim();
          let email = String(row.email || row["Email"] || "")
            .toLowerCase()
            .trim();
          const no_whatsapp = String(
            row.no_whatsapp || row["No WhatsApp"] || row["whatsapp"] || "",
          ).trim();
          let role = row.role || row["Role"] || "guru mapel";
          const jenis_kelamin = row.jenis_kelamin || row["Jenis Kelamin"] || "";

          if (!nama_lengkap) continue;

          if (role === "guru_walikelas") role = "guru walikelas";
          if (role === "guru_pendamping") role = "guru pendamping";
          if (role === "guru_mapel") role = "guru mapel";

          if (email === "") email = null;

          const isExist = allUsers.find((u) => {
            const matchEmail = email && u.email?.toLowerCase() === email;
            const matchNama =
              u.nama_lengkap?.toLowerCase().trim() ===
              nama_lengkap.toLowerCase();
            return matchEmail || matchNama;
          });

          if (isExist) continue;

          const payload = {
            nama_lengkap,
            role,
            password: "gTeach2026",
            passwordConfirm: "gTeach2026",
            is_aktif: true,
            verified: true,
          };

          if (email) payload.email = email;
          if (no_whatsapp) payload.no_whatsapp = no_whatsapp;
          if (jenis_kelamin) payload.jenis_kelamin = jenis_kelamin;

          const newGuru = await pb.collection("users").create(payload);
          allUsers.push({
            id: newGuru.id,
            nama_lengkap: payload.nama_lengkap,
            email: email || "",
          });

          const namaKelasExcel =
            row.nama_kelas || row["Kelas"] || row["Nama Kelas"];
          if (namaKelasExcel && newGuru) {
            const kelasTerkait = kelasList.find(
              (k) =>
                k.nama_kelas?.toLowerCase() ===
                String(namaKelasExcel).toLowerCase(),
            );
            if (kelasTerkait) {
              const updateKelasPayload = {};
              if (role === "guru walikelas")
                updateKelasPayload.walikelas_id = newGuru.id;
              else if (role === "guru pendamping")
                updateKelasPayload.pendamping_id = newGuru.id;
              if (Object.keys(updateKelasPayload).length > 0) {
                await pb
                  .collection("kelas")
                  .update(kelasTerkait.id, updateKelasPayload);
              }
            }
          }
          successCount++;
        } catch (e) {
          console.error("Baris gagal diimpor:", e.data || e.message || e);
        }
      }

      alert(
        `${successCount} dari ${rows.length} baris guru berhasil diproses.`,
      );
      handleCloseModal();
      await fetchGuruDanKelas();
    } catch (err) {
      console.error("Gagal total import data:", err);
      alert("Terjadi kesalahan sistem saat mengimport data.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportDefault = async () => {
    if (dataGuru.length === 0) {
      alert("Tidak ada data untuk diexport.");
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const dataToExport = dataGuru.map((item) => {
        const kelasGuru = getKelasGuru(item.id);
        let statusKelas = "-";
        if (kelasGuru) {
          const tipe =
            kelasGuru.walikelas_id === item.id ? "Wali" : "Pendamping";
          statusKelas = `${kelasGuru.nama_kelas} (${tipe})`;
        }
        return {
          "Nama Lengkap": item.nama_lengkap || "",
          Role: item.role || "",
          "Kelas Diampu": statusKelas,
          username: item.username,
          password: "gTeach2026",
        };
      });
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      ws["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 25 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data Guru");
      XLSX.writeFile(
        wb,
        `Data_Guru_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
    } catch (error) {
      console.error("Gagal export data:", error);
      alert("Gagal mengexport data ke Excel.");
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import("xlsx");
      const templateData = [
        {
          nama_lengkap: "Ahmad Subarjo, S.Pd",
          username: "ahmadsubarjo",
          email: "ahmad@sekolah.sch.id",
          no_whatsapp: "081234567890",
          role: "guru_walikelas",
          jenis_kelamin: "L",
          nama_kelas: "Kelas 1A",
        },
      ];
      const ws = XLSX.utils.json_to_sheet(templateData);
      ws["!cols"] = [
        { wch: 25 },
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 18 },
        { wch: 15 },
        { wch: 15 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template Import");
      XLSX.writeFile(wb, "template_import_guru.xlsx");
    } catch (error) {
      console.error("Gagal mendownload template:", error);
      alert("Gagal mengunduh template.");
    }
  };

  const daftarTingkat = [
    ...new Set(kelasList.map((k) => String(k.tingkat || "")).filter(Boolean)),
  ].sort();

  const filteredSiswa = dataGuru.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      item.nama_lengkap?.toLowerCase().includes(q) ||
      item.username?.toLowerCase().includes(q) ||
      item.email?.toLowerCase().includes(q);
    const kelasGuru = getKelasGuru(item.id);
    const tingkatKelas = String(kelasGuru?.tingkat || "");
    const matchesTingkat =
      selectedTingkat === "semua" || tingkatKelas === selectedTingkat;
    return matchesSearch && matchesTingkat;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarBtn variant="primary" onClick={OpenModalForm}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Tambah Guru
          </ToolbarBtn>
          <ToolbarBtn onClick={handleDownloadTemplate}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Template
          </ToolbarBtn>
          <ToolbarBtn onClick={openImport}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </ToolbarBtn>
          <ToolbarBtn onClick={handleExportDefault}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </ToolbarBtn>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, username, atau email guru..."
              className="h-9 pl-8 pr-3 text-[13px] border border-gray-200 rounded-lg w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition"
            />
          </div>
          <Select
            value={selectedTingkat}
            onChange={(e) => setSelectedTingkat(e.target.value)}
            className="w-full sm:w-40"
          >
            <option value="semua">Semua Tingkat</option>
            {daftarTingkat.map((t) => (
              <option key={t} value={t}>
                Tingkat {t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Tabel */}
      <div className="w-full bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                {[
                  "Nama Guru",
                  "Username",
                  "Role",
                  "Kelas",
                  "Email",
                  "No WhatsApp",
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
                      Coba ubah filter atau tambah guru baru
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSiswa.map((item) => {
                  const kelasGuru = getKelasGuru(item.id);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-gray-600">
                        <div className="flex items-center gap-2">
                          <Avatar name={item.nama_lengkap || "?"} size="sm" />
                          <strong className="text-gray-900">
                            {item.nama_lengkap || (
                              <span className="text-gray-400 italic font-normal">
                                Belum ditetapkan
                              </span>
                            )}
                          </strong>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {item.username || "-"}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {item.role || "-"}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {kelasGuru
                          ? `${kelasGuru.nama_kelas} (${kelasGuru.walikelas_id === item.id ? "Wali" : "Pendamping"})`
                          : "Bukan Wali/Pendamping"}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {item.email || "-"}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {item.no_whatsapp || "-"}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <IconBtn
                            onClick={() => openDetail(item)}
                            title="Lihat Detail"
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
                          </IconBtn>
                          <div className="w-px h-4 bg-gray-200 mx-0.5" />
                          <IconBtn
                            onClick={() => handleEdit(item)}
                            title="Edit"
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
                          </IconBtn>
                          <IconBtn
                            onClick={() => openDelete(item)}
                            title="Hapus"
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
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-50/50 border-t border-gray-100 px-5 py-3 text-[12px] text-gray-500 flex justify-between items-center">
          <span>
            Menampilkan{" "}
            <strong className="text-gray-900">{filteredSiswa.length}</strong>{" "}
            dari <strong className="text-gray-900">{dataGuru.length}</strong>{" "}
            Guru
          </span>
          {(selectedTingkat !== "semua" || searchQuery) && (
            <button
              onClick={() => {
                setSelectedTingkat("semua");
                setSearchQuery("");
              }}
              className="text-[12px] text-gray-700 hover:text-black font-medium transition"
            >
              Reset filter
            </button>
          )}
        </div>
      </div>

      {/* Modal Utama */}
      <Modal
        isOpen={openModal}
        title={
          modalMode === "hapus"
            ? "Hapus Guru"
            : modalMode === "import"
              ? "Import Data Guru"
              : modalMode === "edit"
                ? "Edit Data Guru"
                : "Tambah Guru"
        }
        onClose={handleCloseModal}
      >
        {modalMode === "hapus" ? (
          <ConfirmDeleteModal
            item={deleteTarget}
            onConfirm={handleDelete}
            onCancel={handleCloseModal}
            loading={loading}
          />
        ) : modalMode === "import" ? (
          <ImportModal
            onImport={handleImport}
            onClose={handleCloseModal}
            loading={loading}
          />
        ) : (
          <form onSubmit={handlSubmit} className="space-y-3.5">
            <Field label="Nama Lengkap">
              <Input
                name="nama_siswa"
                value={form.nama_siswa}
                onChange={handleChange}
                required
              />
            </Field>
            <Field label="Username">
              <Input
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder="Opsional (Otomatis jika kosong)"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
              />
            </Field>
            <Field label="No WhatsApp">
              <Input
                name="no_whatsapp"
                value={form.no_whatsapp}
                onChange={handleChange}
              />
            </Field>
            <Field label="Role">
              <Select
                name="role"
                value={form.role}
                onChange={handleChange}
                required
                className="w-full"
              >
                <option value="">Pilih Role</option>
                <option value="guru walikelas">Guru Wali Kelas</option>
                <option value="guru pendamping">Guru Pendamping</option>
                <option value="guru mapel">Guru Mapel</option>
                <option value="admin">Admin</option>
                <option value="ict">ICT</option>
              </Select>
            </Field>
            <Field label="Kelas Pengampu">
              <Select
                name="kelas_id"
                value={form.kelas_id}
                onChange={handleChange}
                className="w-full"
              >
                <option value="">
                  Pilih Kelas (Kosongkan jika bukan wali/pendamping)
                </option>
                {kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama_kelas || `Tingkat ${k.tingkat}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Jenis Kelamin">
              <Select
                name="jenis_kelamin"
                value={form.jenis_kelamin}
                onChange={handleChange}
                className="w-full"
              >
                <option value="">Pilih Jenis Kelamin</option>
                <option value="L">Laki-Laki</option>
                <option value="P">Perempuan</option>
              </Select>
            </Field>
            {modalMode === "tambah" && (
              <Field label="Password">
                <Input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Minimal 8 karakter"
                  required
                />
              </Field>
            )}
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
                className="px-4 py-2 text-[13px] font-semibold text-white bg-gray-900 hover:bg-black rounded-lg flex items-center gap-2 transition shadow-sm disabled:bg-gray-400"
              >
                {loading ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Detail */}
      {detailTarget && (
        <Modal
          isOpen={!!detailTarget}
          title="Detail Guru"
          onClose={closeDetail}
        >
          <div className="space-y-3 text-[13px] text-gray-600">
            <div>
              <span className="text-gray-400">Nama Lengkap:</span>{" "}
              <strong className="text-gray-900">
                {detailTarget.nama_lengkap || "-"}
              </strong>
            </div>
            <div>
              <span className="text-gray-400">Username:</span>{" "}
              {detailTarget.username || "-"}
            </div>
            <div>
              <span className="text-gray-400">Role:</span>{" "}
              {detailTarget.role || "-"}
            </div>
            <div>
              <span className="text-gray-400">Kelas Diampu:</span>{" "}
              {(() => {
                const kg = getKelasGuru(detailTarget.id);
                return kg
                  ? `${kg.nama_kelas} (${kg.walikelas_id === detailTarget.id ? "Wali Kelas" : "Pendamping Kelas"})`
                  : "Bukan Wali/Pendamping Kelas";
              })()}
            </div>
            <div>
              <span className="text-gray-400">Email:</span>{" "}
              {detailTarget.email || "-"}
            </div>
            <div>
              <span className="text-gray-400">No WhatsApp:</span>{" "}
              {detailTarget.no_whatsapp || "-"}
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
              <button
                onClick={() => handleEdit(detailTarget)}
                className="px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => openDelete(detailTarget)}
                className="px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Hapus
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
