"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

const ALLOWED_ROLES = ["admin", "ict"];

const TINGKAT_OPTIONS = ["1", "2", "3", "4", "5", "6"];

const JENIS_UJIAN_OPTIONS = [
  { value: "ahb", label: "AHB", desc: "Hanya share PDF" },
  { value: "asas", label: "ASAS", desc: "Cetak · Semester 1" },
  { value: "asat", label: "ASAT", desc: "Cetak · Semester 2" },
  { value: "lainnya", label: "Lainnya", desc: "Ujian tambahan (mis. kelas 6)" },
];

const TEMPLATE_RAPOR_OPTIONS = ["akademik", "vocab", "tahfiz", "kombinasi"];

function jenisUjianBadge(jenis) {
  const map = {
    ahb: "bg-blue-50 text-blue-600 border-blue-100",
    asas: "bg-indigo-50 text-indigo-600 border-indigo-100",
    asat: "bg-purple-50 text-purple-600 border-purple-100",
    lainnya: "bg-amber-50 text-amber-700 border-amber-100",
  };
  return map[jenis] || "bg-slate-50 text-slate-500 border-slate-100";
}

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

const emptyForm = {
  nama_ujian: "",
  target_tingkat: [],
  target_kelas_id: [],
  template_rapor: "akademik",
  jenis_ujian: "ahb",
  status_akses: "tutup",
};

