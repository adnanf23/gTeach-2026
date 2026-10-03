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
    mapel_id: "",
    capaian_tinggi: "",
    capaian_rendah: "",
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

export default function CapaianKompetensiPage() {
  const [list, setList] = useState([]);
  const [guruKelasList, setGuruKelasList] = useState([]);
  const [myMapelList, setMyMapelList] = useState([]);

  const [loading, setLoading] = useState(true);
  const [errorBase, setErrorBase] = useState("");

  const [search, setSearch] = useState("");
  const [filterMapel, setFilterMapel] = useState("semua");

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
  // Fetch data
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
        setMyMapelList([]);
        setList([]);
        setLoading(false);
        return;
      }

      const myKelasIds = kelasGuru.map((k) => k.id);
      const myTingkat = Array.from(
        new Set(kelasGuru.map((k) => String(k.tingkat || ""))),
      );

      const orParts = [
        ...myKelasIds.map((id) => `spesifik_kelas_id ~ "${pbQuote(id)}"`),
        ...myTingkat.map((t) => `target_tingkat ~ "${pbQuote(t)}"`),
      ];
      const mapelFilter = orParts.length > 0 ? orParts.join(" || ") : "";

      const mapelRes = await pb.collection("mata_pelajaran").getFullList({
        filter: mapelFilter,
        sort: "nama_mapel",
        requestKey: null,
      });

      const myKelasSet = new Set(myKelasIds);
      const myTingkatSet = new Set(myTingkat);
      const filteredMapel = mapelRes.filter((m) => {
        const spesifik = Array.isArray(m.spesifik_kelas_id)
          ? m.spesifik_kelas_id
          : m.spesifik_kelas_id
            ? [m.spesifik_kelas_id]
            : [];
        if (spesifik.length > 0) {
          return spesifik.some((id) => myKelasSet.has(id));
        }
        const target = Array.isArray(m.target_tingkat)
          ? m.target_tingkat
          : m.target_tingkat
            ? [m.target_tingkat]
            : [];
        if (target.length === 0) return true;
        return target.some((t) => myTingkatSet.has(String(t)));
      });
      setMyMapelList(filteredMapel);

      const mapelIds = filteredMapel.map((m) => m.id);
      if (mapelIds.length === 0) {
        setList([]);
        setLoading(false);
        return;
      }

      const ckFilter = `(${myKelasIds.map((id) => `kelas_id = "${pbQuote(id)}"`).join(" || ")}) && (${mapelIds.map((id) => `mapel_id = "${pbQuote(id)}"`).join(" || ")})`;

      const ck = await pb.collection("capaian_kompetensi").getFullList({
        filter: ckFilter,
        sort: "-created",
        expand: "mapel_id,kelas_id",
        requestKey: null,
      });

      setList(ck);
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
  const filteredList = useMemo(() => {
    let data = list;
    if (filterMapel !== "semua") {
      data = data.filter((c) => c.mapel_id === filterMapel);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((c) => {
        const nm = (c.expand?.mapel_id?.nama_mapel || "").toLowerCase();
        const kls = (c.expand?.kelas_id?.nama_kelas || "").toLowerCase();
        const t = (c.capaian_tinggi || "").toLowerCase();
        const r = (c.capaian_rendah || "").toLowerCase();
        return (
          nm.includes(q) || kls.includes(q) || t.includes(q) || r.includes(q)
        );
      });
    }
    return data;
  }, [list, search, filterMapel]);

  // ------------------------------------------------------------------
  // Download Template Excel (1 sheet, rapi)
  // ------------------------------------------------------------------
  const handleDownloadTemplate = () => {
    if (myMapelList.length === 0) {
      setToast("Tidak ada mapel untuk kelasmu.");
      return;
    }

    const headers = ["mata_pelajaran", "Capaian tinggi", "Capaian rendah"];

    // 1 baris per mapel + beberapa baris cadangan
    const rows = myMapelList.map((m) => [m.nama_mapel, "", ""]);
    const extraRows = 3;
    for (let i = 0; i < extraRows; i++) {
      rows.push(["", "", ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // ---------------- Lebar kolom ----------------
    ws["!cols"] = [
      { wch: 32 }, // mata_pelajaran
      { wch: 55 }, // Capaian tinggi
      { wch: 55 }, // Capaian rendah
    ];

    // ---------------- Tinggi baris ----------------
    ws["!rows"] = [{ hpt: 26 }];
    for (let i = 0; i < rows.length; i++) {
      ws["!rows"].push({ hpt: 30 });
    }

    // ---------------- Style header ----------------
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

    // ---------------- Style kolom mata_pelajaran ----------------
    const mapelStyle = {
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

    // ---------------- Style kolom capaian ----------------
    const capaianStyle = {
      font: { sz: 11, color: { rgb: "1E293B" } },
      fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
      alignment: { vertical: "center", horizontal: "left", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } },
      },
    };

    // ---------------- Terapkan style header ----------------
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }

    // ---------------- Terapkan style baris data ----------------
    for (let r = 1; r <= rows.length; r++) {
      const addrA = XLSX.utils.encode_cell({ r, c: 0 });
      const addrB = XLSX.utils.encode_cell({ r, c: 1 });
      const addrC = XLSX.utils.encode_cell({ r, c: 2 });

      if (!ws[addrA]) ws[addrA] = { t: "s", v: "" };
      if (!ws[addrB]) ws[addrB] = { t: "s", v: "" };
      if (!ws[addrC]) ws[addrC] = { t: "s", v: "" };

      ws[addrA].s = mapelStyle;
      ws[addrB].s = capaianStyle;
      ws[addrC].s = capaianStyle;
    }

    // ---------------- Freeze + autofilter ----------------
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: 0, c: 2 },
      }),
    };

    // ---------------- Simpan ----------------
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Capaian");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `template-capaian-${date}.xlsx`);

    setToast(
      "Template berhasil diunduh. Isi kolom capaian lalu import kembali.",
    );
  };

  // ------------------------------------------------------------------
  // Export
  // ------------------------------------------------------------------
  const handleExport = () => {
    if (filteredList.length === 0) {
      setToast("Tidak ada data untuk diexport.");
      return;
    }

    const headers = [
      "mata_pelajaran",
      "kode_mapel",
      "kelas",
      "Capaian tinggi",
      "Capaian rendah",
    ];

    const rows = filteredList.map((c) => [
      c.expand?.mapel_id?.nama_mapel || "",
      c.expand?.mapel_id?.kode_mapel || "",
      c.expand?.kelas_id?.nama_kelas || "",
      c.capaian_tinggi || "",
      c.capaian_rendah || "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    ws["!cols"] = [
      { wch: 28 },
      { wch: 12 },
      { wch: 12 },
      { wch: 50 },
      { wch: 50 },
    ];

    ws["!rows"] = [{ hpt: 26 }];
    for (let i = 0; i < rows.length; i++) {
      ws["!rows"].push({ hpt: 30 });
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
      alignment: { vertical: "center", horizontal: "left", wrapText: true },
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
    XLSX.utils.book_append_sheet(wb, ws, "Capaian Kompetensi");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `capaian-kompetensi-${date}.xlsx`);

    setToast(`${filteredList.length} data berhasil diexport.`);
  };

  const handleImportClick = () => {
    if (guruKelasList.length === 0) {
      setToast("Kamu belum terdaftar sebagai walikelas / pendamping.");
      return;
    }
    fileInputRef.current?.click();
  };

  // ------------------------------------------------------------------
  // Import dari Excel
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

      const mapelByName = new Map();
      myMapelList.forEach((m) => {
        mapelByName.set(String(m.nama_mapel).trim().toLowerCase(), m);
      });

      const autoKelasId = guruKelasList[0]?.id;
      if (!autoKelasId) {
        setImportResult({
          success: 0,
          failed: rows.length,
          errors: ["Tidak ada kelas yang terhubung dengan akunmu."],
        });
        setImporting(false);
        return;
      }

      const errors = [];
      let success = 0;
      let failed = 0;
      const createdItems = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const namaMapelRaw = String(row["mata_pelajaran"] ?? "").trim();
        const capTinggi = String(row["Capaian tinggi"] ?? "").trim();
        const capRendah = String(row["Capaian rendah"] ?? "").trim();

        // Skip baris kosong (kalau ada baris cadangan)
        if (!namaMapelRaw && !capTinggi && !capRendah) {
          continue;
        }

        if (!namaMapelRaw) {
          errors.push(`Baris ${rowNum}: kolom "mata_pelajaran" kosong.`);
          failed++;
          continue;
        }

        if (!capTinggi && !capRendah) {
          errors.push(
            `Baris ${rowNum}: minimal salah satu capaian (tinggi/rendah) harus diisi.`,
          );
          failed++;
          continue;
        }

        const mapel = mapelByName.get(namaMapelRaw.toLowerCase());
        if (!mapel) {
          errors.push(
            `Baris ${rowNum}: mapel "${namaMapelRaw}" tidak cocok dengan mapel untuk kelasmu.`,
          );
          failed++;
          continue;
        }

        try {
          const created = await pb.collection("capaian_kompetensi").create({
            mapel_id: mapel.id,
            kelas_id: autoKelasId,
            capaian_tinggi: capTinggi,
            capaian_rendah: capRendah,
          });
          const full = await pb
            .collection("capaian_kompetensi")
            .getOne(created.id, { expand: "mapel_id,kelas_id" });
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
        setToast(`${success} capaian berhasil diimport.`);
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
    if (guruKelasList.length === 0) {
      setToast(
        "Kamu belum terdaftar sebagai walikelas / pendamping di kelas mana pun.",
      );
      return;
    }
    setForm(emptyForm());
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setForm({
      id: c.id,
      mapel_id: c.mapel_id || "",
      capaian_tinggi: c.capaian_tinggi || "",
      capaian_rendah: c.capaian_rendah || "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (guruKelasList.length === 0) {
      setFormError(
        "Kamu belum terdaftar sebagai walikelas / pendamping di kelas mana pun.",
      );
      return;
    }
    if (!form.mapel_id) {
      setFormError("Mata pelajaran wajib dipilih.");
      return;
    }
    if (!form.capaian_tinggi.trim() && !form.capaian_rendah.trim()) {
      setFormError("Minimal salah satu capaian (tinggi/rendah) harus diisi.");
      return;
    }

    const autoKelasId = guruKelasList[0]?.id;
    if (!autoKelasId) {
      setFormError("Tidak ada kelas yang terhubung dengan akunmu.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        mapel_id: form.mapel_id,
        kelas_id: autoKelasId,
        capaian_tinggi: form.capaian_tinggi.trim(),
        capaian_rendah: form.capaian_rendah.trim(),
      };

      if (isEditing) {
        const updated = await pb
          .collection("capaian_kompetensi")
          .update(form.id, payload);
        const full = await pb
          .collection("capaian_kompetensi")
          .getOne(updated.id, { expand: "mapel_id,kelas_id" });
        setList((prev) => prev.map((c) => (c.id === full.id ? full : c)));
        setToast("Capaian kompetensi berhasil diperbarui.");
      } else {
        const created = await pb
          .collection("capaian_kompetensi")
          .create(payload);
        const full = await pb
          .collection("capaian_kompetensi")
          .getOne(created.id, { expand: "mapel_id,kelas_id" });
        setList((prev) => [full, ...prev]);
        setToast("Capaian kompetensi berhasil ditambahkan.");
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
      await pb.collection("capaian_kompetensi").delete(deleteTarget.id);
      setList((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setToast("Capaian kompetensi berhasil dihapus.");
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      setToast(firstErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  // ------------------------------------------------------------------
  // Render card (mobile)
  // ------------------------------------------------------------------
  const renderCard = (c) => {
    const mapel = c.expand?.mapel_id;
    const kelas = c.expand?.kelas_id;
    return (
      <div
        key={c.id}
        className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {mapel?.kode_mapel && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  {mapel.kode_mapel}
                </span>
              )}
              {kelas?.nama_kelas && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-100">
                  {kelas.nama_kelas}
                </span>
              )}
            </div>
            <p className="truncate text-sm font-semibold text-neutral-800">
              {mapel?.nama_mapel || "—"}
            </p>
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
        <div className="space-y-2 border-t border-neutral-50 pt-3">
          <div className="rounded-lg bg-emerald-50/50 px-3 py-2">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
              Capaian Tinggi
            </p>
            <p className="whitespace-pre-wrap text-xs text-neutral-700">
              {c.capaian_tinggi || "—"}
            </p>
          </div>
          <div className="rounded-lg bg-amber-50/50 px-3 py-2">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
              Capaian Rendah
            </p>
            <p className="whitespace-pre-wrap text-xs text-neutral-700">
              {c.capaian_rendah || "—"}
            </p>
          </div>
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
                Capaian Kompetensi
              </h1>
              <p className="mt-0.5 text-xs text-neutral-500">
                Kelola deskripsi capaian tinggi & rendah per mata pelajaran.
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
                  disabled={loading || myMapelList.length === 0}
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
                  disabled={importing || loading || guruKelasList.length === 0}
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
                disabled={guruKelasList.length === 0}
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
              label="Total capaian"
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
              label="Mapel tersedia"
              value={myMapelList.length}
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
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
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
                Daftar capaian
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
                placeholder="Cari..."
                className="w-full rounded-full border border-neutral-200 bg-neutral-50/60 py-2 pl-9 pr-3 text-xs transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-56"
              />
            </div>
            <select
              value={filterMapel}
              onChange={(e) => setFilterMapel(e.target.value)}
              className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="semua">Semua mapel</option>
              {myMapelList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nama_mapel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <LoadingState label="Memuat data capaian kompetensi..." />
        ) : filteredList.length === 0 ? (
          <EmptyState
            title="Belum ada capaian"
            description={
              list.length === 0
                ? "Mulai dengan menambahkan capaian atau import dari Excel."
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
                        Mapel
                      </th>
                      <th className="px-5 py-3 font-semibold whitespace-nowrap">
                        Kelas
                      </th>
                      <th className="px-5 py-3 font-semibold">
                        Capaian Tinggi
                      </th>
                      <th className="px-5 py-3 font-semibold">
                        Capaian Rendah
                      </th>
                      <th className="px-5 py-3 text-right font-semibold whitespace-nowrap">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {filteredList.map((c) => {
                      const mapel = c.expand?.mapel_id;
                      const kelas = c.expand?.kelas_id;
                      return (
                        <tr
                          key={c.id}
                          className="align-top transition hover:bg-neutral-50/60"
                        >
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-neutral-800">
                                {mapel?.nama_mapel || "—"}
                              </span>
                              {mapel?.kode_mapel && (
                                <span className="w-fit rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                  {mapel.kode_mapel}
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
                          <td className="max-w-xs px-5 py-3.5">
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-700">
                              {c.capaian_tinggi || (
                                <span className="italic text-neutral-300">
                                  Belum diisi
                                </span>
                              )}
                            </p>
                          </td>
                          <td className="max-w-xs px-5 py-3.5">
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-700">
                              {c.capaian_rendah || (
                                <span className="italic text-neutral-300">
                                  Belum diisi
                                </span>
                              )}
                            </p>
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
                  {isEditing
                    ? "Edit capaian kompetensi"
                    : "Tambah capaian kompetensi"}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {isEditing
                    ? "Perbarui detail capaian kompetensi."
                    : "Pilih mapel, kelas akan terisi otomatis."}
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

            {guruKelasList.length > 0 && (
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
                  <div>
                    <b>Kelas:</b>{" "}
                    {guruKelasList.map((k) => k.nama_kelas).join(", ")}
                    {guruKelasList.length > 1 && (
                      <span className="mt-1 block text-blue-600">
                        Kamu terkait dengan lebih dari 1 kelas — capaian akan
                        disimpan untuk kelas pertama (
                        <b>{guruKelasList[0]?.nama_kelas}</b>).
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Field label="Mata pelajaran">
              <select
                value={form.mapel_id}
                onChange={(e) =>
                  setForm((p) => ({ ...p, mapel_id: e.target.value }))
                }
                disabled={myMapelList.length === 0}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-3.5 py-2.5 text-sm transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              >
                <option value="">
                  {myMapelList.length === 0
                    ? "Tidak ada mapel untuk kelasmu"
                    : "Pilih mapel"}
                </option>
                {myMapelList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nama_mapel}
                    {m.kode_mapel ? ` (${m.kode_mapel})` : ""}
                  </option>
                ))}
              </select>
              {myMapelList.length === 0 && (
                <p className="mt-1.5 text-[11px] text-amber-600">
                  Belum ada mapel yang cocok dengan kelasmu. Hubungi admin/ICT.
                </p>
              )}
            </Field>

            <Field label="Capaian Tinggi">
              <textarea
                value={form.capaian_tinggi}
                onChange={(e) =>
                  setForm((p) => ({ ...p, capaian_tinggi: e.target.value }))
                }
                rows={3}
                placeholder="Deskripsi capaian untuk siswa dengan nilai tinggi..."
                className="w-full resize-y rounded-xl border border-neutral-200 bg-neutral-50/60 px-3.5 py-2.5 text-sm transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </Field>

            <Field label="Capaian Rendah">
              <textarea
                value={form.capaian_rendah}
                onChange={(e) =>
                  setForm((p) => ({ ...p, capaian_rendah: e.target.value }))
                }
                rows={3}
                placeholder="Deskripsi capaian untuk siswa dengan nilai rendah..."
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
                disabled={saving || myMapelList.length === 0}
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 hover:shadow disabled:opacity-50"
              >
                {saving && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {isEditing ? "Simpan perubahan" : "Tambah capaian"}
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
                Hapus capaian kompetensi?
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                Capaian untuk{" "}
                <span className="font-medium text-neutral-700">
                  {deleteTarget.expand?.mapel_id?.nama_mapel || "—"}
                </span>{" "}
                ·{" "}
                <span className="font-medium text-neutral-700">
                  {deleteTarget.expand?.kelas_id?.nama_kelas || "—"}
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
