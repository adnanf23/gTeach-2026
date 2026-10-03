"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

const ALLOWED_ROLES = ["admin", "ict"];

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

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
    ahb: "bg-blue-50 text-blue-600 border-blue-100",
    asas: "bg-indigo-50 text-indigo-600 border-indigo-100",
    asat: "bg-purple-50 text-purple-600 border-purple-100",
    lainnya: "bg-sky-50 text-sky-700 border-sky-100",
  };
  return map[jenis] || "bg-slate-50 text-slate-500 border-slate-100";
}

const emptyForm = {
  ujian_id: "",
  nama_sekolah: "",
  alamat: "",
  tahun_ajaran: "",
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

  const selectedTahunAjaran = useMemo(
    () => tahunAjaranList.find((t) => t.id === selectedTahunAjaranId) || null,
    [tahunAjaranList, selectedTahunAjaranId],
  );

  const ujianMap = useMemo(() => {
    const map = {};
    ujianList.forEach((u) => {
      map[u.id] = u;
    });
    return map;
  }, [ujianList]);

  function getUjianIdOfRapor(r) {
    return firstOf(r.ujian_id);
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
        const taRecords = await pb.collection("tahun_ajaran").getFullList({
          sort: "-tahun,-semester",
          requestKey: null,
        });
        if (!isMounted) return;
        setTahunAjaranList(taRecords);
        const aktif = taRecords.find((t) => t.is_aktif);
        setSelectedTahunAjaranId((aktif || taRecords[0])?.id || null);
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
        const ujianRecords = await pb
          .collection("pengaturan_ujian")
          .getFullList({
            filter: `tahun_ajaran_id = "${selectedTahunAjaranId}"`,
            sort: "jenis_ujian,nama_ujian",
            requestKey: null,
          });
        if (!isMounted) return;
        setUjianList(ujianRecords);

        if (ujianRecords.length === 0) {
          setRaporList([]);
          return;
        }

        const filterStr = ujianRecords
          .map((u) => `ujian_id = "${u.id}"`)
          .join(" || ");

        const raporRecords = await pb
          .collection("pengaturan_rapor")
          .getFullList({
            filter: filterStr,
            requestKey: null,
          });
        if (!isMounted) return;
        setRaporList(raporRecords);
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
  function openFormForUjian(u) {
    const existing = raporList.find((r) => getUjianIdOfRapor(r) === u.id);
    setEditingUjianId(u.id);
    setForm({
      ujian_id: u.id,
      nama_sekolah: existing?.nama_sekolah || "",
      alamat: existing?.alamat || "",
      tahun_ajaran:
        existing?.tahun_ajaran ||
        (selectedTahunAjaran
          ? `${selectedTahunAjaran.tahun} · Semester ${selectedTahunAjaran.semester}`
          : ""),
      tanggal_rapor: toDateInput(existing?.tanggal_rapor),
    });
  }

  function closeForm() {
    setEditingUjianId(null);
    setForm({ ...emptyForm });
  }

  async function submitForm() {
    if (!form.ujian_id) {
      setError("Ujian tidak valid.");
      return;
    }
    setSavingForm(true);
    setError("");
    try {
      const payload = {
        ujian_id: form.ujian_id,
        nama_sekolah: form.nama_sekolah.trim(),
        alamat: form.alamat.trim(),
        tahun_ajaran: form.tahun_ajaran.trim(),
        tanggal_rapor: form.tanggal_rapor || null,
      };

      const existing = raporList.find(
        (r) => getUjianIdOfRapor(r) === form.ujian_id,
      );
      if (existing) {
        const updated = await pb
          .collection("pengaturan_rapor")
          .update(existing.id, payload);
        setRaporList((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        );
      } else {
        const created = await pb.collection("pengaturan_rapor").create(payload);
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
    if (!confirm("Hapus pengaturan rapor untuk ujian ini?")) return;
    setDeletingId(raporId);
    setError("");
    try {
      await pb.collection("pengaturan_rapor").delete(raporId);
      setRaporList((prev) => prev.filter((r) => r.id !== raporId));
      if (editingUjianId) {
        const stillExists = raporList.find((r) => r.id === raporId);
        if (stillExists) closeForm();
      }
    } catch (err) {
      console.error("Error deleting pengaturan_rapor:", err);
      setError("Gagal menghapus pengaturan rapor.");
    } finally {
      setDeletingId(null);
    }
  }

  const jumlahTerisi = raporList.length;
  const jumlahKosong = ujianList.length - jumlahTerisi;

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

  const editingUjian = editingUjianId ? ujianMap[editingUjianId] : null;
  const editingRapor = editingUjianId
    ? raporList.find((r) => getUjianIdOfRapor(r) === editingUjianId)
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 text-xs text-slate-400 flex items-center gap-2">
        <span>ICT</span> <span>/</span>{" "}
        <span className="text-slate-600 font-medium">Pengaturan Rapor</span>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Pengaturan Rapor</h1>
          <p className="text-xs text-slate-500 mt-1">
            Atur header & tanggal rapor (nama sekolah, alamat, tahun ajaran,
            tanggal) <b>per ujian</b>. Setiap ujian punya pengaturan rapornya
            sendiri.
          </p>
        </div>

        {!loadingTahunAjaran && tahunAjaranList.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-500">
              Tahun Ajaran:
            </label>
            <select
              value={selectedTahunAjaranId || ""}
              onChange={(e) => {
                setSelectedTahunAjaranId(e.target.value);
                closeForm();
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-500"
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

      {selectedTahunAjaran && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-blue-100 font-semibold">
                Tahun Ajaran {selectedTahunAjaran.tahun} · Semester{" "}
                {selectedTahunAjaran.semester}
              </p>
              <h2 className="text-base font-bold mt-0.5">
                {jumlahTerisi} / {ujianList.length} Ujian Sudah Diatur Rapornya
              </h2>
              {jumlahKosong > 0 && (
                <p className="text-[11px] text-blue-100 mt-1">
                  {jumlahKosong} ujian belum memiliki pengaturan rapor.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-lg bg-white/10 border border-white/30 px-3 py-1.5 font-semibold">
                {jumlahTerisi} Terisi
              </span>
              <span className="rounded-lg bg-white/10 border border-white/30 px-3 py-1.5 font-semibold">
                {jumlahKosong} Kosong
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Form edit/tambah */}
      {editingUjian && (
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-700">
                {editingRapor ? "Edit Pengaturan Rapor" : "Atur Rapor Baru"}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Untuk ujian:{" "}
                <span className="font-semibold text-slate-700">
                  {editingUjian.nama_ujian}
                </span>
              </p>
            </div>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${jenisUjianBadge(editingUjian.jenis_ujian)}`}
            >
              {editingUjian.jenis_ujian || "—"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Nama Sekolah
              </label>
              <input
                type="text"
                value={form.nama_sekolah}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nama_sekolah: e.target.value }))
                }
                placeholder="Contoh: SDIT Al-Hikmah"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Tahun Ajaran (teks pada rapor)
              </label>
              <input
                type="text"
                value={form.tahun_ajaran}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tahun_ajaran: e.target.value }))
                }
                placeholder="Contoh: 2024/2025 · Semester 1"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-500">
              Alamat
            </label>
            <textarea
              rows={2}
              value={form.alamat}
              onChange={(e) =>
                setForm((f) => ({ ...f, alamat: e.target.value }))
              }
              placeholder="Contoh: Jl. Pendidikan No. 123, Jakarta"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-500">
              Tanggal Rapor
            </label>
            <input
              type="date"
              value={form.tanggal_rapor}
              onChange={(e) =>
                setForm((f) => ({ ...f, tanggal_rapor: e.target.value }))
              }
              className="mt-1 w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
            />
            {form.tanggal_rapor && (
              <p className="mt-1 text-[11px] text-slate-400">
                Preview: {formatDate(form.tanggal_rapor)}
              </p>
            )}
          </div>

          <div className="flex gap-2 justify-between pt-2 border-t border-blue-100">
            <div>
              {editingRapor && (
                <button
                  type="button"
                  disabled={deletingId === editingRapor.id}
                  onClick={() => deleteRapor(editingRapor.id)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === editingRapor.id
                    ? "Menghapus..."
                    : "Hapus Pengaturan"}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={savingForm}
                onClick={submitForm}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingForm ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daftar ujian */}
      {loadingData ? (
        <LoadingGrid />
      ) : ujianList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
          Belum ada ujian untuk tahun ajaran ini. Tambahkan ujian dulu di menu{" "}
          <span className="font-semibold text-slate-600">Manajemen Ujian</span>.
        </div>
      ) : (
        <div className="space-y-3">
          {ujianList.map((u) => {
            const rapor = raporList.find((r) => getUjianIdOfRapor(r) === u.id);
            const isEditing = editingUjianId === u.id;
            return (
              <div
                key={u.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                  isEditing
                    ? "border-blue-300 ring-2 ring-blue-100"
                    : "border-slate-100"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${jenisUjianBadge(u.jenis_ujian)}`}
                      >
                        {u.jenis_ujian || "—"}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          rapor
                            ? "text-emerald-700 bg-emerald-50"
                            : "text-slate-500 bg-slate-100"
                        }`}
                      >
                        {rapor ? "● Rapor Diatur" : "○ Rapor Belum Diatur"}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-800 mt-2">
                      {u.nama_ujian}
                    </h3>

                    {rapor ? (
                      <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
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
                          <span className="text-slate-400">TA:</span>{" "}
                          {rapor.tahun_ajaran || "—"}
                        </p>
                        <p>
                          <span className="text-slate-400">Tanggal:</span>{" "}
                          {formatDate(rapor.tanggal_rapor) || "—"}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic mt-2">
                        Belum ada pengaturan rapor untuk ujian ini.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openFormForUjian(u)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                        rapor
                          ? "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          : "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100"
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
  );
}

function LoadingGrid() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}