export default function ManajemenUjianPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");

  const [tahunAjaranList, setTahunAjaranList] = useState([]);
  const [selectedTahunAjaranId, setSelectedTahunAjaranId] = useState(null);
  const [loadingTahunAjaran, setLoadingTahunAjaran] = useState(true);

  const [kelasList, setKelasList] = useState([]);

  const [ujianList, setUjianList] = useState([]);
  const [loadingUjian, setLoadingUjian] = useState(false);

  const [filterJenis, setFilterJenis] = useState("semua");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [savingForm, setSavingForm] = useState(false);

  const [togglingId, setTogglingId] = useState(null);
  const [creatingSkema, setCreatingSkema] = useState(false);

  const selectedTahunAjaran = useMemo(
    () => tahunAjaranList.find((t) => t.id === selectedTahunAjaranId) || null,
    [tahunAjaranList, selectedTahunAjaranId],
  );

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

  // 2. Ambil tahun ajaran + semua kelas (untuk picker target_kelas_id)
  useEffect(() => {
    if (!authChecked || unauthorized) return;
    let isMounted = true;

    async function fetchInit() {
      setLoadingTahunAjaran(true);
      setError("");
      try {
        const [taRecords, kelasRecords] = await Promise.all([
          pb.collection("tahun_ajaran").getFullList({
            sort: "-tahun,-semester",
            requestKey: null,
          }),
          pb.collection("kelas").getFullList({
            sort: "tingkat,nama_kelas",
            requestKey: null,
          }),
        ]);
        if (!isMounted) return;
        setTahunAjaranList(taRecords);
        setKelasList(kelasRecords);
        const aktif = taRecords.find((t) => t.is_aktif);
        setSelectedTahunAjaranId((aktif || taRecords[0])?.id || null);
      } catch (err) {
        console.error("Error fetching init data:", err);
        if (isMounted) setError("Gagal memuat data tahun ajaran / kelas.");
      } finally {
        if (isMounted) setLoadingTahunAjaran(false);
      }
    }

    fetchInit();
    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized]);

  // 3. Ambil daftar pengaturan_ujian untuk tahun ajaran terpilih
  useEffect(() => {
    if (!selectedTahunAjaranId) {
      setUjianList([]);
      return;
    }
    let isMounted = true;

    async function fetchUjian() {
      setLoadingUjian(true);
      setError("");
      try {
        const records = await pb.collection("pengaturan_ujian").getFullList({
          filter: `tahun_ajaran_id = "${selectedTahunAjaranId}"`,
          sort: "jenis_ujian,nama_ujian",
          expand: "target_kelas_id",
          requestKey: null,
        });
        if (isMounted) setUjianList(records);
      } catch (err) {
        console.error("Error fetching pengaturan_ujian:", err);
        if (isMounted) setError("Gagal memuat data ujian.");
      } finally {
        if (isMounted) setLoadingUjian(false);
      }
    }

    fetchUjian();
    return () => {
      isMounted = false;
    };
  }, [selectedTahunAjaranId]);

  // ---------------- Handlers: Form Ujian ----------------
  function openAddForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEditForm(u) {
    setEditingId(u.id);
    setForm({
      nama_ujian: u.nama_ujian || "",
      target_tingkat: u.target_tingkat || [],
      target_kelas_id: Array.isArray(u.target_kelas_id)
        ? u.target_kelas_id
        : u.target_kelas_id
          ? [u.target_kelas_id]
          : [],
      template_rapor: u.template_rapor || "akademik",
      jenis_ujian: u.jenis_ujian || "ahb",
      status_akses: u.status_akses || "tutup",
    });
    setShowForm(true);
  }

  function toggleTingkat(t) {
    setForm((f) => ({
      ...f,
      target_tingkat: f.target_tingkat.includes(t)
        ? f.target_tingkat.filter((x) => x !== t)
        : [...f.target_tingkat, t],
      // reset kelas spesifik kalau tingkat berubah, biar nggak nyangkut kelas dari tingkat lain
      target_kelas_id: [],
    }));
  }

  function toggleKelasSpesifik(kelasId) {
    setForm((f) => ({
      ...f,
      target_kelas_id: f.target_kelas_id.includes(kelasId)
        ? f.target_kelas_id.filter((x) => x !== kelasId)
        : [...f.target_kelas_id, kelasId],
    }));
  }

  async function submitForm() {
    if (
      !form.nama_ujian.trim() ||
      form.target_tingkat.length === 0 ||
      !selectedTahunAjaranId
    ) {
      setError("Nama ujian dan minimal 1 tingkat sasaran wajib diisi.");
      return;
    }
    setSavingForm(true);
    setError("");
    try {
      const payload = {
        nama_ujian: form.nama_ujian.trim(),
        tahun_ajaran_id: selectedTahunAjaranId,
        target_tingkat: form.target_tingkat,
        target_kelas_id: form.target_kelas_id,
        template_rapor: form.template_rapor,
        jenis_ujian: form.jenis_ujian,
        status_akses: form.status_akses,
      };

      if (editingId) {
        const updated = await pb
          .collection("pengaturan_ujian")
          .update(editingId, payload);
        setUjianList((prev) =>
          prev.map((u) => (u.id === updated.id ? updated : u)),
        );
      } else {
        const created = await pb.collection("pengaturan_ujian").create(payload);
        setUjianList((prev) => [...prev, created]);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
    } catch (err) {
      console.error("Error saving pengaturan_ujian:", err);
      setError("Gagal menyimpan pengaturan ujian.");
    } finally {
      setSavingForm(false);
    }
  }

  async function deleteUjian(id) {
    if (
      !confirm(
        "Hapus ujian ini? Seluruh nilai ujian siswa yang sudah terlanjur diinput untuk ujian ini juga akan hilang.",
      )
    )
      return;
    try {
      await pb.collection("pengaturan_ujian").delete(id);
      setUjianList((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      console.error("Error deleting pengaturan_ujian:", err);
      setError("Gagal menghapus ujian.");
    }
  }

  async function toggleStatusAkses(u) {
    const nextStatus = u.status_akses === "buka" ? "tutup" : "buka";
    setTogglingId(u.id);
    setError("");
    try {
      const updated = await pb.collection("pengaturan_ujian").update(u.id, {
        status_akses: nextStatus,
      });
      setUjianList((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
    } catch (err) {
      console.error("Error toggling status_akses:", err);
      setError("Gagal mengubah status akses ujian.");
    } finally {
      setTogglingId(null);
    }
  }

  // ---------------- Quick action: buat skema standar semester ----------------
  async function buatSkemaStandar() {
    if (!selectedTahunAjaran) return;
    const semester = selectedTahunAjaran.semester;
    const jenisFinal = semester === "1" ? "asas" : "asat";
    const labelFinal = semester === "1" ? "ASAS" : "ASAT";

    const sudahAda = (jenis) => ujianList.some((u) => u.jenis_ujian === jenis);

    const toCreate = [];
    if (!sudahAda("ahb")) {
      toCreate.push({
        nama_ujian: `AHB Semester ${semester}`,
        jenis_ujian: "ahb",
      });
    }
    if (!sudahAda(jenisFinal)) {
      toCreate.push({
        nama_ujian: `${labelFinal} Semester ${semester}`,
        jenis_ujian: jenisFinal,
      });
    }

    if (toCreate.length === 0) {
      setError("AHB dan " + labelFinal + " untuk tahun ajaran ini sudah ada.");
      return;
    }

    setCreatingSkema(true);
    setError("");
    try {
      const created = await Promise.all(
        toCreate.map((item) =>
          pb.collection("pengaturan_ujian").create({
            nama_ujian: item.nama_ujian,
            tahun_ajaran_id: selectedTahunAjaranId,
            target_tingkat: TINGKAT_OPTIONS,
            target_kelas_id: [],
            template_rapor: "akademik",
            jenis_ujian: item.jenis_ujian,
            status_akses: "tutup",
          }),
        ),
      );
      setUjianList((prev) => [...prev, ...created]);
    } catch (err) {
      console.error("Error creating skema standar:", err);
      setError("Gagal membuat skema standar ujian.");
    } finally {
      setCreatingSkema(false);
    }
  }

  const filteredUjianList = ujianList.filter((u) =>
    filterJenis === "semua" ? true : u.jenis_ujian === filterJenis,
  );

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 text-xs text-slate-400 flex items-center gap-2">
        <span>ICT</span> <span>/</span>{" "}
        <span className="text-slate-600 font-medium">Manajemen Ujian</span>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Manajemen Ujian</h1>
          <p className="text-xs text-slate-500 mt-1">
            Atur skema ujian (AHB/ASAS/ASAT) dan buka/tutup akses nilai ujian
            per tingkat.
          </p>
        </div>

        {!loadingTahunAjaran && tahunAjaranList.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-500">
              Tahun Ajaran:
            </label>
            <select
              value={selectedTahunAjaranId || ""}
              onChange={(e) => setSelectedTahunAjaranId(e.target.value)}
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
                {ujianList.length} Ujian Terdaftar
              </h2>
            </div>
            <button
              type="button"
              disabled={creatingSkema}
              onClick={buatSkemaStandar}
              className="rounded-lg bg-white/10 border border-white/30 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition disabled:opacity-50"
            >
              {creatingSkema
                ? "Membuat..."
                : `+ Buat Skema Standar (AHB & ${selectedTahunAjaran.semester === "1" ? "ASAS" : "ASAT"})`}
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 no-scrollbar w-full sm:w-fit">
          {[{ value: "semua", label: "Semua" }, ...JENIS_UJIAN_OPTIONS].map(
            (opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilterJenis(opt.value)}
                className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  filterJenis === opt.value
                    ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                }`}
              >
                {opt.label}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition whitespace-nowrap"
        >
          + Tambah Ujian
        </button>
      </div>

      {/* Form tambah/edit */}
      {showForm && (
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-700">
            {editingId ? "Edit Ujian" : "Ujian Baru"}
          </h3>

          <div>
            <label className="text-[11px] font-medium text-slate-500">
              Nama Ujian
            </label>
            <input
              type="text"
              value={form.nama_ujian}
              onChange={(e) =>
                setForm((f) => ({ ...f, nama_ujian: e.target.value }))
              }
              placeholder="Contoh: Try Out I, Ujian Sekolah, ASAS Semester 1"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Jenis Ujian
              </label>
              <select
                value={form.jenis_ujian}
                onChange={(e) =>
                  setForm((f) => ({ ...f, jenis_ujian: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              >
                {JENIS_UJIAN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.desc}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Template Rapor
              </label>
              <select
                value={form.template_rapor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, template_rapor: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              >
                {TEMPLATE_RAPOR_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-500">
              Tingkat Sasaran
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TINGKAT_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTingkat(t)}
                  className={`h-8 w-8 rounded-lg text-xs font-bold border transition ${
                    form.target_tingkat.includes(t)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {form.target_tingkat.length > 0 && (
            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Kelas Spesifik{" "}
                <span className="text-slate-400">
                  (opsional — kosongkan berarti semua kelas di tingkat terpilih)
                </span>
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {kelasList
                  .filter((k) =>
                    form.target_tingkat.includes(String(k.tingkat)),
                  )
                  .map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKelasSpesifik(k.id)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition ${
                        form.target_kelas_id.includes(k.id)
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      {k.nama_kelas}
                    </button>
                  ))}
                {kelasList.filter((k) =>
                  form.target_tingkat.includes(String(k.tingkat)),
                ).length === 0 && (
                  <p className="text-[11px] text-slate-400 italic">
                    Tidak ada kelas terdaftar untuk tingkat yang dipilih.
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-slate-500">
              Status Akses Awal
            </label>
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, status_akses: "tutup" }))
                }
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                  form.status_akses === "tutup"
                    ? "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, status_akses: "buka" }))}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                  form.status_akses === "buka"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                Buka
              </button>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-blue-100">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
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
              {savingForm ? "Menyimpan..." : "Simpan Ujian"}
            </button>
          </div>
        </div>
      )}

      {/* Daftar ujian */}
      {loadingUjian ? (
        <LoadingGrid />
      ) : filteredUjianList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
          {ujianList.length === 0
            ? 'Belum ada ujian untuk tahun ajaran ini. Klik "Buat Skema Standar" atau "Tambah Ujian" untuk mulai.'
            : "Tidak ada ujian dengan jenis ini."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUjianList.map((u) => {
            const kelasSpesifik = u.expand?.target_kelas_id;
            const kelasSpesifikList = Array.isArray(kelasSpesifik)
              ? kelasSpesifik
              : kelasSpesifik
                ? [kelasSpesifik]
                : [];
            return (
              <div
                key={u.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${jenisUjianBadge(u.jenis_ujian)}`}
                    >
                      {u.jenis_ujian || "—"}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                      {u.template_rapor}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        u.status_akses === "buka"
                          ? "text-emerald-700 bg-emerald-50"
                          : "text-slate-500 bg-slate-100"
                      }`}
                    >
                      {u.status_akses === "buka"
                        ? "● Nilai Terbuka"
                        : "○ Nilai Tertutup"}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mt-2">
                    {u.nama_ujian}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tingkat {(u.target_tingkat || []).join(", ") || "—"}
                    {kelasSpesifikList.length > 0 && (
                      <>
                        {" "}
                        · Kelas:{" "}
                        {kelasSpesifikList.map((k) => k.nama_kelas).join(", ")}
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={togglingId === u.id}
                    onClick={() => toggleStatusAkses(u)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition disabled:opacity-50 ${
                      u.status_akses === "buka"
                        ? "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        : "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100"
                    }`}
                  >
                    {togglingId === u.id
                      ? "..."
                      : u.status_akses === "buka"
                        ? "Tutup Nilai"
                        : "Buka Nilai"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditForm(u)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                    title="Edit"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteUjian(u.id)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Hapus"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
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
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}
