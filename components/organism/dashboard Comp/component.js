"use client";

import { useEffect, useState, useRef } from "react";

// ─── Utilities ────────────────────────────────────────────────────────────────

export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const TINGKAT_CONFIG = {
  1: { label: "Kelas 1", variant: "blue" },
  2: { label: "Kelas 2", variant: "green" },
  3: { label: "Kelas 3", variant: "amber" },
  4: { label: "Kelas 4", variant: "purple" },
  5: { label: "Kelas 5", variant: "pink" },
  6: { label: "Kelas 6", variant: "red" },
};

// ─── Primitive UI ─────────────────────────────────────────────────────────────

export function Badge({ children, variant = "default" }) {
  const variants = {
    default: "bg-gray-100 text-gray-700 border border-gray-200",
    blue: "bg-blue-50 text-blue-700 border border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border border-amber-100",
    red: "bg-red-50 text-red-700 border border-red-100",
    purple: "bg-purple-50 text-purple-700 border border-purple-100",
    pink: "bg-pink-50 text-pink-700 border border-pink-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide",
        variants[variant],
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ name = "?", size = "sm" }) {
  const initials =
    name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-violet-100 text-violet-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-pink-100 text-pink-700",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  const sizeClass =
    size === "sm" ? "w-7 h-7 text-[11px]" : "w-9 h-9 text-[13px]";
  return (
    <span
      className={cn(
        "rounded-full flex items-center justify-center font-bold shrink-0",
        color,
        sizeClass,
      )}
    >
      {initials}
    </span>
  );
}

