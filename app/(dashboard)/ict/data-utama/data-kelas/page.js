"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSystemLog } from "@/lib/logger";

/* ═══════════════════════════════════════════════════════════════
   KOMPONEN UI LOKAL — TEMA HITAM
   ═══════════════════════════════════════════════════════════════ */

function cn(...cls) {
  return cls.filter(Boolean).join(" ");
}

const TINGKAT_CONFIG = {
  1: { label: "Tingkat 1" },
  2: { label: "Tingkat 2" },
  3: { label: "Tingkat 3" },
  4: { label: "Tingkat 4" },
  5: { label: "Tingkat 5" },
  6: { label: "Tingkat 6" },
};

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
        "focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition",
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
        "focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition",
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

function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className="fixed bottom-5 right-5 z-[60] animate-in fade-in slide-in-from-bottom-2">
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-medium shadow-lg",
          isError ? "bg-gray-900 text-white" : "bg-gray-900 text-white",
        )}
      >
        {isError ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {toast.msg}
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

function KelasToolbarButtons({ onTambah, onTemplate, onImport, onExport }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolbarBtn variant="primary" onClick={onTambah}>
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
        Tambah Kelas
      </ToolbarBtn>
      <ToolbarBtn onClick={onTemplate}>
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
      <ToolbarBtn onClick={onImport}>
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
      <ToolbarBtn onClick={onExport}>
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
  );
}

