"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";
import { KelasToolbarButtons } from "@/components/organism/dashboard Comp/component";

const TINGKAT_OPTIONS = ["1", "2", "3", "4", "5", "6"];
const KATEGORI_OPTIONS = [
  { value: "umum", label: "Umum" },
  { value: "tahfizh", label: "Tahfizh" },
  { value: "vocab", label: "Vocab" },
];
const TEMPLATE_HEADERS = [
  "nama_mapel",
  "kode_mapel",
  "target_tingkat",
  "kategori",
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
    kategori: "",
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

function kategoriLabel(value) {
  if (!value) return "";
  return KATEGORI_OPTIONS.find((k) => k.value === value)?.label || value;
}

// ------------------------------------------------------------------
// Parser + validator untuk file import
// ------------------------------------------------------------------
function parseImportRows(rawRows, kelasList, existingCodes) {
  const kelasByName = new Map(
    kelasList.map((k) => [k.nama_kelas.trim().toLowerCase(), k.id]),
  );
  const valid = [];
  const errors = [];
  const seenCodes = new Map(); // kode -> nomor baris (deteksi duplikat dalam file)
  let skipped = 0;

  rawRows.forEach((row, idx) => {
    const nomorBaris = idx + 2; // header = baris 1

    const nama_mapel = String(row.nama_mapel ?? row["Nama Mapel"] ?? "").trim();
    const kode_mapel = String(row.kode_mapel ?? row["Kode Mapel"] ?? "")
      .trim()
      .toUpperCase();
    const tingkatRaw = String(
      row.target_tingkat ?? row["Target Tingkat"] ?? "",
    ).trim();
    const kategoriRaw = String(row.kategori ?? row["Kategori"] ?? "")
      .trim()
      .toLowerCase();
    const kelasRaw = String(
      row.kelas ?? row["Kelas"] ?? row["Kelas Terkait"] ?? "",
    ).trim();

    // baris komentar / benar-benar kosong → di-skip (bukan error)
    if (nama_mapel.startsWith("#")) {
      skipped++;
      return;
    }
    if (!nama_mapel && !kode_mapel && !tingkatRaw && !kelasRaw) {
      skipped++;
      return;
    }

    const messages = [];

    if (!nama_mapel) messages.push("nama_mapel kosong");
    if (!kode_mapel) messages.push("kode_mapel kosong");

    const target_tingkat = tingkatRaw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => TINGKAT_OPTIONS.includes(t));
    if (target_tingkat.length === 0) {
      messages.push("target_tingkat tidak valid (isi 1–6, pisah dengan koma)");
    }

    const kategori = KATEGORI_OPTIONS.some((k) => k.value === kategoriRaw)
      ? kategoriRaw
      : "";

    // resolusi kelas
    const kelasNames = kelasRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const kelasIds = [];
    const notFound = [];
    kelasNames.forEach((name) => {
      const id = kelasByName.get(name.toLowerCase());
      if (id) kelasIds.push(id);
      else notFound.push(name);
    });
    if (notFound.length > 0) {
      messages.push(`kelas tidak ditemukan: ${notFound.join(", ")}`);
    }

    // cek duplikat kode
    if (kode_mapel) {
      if (seenCodes.has(kode_mapel)) {
        messages.push(
          `kode "${kode_mapel}" duplikat di file (lihat baris ${seenCodes.get(kode_mapel)})`,
        );
      } else {
        seenCodes.set(kode_mapel, nomorBaris);
      }
      if (existingCodes.has(kode_mapel)) {
        messages.push(`kode "${kode_mapel}" sudah dipakai di database`);
      }
    }

    if (messages.length > 0) {
      errors.push({
        row: nomorBaris,
        kode: kode_mapel || "—",
        nama: nama_mapel || "—",
        messages,
      });
      return;
    }

    valid.push({
      row: nomorBaris,
      nama_mapel,
      kode_mapel,
      target_tingkat,
      kategori,
      kelasNames,
      payload: {
        nama_mapel,
        kode_mapel,
        target_tingkat,
        kategori,
        spesifik_kelas_id: kelasIds,
      },
    });
  });

  return { valid, errors, skipped, total: rawRows.length };
}

