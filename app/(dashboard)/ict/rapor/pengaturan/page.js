"use client";

import { db } from "@/lib/db";
import {
  getPengaturanRaporInit,
  getPengaturanRaporData,
} from "@/actions/ict-rapor-pengaturan.action";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getCurrentUser } from "@/lib/pocketbase";
import {
  LABEL_JENIS_RAPOR,
  jenisRaporDariUjian,
} from "@/lib/raporJenis";

const ALLOWED_ROLES = ["admin", "ict"];

function toDateInput(val) {
  if (!val) return "";
  return String(val).slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function jenisUjianBadge(jenis) {
  const map = {
    ahb: "bg-blue-50 text-blue-700 border-blue-100",
    asas: "bg-indigo-50 text-indigo-700 border-indigo-100",
    asat: "bg-purple-50 text-purple-700 border-purple-100",
    lainnya: "bg-sky-50 text-sky-700 border-sky-100",
  };
  return map[jenis] || "bg-slate-50 text-slate-600 border-slate-200";
}

const emptyForm = {
  jenis_rapor: "",
  nama_sekolah: "",
  alamat: "",
  kepala_sekolah: "",
  tanggal_rapor: "",
};

export default function PengaturanRaporPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");

  const [tahunAjaranList, setTahunAjaranList] = useState([]);
  const [selectedTahunAjaranId, setSelectedTahunAjaranId] = useState(null);
  const [loadingTahunAjaran, setLoadingTahunAjaran] = useState(true);

  const [ujianList, setUjianList] = useState([]);
  const [raporList, setRaporList] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [editingUjianId, setEditingUjianId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [savingForm, setSavingForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingAksesId, setTogglingAksesId] = useState(null);

  const selectedTahunAjaran = useMemo(
    () => tahunAjaranList.find((t) => t.id === selectedTahunAjaranId) || null,
    [tahunAjaranList, selectedTahunAjaranId],
  );

  function getJenisRapor(r) {
    return r.jenis_rapor || "";
  }

  // Satu baris per jenis rapor, bukan per ujian: satu semester hanya punya satu
  // rapor Tahfizh, satu AHB, dan satu ASAS.
  const KARTU_JENIS = ["tahfiz", "ahb", "asas"];

  // Satu jenis bisa punya lebih dari satu ujian (mis. AHB dan Koding sama-sama
  // "ahb"). Utamakan yang akses rapornya sudah dibuka supaya toggle tetap ada
  // di kartu yang benar.
  function ujianUntukJenis(jenis) {
    const kandidat = ujianList.filter((u) => jenisRaporDariUjian(u) === jenis);
    return (
      kandidat.find((u) => u.akses_rapor || u.akses_guru_rapor) ||
      kandidat[0] ||
      null
    );
  }

  // 1. Auth
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!isAuthenticated() || !currentUser) {
      router.push("/login");
      return;
    }
    if (!ALLOWED_ROLES.includes(currentUser.role)) {
      setUnauthorized(true);
      setAuthChecked(true);
      setLoadingTahunAjaran(false);
      return;
    }
    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // 2. Ambil tahun ajaran
  useEffect(() => {
    if (!authChecked || unauthorized) return;
    let isMounted = true;

    async function fetchInit() {
      setLoadingTahunAjaran(true);
      setError("");
      try {
        // Baca tahun ajaran + penentuan tahun ajaran aktif dilakukan di action.
        const res = await getPengaturanRaporInit();
        if (!isMounted) return;
        if (res.error) {
          setError(res.error);
          return;
        }
        setTahunAjaranList(res.tahunAjaranList);
        setSelectedTahunAjaranId(res.selectedTahunAjaranId);
      } catch (err) {
        console.error("Error fetching tahun_ajaran:", err);
        if (isMounted) setError("Gagal memuat data tahun ajaran.");
      } finally {
        if (isMounted) setLoadingTahunAjaran(false);
      }
    }

    fetchInit();
    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized]);

  // 3. Ambil ujian + pengaturan rapor
  useEffect(() => {
    if (!selectedTahunAjaranId) {
      setUjianList([]);
      setRaporList([]);
      return;
    }
    let isMounted = true;

    async function fetchData() {
      setLoadingData(true);
      setError("");
      try {
        // Baca pengaturan_ujian + pengaturan_rapor turunannya dilakukan di action.
        const res = await getPengaturanRaporData(selectedTahunAjaranId);
        if (!isMounted) return;
        if (res.error) {
          setError(res.error);
          return;
        }
        setUjianList(res.ujianList);
        setRaporList(res.raporList);
      } catch (err) {
        console.error("Error fetching pengaturan_rapor:", err);
        if (isMounted) setError("Gagal memuat data pengaturan rapor.");
      } finally {
        if (isMounted) setLoadingData(false);
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [selectedTahunAjaranId]);

  // ---------------- Handlers ----------------
  function openFormForJenis(jenis) {
    const existing = raporList.find((r) => getJenisRapor(r) === jenis);
    setEditingUjianId(jenis);
    setForm({
      jenis_rapor: jenis,
      nama_sekolah: existing?.nama_sekolah || "",
      alamat: existing?.alamat || "",
      kepala_sekolah: existing?.kepala_sekolah || "",
      tanggal_rapor: toDateInput(existing?.tanggal_rapor),
    });
  }

  function closeForm() {
    setEditingUjianId(null);
    setForm({ ...emptyForm });
  }

  async function submitForm() {
    if (!form.jenis_rapor || !selectedTahunAjaranId) {
      setError("Jenis rapor atau tahun ajaran tidak valid.");
      return;
    }
    setSavingForm(true);
    setError("");
    try {
      const payload = {
        tahun_ajaran_id: selectedTahunAjaranId,
        jenis_rapor: form.jenis_rapor,
        nama_sekolah: form.nama_sekolah.trim(),
        alamat: form.alamat.trim(),
        kepala_sekolah: form.kepala_sekolah.trim(),
        tanggal_rapor: form.tanggal_rapor || null,
      };

      const existing = raporList.find(
        (r) => getJenisRapor(r) === form.jenis_rapor,
      );
      if (existing) {
        const updated = await db.update("pengaturan_rapor", existing.id, payload);
        setRaporList((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        );
      } else {
        const created = await db.create("pengaturan_rapor", payload);
        setRaporList((prev) => [...prev, created]);
      }
      closeForm();
    } catch (err) {
      console.error("Error saving pengaturan_rapor:", err);
      setError("Gagal menyimpan pengaturan rapor.");
    } finally {
      setSavingForm(false);
    }
  }

  async function deleteRapor(raporId) {
    if (!confirm("Hapus pengaturan rapor untuk jenis ini?")) return;
    setDeletingId(raporId);
    setError("");
    try {
      await db.remove("pengaturan_rapor", raporId);
      setRaporList((prev) => prev.filter((r) => r.id !== raporId));
      closeForm();
    } catch (err) {
      console.error("Error deleting pengaturan_rapor:", err);
      setError("Gagal menghapus pengaturan rapor.");
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleAksesRapor(jenis) {
    const ujian = ujianUntukJenis(jenis);
    if (!ujian) {
      setError("Tidak ada ujian untuk jenis rapor ini.");
      return;
    }
    setTogglingAksesId(ujian.id);
    setError("");
    try {
      const nextAkses = !ujian.akses_rapor;
      const updated = await db.update("pengaturan_ujian", ujian.id, {
        akses_rapor: nextAkses,
        status_akses: nextAkses ? "buka" : "tutup",
      });
      setUjianList((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      console.error("Error toggling akses rapor:", err);
      setError("Gagal mengubah status akses rapor.");
    } finally {
      setTogglingAksesId(null);
    }
  }

  const jenisTersedia = KARTU_JENIS.filter((jenis) =>
    ujianList.some((u) => jenisRaporDariUjian(u) === jenis),
  );
  const jumlahTerisi = jenisTersedia.filter((jenis) =>
    raporList.some((r) => getJenisRapor(r) === jenis),
  ).length;
  const jumlahKosong = jenisTersedia.length - jumlahTerisi;

  // ---------------- Render ----------------

  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        Memeriksa sesi login...
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">Akses Ditolak</h1>
        <p className="mt-2 text-sm text-red-600">
          Halaman ini hanya dapat diakses oleh admin atau ICT.
        </p>
      </div>
    );
  }

  const editingJenis = editingUjianId || null;
  const editingRapor = editingJenis
    ? raporList.find((r) => getJenisRapor(r) === editingJenis)
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-6 text-xs text-slate-400 flex items-center gap-2">
          <span>ICT</span> <span>/</span>{" "}
          <span className="text-slate-800 font-medium">Pengaturan Rapor</span>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Pengaturan Rapor
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Satu semester punya satu rapor per jenis: <b>Tahfizh</b>,{" "}
              <b>AHB</b>, dan <b>ASAS</b>. Pengaturan di sini dipakai ketiga
              halaman cetak.
            </p>
          </div>

          {!loadingTahunAjaran && tahunAjaranList.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">
                Tahun Ajaran:
              </label>
              <select
                value={selectedTahunAjaranId || ""}
                onChange={(e) => {
                  setSelectedTahunAjaranId(e.target.value);
                  closeForm();
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-slate-500 shadow-sm"
              >
                {tahunAjaranList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.tahun} · Semester {t.semester}{" "}
                    {t.is_aktif ? "(Aktif)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Banner Card - Nuansa Hitam */}
        {selectedTahunAjaran && (
          <div className="mb-8 rounded-2xl bg-slate-900 p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-16 -mr-16 h-64 w-64 rounded-full bg-white/5 blur-2xl pointer-events-none" />

            <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">
                  Tahun Ajaran {selectedTahunAjaran.tahun} · Semester{" "}
                  {selectedTahunAjaran.semester}
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {jumlahTerisi} / {jenisTersedia.length} Jenis Rapor Sudah
                  Diatur
                </h2>
                {jumlahKosong > 0 && (
                  <p className="text-sm text-slate-400 mt-2">
                    {jumlahKosong} jenis rapor belum memiliki pengaturan.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-lg bg-white/10 border border-white/20 px-4 py-2 font-semibold backdrop-blur-sm">
                  {jumlahTerisi} Terisi
                </span>
                <span className="rounded-lg bg-white/10 border border-white/20 px-4 py-2 font-semibold backdrop-blur-sm">
                  {jumlahKosong} Kosong
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Form edit/tambah */}
        {editingJenis && (
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingRapor ? "Edit Pengaturan Rapor" : "Atur Rapor Baru"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rapor:{" "}
                  <span className="font-semibold text-slate-900">
                    {LABEL_JENIS_RAPOR[editingJenis] || editingJenis}
                  </span>
                </p>
              </div>
              <span
                className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded border ${jenisUjianBadge(
                  editingJenis === "tahfiz" ? "lainnya" : editingJenis,
                )}`}
              >
                {editingJenis}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-medium text-slate-500">
                  Nama Sekolah
                </label>
                <input
                  type="text"
                  value={form.nama_sekolah}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nama_sekolah: e.target.value }))
                  }
                  placeholder="Contoh: SDIT Al-Hikmah"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-slate-500 focus:bg-white transition-colors placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">
                  Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={form.kepala_sekolah}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, kepala_sekolah: e.target.value }))
                  }
                  placeholder="Contoh: Syafrina Ahda, S.Pd., M.M."
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-slate-500 focus:bg-white transition-colors placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">
                Alamat
              </label>
              <textarea
                rows={2}
                value={form.alamat}
                onChange={(e) =>
                  setForm((f) => ({ ...f, alamat: e.target.value }))
                }
                placeholder="Contoh: Jl. Pendidikan No. 123, Jakarta"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-slate-500 focus:bg-white transition-colors placeholder:text-slate-400 resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">
                Tanggal Rapor
              </label>
              <input
                type="date"
                value={form.tanggal_rapor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tanggal_rapor: e.target.value }))
                }
                className="mt-1.5 w-full sm:w-64 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-slate-500 focus:bg-white transition-colors"
              />
              {form.tanggal_rapor && (
                <p className="mt-1.5 text-xs text-slate-400">
                  Preview: {formatDate(form.tanggal_rapor)}
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-between pt-4 border-t border-slate-100">
              <div>
                {editingRapor && (
                  <button
                    type="button"
                    disabled={deletingId === editingRapor.id}
                    onClick={() => deleteRapor(editingRapor.id)}
                    className="rounded-lg px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    {deletingId === editingRapor.id
                      ? "Menghapus..."
                      : "Hapus Pengaturan"}
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg px-5 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={savingForm}
                  onClick={submitForm}
                  className="rounded-lg bg-slate-900 px-6 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  {savingForm ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Daftar jenis rapor */}
        {loadingData ? (
          <LoadingGrid />
        ) : jenisTersedia.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 text-sm shadow-sm">
            Belum ada ujian untuk tahun ajaran ini. Tambahkan ujian dulu di menu{" "}
            <span className="font-semibold text-slate-700">
              Manajemen Ujian
            </span>
            .
          </div>
        ) : (
          <div className="space-y-4">
            {jenisTersedia.map((jenis) => {
              const rapor = raporList.find((r) => getJenisRapor(r) === jenis);
              const isEditing = editingJenis === jenis;
              const ujianAcuan = ujianUntukJenis(jenis);
              const isAksesRaporOpen = !!ujianAcuan?.akses_rapor;

              return (
                <div
                  key={jenis}
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                    isEditing
                      ? "border-slate-400 ring-2 ring-slate-200"
                      : "border-slate-200 hover:shadow-md"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded border ${jenisUjianBadge(
                            jenis === "tahfiz" ? "lainnya" : jenis,
                          )}`}
                        >
                          {jenis}
                        </span>

                        <span
                          className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded border ${
                            isAksesRaporOpen
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : "bg-rose-50 text-rose-700 border-rose-100"
                          }`}
                        >
                          {isAksesRaporOpen
                            ? "● Rapor Dibuka"
                            : "○ Rapor Ditutup"}
                        </span>

                        <span
                          className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded ${
                            rapor
                              ? "text-emerald-700 bg-emerald-50 border border-emerald-100"
                              : "text-slate-500 bg-slate-100 border border-slate-200"
                          }`}
                        >
                          {rapor ? "● Rapor Diatur" : "○ Rapor Belum Diatur"}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 mt-3">
                        {LABEL_JENIS_RAPOR[jenis] || jenis}
                      </h3>

                      {rapor ? (
                        <div className="mt-2 space-y-1 text-xs text-slate-500">
                          <p>
                            <span className="text-slate-400">Sekolah:</span>{" "}
                            <span className="font-medium text-slate-700">
                              {rapor.nama_sekolah || "—"}
                            </span>
                          </p>
                          <p className="truncate">
                            <span className="text-slate-400">Alamat:</span>{" "}
                            {rapor.alamat || "—"}
                          </p>
                          <p>
                            <span className="text-slate-400">
                              Kepala Sekolah:
                            </span>{" "}
                            {rapor.kepala_sekolah || "—"}
                          </p>
                          <p>
                            <span className="text-slate-400">Tanggal:</span>{" "}
                            {formatDate(rapor.tanggal_rapor) || "—"}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic mt-2">
                          Belum ada pengaturan rapor untuk jenis ini.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {ujianAcuan && (
                        <button
                          type="button"
                          disabled={togglingAksesId === ujianAcuan.id}
                          onClick={() => toggleAksesRapor(jenis)}
                          className={`rounded-lg px-4 py-2 text-xs font-semibold border transition ${
                            isAksesRaporOpen
                              ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                          } disabled:opacity-50`}
                        >
                          {togglingAksesId === ujianAcuan.id
                            ? "Memproses..."
                            : isAksesRaporOpen
                              ? "Tutup Rapor"
                              : "Buka Rapor"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openFormForJenis(jenis)}
                        className={`rounded-lg px-4 py-2 text-xs font-semibold border transition ${
                          rapor
                            ? "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100"
                            : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                        }`}
                      >
                        {rapor ? "Edit Rapor" : "Atur Rapor"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-2xl bg-white border border-slate-200 shadow-sm"
        />
      ))}
    </div>
  );
}