function FormKelas({ initial, onSubmit, onCancel, loading, guruList }) {
  const [form, setForm] = useState({
    nama_kelas: initial?.nama_kelas || "",
    tingkat: initial?.tingkat || "",
    walikelas_id: initial?.walikelas_id || "",
    pendamping_id: initial?.pendamping_id || "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <Field label="Nama Kelas">
        <Input
          name="nama_kelas"
          value={form.nama_kelas}
          onChange={handleChange}
          placeholder="Contoh: 1A"
          required
        />
      </Field>
      <Field label="Tingkat">
        <Select
          name="tingkat"
          value={form.tingkat}
          onChange={handleChange}
          className="w-full"
          required
        >
          <option value="">Pilih Tingkat</option>
          {Object.entries(TINGKAT_CONFIG).map(([value, config]) => (
            <option key={value} value={value}>
              {config.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Wali Kelas">
        <Select
          name="walikelas_id"
          value={form.walikelas_id}
          onChange={handleChange}
          className="w-full"
        >
          <option value="">Belum ditetapkan</option>
          {guruList.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nama_lengkap}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Guru Pendamping">
        <Select
          name="pendamping_id"
          value={form.pendamping_id}
          onChange={handleChange}
          className="w-full"
        >
          <option value="">Belum ditetapkan</option>
          {guruList.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nama_lengkap}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-[13px] font-semibold text-white bg-gray-900 hover:bg-black rounded-lg transition shadow-sm disabled:bg-gray-400"
        >
          {loading ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </form>
  );
}

function ConfirmDeleteModal({ kelas, onConfirm, onCancel, loading }) {
  const nama = kelas?.nama_kelas || "kelas ini";
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

function ImportModal({ onImport, onCancel, loading }) {
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
          onClick={onCancel}
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

function SiswaCount({ kelasId, pb }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let alive = true;
    pb.collection("siswa")
      .getList(1, 1, { filter: `kelas_id = "${kelasId}"`, requestKey: null })
      .then((res) => {
        if (alive) setCount(res.totalItems);
      })
      .catch(() => {
        if (alive) setCount(0);
      });
    return () => {
      alive = false;
    };
  }, [kelasId, pb]);

  if (count === null) {
    return (
      <span className="inline-block h-3 w-6 animate-pulse rounded bg-gray-200" />
    );
  }
  return <span>{count} siswa</span>;
}

/* ═══════════════════════════════════════════════════════════════
   KELAS CARD
   ═══════════════════════════════════════════════════════════════ */

function KelasCard({ item, onDetail, onEdit, onDelete }) {
  const tingkat = TINGKAT_CONFIG[String(item.tingkat)];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-gray-900 transition-all duration-200 flex flex-col">
      {/* Color strip — hitam */}
      <div className="h-1.5 w-full bg-gradient-to-r from-gray-800 via-gray-900 to-black" />

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={() => onDetail(item)}
            className="text-[15px] font-bold text-gray-900 hover:text-black text-left leading-tight transition-colors"
          >
            {item.nama_kelas}
          </button>
          {tingkat && (
            <span className="shrink-0 text-[10px] font-semibold mt-0.5 rounded-full bg-gray-900 text-white px-2.5 py-0.5">
              {tingkat.label}
            </span>
          )}
        </div>

        <div className="border-t border-gray-100" />

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
                <span className="text-gray-400 italic font-normal">
                  Belum ditetapkan
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
          <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
            <svg
              width="13"
              height="13"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
              Total Siswa
            </p>
            <div className="text-[13px] font-semibold text-gray-800">
              <SiswaCount kelasId={item.id} pb={pb} />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => onDetail(item)}
          className="flex-1 py-1.5 text-[12px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-900 hover:text-white hover:border-gray-900 transition"
        >
          Detail
        </button>
        <button
          onClick={() => onEdit(item)}
          className="flex-1 py-1.5 text-[12px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-900 hover:text-white hover:border-gray-900 transition"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(item)}
          className="w-8 h-[30px] flex items-center justify-center text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-900 hover:text-white hover:border-gray-900 transition"
          title="Hapus"
        >
          <svg
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

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

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function DataKelasPage() {
  const router = useRouter();

  const [kelas, setKelas] = useState([]);
  const [guruList, setGuruList] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTingkat, setSelectedTingkat] = useState("semua");

  const [modalTambah, setModalTambah] = useState(false);
  const [modalEdit, setModalEdit] = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [modalDelete, setModalDelete] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const currentUser = () => pb.authStore.model;
  const currentPath = () =>
    typeof window !== "undefined" ? window.location.pathname : "-";

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await pb.collection("kelas").getFullList({
        expand: "walikelas_id,pendamping_id",
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
        filter: 'role = "guru walikelas" || role = "guru pendamping"',
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

  const filteredKelas = kelas.filter((item) => {
    const matchTingkat =
      selectedTingkat === "semua" || String(item.tingkat) === selectedTingkat;
    const namaKelas = item.nama_kelas?.toLowerCase() || "";
    const namaWali =
      item.expand?.walikelas_id?.nama_lengkap?.toLowerCase() || "";
    const search = searchQuery.toLowerCase();
    return (
      matchTingkat && (namaKelas.includes(search) || namaWali.includes(search))
    );
  });

  const handleTambah = async (form) => {
    try {
      setSubmitLoading(true);
      await pb.collection("kelas").create(form);
      const user = currentUser();
      await createSystemLog({
        type: "succes",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' berhasil Menambahkan data kelas.`,
        endpoint: currentPath(),
        statusCode: 200,
        payload: { form },
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
        endpoint: currentPath(),
        statusCode: 200,
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
        endpoint: currentPath(),
        statusCode: 200,
        payload: {},
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
          const waliNama =
            row.expand?.walikelas_id?.nama_lengkap || row["walikelas_id"] || "";
          const pendampingNama =
            row.expand?.walikelas_id?.nama_lengkap ||
            row["pendamping_id"] ||
            "";
          const waliUser = allUsers.find((u) => u.nama_lengkap === waliNama);
          const pendampingUser = allUsers.find(
            (u) => u.nama_lengkap === pendampingNama,
          );
          await pb.collection("kelas").create({
            nama_kelas: row.nama_kelas || row["nama kelas"] || "",
            walikelas_id: waliUser?.id || "",
            pendamping_id: pendampingUser?.id || "",
            tingkat: row.tingkat || 1,
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
      "Nama Kelas": item.nama_kelas || "",
      "Wali Kelas": item.expand?.walikelas_id?.nama_lengkap || "-",
      Pendamping: item.expand?.pendamping_id?.nama_lengkap || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Kelas");
    XLSX.writeFile(
      wb,
      `Data_Kelas_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    showToast("Data berhasil diexport ke Excel.");
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const templateData = [
      {
        nama_kelas: "1A",
        walikelas_id: "Nama Guru",
        tingkat: "1",
        pendamping_id: "Nama pendamping",
      },
      {
        nama_kelas: "2B",
        walikelas_id: "Nama Guru",
        tingkat: "2",
        pendamping_id: "Nama pendamping",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws["!cols"] = [{ wch: 27 }, { wch: 27 }, { wch: 27 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Kelas");
    XLSX.writeFile(wb, "template_import_kelas.xlsx");
  };

  const openEdit = (item) => {
    setEditTarget(item);
    setModalEdit(true);
  };
  const openDelete = (item) => {
    setDeleteTarget(item);
    setModalDelete(true);
  };
  const openDetail = (item) =>
    router.push(`/ict/data-utama/data-kelas/${item.id}`);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <Toast toast={toast} />

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
            placeholder="Cari nama kelas atau wali kelas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 placeholder-gray-400 transition-all"
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

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <KelasCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredKelas.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl py-16 text-center">
          <div className="text-3xl mb-3">📁</div>
          <p className="font-medium text-gray-500 text-sm">
            Data tidak ditemukan
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Coba ubah filter atau tambah kelas baru
          </p>
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

      {/* Footer */}
      <div className="flex justify-between items-center text-[12px] text-gray-500 px-1">
        <span>
          Menampilkan{" "}
          <strong className="text-gray-900">{filteredKelas.length}</strong> dari{" "}
          <strong className="text-gray-900">{kelas.length}</strong> kelas
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

      {/* Modals */}
      <Modal
        isOpen={modalTambah}
        onClose={() => setModalTambah(false)}
        title="Tambah Kelas Baru"
      >
        <FormKelas
          onSubmit={handleTambah}
          onCancel={() => setModalTambah(false)}
          loading={submitLoading}
          guruList={guruList}
        />
      </Modal>

      <Modal
        isOpen={modalEdit}
        onClose={() => setModalEdit(false)}
        title={`Edit Kelas — ${editTarget?.nama_kelas || ""}`}
      >
        <FormKelas
          initial={
            editTarget
              ? {
                  nama_kelas: editTarget.nama_kelas,
                  tingkat: String(editTarget.tingkat),
                  walikelas_id: editTarget.walikelas_id,
                  pendamping_id: editTarget.pendamping_id,
                }
              : undefined
          }
          onSubmit={handleEdit}
          onCancel={() => setModalEdit(false)}
          loading={submitLoading}
          guruList={guruList}
        />
      </Modal>

      <Modal
        isOpen={modalImport}
        onClose={() => setModalImport(false)}
        title="Import Data Kelas dari Excel"
      >
        <ImportModal
          onImport={handleImport}
          onCancel={() => setModalImport(false)}
          loading={submitLoading}
        />
      </Modal>

      <Modal
        isOpen={modalDelete}
        onClose={() => setModalDelete(false)}
        title="Konfirmasi Hapus"
      >
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