export default function MataPelajaranPage() {
  const [mapelList, setMapelList] = useState([]);
  const [kelasList, setKelasList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorBase, setErrorBase] = useState("");

  const [search, setSearch] = useState("");
  const [filterTingkat, setFilterTingkat] = useState("semua");
  const [filterKategori, setFilterKategori] = useState("semua");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [kelasSearch, setKelasSearch] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // import states
  const [importPreview, setImportPreview] = useState(null);
  // { fileName, valid[], errors[], skipped, total }
  const [importProgress, setImportProgress] = useState(null);
  // { done, total } saat proses berjalan
  const [importResult, setImportResult] = useState(null);
  // { success, failed:[{row,kode,messages}], skipped }
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
    if (filterKategori !== "semua") {
      if (filterKategori === "__kosong__") {
        list = list.filter((m) => !m.kategori);
      } else {
        list = list.filter((m) => m.kategori === filterKategori);
      }
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
  }, [mapelList, search, filterTingkat, filterKategori]);

  // ------------------------------------------------------------------
  // Modal helpers (form)
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
      kategori: m.kategori || "",
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

  const toggleKategori = (value) => {
    setForm((prev) => ({
      ...prev,
      kategori: prev.kategori === value ? "" : value,
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
        kategori: form.kategori || "",
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
      ["Matematika", "MTK", "1,2,3", "umum", ""],
      ["Bahasa Indonesia", "BIN", "4,5,6", "", ""],
      ["Tahfizh Juz 30", "THF-30", "1,2,3", "tahfizh", ""],
      [
        "English (Internasional)",
        "ENG-INT",
        "1,2,3",
        "vocab",
        "Kelas 1 Internasional, Kelas 2 Internasional",
      ],
      [
        "# Kosongkan kolom kelas jika mapel berlaku untuk SEMUA kelas di tingkat tsb.",
        "",
        "",
        "",
        "",
      ],
      [
        "# Kolom kategori: umum | tahfizh | vocab. Kosongkan jika tidak ada kategori.",
        "",
        "",
        "",
        "",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 28 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 32 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_mata_pelajaran.xlsx");
  };

  // ------------------------------------------------------------------
  // Export data saat ini (.xlsx)
  // ------------------------------------------------------------------
  const handleExport = async () => {
    // xlsx-js-style: fork dari xlsx yang mendukung cell styling saat write
    const XLSX = await import("xlsx-js-style");

    // --- Susun baris data ---
    const rows = filteredMapel.map((m, i) => {
      const relatedKelas = m.expand?.spesifik_kelas_id
        ? Array.isArray(m.expand.spesifik_kelas_id)
          ? m.expand.spesifik_kelas_id
          : [m.expand.spesifik_kelas_id]
        : [];

      return {
        no: i + 1,
        kode: m.kode_mapel || "",
        nama: m.nama_mapel || "",
        kategori: kategoriLabel(m.kategori) || "-",
        tingkat: (m.target_tingkat || [])
          .slice()
          .sort((a, b) => Number(a) - Number(b))
          .map((t) => `Tingkat ${t}`)
          .join(", "),
        kelas:
          relatedKelas.length === 0
            ? `Semua kelas tingkat ${(m.target_tingkat || []).join(", ")}`
            : relatedKelas.map((k) => k.nama_kelas).join(", "),
      };
    });

    const HEADERS = [
      "No",
      "Kode Mapel",
      "Nama Mapel",
      "Kategori",
      "Target Tingkat",
      "Kelas Khusus",
    ];
    const TITLE = "DAFTAR MATA PELAJARAN";
    const META = [
      `Diexport: ${new Date().toLocaleString("id-ID", {
        dateStyle: "long",
        timeStyle: "short",
      })}`,
      `Total: ${rows.length} mapel`,
    ].join("   •   ");

    // --- Bangun AOA: judul → meta → baris kosong → header → data ---
    const aoa = [
      [TITLE],
      [META],
      [],
      HEADERS,
      ...rows.map((r) => [
        r.no,
        r.kode,
        r.nama,
        r.kategori,
        r.tingkat,
        r.kelas,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // --- Merge judul & meta sepanjang kolom ---
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: HEADERS.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: HEADERS.length - 1 } },
    ];

    // --- Lebar kolom ---
    ws["!cols"] = [
      { wch: 5 }, // No
      { wch: 14 }, // Kode
      { wch: 32 }, // Nama
      { wch: 12 }, // Kategori
      { wch: 22 }, // Tingkat
      { wch: 42 }, // Kelas
    ];

    // --- Tinggi baris ---
    ws["!rows"] = [
      { hpt: 30 }, // judul
      { hpt: 18 }, // meta
      { hpt: 6 }, // pemisah
      { hpt: 24 }, // header
    ];

    // --- Autofilter di baris header ---
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 3, c: 0 },
        e: { r: 3 + rows.length, c: HEADERS.length - 1 },
      }),
    };

    // --- Freeze pane: header tetap terlihat saat scroll ---
    // (didukung oleh xlsx-js-style pada write xlsx)
    ws["!freeze"] = "A5";

    // --- Style ---
    const range = XLSX.utils.decode_range(ws["!ref"]);

    const styleTitle = {
      font: { bold: true, sz: 15, color: { rgb: "1E3A8A" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
    const styleMeta = {
      font: { italic: true, sz: 10, color: { rgb: "6B7280" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
    const borderThin = {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      left: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "thin", color: { rgb: "E5E7EB" } },
    };
    const styleHeader = {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "2563EB" } }, // biru
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "1E40AF" } },
        bottom: { style: "thin", color: { rgb: "1E40AF" } },
        left: { style: "thin", color: { rgb: "1E40AF" } },
        right: { style: "thin", color: { rgb: "1E40AF" } },
      },
    };
    const styleCell = {
      font: { sz: 11, color: { rgb: "1F2937" } },
      alignment: { vertical: "center", wrapText: true },
      border: borderThin,
    };
    const styleCellCenter = {
      ...styleCell,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    };
    const styleKategori = {
      ...styleCellCenter,
      font: { sz: 11, bold: true, color: { rgb: "1D4ED8" } },
    };
    const fillAlt = { fill: { fgColor: { rgb: "F1F5F9" } } };

    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;

        if (R === 0) {
          ws[addr].s = styleTitle;
        } else if (R === 1) {
          ws[addr].s = styleMeta;
        } else if (R === 3) {
          ws[addr].s = styleHeader;
        } else if (R > 3) {
          const isAlt = (R - 4) % 2 === 1;
          const altPatch = isAlt ? fillAlt : {};

          if (C === 0 || C === 1) {
            ws[addr].s = { ...styleCellCenter, ...altPatch };
          } else if (C === 3) {
            ws[addr].s = { ...styleKategori, ...altPatch };
          } else {
            ws[addr].s = { ...styleCell, ...altPatch };
          }
        }
      }
    }

    // --- Simpan ---
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mata Pelajaran");
    XLSX.writeFile(wb, `mata_pelajaran_${todayStr()}.xlsx`);
    setToast("Data mata pelajaran berhasil diexport.");
  };

  // ------------------------------------------------------------------
  // IMPORT — 3 tahap: pilih file → preview → konfirmasi
  // ------------------------------------------------------------------
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Tahap 1: baca file → validasi → tampilkan preview
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rawRows.length === 0) {
        setToast("File kosong atau format tidak sesuai template.");
        return;
      }

      const existingCodes = new Set(
        mapelList.map((m) => (m.kode_mapel || "").toUpperCase()),
      );
      const { valid, errors, skipped, total } = parseImportRows(
        rawRows,
        kelasList,
        existingCodes,
      );

      setImportResult(null);
      setImportPreview({
        fileName: file.name,
        valid,
        errors,
        skipped,
        total,
      });
    } catch (err) {
      console.error(err);
      setToast(err?.message || "Gagal membaca file.");
    }
  };

  // Tahap 2: konfirmasi import
  const confirmImport = async () => {
    if (!importPreview || importPreview.valid.length === 0) return;

    const { valid, skipped } = importPreview;
    const failed = [];
    let success = 0;

    setImportProgress({ done: 0, total: valid.length });

    for (let i = 0; i < valid.length; i++) {
      const item = valid[i];
      try {
        await pb.collection("mata_pelajaran").create(item.payload);
        success++;
      } catch (err) {
        failed.push({
          row: item.row,
          kode: item.kode_mapel,
          messages: [firstErrorMessage(err)],
        });
      }
      setImportProgress({ done: i + 1, total: valid.length });
    }

    await loadData();
    setImportPreview(null);
    setImportProgress(null);
    setImportResult({ success, failed, skipped });
    setToast(
      `${success} mapel berhasil diimpor${
        failed.length ? `, ${failed.length} baris gagal` : ""
      }.`,
    );
  };

  const cancelImport = () => {
    setImportPreview(null);
    setImportProgress(null);
  };

  // ------------------------------------------------------------------
  // Render helper card mobile
  // ------------------------------------------------------------------
  const renderMapelCard = (m) => {
    const relatedKelas = m.expand?.spesifik_kelas_id
      ? Array.isArray(m.expand.spesifik_kelas_id)
        ? m.expand.spesifik_kelas_id
        : [m.expand.spesifik_kelas_id]
      : [];

    return (
      <div
        key={m.id}
        className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100"
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                {m.kode_mapel}
              </span>
              {m.kategori && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                  {kategoriLabel(m.kategori)}
                </span>
              )}
              <span className="text-xs text-neutral-400">•</span>
              <span className="text-xs font-medium text-neutral-500">
                {m.nama_mapel}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {(m.target_tingkat || []).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200"
                >
                  Tingkat {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
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
        </div>
        <div className="text-xs text-neutral-500 mt-2 pt-2 border-t border-neutral-50">
          {relatedKelas.length === 0 ? (
            <span className="text-xs italic text-neutral-400">
              Berlaku untuk semua kelas tingkat{" "}
              {(m.target_tingkat || []).join(", ")}
            </span>
          ) : (
            <span>
              <span className="font-medium text-neutral-600">Khusus: </span>
              {relatedKelas.map((k) => k.nama_kelas).join(", ")}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen text-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <KelasToolbarButtons
          onExport={handleExport}
          onImport={handleImportClick}
          onTambah={openCreate}
          onTemplate={handleDownloadTemplate}
        />
        {/* input file tersembunyi */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleImportFile}
          className="hidden"
        />
        <br />

        {/* Banner hasil import */}
        {importResult &&
          (importResult.failed?.length > 0 || importResult.success > 0) && (
            <div
              className={`mb-6 rounded-2xl border px-5 py-4 text-sm ${
                importResult.failed?.length > 0
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {importResult.success} baris berhasil diimpor
                  {importResult.skipped > 0 &&
                    `, ${importResult.skipped} baris dilewati`}
                  {importResult.failed?.length > 0 &&
                    `, ${importResult.failed.length} baris gagal`}
                  .
                </p>
                <button
                  onClick={() => setImportResult(null)}
                  className="text-xs font-medium hover:underline"
                >
                  Tutup
                </button>
              </div>
              {importResult.failed?.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                  {importResult.failed.slice(0, 8).map((f, i) => (
                    <li key={i}>
                      Baris {f.row} ({f.kode}): {f.messages.join("; ")}
                    </li>
                  ))}
                  {importResult.failed.length > 8 && (
                    <li>...dan {importResult.failed.length - 8} lainnya</li>
                  )}
                </ul>
              )}
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
            {KATEGORI_OPTIONS.slice(0, 3).map((k) => (
              <StatCard
                key={k.value}
                label={`Kategori ${k.label}`}
                value={mapelList.filter((m) => m.kategori === k.value).length}
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
                className="w-full sm:w-auto rounded-full border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <select
              value={filterKategori}
              onChange={(e) => setFilterKategori(e.target.value)}
              className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="semua">Semua kategori</option>
              {KATEGORI_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
              <option value="__kosong__">(Belum diisi)</option>
            </select>
            <select
              value={filterTingkat}
              onChange={(e) => setFilterTingkat(e.target.value)}
              className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
          <>
            <div className="block sm:hidden space-y-3">
              {filteredMapel.map((m) => renderMapelCard(m))}
            </div>

            <div className="hidden sm:block overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-400">
                      <th className="px-5 py-3 font-medium whitespace-nowrap">
                        Kode
                      </th>
                      <th className="px-5 py-3 font-medium whitespace-nowrap">
                        Nama mapel
                      </th>
                      <th className="px-5 py-3 font-medium whitespace-nowrap">
                        Kategori
                      </th>
                      <th className="px-5 py-3 font-medium whitespace-nowrap">
                        Target tingkat
                      </th>
                      <th className="px-5 py-3 font-medium whitespace-nowrap">
                        Berlaku untuk
                      </th>
                      <th className="px-5 py-3 font-medium text-right whitespace-nowrap">
                        Aksi
                      </th>
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
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                              {m.kode_mapel}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-medium text-neutral-800 whitespace-nowrap">
                            {m.nama_mapel}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            {m.kategori ? (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                                {kategoriLabel(m.kategori)}
                              </span>
                            ) : (
                              <span className="text-xs italic text-neutral-300">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(m.target_tingkat || []).map((t) => (
                                <span
                                  key={t}
                                  className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-neutral-500">
                            {relatedKelas.length === 0 ? (
                              <span className="text-xs italic text-neutral-400 whitespace-nowrap">
                                Semua kelas tingkat{" "}
                                {(m.target_tingkat || []).join(", ")}
                              </span>
                            ) : (
                              <span className="text-xs">
                                <span className="font-medium text-neutral-600">
                                  Khusus:{" "}
                                </span>
                                {relatedKelas
                                  .map((k) => k.nama_kelas)
                                  .join(", ")}
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
            </div>
          </>
        )}
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Modal: form create / edit                                  */}
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
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field label="Kode mapel">
                <input
                  value={form.kode_mapel}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, kode_mapel: e.target.value }))
                  }
                  placeholder="mis. MTK"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm uppercase focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </Field>
            </div>

            <Field label="Kategori (opsional)">
              <div className="flex flex-wrap gap-2">
                {KATEGORI_OPTIONS.map((k) => {
                  const active = form.kategori === k.value;
                  return (
                    <button
                      type="button"
                      key={k.value}
                      onClick={() => toggleKategori(k.value)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-blue-500 text-white shadow-sm"
                          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                      }`}
                    >
                      {k.label}
                    </button>
                  );
                })}
                {form.kategori && (
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, kategori: "" }))}
                    className="rounded-full px-4 py-2 text-sm font-medium text-neutral-400 transition hover:bg-neutral-100 hover:text-rose-600"
                  >
                    Kosongkan
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-neutral-400">
                Klik pill yang sama untuk membatalkan pilihan. Boleh
                dikosongkan.
              </p>
            </Field>

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
                          ? "bg-blue-500 text-white shadow-sm"
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
                      className="mb-2 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                                  <span className="text-blue-600">
                                    · {selectedCount}/{kelasTingkatIni.length}{" "}
                                    dipilih
                                  </span>
                                )}
                              </span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => selectAllKelasByTingkat(t)}
                                  className="text-[11px] font-medium text-neutral-500 hover:text-blue-600"
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
                                        ? "bg-blue-500 text-white shadow-sm"
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
      {/* Modal: import preview                                      */}
      {/* ---------------------------------------------------------- */}
      {importPreview && (
        <Modal onClose={() => !importProgress && cancelImport()}>
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-neutral-900">
                Preview import
              </h3>
              <p className="mt-0.5 text-xs text-neutral-400">
                File:{" "}
                <span className="font-medium text-neutral-600">
                  {importPreview.fileName}
                </span>
              </p>
            </div>

            {/* Ringkasan */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                  Siap diimport
                </p>
                <p className="text-lg font-semibold text-emerald-800">
                  {importPreview.valid.length}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-rose-700">
                  Error
                </p>
                <p className="text-lg font-semibold text-rose-800">
                  {importPreview.errors.length}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Dilewati
                </p>
                <p className="text-lg font-semibold text-neutral-700">
                  {importPreview.skipped}
                </p>
              </div>
            </div>

            {/* Preview baris valid */}
            {importPreview.valid.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500">
                  Akan diimport ({importPreview.valid.length})
                </p>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-neutral-200">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Kode</th>
                        <th className="px-3 py-2 font-medium">Nama</th>
                        <th className="px-3 py-2 font-medium">Tingkat</th>
                        <th className="px-3 py-2 font-medium">Kategori</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {importPreview.valid.slice(0, 20).map((v) => (
                        <tr key={v.row}>
                          <td className="px-3 py-1.5 text-neutral-400">
                            {v.row}
                          </td>
                          <td className="px-3 py-1.5 font-medium text-neutral-700">
                            {v.kode_mapel}
                          </td>
                          <td className="px-3 py-1.5 text-neutral-700">
                            {v.nama_mapel}
                          </td>
                          <td className="px-3 py-1.5 text-neutral-500">
                            {v.target_tingkat.join(", ")}
                          </td>
                          <td className="px-3 py-1.5 text-neutral-500">
                            {v.kategori || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importPreview.valid.length > 20 && (
                    <p className="border-t border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-400">
                      ...dan {importPreview.valid.length - 20} baris lainnya
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Error per baris */}
            {importPreview.errors.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-rose-600">
                  Baris bermasalah ({importPreview.errors.length})
                </p>
                <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs">
                  {importPreview.errors.map((err) => (
                    <li key={err.row} className="text-rose-700">
                      <span className="font-semibold">Baris {err.row}</span>
                      {err.kode !== "—" && (
                        <span className="text-rose-500"> · {err.kode}</span>
                      )}
                      <span className="block text-rose-600/90">
                        {err.messages.join("; ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importPreview.valid.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
                Tidak ada baris valid untuk diimport. Perbaiki file lalu coba
                lagi.
              </div>
            )}

            {/* Progress bar */}
            {importProgress && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-blue-800">
                    Mengimport...
                  </span>
                  <span className="text-blue-700">
                    {importProgress.done}/{importProgress.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{
                      width: `${importProgress.total === 0 ? 0 : (importProgress.done / importProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelImport}
                disabled={!!importProgress}
                className="rounded-full px-4 py-2 text-sm font-medium text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={!!importProgress || importPreview.valid.length === 0}
                className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {importProgress && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                Import {importPreview.valid.length} baris
              </button>
            </div>
          </div>
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
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-neutral-200 border-t-blue-500" />
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
