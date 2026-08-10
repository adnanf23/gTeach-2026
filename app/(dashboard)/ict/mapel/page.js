"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";
import { KelasToolbarButtons } from "@/components/organism/dashboard Comp/component";
// ^ Sesuaikan path import ini dengan lokasi file pocketbase.js di project-mu.
// Catatan: pastikan package "xlsx" sudah terpasang -> npm install xlsx

const TINGKAT_OPTIONS = ["1", "2", "3", "4", "5", "6"];
const TEMPLATE_HEADERS = [
  "nama_mapel",
  "kode_mapel",
  "target_tingkat",
  "kelas",
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyForm() {
  return {
    id: null,
    nama_mapel: "",
    kode_mapel: "",
    target_tingkat: [],
    spesifik_kelas_id: [],
  };
}

function firstErrorMessage(err) {
  const data = err?.data?.data;
  if (data) {
    const firstKey = Object.keys(data)[0];
    if (firstKey) return data[firstKey]?.message || "Data tidak valid.";
  }
  return err?.message || "Terjadi kesalahan. Coba lagi.";
}

export default function MataPelajaranPage() {
  const [mapelList, setMapelList] = useState([]);
  const [kelasList, setKelasList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorBase, setErrorBase] = useState("");

  const [search, setSearch] = useState("");
  const [filterTingkat, setFilterTingkat] = useState("semua");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [kelasSearch, setKelasSearch] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null); // { success, failed: [] }
  const fileInputRef = useRef(null);

  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const isEditing = Boolean(form.id);

  // ------------------------------------------------------------------
  // Load data
  // ------------------------------------------------------------------
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorBase("");
    try {
      const [mapel, kelas] = await Promise.all([
        pb.collection("mata_pelajaran").getFullList({
          sort: "nama_mapel",
          expand: "spesifik_kelas_id",
          requestKey: null,
        }),
        pb
          .collection("kelas")
          .getFullList({ sort: "tingkat,nama_kelas", requestKey: null }),
      ]);
      setMapelList(mapel);
      setKelasList(kelas);
    } catch (err) {
      console.error(err);
      setErrorBase(
        "Gagal memuat data. Pastikan PocketBase berjalan dan kamu sudah login.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ------------------------------------------------------------------
  // Filtering
  // ------------------------------------------------------------------
  const filteredMapel = useMemo(() => {
    let list = mapelList;
    if (filterTingkat !== "semua") {
      list = list.filter((m) =>
        (m.target_tingkat || []).includes(filterTingkat),
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.nama_mapel.toLowerCase().includes(q) ||
          m.kode_mapel.toLowerCase().includes(q),
      );
    }
    return list;
  }, [mapelList, search, filterTingkat]);

  // ------------------------------------------------------------------
  // Modal helpers
  // ------------------------------------------------------------------
  const openCreate = () => {
    setForm(emptyForm());
    setFormError("");
    setKelasSearch("");
    setModalOpen(true);
  };

  const openEdit = (m) => {
    setForm({
      id: m.id,
      nama_mapel: m.nama_mapel || "",
      kode_mapel: m.kode_mapel || "",
      target_tingkat: m.target_tingkat || [],
      spesifik_kelas_id: Array.isArray(m.spesifik_kelas_id)
        ? m.spesifik_kelas_id
        : m.spesifik_kelas_id
          ? [m.spesifik_kelas_id]
          : [],
    });
    setFormError("");
    setKelasSearch("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const toggleTingkat = (t) => {
    setForm((prev) => ({
      ...prev,
      target_tingkat: prev.target_tingkat.includes(t)
        ? prev.target_tingkat.filter((x) => x !== t)
        : [...prev.target_tingkat, t],
    }));
  };

  const toggleKelas = (id) => {
    setForm((prev) => ({
      ...prev,
      spesifik_kelas_id: prev.spesifik_kelas_id.includes(id)
        ? prev.spesifik_kelas_id.filter((x) => x !== id)
        : [...prev.spesifik_kelas_id, id],
    }));
  };

  const selectAllKelasByTingkat = (t) => {
    const idsForTingkat = kelasList
      .filter((k) => String(k.tingkat) === String(t))
      .map((k) => k.id);
    setForm((prev) => ({
      ...prev,
      spesifik_kelas_id: Array.from(
        new Set([...prev.spesifik_kelas_id, ...idsForTingkat]),
      ),
    }));
  };

  const clearKelasByTingkat = (t) => {
    const idsForTingkat = new Set(
      kelasList.filter((k) => String(k.tingkat) === String(t)).map((k) => k.id),
    );
    setForm((prev) => ({
      ...prev,
      spesifik_kelas_id: prev.spesifik_kelas_id.filter(
        (id) => !idsForTingkat.has(id),
      ),
    }));
  };

  // ------------------------------------------------------------------
  // Submit create / update
  // ------------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!form.nama_mapel.trim() || !form.kode_mapel.trim()) {
      setFormError("Nama dan kode mata pelajaran wajib diisi.");
      return;
    }
    if (form.target_tingkat.length === 0) {
      setFormError("Pilih minimal satu target tingkat.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nama_mapel: form.nama_mapel.trim(),
        kode_mapel: form.kode_mapel.trim().toUpperCase(),
        target_tingkat: form.target_tingkat,
        spesifik_kelas_id: form.spesifik_kelas_id,
      };

      if (isEditing) {
        const updated = await pb
          .collection("mata_pelajaran")
          .update(form.id, payload);
        const full = await pb
          .collection("mata_pelajaran")
          .getOne(updated.id, { expand: "spesifik_kelas_id" });
        setMapelList((prev) => prev.map((m) => (m.id === full.id ? full : m)));
        setToast("Mata pelajaran berhasil diperbarui.");
      } else {
        const created = await pb.collection("mata_pelajaran").create(payload);
        const full = await pb
          .collection("mata_pelajaran")
          .getOne(created.id, { expand: "spesifik_kelas_id" });
        setMapelList((prev) =>
          [...prev, full].sort((a, b) =>
            a.nama_mapel.localeCompare(b.nama_mapel),
          ),
        );
        setToast("Mata pelajaran berhasil ditambahkan.");
      }
      setModalOpen(false);
    } catch (err) {
      console.error(err);
      setFormError(firstErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await pb.collection("mata_pelajaran").delete(deleteTarget.id);
      setMapelList((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setToast("Mata pelajaran berhasil dihapus.");
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      setToast(firstErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  // ------------------------------------------------------------------
  // Download template (.xlsx)
  // ------------------------------------------------------------------
  const handleDownloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const wsData = [
      TEMPLATE_HEADERS,
      ["Matematika", "MTK", "1,2,3", ""],
      ["Bahasa Indonesia", "BIN", "4,5,6", ""],
      [
        "English (Internasional)",
        "ENG-INT",
        "1,2,3",
        "Kelas 1 Internasional, Kelas 2 Internasional",
      ],
      [
        "# Kosongkan kolom kelas jika mapel berlaku untuk SEMUA kelas di tingkat tsb.",
        "",
        "",
        "",
      ],
      [
        "# Isi kolom kelas HANYA jika mapel khusus untuk kelas tertentu (mis. Kelas Internasional).",
        "",
        "",
        "",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_mata_pelajaran.xlsx");
  };

  // ------------------------------------------------------------------
  // Export data saat ini (.xlsx)
  // ------------------------------------------------------------------
  const handleExport = async () => {
    const XLSX = await import("xlsx");
    const rows = filteredMapel.map((m) => {
      const relatedKelas = m.expand?.spesifik_kelas_id
        ? Array.isArray(m.expand.spesifik_kelas_id)
          ? m.expand.spesifik_kelas_id
          : [m.expand.spesifik_kelas_id]
        : [];
      return {
        kode_mapel: m.kode_mapel,
        nama_mapel: m.nama_mapel,
        target_tingkat: (m.target_tingkat || []).join(","),
        kelas: relatedKelas.map((k) => k.nama_kelas).join(", "),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ["kode_mapel", "nama_mapel", "target_tingkat", "kelas"],
    });
    ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mata Pelajaran");
    XLSX.writeFile(wb, `mata_pelajaran_${todayStr()}.xlsx`);
    setToast("Data mata pelajaran berhasil diexport.");
  };

  // ------------------------------------------------------------------
  // Import dari file .xlsx
  // ------------------------------------------------------------------
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0) {
        throw new Error("File kosong atau format tidak sesuai template.");
      }

      const kelasByName = new Map(
        kelasList.map((k) => [k.nama_kelas.trim().toLowerCase(), k.id]),
      );

      let success = 0;
      const failed = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const nomorBaris = i + 2; // +1 header, +1 index 0-based

        const nama_mapel = String(
          row.nama_mapel ?? row["Nama Mapel"] ?? "",
        ).trim();
        const kode_mapel = String(row.kode_mapel ?? row["Kode Mapel"] ?? "")
          .trim()
          .toUpperCase();
        const tingkatRaw = String(
          row.target_tingkat ?? row["Target Tingkat"] ?? "",
        );
        const kelasRaw = String(
          row.kelas ?? row["Kelas"] ?? row["Kelas Terkait"] ?? "",
        );

        // baris komentar/petunjuk di template diawali "#" -> lewati, jangan dihitung gagal
        if (
          nama_mapel.startsWith("#") ||
          (!nama_mapel && !kode_mapel && !tingkatRaw)
        )
          continue;

        const target_tingkat = tingkatRaw
          .split(",")
          .map((t) => t.trim())
          .filter((t) => TINGKAT_OPTIONS.includes(t));

        const spesifik_kelas_id = kelasRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((name) => kelasByName.get(name.toLowerCase()))
          .filter(Boolean);

        if (!nama_mapel || !kode_mapel || target_tingkat.length === 0) {
          failed.push(
            `Baris ${nomorBaris}: nama_mapel, kode_mapel, atau target_tingkat tidak valid`,
          );
          continue;
        }

        try {
          await pb.collection("mata_pelajaran").create({
            nama_mapel,
            kode_mapel,
            target_tingkat,
            spesifik_kelas_id,
          });
          success++;
        } catch (err) {
          failed.push(
            `Baris ${nomorBaris} (${kode_mapel}): ${firstErrorMessage(err)}`,
          );
        }
      }

      await loadData();
      setImportResult({ success, failed });
      setToast(
        `${success} mapel berhasil diimpor${failed.length ? `, ${failed.length} baris gagal` : ""}.`,
      );
    } catch (err) {
      console.error(err);
      setImportResult({
        success: 0,
        failed: [err.message || "Gagal membaca file."],
      });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <KelasToolbarButtons
          onExport={handleExport}
          onImport={handleImport}
          onTambah={openCreate}
          onTemplate={handleDownloadTemplate}
        />
        <br />

        {importResult && importResult.failed?.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">
                {importResult.success} baris berhasil diimpor,{" "}
                {importResult.failed.length} baris gagal:
              </p>
              <button
                onClick={() => setImportResult(null)}
                className="text-xs font-medium text-amber-700 hover:underline"
              >
                Tutup
              </button>
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
              {importResult.failed.slice(0, 8).map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
              {importResult.failed.length > 8 && (
                <li>...dan {importResult.failed.length - 8} lainnya</li>
              )}
            </ul>
          </div>
        )}

        {errorBase && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {errorBase}
          </div>
        )}

        {/* Stat row */}
        {!loading && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total mapel" value={mapelList.length} />
            {TINGKAT_OPTIONS.slice(0, 3).map((t) => (
              <StatCard
                key={t}
                label={`Tingkat ${t}`}
                value={
                  mapelList.filter((m) => (m.target_tingkat || []).includes(t))
                    .length
                }
              />
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-neutral-800">
              Daftar mata pelajaran
            </h2>
            <p className="text-xs text-neutral-400">
              {filteredMapel.length} dari {mapelList.length} mapel
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama / kode mapel"
                className="rounded-full border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
            <select
              value={filterTingkat}
              onChange={(e) => setFilterTingkat(e.target.value)}
              className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
            >
              <option value="semua">Semua tingkat</option>
              {TINGKAT_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  Tingkat {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <LoadingState label="Memuat data mata pelajaran..." />
        ) : filteredMapel.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-sm text-neutral-400">
              Tidak ada mata pelajaran yang cocok.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-400">
                  <th className="px-5 py-3 font-medium">Kode</th>
                  <th className="px-5 py-3 font-medium">Nama mapel</th>
                  <th className="px-5 py-3 font-medium">Target tingkat</th>
                  <th className="px-5 py-3 font-medium">Berlaku untuk</th>
                  <th className="px-5 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {filteredMapel.map((m) => {
                  const relatedKelas = m.expand?.spesifik_kelas_id
                    ? Array.isArray(m.expand.spesifik_kelas_id)
                      ? m.expand.spesifik_kelas_id
                      : [m.expand.spesifik_kelas_id]
                    : [];
                  return (
                    <tr
                      key={m.id}
                      className="transition hover:bg-neutral-50/60"
                    >
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                          {m.kode_mapel}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-neutral-800">
                        {m.nama_mapel}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(m.target_tingkat || []).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-neutral-500">
                        {relatedKelas.length === 0 ? (
                          <span className="text-xs italic text-neutral-400">
                            Semua kelas tingkat{" "}
                            {(m.target_tingkat || []).join(", ")}
                          </span>
                        ) : (
                          <span className="text-xs">
                            <span className="font-medium text-neutral-600">
                              Khusus:{" "}
                            </span>
                            {relatedKelas.map((k) => k.nama_kelas).join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => openEdit(m)}
                            className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                            title="Edit"
                          >
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteTarget(m)}
                            className="rounded-lg p-2 text-neutral-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="Hapus"
                          >
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Modal: create / edit                                       */}
      {/* ---------------------------------------------------------- */}
      {modalOpen && (
        <Modal onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-neutral-900">
                {isEditing ? "Edit mata pelajaran" : "Tambah mata pelajaran"}
              </h3>
              <p className="mt-0.5 text-xs text-neutral-400">
                {isEditing
                  ? "Perbarui detail mata pelajaran."
                  : "Isi detail mata pelajaran baru."}
              </p>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {formError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama mata pelajaran">
                <input
                  value={form.nama_mapel}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, nama_mapel: e.target.value }))
                  }
                  placeholder="mis. Matematika"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                />
              </Field>
              <Field label="Kode mapel">
                <input
                  value={form.kode_mapel}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, kode_mapel: e.target.value }))
                  }
                  placeholder="mis. MTK"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm uppercase focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                />
              </Field>
            </div>

            <Field label="Target tingkat">
              <div className="flex flex-wrap gap-2">
                {TINGKAT_OPTIONS.map((t) => {
                  const active = form.target_tingkat.includes(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      onClick={() => toggleTingkat(t)}
                      className={`h-9 w-9 rounded-full text-sm font-medium transition ${
                        active
                          ? "bg-orange-500 text-white shadow-sm"
                          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Kelas khusus (opsional)">
              <p className="-mt-1 mb-2 text-xs text-neutral-400">
                Kosongkan jika mapel ini berlaku untuk{" "}
                <span className="font-medium text-neutral-500">
                  semua kelas
                </span>{" "}
                di tingkat yang dipilih di atas. Isi hanya jika mapel ini khusus
                untuk kelas tertentu, misalnya{" "}
                <span className="font-medium text-neutral-500">
                  Kelas Internasional
                </span>
                , atau untuk membagi satu mapel antar guru (mis. PAI 1 untuk
                1A–3B, PAI 2 untuk 3C–3H). Kelas dikelompokkan per tingkat di
                bawah — cek dulu status tiap kelas sebelum simpan.
              </p>

              {form.target_tingkat.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                  Pilih target tingkat terlebih dulu untuk menampilkan daftar
                  kelasnya.
                </p>
              ) : (
                <>
                  {kelasList.length > 6 && (
                    <input
                      value={kelasSearch}
                      onChange={(e) => setKelasSearch(e.target.value)}
                      placeholder="Cari kelas..."
                      className="mb-2 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    />
                  )}

                  <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-neutral-200 p-3">
                    {[...form.target_tingkat]
                      .sort((a, b) => Number(a) - Number(b))
                      .map((t) => {
                        const kelasTingkatIni = kelasList
                          .filter((k) => String(k.tingkat) === String(t))
                          .filter((k) =>
                            k.nama_kelas
                              .toLowerCase()
                              .includes(kelasSearch.trim().toLowerCase()),
                          )
                          .sort((a, b) =>
                            a.nama_kelas.localeCompare(b.nama_kelas),
                          );
                        const selectedCount = kelasTingkatIni.filter((k) =>
                          form.spesifik_kelas_id.includes(k.id),
                        ).length;

                        if (kelasTingkatIni.length === 0) return null;

                        return (
                          <div key={t}>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                Tingkat {t}{" "}
                                {selectedCount > 0 && (
                                  <span className="text-orange-600">
                                    · {selectedCount}/{kelasTingkatIni.length}{" "}
                                    dipilih
                                  </span>
                                )}
                              </span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => selectAllKelasByTingkat(t)}
                                  className="text-[11px] font-medium text-neutral-500 hover:text-orange-600"
                                >
                                  Semua
                                </button>
                                <span className="text-[11px] text-neutral-300">
                                  |
                                </span>
                                <button
                                  type="button"
                                  onClick={() => clearKelasByTingkat(t)}
                                  className="text-[11px] font-medium text-neutral-500 hover:text-rose-600"
                                >
                                  Kosongkan
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {kelasTingkatIni.map((k) => {
                                const active = form.spesifik_kelas_id.includes(
                                  k.id,
                                );
                                return (
                                  <button
                                    type="button"
                                    key={k.id}
                                    onClick={() => toggleKelas(k.id)}
                                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                                      active
                                        ? "bg-orange-500 text-white shadow-sm"
                                        : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                                    }`}
                                  >
                                    {k.nama_kelas}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {form.spesifik_kelas_id.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({ ...p, spesifik_kelas_id: [] }))
                      }
                      className="mt-2 text-xs font-medium text-neutral-400 hover:text-rose-600"
                    >
                      Kosongkan semua pilihan ({form.spesifik_kelas_id.length})
                    </button>
                  )}
                </>
              )}
            </Field>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-full px-4 py-2 text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {isEditing ? "Simpan perubahan" : "Tambah mapel"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------------------------------------------------------- */}
      {/* Modal: delete confirm                                      */}
      {/* ---------------------------------------------------------- */}
      {deleteTarget && (
        <Modal onClose={() => !deleting && setDeleteTarget(null)} narrow>
          <div className="space-y-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-8.25 3h.008v.008h-.008V15z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900">
                Hapus mata pelajaran?
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                <span className="font-medium text-neutral-700">
                  {deleteTarget.nama_mapel}
                </span>{" "}
                akan dihapus permanen dan tidak bisa dikembalikan.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-full px-4 py-2 text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                Hapus
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Primitives
// ------------------------------------------------------------------
function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32 text-neutral-400">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-neutral-200 border-t-orange-500" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Modal({ children, onClose, narrow }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${narrow ? "max-w-sm" : "max-w-lg"} rounded-2xl bg-white p-6 shadow-xl`}
      >
        {children}
      </div>
    </div>
  );
}
