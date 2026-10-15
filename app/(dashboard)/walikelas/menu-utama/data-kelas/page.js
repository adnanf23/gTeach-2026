"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// Role yang boleh mengakses halaman ini
const ALLOWED_ROLES = ["guru walikelas", "guru pendamping"];

// Warna header export (samakan dengan CLR di halaman export nilai mentah kalau nilainya berbeda)
const CLR = {
  GREEN: "FFC6E0B4",
  GREEN_ALT: "FFA9D08E",
  ORANGE: "FFF8CBAD",
  BLUE: "FFBDD7EE",
  YELLOW_LIGHT: "FFFFF2CC",
  GRAY_LIGHT: "FFEEEEEE",
};

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function toArray(val) {
  if (Array.isArray(val)) return val;
  return val ? [val] : [];
}

// Nama sheet Excel: maks 31 karakter, tanpa karakter terlarang, harus unik
function safeSheetName(name, usedNames) {
  let base =
    String(name || "Sheet")
      .replace(/[\\/?*[\]:]/g, "-")
      .trim()
      .slice(0, 31) || "Sheet";
  let finalName = base;
  let i = 2;
  while (usedNames.has(finalName.toLowerCase())) {
    const suffix = ` (${i++})`;
    finalName = base.slice(0, 31 - suffix.length) + suffix;
  }
  usedNames.add(finalName.toLowerCase());
  return finalName;
}

