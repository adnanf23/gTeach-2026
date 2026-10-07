"use client";

import { useEffect, useState, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import { createSystemLog } from "@/lib/logger";

/* ═══════════════════════════════════════════════════════════════
   KOMPONEN UI LOKAL — TEMA HITAM
   ═══════════════════════════════════════════════════════════════ */

function cn(...c) {
  return c.filter(Boolean).join(" ");
}

const TINGKAT_CONFIG = {
  1: { label: "Tingkat 1" },
  2: { label: "Tingkat 2" },
  3: { label: "Tingkat 3" },
  4: { label: "Tingkat 4" },
  5: { label: "Tingkat 5" },
  6: { label: "Tingkat 6" },
};

function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-800 ring-1 ring-gray-300">
      {children}
    </span>
  );
}

function Avatar({ name = "?", size = "sm" }) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const sz = {
    xs: "w-6 h-6 text-[9px]",
    sm: "w-8 h-8 text-[11px]",
    md: "w-10 h-10 text-[13px]",
  }[size];
  return (
    <span
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full bg-gray-900 font-bold text-white ring-2 ring-white select-none",
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

function ActionIconBtn({ onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
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

function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-medium shadow-lg",
          isError ? "bg-rose-600 text-white" : "bg-gray-900 text-white",
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

function ConfirmDeleteModal({ onConfirm, onCancel, loading }) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-gray-600">
        Yakin ingin menghapus akun wali murid ini? Tindakan ini tidak dapat
        dibatalkan.
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
          className="rounded-lg bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {loading ? "Menghapus..." : "Hapus"}
        </button>
      </div>
    </div>
  );
}

function FormMentahan({ onSubmit, children }) {
  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      {children}
    </form>
  );
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-pressed={checked}
      className={cn(
        "relative inline-flex items-center w-10 h-5 rounded-full transition-colors duration-200",
        checked ? "bg-gray-900" : "bg-gray-300",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

// ─── Helper: handle relasi siswa_id yang bisa single atau multiple ──────────
function pickSiswa(item) {
  const exp = item?.expand?.siswa_id;
  if (!exp) return null;
  if (Array.isArray(exp)) return exp[0] || null;
  return exp;
}

/* ═══════════════════════════════════════════════════════════════
   HALAMAN AKUN WALI MURID
   ═══════════════════════════════════════════════════════════════ */

export default function AkunWaliMuridPage() {
  const [loading, setLoading] = useState(false);
  const [loadData, setLoadData] = useState(false);
  const [dataWali, setDataWali] = useState([]);
  const [siswaList, setSiswaList] = useState([]);
  const [toast, setToast] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTingkat, setSelectedTingkat] = useState("semua");

  const [openModal, setOpenModal] = useState(false);
  const [modalMode, setModalMode] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState({
    siswa_id: "",
    username: "",
    password: "",
    verified: true,
  });

  const currentUser = () => pb.authStore.model;
  const currentPath = () =>
    typeof window !== "undefined" ? window.location.pathname : "-";

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchWali = useCallback(async () => {
    try {
      setLoadData(true);
      setFetchError(null);
      const data = await pb.collection("wali_murid").getFullList({
        expand: "siswa_id,siswa_id.kelas_id",
        requestKey: null,
      });
      setDataWali(data);
    } catch (error) {
      console.error("[wali_murid] gagal fetch:", error);
      setFetchError(
        error?.message ||
          error?.response?.message ||
          "Gagal mengambil data wali murid",
      );
      setDataWali([]);
    } finally {
      setLoadData(false);
    }
  }, []);

  const fetchSiswa = useCallback(async () => {
    try {
      const data = await pb.collection("siswa").getFullList({
        expand: "kelas_id",
        requestKey: null,
        sort: "nama_siswa",
      });
      setSiswaList(data);
    } catch (error) {
      console.error("[siswa] gagal fetch:", error);
    }
  }, []);

  useEffect(() => {
    fetchSiswa();
    fetchWali();
  }, [fetchSiswa, fetchWali]);

  const filteredData = dataWali.filter((item) => {
    const siswa = pickSiswa(item);
    const kelas = siswa?.expand?.kelas_id;

    const matchTingkat =
      selectedTingkat === "semua" || String(kelas?.tingkat) === selectedTingkat;

    const search = searchQuery.toLowerCase();
    const namaSiswa = siswa?.nama_siswa?.toLowerCase() || "";
    const nis = siswa?.nis?.toLowerCase() || "";
    const nisn = siswa?.nisn?.toLowerCase() || "";
    const username = item.username?.toLowerCase() || "";
    const namaKelas = kelas?.nama_kelas?.toLowerCase() || "";

    const matchSearch =
      namaSiswa.includes(search) ||
      nis.includes(search) ||
      nisn.includes(search) ||
      username.includes(search) ||
      namaKelas.includes(search);

    return matchTingkat && matchSearch;
  });

  const siswaSudahPunyaAkun = new Set(
    dataWali.flatMap((w) => {
      const raw = w.siswa_id;
      if (Array.isArray(raw)) return raw;
      return raw ? [raw] : [];
    }),
  );

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handlePilihSiswa(e) {
    const siswaId = e.target.value;
    const siswa = siswaList.find((s) => s.id === siswaId);
    setForm((prev) => ({
      ...prev,
      siswa_id: siswaId,
      username: prev.username || (siswa?.nis ? `wm${siswa.nis}` : ""),
    }));
  }

  function handleCloseModal() {
    setOpenModal(false);
    setModalMode(null);
    setDeleteTarget(null);
    setForm({ siswa_id: "", username: "", password: "", verified: true });
  }

  function openTambah() {
    setModalMode("tambah");
    setForm({ siswa_id: "", username: "", password: "", verified: true });
    setOpenModal(true);
  }

  function openDelete(item) {
    setDeleteTarget(item.id);
    setModalMode("hapus");
    setOpenModal(true);
  }

  async function handleToggleVerified(item) {
    const newVal = !item.verified;
    try {
      await pb.collection("wali_murid").update(item.id, { verified: newVal });
      setDataWali((prev) =>
        prev.map((d) => (d.id === item.id ? { ...d, verified: newVal } : d)),
      );
      showToast(
        `Akun "${item.username}" ${
          newVal ? "diverifikasi" : "dibatalkan verifikasinya"
        }`,
      );
      const user = currentUser();
      await createSystemLog({
        type: "succes",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' mengubah status verifikasi akun wali murid '${item.username}' menjadi ${newVal}.`,
        endpoint: currentPath(),
        statusCode: 200,
        payload: { id: item.id, verified: newVal },
      });
    } catch (error) {
      console.error("Gagal toggle verified:", error);
      showToast("Gagal mengubah status verifikasi", "error");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.siswa_id) {
      showToast("Pilih siswa terlebih dahulu", "error");
      return;
    }
    if (!form.username) {
      showToast("Username wajib diisi", "error");
      return;
    }
    if (!form.password) {
      showToast("Password wajib diisi", "error");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        siswa_id: [form.siswa_id],
        username: form.username,
        verified: form.verified,
        role: "wali murid",
        password: form.password,
        passwordConfirm: form.password,
      };

      await pb.collection("wali_murid").create(payload);
      const user = currentUser();
      await createSystemLog({
        type: "succes",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' berhasil Menambahkan akun Wali Murid.`,
        endpoint: currentPath(),
        statusCode: 200,
        payload: { form: { ...payload, password: "***" } },
      });
      showToast("Berhasil menambahkan akun wali murid");

      handleCloseModal();
      fetchWali();
    } catch (error) {
      console.error("Gagal memproses akun wali murid:", error);
      const detail =
        error?.response?.data?.username?.message ||
        error?.response?.data?.password?.message ||
        error?.message ||
        "Gagal memproses data";
      showToast(detail, "error");

      const user = currentUser();
      await createSystemLog({
        type: "error",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' gagal memproses akun Wali Murid.`,
        endpoint: currentPath(),
        statusCode: 400,
        payload: { form: { ...form, password: "***" } },
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(e) {
    e.preventDefault();
    try {
      await pb.collection("wali_murid").delete(deleteTarget);
      showToast("Berhasil menghapus akun wali murid");
      handleCloseModal();
      fetchWali();
    } catch (error) {
      console.error("Gagal menghapus:", error);
      showToast("Gagal menghapus data", "error");
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold text-gray-800">
            Akun Wali Murid
          </h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Kelola akun login wali murid untuk akses rapor & absensi.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchWali}
            className="px-3 py-2 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Refresh
          </button>
          <button
            onClick={openTambah}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-gray-900 hover:bg-black rounded-lg shadow-sm transition"
          >
            + Tambah Akun
          </button>
        </div>
      </div>

      {/* Error banner — tetap merah */}
      {fetchError && (
        <div className="px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-[13px] text-rose-700">
          <strong>Gagal memuat data:</strong> {fetchError}
          <button
            onClick={fetchWali}
            className="ml-2 underline hover:no-underline"
          >
            Coba lagi
          </button>
        </div>
      )}

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
            placeholder="Cari nama siswa, NIS, NISN, username, atau kelas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 placeholder-gray-400 transition-all"
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
          <table className="w-full min-w-[920px] text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                {[
                  "Nama Siswa",
                  "NIS",
                  "NISN",
                  "Tingkat",
                  "Kelas",
                  "Username",
                  "Password",
                  "Status Akun",
                  "Aksi",
                ].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "px-5 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider",
                      (h === "Status Akun" || h === "Aksi") && "text-center",
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
                    colSpan={9}
                    className="px-6 py-10 text-center text-gray-400"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[13px]">Mengambil data...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-12 text-center text-gray-400"
                  >
                    <div className="text-2xl mb-2">🔐</div>
                    <p className="font-medium text-gray-500 text-sm">
                      {dataWali.length === 0
                        ? "Belum ada akun wali murid"
                        : "Data tidak ditemukan"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {dataWali.length === 0
                        ? 'Klik "Tambah Akun" untuk membuat akun baru'
                        : "Coba ubah filter atau kata kunci pencarian"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => {
                  const siswa = pickSiswa(item);
                  const kelas = siswa?.expand?.kelas_id;
                  const tingkatConf =
                    TINGKAT_CONFIG[String(kelas?.tingkat)] || null;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-gray-700">
                        <div className="flex items-center gap-2">
                          <Avatar name={siswa?.nama_siswa || "?"} size="sm" />
                          <strong className="text-gray-900">
                            {siswa?.nama_siswa || (
                              <span className="text-gray-400 italic font-normal">
                                Siswa tidak ditemukan
                              </span>
                            )}
                          </strong>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-gray-600">
                        {siswa?.nis || "-"}
                      </td>

                      <td className="px-5 py-3.5 text-gray-600">
                        {siswa?.nisn || "-"}
                      </td>

                      <td className="px-5 py-3.5">
                        {tingkatConf ? (
                          <Badge>{tingkatConf.label}</Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-gray-600">
                        {kelas?.nama_kelas || "-"}
                      </td>

                      <td className="px-5 py-3.5 text-gray-700 font-mono">
                        {item.username || "-"}
                      </td>

                      <td className="px-5 py-3.5">
                        <span
                          className="font-mono text-gray-400 tracking-widest"
                          title="Password terenkripsi."
                        >
                          ••••••••
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-center gap-2">
                          <ToggleSwitch
                            checked={!!item.verified}
                            onChange={() => handleToggleVerified(item)}
                          />
                          <span
                            className={cn(
                              "text-[11px] font-semibold",
                              item.verified ? "text-gray-900" : "text-gray-400",
                            )}
                          >
                            {item.verified ? "Verified" : "Unverified"}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center">
                          <ActionIconBtn
                            onClick={() => openDelete(item)}
                            title="Hapus"
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Modal
          isOpen={openModal}
          title={
            modalMode === "hapus"
              ? "Hapus Akun Wali Murid"
              : "Tambah Akun Wali Murid"
          }
          onClose={handleCloseModal}
        >
          {modalMode === "hapus" ? (
            <ConfirmDeleteModal
              onConfirm={handleDelete}
              onCancel={handleCloseModal}
            />
          ) : (
            <FormMentahan onSubmit={handleSubmit}>
              <Field label="Siswa">
                <Select
                  name="siswa_id"
                  value={form.siswa_id}
                  onChange={handlePilihSiswa}
                  required
                  className="w-full"
                >
                  <option value="">Pilih Siswa</option>
                  {siswaList.map((s) => {
                    const sudahAda = siswaSudahPunyaAkun.has(s.id);
                    const namaKelas = s.expand?.kelas_id?.nama_kelas;
                    return (
                      <option key={s.id} value={s.id} disabled={sudahAda}>
                        {s.nama_siswa} — {s.nis || "-"}
                        {namaKelas ? ` — ${namaKelas}` : ""}
                        {sudahAda ? " (sudah ada akun)" : ""}
                      </option>
                    );
                  })}
                </Select>
              </Field>

              <Field label="Username">
                <Input
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="contoh: wm12345"
                  required
                />
              </Field>

              <Field label="Password">
                <Input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Min. 8 karakter"
                  required
                />
              </Field>

              <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-gray-100 bg-gray-50/60">
                <div>
                  <p className="text-[13px] font-medium text-gray-700">
                    Status Verifikasi
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Aktifkan agar akun dianggap terverifikasi
                  </p>
                </div>
                <ToggleSwitch
                  checked={!!form.verified}
                  onChange={() =>
                    setForm((p) => ({ ...p, verified: !p.verified }))
                  }
                />
              </div>

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
            </FormMentahan>
          )}
        </Modal>

        <div className="bg-gray-50/50 border-t border-gray-100 px-5 py-3 text-[12px] text-gray-500 flex justify-between items-center">
          <span>
            Menampilkan{" "}
            <strong className="text-gray-900">{filteredData.length}</strong>{" "}
            dari <strong className="text-gray-900">{dataWali.length}</strong>{" "}
            akun wali murid
          </span>
          {(searchQuery || selectedTingkat !== "semua") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedTingkat("semua");
              }}
              className="text-[12px] text-gray-700 hover:text-black font-medium transition"
            >
              Reset filter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