export function Spinner({ size = "sm" }) {
  const s = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div
      className={cn(
        "border-2 border-current border-t-transparent rounded-full animate-spin",
        s,
      )}
    />
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[13px] text-gray-900",
        "placeholder-gray-400 transition-all",
        "focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[13px] text-gray-900",
        "transition-all focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({ label, required, children, hint }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">
        {label}{" "}
        {required && <span className="text-red-400 normal-case">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

export function ActionButton({
  onClick,
  variant = "default",
  children,
  className,
}) {
  const variants = {
    default: "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50",
    primary: "bg-blue-600 border border-blue-600 text-white hover:bg-blue-700",
    ghost: "text-gray-600 hover:bg-gray-100 border border-transparent",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-colors",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ActionIconBtn({
  onClick,
  title,
  color = "gray",
  label,
  children,
}) {
  const colorMap = {
    blue: "hover:text-blue-600 hover:bg-blue-50 hover:border-blue-100",
    amber: "hover:text-amber-600 hover:bg-amber-50 hover:border-amber-100",
    red: "hover:text-red-600 hover:bg-red-50 hover:border-red-100",
    gray: "hover:text-gray-700 hover:bg-gray-100 hover:border-gray-200",
  };
  return (
    <div className="relative group/btn">
      <button
        onClick={onClick}
        title={title}
        className={cn(
          "p-2 rounded-lg text-gray-400 border border-transparent transition-all duration-150",
          colorMap[color],
        )}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-[10px] font-medium px-2 py-0.5 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 z-50">
        {label}
      </span>
    </div>
  );
}

/**
 * Toolbar button group: Template, Import, Export, Tambah
 * Props:
 *   onTemplate, onImport, onExport, onTambah
 */
export function KelasToolbarButtons({
  onTemplate,
  onImport,
  onExport,
  onTambah,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton onClick={onTemplate}>
        <svg
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M12 3v12M7 14l5 5 5-5" />
          <path d="M5 19h14" />
        </svg>
        Template
      </ActionButton>
      <ActionButton onClick={onImport}>
        <svg
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M12 21V9M7 10l5-5 5 5" />
          <path d="M5 19h14" />
        </svg>
        Import
      </ActionButton>
      <ActionButton onClick={onExport}>
        <svg
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M12 3v12M7 14l5 5 5-5" />
          <path d="M5 19h14" />
        </svg>
        Export
      </ActionButton>
      <ActionButton variant="primary" onClick={onTambah}>
        <svg
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Tambah Kelas
      </ActionButton>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({ isOpen, onClose, title, children, size = "md" }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeMap = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]",
          sizeMap[size],
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 flex-1">{children}</div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

/**
 * Toast notification
 * Props: toast = { msg: string, type: "success" | "error" }
 */
export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-[13px] font-medium border animate-in fade-in slide-in-from-top-2 duration-200",
        toast.type === "error"
          ? "bg-red-50 border-red-100 text-red-800"
          : "bg-emerald-50 border-emerald-100 text-emerald-800",
      )}
    >
      {toast.type === "error" ? (
        <svg
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9 9 15M9 9l6 6" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )}
      {toast.msg}
    </div>
  );
}

// ─── Form Kelas ───────────────────────────────────────────────────────────────

/**
 * Form tambah / edit kelas
 * Props: initial, onSubmit, onCancel, loading, guruList
 */
export function FormMentahan({ children, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {children}
    </form>
  );
}
export function FormKelas({
  initial,
  onSubmit,
  onCancel,
  loading,
  guruList = [],
}) {
  const [form, setForm] = useState(
    initial || {
      nama_kelas: "",
      tingkat: "1",
      walikelas_id: "",
    },
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "jumlah" ? Number(value) : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Nama Kelas" required>
        <Input
          name="nama_kelas"
          value={form.nama_kelas}
          onChange={handleChange}
          placeholder="Contoh: 1A, 2B, 3C"
          required
        />
      </Field>

      <Field label="Tingkat">
        <Select name="tingkat" value={form.tingkat} onChange={handleChange}>
          {Object.entries(TINGKAT_CONFIG).map(([value, config]) => (
            <option key={value} value={value}>
              {config.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Wali Kelas">
        {guruList.length > 0 ? (
          <Select
            name="walikelas_id"
            value={form.walikelas_id}
            onChange={handleChange}
          >
            <option value="">Pilih Wali Kelas</option>
            {guruList.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nama_lengkap}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            name="walikelas_id"
            value={form.walikelas_id}
            onChange={handleChange}
            placeholder="ID guru dari PocketBase (Data kosong/sedang memuat...)"
          />
        )}
      </Field>

      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition shadow-sm"
        >
          {loading ? (
            <>
              <Spinner />
              <span>Menyimpan...</span>
            </>
          ) : (
            "Simpan"
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

/**
 * Isi modal konfirmasi hapus (dipakai di dalam <Modal>)
 * Props: kelas, onConfirm, onCancel, loading
 */
export function ConfirmDeleteModal({ kelas, onConfirm, onCancel, loading }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <svg
            width="18"
            height="18"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="m12 9 .01 4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-red-800">
            Hapus Data?
          </p>
          <p className="text-[12px] text-red-600 mt-0.5">
            Tindakan ini tidak dapat dibatalkan.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          Batal
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2 transition"
        >
          {loading ? (
            <>
              <Spinner />
              <span>Menghapus...</span>
            </>
          ) : (
            "Ya, Hapus"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

/**
 * Isi modal import Excel (dipakai di dalam <Modal>)
 * Props: onImport, onCancel, loading
 */
export function ImportModal({ onImport, onCancel, loading }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);

  const parseExcel = async (file) => {
    const XLSX = await import("xlsx");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          const normalized = jsonData.map((row) => {
            const newRow = {};
            Object.keys(row).forEach((key) => {
              newRow[key.toLowerCase().trim()] = row[key];
            });
            return newRow;
          });
          resolve(normalized);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const isValid = [".xlsx", ".xls"].some((ext) =>
      f.name.toLowerCase().endsWith(ext),
    );
    if (!isValid) {
      setError("File harus berformat Excel (.xlsx atau .xls)");
      return;
    }
    setFile(f);
    setError("");
    try {
      const rows = await parseExcel(f);
      setPreview(rows.slice(0, 5));
    } catch (err) {
      setError("Gagal membaca file Excel");
      console.error(err);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    try {
      const rows = await parseExcel(file);
      onImport(rows);
    } catch (err) {
      setError("Gagal memproses file Excel");
      console.error(err);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <svg
          className="w-8 h-8 text-gray-300 mx-auto mb-2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path d="M7 18a4.6 4.4 0 0 1 0-9A5 4.5 0 0 1 16.4 9a3.5 3.5 0 0 1 2.1 6.3" />
          <path d="M12 13v8" />
          <path d="m9 16 3-3 3 3" />
        </svg>
        <p className="text-[13px] text-gray-500">
          {file ? file.name : "Klik untuk pilih file Excel"}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Format: nama_kelas, walikelas_id, tingkat, jumlah
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {error && (
        <p className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
          {error}
        </p>
      )}

      {preview.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Preview ({preview.length} baris pertama)
          </p>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(preview[0]).map((k) => (
                    <th
                      key={k}
                      className="px-3 py-2 text-left font-semibold text-gray-600"
                    >
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-2 text-gray-700">
                        {v || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
        >
          Batal
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading || !file}
          className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition disabled:opacity-50"
        >
          {loading ? (
            <>
              <Spinner />
              <span>Mengimpor...</span>
            </>
          ) : (
            `Import ${preview.length > 0 ? "Data" : ""}`
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Siswa Count ──────────────────────────────────────────────────────────────

/**
 * Menampilkan jumlah siswa di suatu kelas dengan progress bar
 * Props: kelasId, pb (PocketBase instance)
 */
export function SiswaCount({ kelasId, pb }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!kelasId || !pb) return;
    pb.collection("siswa")
      .getList(1, 1, {
        filter: `kelas_id = "${kelasId}"`,
        requestKey: `siswa-count-${kelasId}`,
      })
      .then((res) => setCount(res.totalItems))
      .catch(() => setCount(null));
  }, [kelasId, pb]);

  if (count === null) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-300 text-[12px]">—</span>
      </div>
    );
  }

  const pct = Math.min(Math.round((count / 28) * 100), 100);
  const barColor =
    pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-gray-700 font-medium tabular-nums text-[12px] w-12 shrink-0">
        {count} / 28
      </span>
      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