export default function KelasSayaPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [kelasList, setKelasList] = useState([]);
  const [siswaByKelas, setSiswaByKelas] = useState({});
  const [mapelByKelas, setMapelByKelas] = useState({});
  // Map: siswaId -> array of wali_murid records
  const [waliMuridBySiswa, setWaliMuridBySiswa] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  // State untuk toggle sedang loading per waliId
  const [togglingWaliId, setTogglingWaliId] = useState(null);

  // State export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  // Sub-menu Utama: 'overview', 'siswa', atau 'mapel'
  const [activeTab, setActiveTab] = useState("overview");

  // 1. Cek auth & role
  useEffect(() => {
    const currentUser = getCurrentUser();

    if (!isAuthenticated() || !currentUser) {
      router.push("/login");
      return;
    }

    if (!ALLOWED_ROLES.includes(currentUser.role)) {
      setUnauthorized(true);
      setAuthChecked(true);
      setLoading(false);
      return;
    }

    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // 2. Ambil data kelas + siswa + mata_pelajaran + wali_murid
  useEffect(() => {
    if (!authChecked || unauthorized || !user?.id) return;

    let isMounted = true;

    async function fetchData() {
      setLoading(true);
      setError("");

      try {
        const kelasFilter = `walikelas_id = "${user.id}" || pendamping_id = "${user.id}"`;
        const kelasRecords = await pb.collection("kelas").getFullList({
          filter: kelasFilter,
          sort: "tingkat,nama_kelas",
          expand: "tahun_ajaran_id,walikelas_id,pendamping_id",
          requestKey: null,
        });

        if (kelasRecords.length === 0) {
          if (isMounted) {
            setKelasList([]);
            setSiswaByKelas({});
            setMapelByKelas({});
            setWaliMuridBySiswa({});
            setLoading(false);
          }
          return;
        }

        const kelasIds = kelasRecords.map((k) => k.id);
        const distinctTingkat = Array.from(
          new Set(kelasRecords.map((k) => String(k.tingkat))),
        );

        const siswaFilter = kelasIds
          .map((kid) => `kelas_id = "${kid}"`)
          .join(" || ");

        const [siswaRecords, spesifikMapel, kandidatUmumMapel] =
          await Promise.all([
            pb.collection("siswa").getFullList({
              filter: siswaFilter,
              sort: "nama_siswa",
              requestKey: null,
            }),
            pb
              .collection("mata_pelajaran")
              .getFullList({
                filter: kelasIds
                  .map((kid) => `spesifik_kelas_id ~ "${kid}"`)
                  .join(" || "),
                requestKey: null,
              })
              .catch(() => []),
            pb
              .collection("mata_pelajaran")
              .getFullList({
                filter: distinctTingkat
                  .map((t) => `target_tingkat ~ "${t}"`)
                  .join(" || "),
                requestKey: null,
              })
              .catch(() => []),
          ]);

        /* ---------- Ambil akun wali murid untuk siswa-siswa ini ---------- */
        const siswaIds = siswaRecords.map((s) => s.id);
        let waliMuridRecords = [];
        if (siswaIds.length > 0) {
          const CHUNK = 50;
          const chunks = [];
          for (let i = 0; i < siswaIds.length; i += CHUNK) {
            chunks.push(siswaIds.slice(i, i + CHUNK));
          }
          const results = await Promise.all(
            chunks.map((chunk) =>
              pb
                .collection("wali_murid")
                .getFullList({
                  filter: chunk.map((id) => `siswa_id ~ "${id}"`).join(" || "),
                  fields: "id,username,siswa_id,verified",
                  requestKey: null,
                })
                .catch(() => []),
            ),
          );
          waliMuridRecords = results.flat();
        }

        // Map siswaId -> [wali_murid, ...]
        const waliBySiswa = {};
        for (const w of waliMuridRecords) {
          for (const sid of toArray(w.siswa_id)) {
            if (!waliBySiswa[sid]) waliBySiswa[sid] = [];
            waliBySiswa[sid].push(w);
          }
        }

        /* ---------- Grouping siswa per kelas ---------- */
        const groupedSiswa = {};
        for (const s of siswaRecords) {
          const kid = firstOf(s.kelas_id);
          if (!kid) continue;
          if (!groupedSiswa[kid]) groupedSiswa[kid] = [];
          groupedSiswa[kid].push(s);
        }

        const umumMapel = kandidatUmumMapel.filter((m) => {
          const ids = Array.isArray(m.spesifik_kelas_id)
            ? m.spesifik_kelas_id
            : m.spesifik_kelas_id
              ? [m.spesifik_kelas_id]
              : [];
          return ids.length === 0;
        });

        const groupedMapel = {};
        for (const kelas of kelasRecords) {
          const tingkat = String(kelas.tingkat);
          const applied = [];
          const seen = new Set();

          for (const m of spesifikMapel) {
            const ids = Array.isArray(m.spesifik_kelas_id)
              ? m.spesifik_kelas_id
              : m.spesifik_kelas_id
                ? [m.spesifik_kelas_id]
                : [];
            if (ids.includes(kelas.id) && !seen.has(m.id)) {
              applied.push({ ...m, __khusus: true });
              seen.add(m.id);
            }
          }

          for (const m of umumMapel) {
            if (seen.has(m.id)) continue;
            if (!(m.target_tingkat || []).includes(tingkat)) continue;
            applied.push({ ...m, __khusus: false });
            seen.add(m.id);
          }

          groupedMapel[kelas.id] = applied.sort((a, b) =>
            (a.nama_mapel || "").localeCompare(b.nama_mapel || ""),
          );
        }

        if (isMounted) {
          setKelasList(kelasRecords);
          setSiswaByKelas(groupedSiswa);
          setMapelByKelas(groupedMapel);
          setWaliMuridBySiswa(waliBySiswa);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        if (isMounted) {
          setError("Gagal memuat data kelas atau mata pelajaran Anda.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized, user]);

  // ─── Toggle verified wali murid (inline di tabel) ─────────────────────────
  const handleToggleWaliVerified = useCallback(
    async (waliId, nextVal) => {
      if (togglingWaliId) return; // cegah klik ganda
      setTogglingWaliId(waliId);

      // Optimistic update
      setWaliMuridBySiswa((prev) => {
        const next = { ...prev };
        for (const sid of Object.keys(next)) {
          next[sid] = next[sid].map((w) =>
            w.id === waliId ? { ...w, verified: nextVal } : w,
          );
        }
        return next;
      });

      try {
        await pb.collection("wali_murid").update(waliId, {
          verified: nextVal,
        });
      } catch (err) {
        console.error("Gagal update verified:", err);
        // Rollback
        setWaliMuridBySiswa((prev) => {
          const next = { ...prev };
          for (const sid of Object.keys(next)) {
            next[sid] = next[sid].map((w) =>
              w.id === waliId ? { ...w, verified: !nextVal } : w,
            );
          }
          return next;
        });
        setError("Gagal mengubah status verifikasi akun wali murid.");
      } finally {
        setTogglingWaliId(null);
      }
    },
    [togglingWaliId],
  );

  // Handler ganti tab
  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    setSearchTerm("");
  };

  // Filter siswa berdasarkan pencarian (dipakai tabel & export)
  const filterSiswa = (siswaList) => {
    if (!searchTerm.trim()) return siswaList;
    const q = searchTerm.toLowerCase();
    return siswaList.filter((s) => {
      const waliUsernames = (waliMuridBySiswa[s.id] || [])
        .map((w) => w.username || "")
        .join(" ");
      return (
        s.nama_siswa?.toLowerCase().includes(q) ||
        s.nis?.toLowerCase().includes(q) ||
        s.nisn?.toLowerCase().includes(q) ||
        waliUsernames.toLowerCase().includes(q)
      );
    });
  };

  // ─── Export data siswa ke Excel (1 sheet per kelas, mengikuti filter pencarian) ───
  async function handleExportSiswa() {
    if (kelasList.length === 0) return;

    try {
      setExporting(true);
      setExportProgress("Menyiapkan file...");

      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = await import("file-saver");

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistem Penilaian";
      workbook.created = new Date();

      const usedNames = new Set();
      const border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };

      function styleHead(cell, argb) {
        cell.font = { bold: true, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = border;
      }

      function fillCell(cell, argb) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      }

      const collator = new Intl.Collator("id", { numeric: true });

      // Layout kolom:
      // 1 No | 2 NIS | 3 NISN | 4 Nama Siswa | 5 L/P | 6 Username Wali | 7 Status
      const FIXED = 5;
      const LAST_COL = 7;

      for (let ki = 0; ki < kelasList.length; ki++) {
        const kelas = kelasList[ki];
        const namaKelas = (kelas.nama_kelas || `Kelas ${ki + 1}`).trim();

        setExportProgress(
          `Menyusun sheet ${ki + 1}/${kelasList.length}: ${namaKelas}`,
        );
        await new Promise((r) => setTimeout(r, 0));

        const siswaSorted = [...filterSiswa(siswaByKelas[kelas.id] || [])].sort(
          (a, b) => collator.compare(a.nama_siswa || "", b.nama_siswa || ""),
        );

        const ta = kelas.expand?.tahun_ajaran_id;
        const taText = ta ? `${ta.tahun} · Sem. ${ta.semester}` : "—";
        const namaWali = kelas.expand?.walikelas_id?.nama_lengkap || "—";
        const namaPendamping = kelas.expand?.pendamping_id?.nama_lengkap || "—";

        const sheet = workbook.addWorksheet(
          safeSheetName(namaKelas, usedNames),
        );

        // =========================
        // HEADER 1: Info Kelas (row 1, digabung full)
        // =========================
        const infoRow = sheet.getRow(1);
        sheet.mergeCells(1, 1, 1, LAST_COL);
        infoRow.getCell(1).value =
          `Kelas: ${namaKelas}   |   Tahun Ajaran: ${taText}   |   Wali Kelas: ${namaWali}   |   Guru Pendamping: ${namaPendamping}`;
        for (let c = 1; c <= LAST_COL; c++) {
          const cell = infoRow.getCell(c);
          cell.font = { bold: true, size: 10 };
          fillCell(cell, CLR.YELLOW_LIGHT);
          cell.alignment = {
            horizontal: "left",
            vertical: "middle",
            wrapText: true,
          };
          cell.border = border;
        }
        infoRow.height = 30;

        // =========================
        // HEADER 2: Kolom (row 2-3)
        // =========================
        const h1 = sheet.getRow(2);
        const h2 = sheet.getRow(3);

        // Kolom tetap (hijau), header digabung 2 baris
        ["No", "NIS", "NISN", "Nama Siswa", "L/P"].forEach((label, c) => {
          sheet.mergeCells(2, c + 1, 3, c + 1);
          h1.getCell(c + 1).value = label;
          styleHead(h1.getCell(c + 1), CLR.GREEN);
          styleHead(h2.getCell(c + 1), CLR.GREEN);
        });

        // Grup akun wali murid (oranye)
        sheet.mergeCells(2, FIXED + 1, 2, LAST_COL);
        h1.getCell(FIXED + 1).value = "AKUN WALI MURID";
        styleHead(h1.getCell(FIXED + 1), CLR.ORANGE);
        styleHead(h1.getCell(LAST_COL), CLR.ORANGE);
        h2.getCell(FIXED + 1).value = "Username";
        h2.getCell(FIXED + 2).value = "Status";
        styleHead(h2.getCell(FIXED + 1), CLR.ORANGE);
        styleHead(h2.getCell(FIXED + 2), CLR.ORANGE);

        h1.height = 22;
        h2.height = 26;

        // =========================
        // DATA mulai row 4
        // =========================
        let r = 4;

        if (siswaSorted.length === 0) {
          sheet.mergeCells(r, 1, r, LAST_COL);
          const cell = sheet.getRow(r).getCell(1);
          cell.value = searchTerm.trim()
            ? "Tidak ada siswa yang cocok dengan pencarian."
            : "Belum ada siswa di kelas ini.";
          cell.font = { italic: true, color: { argb: "FF888888" } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = border;
        } else {
          siswaSorted.forEach((s, idx) => {
            const waliList = waliMuridBySiswa[s.id] || [];
            const span = Math.max(waliList.length, 1);
            const startRow = r;

            for (let i = 0; i < span; i++) {
              const w = waliList[i];
              const row = sheet.getRow(r);

              if (i === 0) {
                row.getCell(1).value = idx + 1;
                row.getCell(2).value = s.nis ? String(s.nis) : "";
                row.getCell(3).value = s.nisn ? String(s.nisn) : "";
                row.getCell(4).value = s.nama_siswa || "";
                row.getCell(5).value = s.jenis_kelamin || "";
              }

              let statusText = "—";
              let statusColor = CLR.GRAY_LIGHT;
              if (w) {
                statusText = w.verified ? "Verified" : "Unverified";
                statusColor = w.verified ? CLR.GREEN : CLR.YELLOW_LIGHT;
              }

              row.getCell(FIXED + 1).value = w
                ? w.username || "(tanpa username)"
                : "Belum ada akun";
              row.getCell(FIXED + 2).value = statusText;

              for (let c = 1; c <= LAST_COL; c++) {
                const cell = row.getCell(c);
                cell.border = border;
                cell.alignment = {
                  horizontal: c === 4 || c === FIXED + 1 ? "left" : "center",
                  vertical: "middle",
                };
              }
              fillCell(row.getCell(FIXED + 2), statusColor);
              if (!w) {
                row.getCell(FIXED + 1).font = {
                  italic: true,
                  color: { argb: "FF888888" },
                };
              }
              r++;
            }

            // Siswa dengan >1 akun wali: gabungkan kolom data siswa secara vertikal
            if (span > 1) {
              for (let c = 1; c <= FIXED; c++) {
                sheet.mergeCells(startRow, c, r - 1, c);
              }
            }
          });
        }

        sheet.getColumn(1).width = 6;
        sheet.getColumn(2).width = 14;
        sheet.getColumn(3).width = 16;
        sheet.getColumn(4).width = 32;
        sheet.getColumn(5).width = 7;
        sheet.getColumn(6).width = 24;
        sheet.getColumn(7).width = 14;

        // Freeze sampai baris header selesai (row 3)
        sheet.views = [{ state: "frozen", xSplit: 4, ySplit: 3 }];
      }

      setExportProgress("Membuat file...");
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const fileLabel =
        kelasList.length === 1
          ? kelasList[0].nama_kelas || "Kelas"
          : "Kelas_Saya";
      saveAs(blob, `Data_Siswa_${fileLabel}.xlsx`.replace(/\s+/g, "_"));
    } catch (err) {
      console.error("Gagal export data siswa:", err);
      alert(
        "Gagal export. Pastikan package 'exceljs' dan 'file-saver' sudah terinstall.",
      );
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  }

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
          Halaman ini hanya dapat diakses oleh guru walikelas atau guru
          pendamping.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 text-xs text-slate-400 flex items-center gap-2">
        <span>Kelas</span> <span>/</span>{" "}
        <span className="text-slate-600 font-medium">Kelas Saya</span>
      </div>

      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between sm:pb-2">
        <div className="flex flex-row items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 no-scrollbar w-full sm:w-auto relative z-20">
          <button
            type="button"
            onClick={() => handleTabChange("overview")}
            className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer select-none outline-none min-w-[100px] flex-1 sm:flex-initial ${
              activeTab === "overview"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            }`}
          >
            <svg
              className="h-4 w-4 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"
              />
            </svg>
            <span>Overview Kelas</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("siswa")}
            className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer select-none outline-none min-w-[100px] flex-1 sm:flex-initial ${
              activeTab === "siswa"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            }`}
          >
            <svg
              className="h-4 w-4 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <span>Data Siswa</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("mapel")}
            className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer select-none outline-none min-w-[100px] flex-1 sm:flex-initial ${
              activeTab === "mapel"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            }`}
          >
            <svg
              className="h-4 w-4 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <span>Mata Pelajaran</span>
          </button>
        </div>

        {activeTab !== "overview" && kelasList.length > 0 && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center relative z-10">
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder={
                  activeTab === "siswa"
                    ? "Cari nama siswa / NIS..."
                    : "Cari kode / nama mata pelajaran..."
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 pl-9 text-xs outline-none focus:border-blue-500 transition shadow-sm"
              />
              <svg
                className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            {activeTab === "siswa" && (
              <button
                type="button"
                onClick={handleExportSiswa}
                disabled={exporting || loading}
                title="Export data siswa ke Excel (mengikuti pencarian yang aktif)"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
              >
                {exporting ? (
                  <svg
                    className="h-3.5 w-3.5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
                    />
                  </svg>
                )}
                <span>{exporting ? "Mengekspor..." : "Export Excel"}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {exporting && exportProgress && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
          {exportProgress}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : kelasList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
          Anda belum ditugaskan sebagai wali kelas atau guru pendamping di kelas
          manapun.
        </div>
      ) : (
        <div className="space-y-8 relative z-10">
          {kelasList.map((kelas) => {
            const siswaList = siswaByKelas[kelas.id] || [];
            const mapelList = mapelByKelas[kelas.id] || [];

            const filteredSiswa = filterSiswa(siswaList);

            const filteredMapel = mapelList.filter((m) => {
              if (!searchTerm.trim()) return true;
              const q = searchTerm.toLowerCase();
              return (
                m.nama_mapel?.toLowerCase().includes(q) ||
                m.kode_mapel?.toLowerCase().includes(q)
              );
            });

            const jumlahL = filteredSiswa.filter(
              (s) => s.jenis_kelamin === "L",
            ).length;
            const jumlahP = filteredSiswa.filter(
              (s) => s.jenis_kelamin === "P",
            ).length;
            const tahunAjaran = kelas.expand?.tahun_ajaran_id;

            const namaWali =
              kelas.expand?.walikelas_id?.nama_lengkap || "Belum Ditentukan";
            const usernameWali = kelas.expand?.walikelas_id?.username || "—";
            const namaPendamping =
              kelas.expand?.pendamping_id?.nama_lengkap || "Belum Ditentukan";
            const usernamePendamping =
              kelas.expand?.pendamping_id?.username || "—";

            const isWaliKelas = kelas.walikelas_id === user?.id;
            const isGuruPendamping = kelas.pendamping_id === user?.id;

            return (
              <div
                key={kelas.id}
                className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-5"
              >
                {/* HEADER INFO UTAMA KELAS */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white uppercase text-sm shadow-sm">
                      {kelas.nama_kelas?.substring(0, 2) ||
                        `${kelas.tingkat || 1}A`}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                        {kelas.nama_kelas}
                        <span className="text-[11px] font-mono font-normal text-slate-400 bg-white border px-1.5 py-0.5 rounded">
                          ID: {kelas.id}
                        </span>
                      </h2>
                      <div className="flex gap-1.5 mt-1">
                        {isWaliKelas && (
                          <span className="rounded bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                            Wali Kelas Anda
                          </span>
                        )}
                        {isGuruPendamping && (
                          <span className="rounded bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                            Guru Pendamping Anda
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 sm:text-right font-medium">
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      Tahun Ajaran
                    </p>
                    <p className="text-slate-700 font-semibold mt-0.5">
                      {tahunAjaran
                        ? `${tahunAjaran.tahun} · Sem. ${tahunAjaran.semester}`
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* ================= AREA KONTEN AKTIF ================= */}
                {activeTab === "overview" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          Penugasan Wali Kelas
                        </span>
                        <h3 className="text-sm font-bold text-slate-800 mt-2">
                          {namaWali}
                        </h3>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-500 font-mono">
                        <span className="text-slate-400">Username:</span>
                        <span className="text-slate-700 font-semibold">
                          @{usernameWali}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          Penugasan Guru Pendamping
                        </span>
                        <h3 className="text-sm font-bold text-slate-800 mt-2">
                          {namaPendamping}
                        </h3>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-500 font-mono">
                        <span className="text-slate-400">Username:</span>
                        <span className="text-slate-700 font-semibold">
                          @{usernamePendamping}
                        </span>
                      </div>
                    </div>

                    <div className="md:col-span-2 rounded-xl border border-slate-50 bg-slate-50/50 p-4 text-[11px] text-slate-500 flex justify-between flex-wrap gap-4">
                      <p>
                        Tingkat Kelas:{" "}
                        <span className="font-bold text-slate-700">
                          {kelas.tingkat || "—"}
                        </span>
                      </p>
                      <p>
                        Total Murid Terdaftar:{" "}
                        <span className="font-bold text-slate-700">
                          {siswaList.length} Anak
                        </span>
                      </p>
                      <p>
                        Jumlah Mata Pelajaran Kurikulum:{" "}
                        <span className="font-bold text-slate-700">
                          {mapelList.length} Pelajaran
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "siswa" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                      <span className="uppercase tracking-wider">
                        Daftar Murid Aktif
                      </span>
                      <span>
                        {filteredSiswa.length} ditemukan (L: {jumlahL} · P:{" "}
                        {jumlahP})
                      </span>
                    </div>

                    {filteredSiswa.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200">
                        {searchTerm.trim()
                          ? "Tidak ada nama siswa yang cocok."
                          : "Belum ada siswa terdaftar."}
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
                        <table className="w-full min-w-[760px] text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-left uppercase tracking-wider text-slate-400 text-[10px] font-semibold border-b border-slate-100">
                              <th className="px-4 py-2.5 text-center w-12">
                                No
                              </th>
                              <th className="px-4 py-2.5">
                                Nama Lengkap Siswa
                              </th>
                              <th className="px-4 py-2.5">NIS</th>
                              <th className="px-4 py-2.5">NISN</th>
                              <th className="px-4 py-2.5 text-center w-16">
                                L/P
                              </th>
                              <th className="px-4 py-2.5">
                                Akun Wali Murid (Verified)
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-600 bg-white">
                            {filteredSiswa.map((s, idx) => {
                              const waliList = waliMuridBySiswa[s.id] || [];
                              return (
                                <tr
                                  key={s.id}
                                  className="hover:bg-slate-50/40 transition"
                                >
                                  <td className="px-4 py-2.5 text-center text-slate-400 font-mono">
                                    {idx + 1}
                                  </td>
                                  <td className="px-4 py-2.5 font-semibold text-slate-700">
                                    {s.nama_siswa}
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-500 font-mono">
                                    {s.nis || "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-500 font-mono">
                                    {s.nisn || "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span
                                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                                        s.jenis_kelamin === "L"
                                          ? "bg-sky-50 text-sky-600 border border-sky-100"
                                          : s.jenis_kelamin === "P"
                                            ? "bg-pink-50 text-pink-600 border border-pink-100"
                                            : "bg-slate-50 text-slate-500"
                                      }`}
                                    >
                                      {s.jenis_kelamin || "—"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {waliList.length === 0 ? (
                                      <span className="inline-flex items-center gap-1 rounded bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 text-[10px] font-medium">
                                        Belum ada akun
                                      </span>
                                    ) : (
                                      <div className="flex flex-col gap-1.5">
                                        {waliList.map((w) => {
                                          const isOn = !!w.verified;
                                          const isBusy =
                                            togglingWaliId === w.id;
                                          return (
                                            <div
                                              key={w.id}
                                              className="inline-flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1"
                                            >
                                              <span
                                                className="font-mono font-semibold text-[10px] text-slate-700"
                                                title={`ID: ${w.id}`}
                                              >
                                                {w.username ||
                                                  "(tanpa username)"}
                                              </span>
                                              <span
                                                className={`text-[9px] font-bold uppercase tracking-wider ${
                                                  isOn
                                                    ? "text-emerald-600"
                                                    : "text-slate-400"
                                                }`}
                                              >
                                                {isOn
                                                  ? "Verified"
                                                  : "Unverified"}
                                              </span>
                                              <ToggleSwitch
                                                checked={isOn}
                                                disabled={isBusy}
                                                onChange={() =>
                                                  handleToggleWaliVerified(
                                                    w.id,
                                                    !isOn,
                                                  )
                                                }
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "mapel" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                      <span className="uppercase tracking-wider">
                        Mata Pelajaran Kurikulum Terdaftar
                      </span>
                      <span>{filteredMapel.length} Mata Pelajaran Aktif</span>
                    </div>

                    {filteredMapel.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200">
                        {searchTerm.trim()
                          ? "Tidak ada mata pelajaran yang cocok."
                          : "Belum ada kurikulum didaftarkan."}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredMapel.map((m) => (
                          <div
                            key={m.id}
                            className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col justify-between hover:border-blue-200 transition"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                                  {m.kode_mapel || "MPL"}
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono">
                                  ID: {m.id}
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-slate-800 mt-2 line-clamp-1">
                                {m.nama_mapel}
                              </h4>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                              <span>
                                Tingkat:{" "}
                                {(m.target_tingkat || []).join(", ") || "—"}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                                  m.__khusus
                                    ? "text-amber-700 bg-amber-50"
                                    : "text-blue-600 bg-blue-50"
                                }`}
                              >
                                {m.__khusus ? "Khusus kelas ini" : "Umum"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-pressed={checked}
      title={checked ? "Klik untuk unverify" : "Klik untuk verify"}
      className={`relative inline-flex items-center w-9 h-[18px] rounded-full transition-colors duration-200 ${
        checked ? "bg-emerald-500" : "bg-slate-300"
      } ${disabled ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-200 ${
          checked ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 animate-pulse rounded-xl bg-slate-100 w-1/3" />
      {[1, 2].map((i) => (
        <div
          key={i}
          className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
        >
          <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-xl bg-slate-50" />
        </div>
      ))}
    </div>
  );
}
