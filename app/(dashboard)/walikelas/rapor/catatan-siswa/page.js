"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { pb } from "@/lib/pocketbase";
import * as XLSX from "xlsx-js-style";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function emptyForm() {
  return {
    id: null,
    siswa_id: "",
    kelas_id: "",
    catatan: "",
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

function pbQuote(str) {
  return String(str).replace(/"/g, '\\"');
}

// Format tanggal untuk kolom Excel
function formatTanggal(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function CatatanSiswaPage() {
  const [list, setList] = useState([]);
  const [guruKelasList, setGuruKelasList] = useState([]);
  const [siswaList, setSiswaList] = useState([]);

  const [loading, setLoading] = useState(true);
  const [errorBase, setErrorBase] = useState("");

  const [search, setSearch] = useState("");
  const [filterKelas, setFilterKelas] = useState("semua");
  const [filterSiswa, setFilterSiswa] = useState("semua");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const isEditing = Boolean(form.id);

  // ------------------------------------------------------------------
  // Fetch
  // ------------------------------------------------------------------
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorBase("");
    try {
      const currentUser = pb.authStore.model;
      if (!currentUser) {
        setErrorBase("Kamu belum login.");
        setLoading(false);
        return;
      }

      const kelasGuru = await pb.collection("kelas").getFullList({
        filter: `walikelas_id = "${pbQuote(currentUser.id)}" || pendamping_id = "${pbQuote(currentUser.id)}"`,
        sort: "tingkat,nama_kelas",
        requestKey: null,
      });
      setGuruKelasList(kelasGuru);

      if (kelasGuru.length === 0) {
        setSiswaList([]);
        setList([]);
        setLoading(false);
        return;
      }

      const myKelasIds = kelasGuru.map((k) => k.id);

      const siswaRes = await pb.collection("siswa").getFullList({
        filter: myKelasIds
          .map((id) => `kelas_id = "${pbQuote(id)}"`)
          .join(" || "),
        sort: "nama_siswa",
        expand: "kelas_id",
        requestKey: null,
      });
      setSiswaList(siswaRes);

      if (siswaRes.length === 0) {
        setList([]);
        setLoading(false);
        return;
      }

      const mySiswaIds = siswaRes.map((s) => s.id);

      const filterCatatan =
        `(${mySiswaIds.map((id) => `siswa_id = "${pbQuote(id)}"`).join(" || ")})` +
        ` && ` +
        `(${myKelasIds.map((id) => `kelas_id = "${pbQuote(id)}"`).join(" || ")})`;

      const catatanRes = await pb.collection("catatan_siswa").getFullList({
        filter: filterCatatan,
        sort: "-created",
        expand: "siswa_id,kelas_id",
        requestKey: null,
      });

      setList(catatanRes);
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
  // Daftar siswa untuk dropdown (ikut filter kelas)
  // ------------------------------------------------------------------
  const siswaForFilter = useMemo(() => {
    if (filterKelas === "semua") return siswaList;
    return siswaList.filter((s) => s.kelas_id === filterKelas);
  }, [siswaList, filterKelas]);

  useEffect(() => {
    if (
      filterSiswa !== "semua" &&
      !siswaForFilter.some((s) => s.id === filterSiswa)
    ) {
      setFilterSiswa("semua");
    }
  }, [filterKelas, filterSiswa, siswaForFilter]);

  // ------------------------------------------------------------------
  // Filtering
  // ------------------------------------------------------------------
  const filteredList = useMemo(() => {
    let data = list;

    if (filterKelas !== "semua") {
      data = data.filter((c) => c.kelas_id === filterKelas);
    }
    if (filterSiswa !== "semua") {
      data = data.filter((c) => c.siswa_id === filterSiswa);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((c) => {
        const nm = (c.expand?.siswa_id?.nama_siswa || "").toLowerCase();
        const nis = (c.expand?.siswa_id?.nis || "").toLowerCase();
        const kls = (c.expand?.kelas_id?.nama_kelas || "").toLowerCase();
        const cat = (c.catatan || "").toLowerCase();
        return (
          nm.includes(q) ||
          nis.includes(q) ||
          kls.includes(q) ||
          cat.includes(q)
        );
      });
    }
    return data;
  }, [list, search, filterKelas, filterSiswa]);

  // ------------------------------------------------------------------
  // Download Template Excel (1 sheet, rapi)
  // Format: nis | nama_siswa | kelas | catatan
  // ------------------------------------------------------------------
  const handleDownloadTemplate = () => {
    if (siswaList.length === 0) {
      setToast("Tidak ada siswa di kelas yang kamu ampu.");
      return;
    }

    const headers = ["nis", "nama_siswa", "kelas", "catatan"];

    // Satu baris per siswa, kolom catatan dikosongkan
    const rows = siswaList.map((s) => [
      s.nis || "",
      s.nama_siswa || "",
      s.expand?.kelas_id?.nama_kelas || "",
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Lebar kolom
    ws["!cols"] = [
      { wch: 14 }, // nis
      { wch: 30 }, // nama_siswa
      { wch: 14 }, // kelas
      { wch: 60 }, // catatan
    ];

    // Tinggi baris
    ws["!rows"] = [{ hpt: 26 }];
    for (let i = 0; i < rows.length; i++) {
      ws["!rows"].push({ hpt: 40 });
    }

    // Style header
    const headerStyle = {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "1E40AF" } },
      alignment: { vertical: "center", horizontal: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "1E3A8A" } },
        bottom: { style: "thin", color: { rgb: "1E3A8A" } },
        left: { style: "thin", color: { rgb: "1E3A8A" } },
        right: { style: "thin", color: { rgb: "1E3A8A" } },
      },
    };

    // Style kolom readonly (nis, nama_siswa, kelas)
    const readonlyStyle = {
      font: { sz: 11, color: { rgb: "1E293B" }, bold: true },
      fill: { patternType: "solid", fgColor: { rgb: "F1F5F9" } },
      alignment: { vertical: "center", horizontal: "left", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } },
      },
    };

    // Style kolom catatan (diisi guru)
    const catatanStyle = {
      font: { sz: 11, color: { rgb: "1E293B" } },
      fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
      alignment: { vertical: "top", horizontal: "left", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } },
      },
    };

    // Terapkan style header
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }

    // Terapkan style baris data
    for (let r = 1; r <= rows.length; r++) {
      for (let c = 0; c <= 3; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        ws[addr].s = c === 3 ? catatanStyle : readonlyStyle;
      }
    }

    // Freeze + autofilter
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: 0, c: 3 },
      }),
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Catatan");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `template-catatan-siswa-${date}.xlsx`);

    setToast(
      "Template berhasil diunduh. Isi kolom catatan lalu import kembali.",
    );
  };

  // ------------------------------------------------------------------
  // Export data ke Excel
  // ------------------------------------------------------------------
  const handleExport = () => {
    if (filteredList.length === 0) {
      setToast("Tidak ada data untuk diexport.");
      return;
    }

    const headers = ["nis", "nama_siswa", "kelas", "catatan", "tanggal"];

    const rows = filteredList.map((c) => [
      c.expand?.siswa_id?.nis || "",
      c.expand?.siswa_id?.nama_siswa || "",
      c.expand?.kelas_id?.nama_kelas || "",
      c.catatan || "",
      formatTanggal(c.created),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    ws["!cols"] = [
      { wch: 14 },
      { wch: 30 },
      { wch: 14 },
      { wch: 60 },
      { wch: 16 },
    ];

    ws["!rows"] = [{ hpt: 26 }];
    for (let i = 0; i < rows.length; i++) {
      ws["!rows"].push({ hpt: 40 });
    }

    const headerStyle = {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "1E40AF" } },
      alignment: { vertical: "center", horizontal: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "1E3A8A" } },
        bottom: { style: "thin", color: { rgb: "1E3A8A" } },
        left: { style: "thin", color: { rgb: "1E3A8A" } },
        right: { style: "thin", color: { rgb: "1E3A8A" } },
      },
    };

    const cellStyle = {
      font: { sz: 11, color: { rgb: "1E293B" } },
      alignment: { vertical: "top", horizontal: "left", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } },
      },
    };

    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
    for (let r = 1; r <= rows.length; r++) {
      for (let c = 0; c <= 4; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        ws[addr].s = cellStyle;
      }
    }

    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: 0, c: 4 },
      }),
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catatan Siswa");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `catatan-siswa-${date}.xlsx`);

    setToast(`${filteredList.length} data berhasil diexport.`);
  };

  // ------------------------------------------------------------------
  // Trigger file input
  // ------------------------------------------------------------------
  const handleImportClick = () => {
    if (siswaList.length === 0) {
      setToast("Tidak ada siswa di kelas yang kamu ampu.");
      return;
    }
    fileInputRef.current?.click();
  };

  // ------------------------------------------------------------------
  // Proses file Excel yang di-upload
  // ------------------------------------------------------------------
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";

    setImporting(true);
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0) {
        setImportResult({
          success: 0,
          failed: 0,
          errors: ["File kosong atau tidak ada baris data."],
        });
        setImporting(false);
        return;
      }

      // Map NIS → siswa, dan nama → siswa (fallback)
      const siswaByNis = new Map();
      const siswaByName = new Map();
      siswaList.forEach((s) => {
        if (s.nis) {
          siswaByNis.set(String(s.nis).trim().toLowerCase(), s);
        }
        if (s.nama_siswa) {
          siswaByName.set(String(s.nama_siswa).trim().toLowerCase(), s);
        }
      });

      const errors = [];
      let success = 0;
      let failed = 0;
      const createdItems = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const nisRaw = String(row["nis"] ?? "").trim();
        const namaRaw = String(row["nama_siswa"] ?? "").trim();
        const catatan = String(row["catatan"] ?? "").trim();

        // Skip baris kosong
        if (!nisRaw && !namaRaw && !catatan) continue;

        if (!catatan) {
          errors.push(`Baris ${rowNum}: kolom "catatan" kosong.`);
          failed++;
          continue;
        }

        // Cari siswa: prioritas NIS, fallback nama
        let siswa = null;
        if (nisRaw) {
          siswa = siswaByNis.get(nisRaw.toLowerCase());
        }
        if (!siswa && namaRaw) {
          siswa = siswaByName.get(namaRaw.toLowerCase());
        }

        if (!siswa) {
          errors.push(
            `Baris ${rowNum}: siswa "${
              nisRaw || namaRaw || "(kosong)"
            }" tidak ditemukan di kelasmu.`,
          );
          failed++;
          continue;
        }

        const kelasId = siswa.kelas_id;
        if (!kelasId) {
          errors.push(
            `Baris ${rowNum}: kelas untuk siswa "${siswa.nama_siswa}" tidak terdeteksi.`,
          );
          failed++;
          continue;
        }

        try {
          const created = await pb.collection("catatan_siswa").create({
            siswa_id: siswa.id,
            kelas_id: kelasId,
            catatan,
          });
          const full = await pb
            .collection("catatan_siswa")
            .getOne(created.id, { expand: "siswa_id,kelas_id" });
          createdItems.push(full);
          success++;
        } catch (err) {
          errors.push(`Baris ${rowNum}: ${firstErrorMessage(err)}`);
          failed++;
        }
      }

      if (createdItems.length > 0) {
        setList((prev) => [...createdItems, ...prev]);
      }

      setImportResult({ success, failed, errors });

      if (failed === 0 && success > 0) {
        setToast(`${success} catatan berhasil diimport.`);
      } else if (success > 0) {
        setToast(`${success} berhasil, ${failed} gagal. Cek detail.`);
      } else if (failed > 0) {
        setToast(`Import gagal. Cek detail error.`);
      } else {
        setToast("Tidak ada data yang diimport.");
      }
    } catch (err) {
      console.error(err);
      setImportResult({
        success: 0,
        failed: 0,
        errors: ["Gagal membaca file. Pastikan format .xlsx / .xls valid."],
      });
    } finally {
      setImporting(false);
    }
  };

  // ------------------------------------------------------------------
  // Modal helpers
  // ------------------------------------------------------------------
  const openCreate = () => {
    if (siswaList.length === 0) {
      setToast("Tidak ada siswa di kelas yang kamu ampu.");
      return;
    }
    setForm(emptyForm());
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setForm({
      id: c.id,
      siswa_id: c.siswa_id || "",
      kelas_id: c.kelas_id || "",
      catatan: c.catatan || "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const handleSiswaChange = (siswaId) => {
    const s = siswaList.find((x) => x.id === siswaId);
    setForm((p) => ({
      ...p,
      siswa_id: siswaId,
      kelas_id: s?.kelas_id || "",
    }));
  };

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!form.siswa_id) {
      setFormError("Siswa wajib dipilih.");
      return;
    }
    if (!form.kelas_id) {
      setFormError("Kelas tidak terdeteksi. Pilih siswa terlebih dahulu.");
      return;
    }
    if (!form.catatan.trim()) {
      setFormError("Catatan wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        siswa_id: form.siswa_id,
        kelas_id: form.kelas_id,
        catatan: form.catatan.trim(),
      };

      if (isEditing) {
        const updated = await pb
          .collection("catatan_siswa")
          .update(form.id, payload);
        const full = await pb
          .collection("catatan_siswa")
          .getOne(updated.id, { expand: "siswa_id,kelas_id" });
        setList((prev) => prev.map((c) => (c.id === full.id ? full : c)));
        setToast("Catatan siswa berhasil diperbarui.");
      } else {
        const created = await pb.collection("catatan_siswa").create(payload);
        const full = await pb
          .collection("catatan_siswa")
          .getOne(created.id, { expand: "siswa_id,kelas_id" });
        setList((prev) => [full, ...prev]);
        setToast("Catatan siswa berhasil ditambahkan.");
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
      await pb.collection("catatan_siswa").delete(deleteTarget.id);
      setList((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setToast("Catatan siswa berhasil dihapus.");
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      setToast(firstErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  // ------------------------------------------------------------------
  // Render card mobile
  // ------------------------------------------------------------------
  const renderCard = (c) => {
    const siswa = c.expand?.siswa_id;
    const kelas = c.expand?.kelas_id;
    return (
      <div
        key={c.id}
        className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-neutral-800">
                {siswa?.nama_siswa || "—"}
              </span>
              {kelas?.nama_kelas && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-100">
                  {kelas.nama_kelas}
                </span>
              )}
            </div>
            {siswa?.nis && (
              <p className="text-[11px] text-neutral-400">NIS: {siswa.nis}</p>
            )}
          </div>
          <div className="flex flex-shrink-0 gap-1">
            <button
              onClick={() => openEdit(c)}
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
              onClick={() => setDeleteTarget(c)}
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
        </div>
        <div className="border-t border-neutral-50 pt-3">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-700">
            {c.catatan || "—"}
          </p>
          {c.created && (
            <p className="mt-2 text-[10px] text-neutral-400">
              {formatTanggal(c.created)}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50/50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header + Toolbar Aksi */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-neutral-900">
                Catatan Siswa
              </h1>
              <p className="mt-0.5 text-xs text-neutral-500">
                Kelola catatan perkembangan & perilaku siswa per kelas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50/70 p-1">
                <button
                  onClick={handleDownloadTemplate}
                  disabled={loading || siswaList.length === 0}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-white hover:text-neutral-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                  title="Download template Excel"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Template
                </button>

                <div className="h-4 w-px bg-neutral-200" />

                <button
                  onClick={handleImportClick}
                  disabled={importing || loading || siswaList.length === 0}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-white hover:text-neutral-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                  title="Import dari Excel"
                >
                  {importing ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                  )}
                  {importing ? "Proses..." : "Import"}
                </button>

                <div className="h-4 w-px bg-neutral-200" />

                <button
                  onClick={handleExport}
                  disabled={loading || filteredList.length === 0}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-white hover:text-neutral-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                  title="Export ke Excel"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export
                </button>
              </div>

              <button
                onClick={openCreate}
                disabled={siswaList.length === 0}
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-neutral-800 hover:shadow disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
                Tambah
              </button>
            </div>
          </div>
        </div>

        {errorBase && (
          <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-700">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{errorBase}</span>
          </div>
        )}

        {!loading && guruKelasList.length === 0 && (
          <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              Akunmu belum terdaftar sebagai <b>walikelas</b> atau{" "}
              <b>pendamping</b> di kelas mana pun. Hubungi admin/ICT untuk
              mengatur data kelas.
            </span>
          </div>
        )}

        {/* Stat row */}
        {!loading && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Total catatan"
              value={list.length}
              icon={
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
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              }
              color="blue"
            />
            <StatCard
              label="Siswa di kelas saya"
              value={siswaList.length}
              icon={
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
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              }
              color="emerald"
            />
            <StatCard
              label="Kelas saya"
              value={guruKelasList.length}
              icon={
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
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              }
              color="amber"
            />
          </div>
        )}

        {/* Toolbar Filter */}
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
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
                  d="M4 6h16M4 12h16M4 18h7"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-800">
                Daftar catatan
              </h2>
              <p className="text-[11px] text-neutral-400">
                Menampilkan {filteredList.length} dari {list.length} data
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
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
                placeholder="Cari siswa / NIS / catatan"
                className="w-full rounded-full border border-neutral-200 bg-neutral-50/60 py-2 pl-9 pr-3 text-xs transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-60"
              />
            </div>

            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="semua">Semua kelas</option>
              {guruKelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama_kelas}
                </option>
              ))}
            </select>

            <select
              value={filterSiswa}
              onChange={(e) => setFilterSiswa(e.target.value)}
              className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="semua">Semua siswa</option>
              {siswaForFilter.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama_siswa}
                  {s.nis ? ` (${s.nis})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <LoadingState label="Memuat data catatan siswa..." />
        ) : filteredList.length === 0 ? (
          <EmptyState
            title="Belum ada catatan"
            description={
              list.length === 0
                ? "Mulai dengan menambahkan catatan atau import dari Excel."
                : "Tidak ada data yang cocok dengan filter kamu."
            }
          />
        ) : (
          <>
            <div className="block space-y-3 sm:hidden">
              {filteredList.map((c) => renderCard(c))}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-sm sm:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/60 text-[11px] uppercase tracking-wide text-neutral-400">
                      <th className="px-5 py-3 font-semibold whitespace-nowrap">
                        Siswa
                      </th>
                      <th className="px-5 py-3 font-semibold whitespace-nowrap">
                        Kelas
                      </th>
                      <th className="px-5 py-3 font-semibold">Catatan</th>
                      <th className="px-5 py-3 font-semibold whitespace-nowrap">
                        Tanggal
                      </th>
                      <th className="px-5 py-3 text-right font-semibold whitespace-nowrap">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {filteredList.map((c) => {
                      const siswa = c.expand?.siswa_id;
                      const kelas = c.expand?.kelas_id;
                      return (
                        <tr
                          key={c.id}
                          className="align-top transition hover:bg-neutral-50/60"
                        >
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-neutral-800">
                                {siswa?.nama_siswa || "—"}
                              </span>
                              {siswa?.nis && (
                                <span className="text-[11px] text-neutral-400">
                                  NIS: {siswa.nis}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {kelas?.nama_kelas ? (
                              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
                                {kelas.nama_kelas}
                              </span>
                            ) : (
                              <span className="text-xs italic text-neutral-300">
                                —
                              </span>
                            )}
                          </td>
                          <td className="max-w-md px-5 py-3.5">
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-700">
                              {c.catatan || "—"}
                            </p>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-xs text-neutral-500">
                            {formatTanggal(c.created) || "—"}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => openEdit(c)}
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
                                onClick={() => setDeleteTarget(c)}
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
            </div>
          </>
        )}
      </div>

      {/* Modal: form create / edit */}
      {modalOpen && (
        <Modal onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-start gap-3 border-b border-neutral-100 pb-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
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
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900">
                  {isEditing ? "Edit catatan siswa" : "Tambah catatan siswa"}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {isEditing
                    ? "Perbarui isi catatan siswa."
                    : "Pilih siswa, kelas akan terisi otomatis."}
                </p>
              </div>
            </div>

            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{formError}</span>
              </div>
            )}

            <Field label="Siswa">
              <select
                value={form.siswa_id}
                onChange={(e) => handleSiswaChange(e.target.value)}
                disabled={siswaList.length === 0}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-3.5 py-2.5 text-sm transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              >
                <option value="">
                  {siswaList.length === 0
                    ? "Tidak ada siswa di kelasmu"
                    : "Pilih siswa"}
                </option>
                {siswaList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama_siswa}
                    {s.nis ? ` (${s.nis})` : ""}
                    {s.expand?.kelas_id?.nama_kelas
                      ? ` — ${s.expand.kelas_id.nama_kelas}`
                      : ""}
                  </option>
                ))}
              </select>
            </Field>

            {form.kelas_id && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-800">
                <div className="flex items-start gap-2">
                  <svg
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>
                    <b>Kelas:</b>{" "}
                    {guruKelasList.find((k) => k.id === form.kelas_id)
                      ?.nama_kelas || form.kelas_id}
                  </span>
                </div>
              </div>
            )}

            <Field label="Catatan">
              <textarea
                value={form.catatan}
                onChange={(e) =>
                  setForm((p) => ({ ...p, catatan: e.target.value }))
                }
                rows={5}
                placeholder="Tulis catatan untuk siswa ini..."
                className="w-full resize-y rounded-xl border border-neutral-200 bg-neutral-50/60 px-3.5 py-2.5 text-sm transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
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
                disabled={saving || siswaList.length === 0}
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 hover:shadow disabled:opacity-50"
              >
                {saving && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {isEditing ? "Simpan perubahan" : "Tambah catatan"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: delete confirm */}
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
                Hapus catatan siswa?
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                Catatan untuk{" "}
                <span className="font-medium text-neutral-700">
                  {deleteTarget.expand?.siswa_id?.nama_siswa || "—"}
                </span>{" "}
                ·{" "}
                <span className="font-medium text-neutral-700">
                  {deleteTarget.expand?.kelas_id?.nama_kelas || "—"}
                </span>{" "}
                akan dihapus permanen.
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
                className="flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 hover:shadow disabled:opacity-50"
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

      {/* Modal: hasil import */}
      {importResult && (
        <Modal onClose={() => setImportResult(null)}>
          <div className="space-y-5">
            <div className="flex items-start gap-3 border-b border-neutral-100 pb-4">
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                  importResult.failed === 0
                    ? "bg-emerald-50 text-emerald-600"
                    : importResult.success === 0
                      ? "bg-rose-50 text-rose-600"
                      : "bg-amber-50 text-amber-600"
                }`}
              >
                {importResult.failed === 0 ? (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
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
                      d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900">
                  Hasil Import
                </h3>
                <p className="mt-0.5 text-xs text-neutral-400">
                  Ringkasan proses import dari file Excel.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                    Berhasil
                  </p>
                </div>
                <p className="mt-1.5 text-2xl font-semibold text-emerald-700">
                  {importResult.success}
                </p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                    Gagal
                  </p>
                </div>
                <p className="mt-1.5 text-2xl font-semibold text-rose-700">
                  {importResult.failed}
                </p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-xl border border-amber-100 bg-amber-50/50 p-3.5">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Detail error ({importResult.errors.length})
                </p>
                <ul className="space-y-1.5 text-xs leading-relaxed text-amber-700">
                  {importResult.errors.map((err, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-amber-400">•</span>
                      <span>{err}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end border-t border-neutral-100 pt-4">
              <button
                onClick={() => setImportResult(null)}
                className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 hover:shadow"
              >
                Tutup
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg ring-1 ring-white/10">
          {toast}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Primitives
// ------------------------------------------------------------------
function StatCard({ label, value, icon, color = "neutral" }) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    neutral: "bg-neutral-100 text-neutral-600",
  };

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm transition hover:shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-neutral-900">
            {value}
          </p>
        </div>
        {icon && (
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${colorMap[color]}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-100 bg-white py-24 shadow-sm">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-neutral-200 border-t-blue-500" />
      <p className="text-sm text-neutral-400">{label}</p>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white py-16 px-6 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-50 text-neutral-300">
        <svg
          className="h-7 w-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <p className="text-sm font-semibold text-neutral-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-neutral-400">{description}</p>
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
        className={`relative w-full ${
          narrow ? "max-w-sm" : "max-w-lg"
        } max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-black/5`}
      >
        {children}
      </div>
    </div>
  );
}
