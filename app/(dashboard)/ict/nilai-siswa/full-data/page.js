"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// ================================================================
// UTIL (sama seperti wali kelas)
// ================================================================
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}
function numOrNull(v) {
  return typeof v === "number" && !isNaN(v) && v !== -1 ? v : null;
}
function safeSheetName(name, used) {
  const base =
    String(name || "Mapel")
      .replace(/[\\/*?:\[\]]/g, "-")
      .trim()
      .slice(0, 31) || "Mapel";
  let final = base;
  let i = 2;
  while (used.has(final.toLowerCase())) {
    const suffix = ` (${i++})`;
    final = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(final.toLowerCase());
  return final;
}
function readCellNumber(cell) {
  const v = cell?.value;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return isNaN(n) ? null : n;
  }
  if (typeof v === "object") {
    if (v.result !== undefined) {
      const n = Number(v.result);
      return isNaN(n) ? null : n;
    }
    if (v.richText) {
      const s = v.richText.map((rt) => rt.text).join("");
      const n = Number(s.trim());
      return isNaN(n) ? null : n;
    }
    if (v.text !== undefined) {
      const n = Number(String(v.text).trim());
      return isNaN(n) ? null : n;
    }
  }
  return null;
}
function readCellString(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if (v.richText)
      return v.richText
        .map((rt) => rt.text)
        .join("")
        .trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
  }
  return String(v).trim();
}
function normNis(v) {
  return String(v ?? "")
    .replace(/\D/g, "")
    .trim();
}
function normText(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function normKey(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
async function runPool(tasks, limit = 6) {
  let idx = 0;
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (idx < tasks.length) {
        const task = tasks[idx++];
        await task();
      }
    },
  );
  await Promise.all(workers);
}

const CLR = {
  GREEN: "FFD9EAD3",
  GREEN_ALT: "FFEAF4E4",
  ORANGE: "FFFCE5CD",
  YELLOW_LIGHT: "FFFFF2CC",
  BLUE: "FFCFE2F3",
  BLUE_ALT: "FFE3F1FB",
};
const KATEGORI_KODING = "koding";

export default function ICTPenilaianPage() {
  const [kelasList, setKelasList] = useState([]);
  const [selectedKelasId, setSelectedKelasId] = useState(null);
  const [searchKelas, setSearchKelas] = useState("");
  const [loading, setLoading] = useState(true);

  const [currentKelas, setCurrentKelas] = useState(null);
  const [loadingMapel, setLoadingMapel] = useState(false);
  const [mapel, setMapel] = useState([]);
  const [ujianAktif, setUjianAktif] = useState([]);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importResult, setImportResult] = useState(null);
  const importInputRef = useRef(null);

  // (UI saja) state pemilih kelas custom
  const [kelasOpen, setKelasOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const kelasWrapRef = useRef(null);
  const kelasSearchRef = useRef(null);
  const kelasListRef = useRef(null);

  const user = getCurrentUser();
  const router = useRouter();

  // ============ LOAD SEMUA KELAS ============
  useEffect(() => {
    async function loadKelas() {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const kelas = await pb.collection("kelas").getFullList({
          sort: "tingkat,nama_kelas",
          requestKey: null,
        });
        setKelasList(kelas);
        if (kelas.length > 0) setSelectedKelasId(kelas[0].id);
      } catch (err) {
        if (!err?.isAbort) console.error("Gagal load kelas:", err);
      } finally {
        setLoading(false);
      }
    }
    loadKelas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============ LOAD MAPEL SAAT KELAS BERUBAH ============
  useEffect(() => {
    if (!selectedKelasId || kelasList.length === 0) return;
    const kelas = kelasList.find((k) => k.id === selectedKelasId);
    if (!kelas) return;

    async function loadMapel() {
      try {
        setLoadingMapel(true);
        setCurrentKelas(kelas);
        setMapel([]);
        setUjianAktif([]);

        const fetchKhusus = pb.collection("mata_pelajaran").getFullList({
          filter: `spesifik_kelas_id ~ "${kelas.id}"`,
          requestKey: null,
        });
        const fetchTingkat = pb.collection("mata_pelajaran").getFullList({
          filter: `target_tingkat ~ "${String(kelas.tingkat)}"`,
          requestKey: null,
        });
        const fetchPloting = pb.collection("ploting_guru").getFullList({
          filter: `kelas_id ~ "${kelas.id}"`,
          expand: "guru_id",
          requestKey: null,
        });
        const fetchUjian = pb.collection("pengaturan_ujian").getFullList({
          filter: `status_akses = "buka" && (target_kelas_id ~ "${kelas.id}" || target_tingkat ~ "${String(kelas.tingkat)}")`,
          requestKey: null,
        });

        const [mapelKhusus, mapelTingkat, plotingData, ujianData] =
          await Promise.all([
            fetchKhusus,
            fetchTingkat,
            fetchPloting,
            fetchUjian,
          ]);

        setUjianAktif(ujianData);

        const combinedMapel = [...mapelKhusus, ...mapelTingkat];
        const uniqueMapelRaw = Array.from(
          new Map(combinedMapel.map((item) => [item.id, item])).values(),
        );

        const uniqueMapel = uniqueMapelRaw.filter((m) => {
          const spesifik = m.spesifik_kelas_id;
          const punyaRestriksi = Array.isArray(spesifik) && spesifik.length > 0;
          if (!punyaRestriksi) return true;
          return spesifik.includes(kelas.id);
        });

        const guruMap = new Map();
        plotingData.forEach((plot) => {
          if (plot.mapel_id && plot.expand?.guru_id) {
            const guruObj = Array.isArray(plot.expand.guru_id)
              ? plot.expand.guru_id[0]
              : plot.expand.guru_id;
            const namaGuru =
              guruObj?.nama_lengkap || guruObj?.name || guruObj?.username;
            if (namaGuru) {
              if (Array.isArray(plot.mapel_id)) {
                plot.mapel_id.forEach((mId) => guruMap.set(mId, namaGuru));
              } else {
                guruMap.set(plot.mapel_id, namaGuru);
              }
            }
          }
        });

        const mapelWithGuru = uniqueMapel.map((m) => ({
          ...m,
          guru_pengampu: guruMap.get(m.id) || "Walikelas",
        }));

        mapelWithGuru.sort((a, b) =>
          String(a.nama_mapel || a.nama || "").localeCompare(
            String(b.nama_mapel || b.nama || ""),
            "id",
            { numeric: true, sensitivity: "base" },
          ),
        );

        setMapel(mapelWithGuru);
      } catch (error) {
        if (!error?.isAbort) console.error("Error fetching mapel:", error);
      } finally {
        setLoadingMapel(false);
      }
    }
    loadMapel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKelasId, kelasList]);

  const ujianSorted = useMemo(() => {
    const rank = (u) => {
      if (u.jenis_ujian === "ahb") return 0;
      if (u.jenis_ujian === "asas") return 1;
      if (u.jenis_ujian === "asat") return 2;
      return 3;
    };
    return [...ujianAktif].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return String(a.nama_ujian || "").localeCompare(
        String(b.nama_ujian || ""),
        "id",
      );
    });
  }, [ujianAktif]);

  const kelasFiltered = useMemo(() => {
    const q = searchKelas.trim().toLowerCase();
    if (!q) return kelasList;
    return kelasList.filter(
      (k) =>
        String(k.nama_kelas || "")
          .toLowerCase()
          .includes(q) ||
        String(k.tingkat || "")
          .toLowerCase()
          .includes(q),
    );
  }, [kelasList, searchKelas]);

  // (UI saja) kelompokkan kelas per tingkat untuk dropdown
  const kelasGroups = useMemo(() => {
    const map = new Map();
    kelasFiltered.forEach((k) => {
      const t = String(k.tingkat ?? "-");
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(k);
    });
    return Array.from(map.entries());
  }, [kelasFiltered]);

  // (UI saja) daftar datar untuk navigasi keyboard, kelas terpilih, dan index
  const kelasFlat = useMemo(
    () => kelasGroups.flatMap(([, items]) => items),
    [kelasGroups],
  );
  const kelasIdxMap = useMemo(
    () => new Map(kelasFlat.map((k, i) => [k.id, i])),
    [kelasFlat],
  );
  const kelasTerpilih = useMemo(
    () => kelasList.find((k) => k.id === selectedKelasId) || null,
    [kelasList, selectedKelasId],
  );
  const kelasIdx = kelasList.findIndex((k) => k.id === selectedKelasId);

  function bukaKelas() {
    const i = kelasFlat.findIndex((k) => k.id === selectedKelasId);
    setActiveIdx(i >= 0 ? i : 0);
    setKelasOpen(true);
  }
  function tutupKelas() {
    setKelasOpen(false);
    setSearchKelas("");
  }
  function pilihKelas(k) {
    if (!k) return;
    setSelectedKelasId(k.id);
    tutupKelas();
  }
  function geserKelas(delta) {
    const next = kelasList[kelasIdx + delta];
    if (next) setSelectedKelasId(next.id);
  }
  function onKelasKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(kelasFlat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pilihKelas(kelasFlat[activeIdx]);
    }
  }

  // (UI saja) fokus ke pencarian, Esc untuk menutup, kunci scroll di HP
  useEffect(() => {
    if (!kelasOpen) return;
    const t = setTimeout(() => kelasSearchRef.current?.focus(), 30);
    function onKey(e) {
      if (e.key === "Escape") tutupKelas();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    if (window.matchMedia("(max-width: 639px)").matches) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasOpen]);

  // (UI saja) jaga item aktif tetap terlihat saat navigasi keyboard
  useEffect(() => {
    if (!kelasOpen) return;
    const el = kelasListRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, kelasOpen]);

  // ================================================================
  // EXPORT EXCEL PER MAPEL (sama seperti wali kelas)
  // ================================================================
  async function handleExportPerMapel() {
    if (!currentKelas || mapel.length === 0) return;
    try {
      setExporting(true);
      setExportProgress("Mengambil data...");

      const mapelIds = mapel.map((m) => m.id);
      const mapelFilter = mapelIds
        .map((id) => `mapel_id ~ "${id}"`)
        .join(" || ");

      const [tpAll, lmAll, nfAll, nsAll, nuAll, siswaAll] = await Promise.all([
        pb.collection("tujuan_pembelajaran").getFullList({
          filter: `(${mapelFilter}) && kelas_id ~ "${currentKelas.id}"`,
          requestKey: null,
        }),
        pb.collection("lingkup_materi").getFullList({
          filter: `(${mapelFilter}) && kelas_id ~ "${currentKelas.id}"`,
          sort: "created",
          requestKey: null,
        }),
        pb.collection("nilai_formatif").getFullList({
          filter: `kelas_id = "${currentKelas.id}"`,
          requestKey: null,
        }),
        pb.collection("nilai_sumatif").getFullList({
          filter: `kelas_id = "${currentKelas.id}"`,
          requestKey: null,
        }),
        pb.collection("nilai_ujian").getFullList({
          filter: `(${mapelFilter})`,
          requestKey: null,
        }),
        pb.collection("siswa").getFullList({
          filter: `kelas_id = "${currentKelas.id}"`,
          sort: "nama_siswa",
          requestKey: null,
        }),
      ]);

      const tpById = new Map(tpAll.map((t) => [t.id, t]));
      const lmById = new Map(lmAll.map((l) => [l.id, l]));
      const lmOrder = new Map(lmAll.map((l, i) => [l.id, i]));

      setExportProgress("Menyusun file Excel...");

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistem Penilaian ICT";
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

      const collator = new Intl.Collator("id", { numeric: true });
      const siswaSorted = [...siswaAll].sort((a, b) =>
        collator.compare(a.nama_siswa || "", b.nama_siswa || ""),
      );

      const ujianForExport = ujianSorted;

      for (let mi = 0; mi < mapel.length; mi++) {
        const m = mapel[mi];
        const mapelName = (m.nama_mapel || m.nama || "-").trim();
        const isKoding = m.kategori === KATEGORI_KODING;

        setExportProgress(
          `Menyusun sheet ${mi + 1}/${mapel.length}: ${mapelName}`,
        );
        await new Promise((r) => setTimeout(r, 0));

        const tps = tpAll.filter((t) => firstOf(t.mapel_id) === m.id);
        const lms = lmAll.filter((l) => firstOf(l.mapel_id) === m.id);
        const nf = nfAll.filter((n) => {
          const tp = tpById.get(firstOf(n.tp_id));
          return tp && firstOf(tp.mapel_id) === m.id;
        });
        const ns = nsAll.filter((n) => {
          const lm = lmById.get(firstOf(n.lm_id));
          return lm && firstOf(lm.mapel_id) === m.id;
        });
        const nu = nuAll.filter((n) => firstOf(n.mapel_id) === m.id);

        let maxTp = 0;
        tps.forEach((tp) => {
          const noTp = parseInt(String(tp.no_tp || "").replace(/\D/g, ""), 10);
          if (noTp && noTp > maxTp) maxTp = noTp;
        });

        const data = new Map();
        nf.forEach((n) => {
          const tp = tpById.get(firstOf(n.tp_id));
          if (!tp) return;
          const noTp = parseInt(String(tp.no_tp || "").replace(/\D/g, ""), 10);
          if (!noTp) return;
          const ks = [n.k1, n.k2, n.k3, n.k4].map(numOrNull);
          if (ks.every((v) => v === null)) return;
          const sid = firstOf(n.siswa_id);
          if (!data.has(sid)) data.set(sid, {});
          data.get(sid)[noTp] = ks;
        });

        const lmNameToOrder = new Map();
        lms.forEach((l) => {
          const nm = (l.nama || "-").trim();
          const ord = lmOrder.get(l.id) ?? 0;
          if (!lmNameToOrder.has(nm) || ord < lmNameToOrder.get(nm)) {
            lmNameToOrder.set(nm, ord);
          }
        });
        const lmNames = Array.from(lmNameToOrder.entries())
          .sort((a, b) => a[1] - b[1])
          .map((e) => e[0]);
        const maxLm = lmNames.length;

        const sData = new Map();
        ns.forEach((n) => {
          const lm = lmById.get(firstOf(n.lm_id));
          if (!lm) return;
          const nilai = numOrNull(n.nilai);
          if (nilai === null) return;
          const namaLm = (lm.nama || "-").trim();
          const sid = firstOf(n.siswa_id);
          if (!sData.has(sid)) sData.set(sid, {});
          sData.get(sid)[namaLm] = nilai;
        });

        const ujianData = new Map();
        nu.forEach((n) => {
          const ujianId = firstOf(n.pengaturan_ujian_id);
          const sid = firstOf(n.siswa_id);
          const nilai = numOrNull(n.nilai);
          if (nilai === null || !ujianId) return;
          if (!ujianData.has(sid)) ujianData.set(sid, {});
          ujianData.get(sid)[ujianId] = nilai;
        });
        const maxUjian = ujianForExport.length;

        const FIXED = 4;
        const tpEnd = FIXED + maxTp * 4;
        const sumatifStart = tpEnd + 1;
        const sumatifEnd = tpEnd + maxLm;
        const ujianStart = sumatifEnd + 1;
        const ujianEnd = sumatifEnd + maxUjian;
        const lastCol = ujianEnd;

        const sheet = workbook.addWorksheet(
          safeSheetName(mapelName, usedNames),
        );
        const h1 = sheet.getRow(1);
        const h2 = sheet.getRow(2);

        ["No", "NIS", "Nama Siswa", "Mapel"].forEach((label, c) => {
          sheet.mergeCells(1, c + 1, 2, c + 1);
          h1.getCell(c + 1).value = label;
          styleHead(h1.getCell(c + 1), CLR.GREEN);
          styleHead(h2.getCell(c + 1), CLR.GREEN);
        });

        if (isKoding) h1.getCell(4).value = "Mapel (KODING)";

        for (let t = 1; t <= maxTp; t++) {
          const startCol = FIXED + (t - 1) * 4 + 1;
          sheet.mergeCells(1, startCol, 1, startCol + 3);
          h1.getCell(startCol).value = `TP ${t}`;
          const argb = t % 2 === 0 ? CLR.GREEN_ALT : CLR.GREEN;
          for (let k = 0; k < 4; k++) {
            styleHead(h1.getCell(startCol + k), argb);
            h2.getCell(startCol + k).value = `K${k + 1}`;
            styleHead(h2.getCell(startCol + k), argb);
          }
        }

        if (maxLm > 0) {
          if (maxLm > 1) sheet.mergeCells(1, sumatifStart, 1, sumatifEnd);
          h1.getCell(sumatifStart).value = "SUMATIF";
          for (let l = 0; l < maxLm; l++) {
            styleHead(h1.getCell(sumatifStart + l), CLR.ORANGE);
            h2.getCell(sumatifStart + l).value = `LM ${l + 1}`;
            styleHead(h2.getCell(sumatifStart + l), CLR.ORANGE);
          }
        }

        if (maxUjian > 0) {
          if (maxUjian > 1) sheet.mergeCells(1, ujianStart, 1, ujianEnd);
          h1.getCell(ujianStart).value = "UJIAN";
          for (let n = 0; n < maxUjian; n++) {
            styleHead(h1.getCell(ujianStart + n), CLR.BLUE);
            h2.getCell(ujianStart + n).value =
              ujianForExport[n].nama_ujian || `Ujian ${n + 1}`;
            styleHead(h2.getCell(ujianStart + n), CLR.BLUE);
          }
        }

        h1.height = 22;
        h2.height = 26;

        if (maxLm > 0) {
          const titleRow = sheet.addRow([]);
          titleRow.getCell(3).value = "Lingkup Materi";
          titleRow.getCell(4).value = isKoding
            ? `${mapelName} [KODING]`
            : mapelName;
          lmNames.forEach((nm, l) => {
            titleRow.getCell(sumatifStart + l).value = nm;
          });
          for (let c = 1; c <= lastCol; c++) {
            const cell = titleRow.getCell(c);
            cell.font = { bold: true, size: 9 };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: CLR.YELLOW_LIGHT },
            };
            cell.alignment = {
              horizontal: c === 3 || c === 4 ? "left" : "center",
              vertical: "middle",
              wrapText: true,
            };
            cell.border = border;
          }
          titleRow.height = 42;
        }

        if (siswaSorted.length === 0) {
          const row = sheet.addRow([]);
          sheet.mergeCells(row.number, 1, row.number, lastCol);
          row.getCell(1).value = "Belum ada siswa di kelas ini.";
          row.getCell(1).font = { italic: true, color: { argb: "FF888888" } };
          row.getCell(1).alignment = {
            horizontal: "center",
            vertical: "middle",
          };
          row.getCell(1).border = border;
        } else {
          siswaSorted.forEach((siswa, idx) => {
            const perTp = data.get(siswa.id) || {};
            const perLm = sData.get(siswa.id) || {};
            const perUjian = ujianData.get(siswa.id) || {};
            const row = sheet.addRow([
              idx + 1,
              siswa.nis || "",
              siswa.nama_siswa,
              isKoding ? `${mapelName} [KODING]` : mapelName,
            ]);
            for (let t = 1; t <= maxTp; t++) {
              const ks = perTp[t] || [null, null, null, null];
              for (let k = 0; k < 4; k++) {
                row.getCell(FIXED + (t - 1) * 4 + k + 1).value = ks[k];
              }
            }
            lmNames.forEach((nm, l) => {
              row.getCell(sumatifStart + l).value = perLm[nm] ?? null;
            });
            ujianForExport.forEach((u, n) => {
              row.getCell(ujianStart + n).value = perUjian[u.id] ?? null;
            });
            for (let c = 1; c <= lastCol; c++) {
              const cell = row.getCell(c);
              cell.border = border;
              cell.alignment = {
                horizontal: c === 3 || c === 4 ? "left" : "center",
                vertical: "middle",
              };
            }
          });
        }

        sheet.getColumn(1).width = 6;
        sheet.getColumn(2).width = 14;
        sheet.getColumn(3).width = 28;
        sheet.getColumn(4).width = 26;
        for (let c = FIXED + 1; c <= tpEnd; c++) sheet.getColumn(c).width = 6;
        for (let c = sumatifStart; c <= sumatifEnd; c++)
          sheet.getColumn(c).width = 14;
        for (let c = ujianStart; c <= ujianEnd; c++)
          sheet.getColumn(c).width = 16;

        sheet.views = [{ state: "frozen", xSplit: 4, ySplit: 2 }];
      }

      setExportProgress("Membuat file...");
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(
        blob,
        `Nilai_Mentah_${currentKelas.nama_kelas}.xlsx`.replace(/\s+/g, "_"),
      );
    } catch (error) {
      console.error("Gagal export:", error);
      alert(
        "Gagal export. Pastikan package 'exceljs' dan 'file-saver' sudah terinstall.",
      );
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  }

  // ================================================================
  // IMPORT EXCEL SEMUA MAPEL (pakai logic yang sama seperti wali kelas)
  // ================================================================
  async function handleImportAllMapel(file) {
    if (!file || !currentKelas || mapel.length === 0) return;
    try {
      setImporting(true);
      setImportResult(null);
      setImportProgress("Membaca file...");

      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      setImportProgress("Menyiapkan data siswa...");

      const siswaAll = await pb.collection("siswa").getFullList({
        filter: `kelas_id = "${currentKelas.id}"`,
        requestKey: null,
      });
      const siswaByNis = new Map();
      const siswaByNama = new Map();
      siswaAll.forEach((s) => {
        const nis = normNis(s.nis);
        if (nis && !siswaByNis.has(nis)) siswaByNis.set(nis, s);
        const nm = normText(s.nama_siswa);
        if (nm && !siswaByNama.has(nm)) siswaByNama.set(nm, s);
      });
      const findSiswa = (nama, nis) => {
        const n = normNis(nis);
        if (n && siswaByNis.has(n)) return siswaByNis.get(n);
        const nm = normText(nama);
        return nm ? siswaByNama.get(nm) || null : null;
      };

      const mapelByKey = new Map();
      mapel.forEach((m) => {
        const k1 = normKey(m.nama_mapel || m.nama);
        const k2 = normKey(m.kode_mapel);
        if (k1) mapelByKey.set(k1, m);
        if (k2 && !mapelByKey.has(k2)) mapelByKey.set(k2, m);
      });

      const sheetSummaries = [];

      for (let i = 0; i < workbook.worksheets.length; i++) {
        const sheet = workbook.worksheets[i];
        const sheetName = String(sheet.name || "").trim();
        const cleanName = sheetName
          .replace(/[\s\-_]*[\(\[]?\s*koding\s*[\)\]]?/gi, " ")
          .replace(/\s+/g, " ")
          .trim();

        const key = normKey(cleanName);
        const keyFull = normKey(sheetName);

        let targetMapel = mapelByKey.get(key) || mapelByKey.get(keyFull);
        if (!targetMapel) {
          targetMapel = mapel.find((m) => {
            const nm = normKey(m.nama_mapel || m.nama);
            const kd = normKey(m.kode_mapel);
            return (
              (nm && (nm.includes(key) || key.includes(nm))) ||
              (kd && (kd.includes(key) || key.includes(kd)))
            );
          });
        }

        if (!targetMapel) {
          sheetSummaries.push({
            sheetName,
            status: "skipped",
            reason: "Tidak cocok dengan mapel manapun",
          });
          continue;
        }

        setImportProgress(
          `Memproses sheet ${i + 1}/${workbook.worksheets.length}: ${sheetName}`,
        );
        await new Promise((r) => setTimeout(r, 0));

        try {
          const summary = await processMapelSheet(
            sheet,
            targetMapel,
            findSiswa,
          );
          sheetSummaries.push({
            sheetName,
            mapelName: targetMapel.nama_mapel || targetMapel.nama,
            isKoding: targetMapel.kategori === KATEGORI_KODING,
            status: "ok",
            ...summary,
          });
        } catch (err) {
          console.error(`Gagal proses sheet ${sheetName}:`, err);
          sheetSummaries.push({
            sheetName,
            mapelName: targetMapel.nama_mapel || targetMapel.nama,
            isKoding: targetMapel.kategori === KATEGORI_KODING,
            status: "error",
            reason: err?.message || "Gagal memproses sheet",
          });
        }
      }

      const totalSaved = sheetSummaries.reduce(
        (acc, s) =>
          acc +
          (s.formatif?.saved || 0) +
          (s.sumatif?.saved || 0) +
          (s.ujian?.saved || 0),
        0,
      );
      const totalCleared = sheetSummaries.reduce(
        (acc, s) =>
          acc +
          (s.formatif?.cleared || 0) +
          (s.sumatif?.cleared || 0) +
          (s.ujian?.cleared || 0),
        0,
      );

      setImportResult({ totalSaved, totalCleared, sheets: sheetSummaries });
    } catch (error) {
      console.error("Gagal import:", error);
      alert("Gagal import: " + (error?.message || "File tidak valid"));
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  }

  async function processMapelSheet(sheet, targetMapel, findSiswa) {
    const result = {
      formatif: { saved: 0, skipped: 0, cleared: 0, created: 0, errors: [] },
      sumatif: { saved: 0, skipped: 0, cleared: 0, created: 0, errors: [] },
      ujian: { saved: 0, skipped: 0, cleared: 0, errors: [] },
    };

    const [tpList, lmList, nfAll, nsAll, nuAll] = await Promise.all([
      pb.collection("tujuan_pembelajaran").getFullList({
        filter: `mapel_id ~ "${targetMapel.id}" && kelas_id ~ "${currentKelas.id}"`,
        requestKey: null,
      }),
      pb.collection("lingkup_materi").getFullList({
        filter: `mapel_id ~ "${targetMapel.id}" && kelas_id ~ "${currentKelas.id}"`,
        sort: "created",
        requestKey: null,
      }),
      pb.collection("nilai_formatif").getFullList({
        filter: `kelas_id = "${currentKelas.id}"`,
        requestKey: null,
      }),
      pb.collection("nilai_sumatif").getFullList({
        filter: `kelas_id = "${currentKelas.id}"`,
        requestKey: null,
      }),
      pb.collection("nilai_ujian").getFullList({
        filter: `mapel_id ~ "${targetMapel.id}"`,
        requestKey: null,
      }),
    ]);

    const tpByNo = new Map();
    tpList.forEach((t) => {
      const no = String(t.no_tp || "")
        .trim()
        .toUpperCase();
      if (no) tpByNo.set(no, t);
    });
    const lmByName = new Map();
    lmList.forEach((l) => lmByName.set(normText(l.nama), l));
    const ujianByKey = new Map();
    ujianAktif.forEach((u) => {
      const k = normKey(u.nama_ujian);
      if (k && !ujianByKey.has(k)) ujianByKey.set(k, u);
    });

    const nfMap = {};
    nfAll.forEach((n) => {
      const tp = tpList.find((t) => t.id === firstOf(n.tp_id));
      if (!tp) return;
      const sid = firstOf(n.siswa_id);
      if (!nfMap[sid]) nfMap[sid] = {};
      nfMap[sid][tp.id] = {
        recordId: n.id,
        k1: n.k1 ?? -1,
        k2: n.k2 ?? -1,
        k3: n.k3 ?? -1,
        k4: n.k4 ?? -1,
      };
    });
    const nsMap = {};
    nsAll.forEach((n) => {
      const lm = lmList.find((l) => l.id === firstOf(n.lm_id));
      if (!lm) return;
      const sid = firstOf(n.siswa_id);
      if (!nsMap[sid]) nsMap[sid] = {};
      nsMap[sid][lm.id] = { recordId: n.id, nilai: n.nilai };
    });
    const nuMap = {};
    nuAll.forEach((n) => {
      const uid = firstOf(n.pengaturan_ujian_id);
      const sid = firstOf(n.siswa_id);
      if (!uid || !sid) return;
      if (!nuMap[uid]) nuMap[uid] = {};
      nuMap[uid][sid] = { recordId: n.id, nilai: n.nilai };
    });

    const h1 = sheet.getRow(1);
    const h2 = sheet.getRow(2);
    const h3 = sheet.getRow(3);

    let lastCol = 4;
    h1.eachCell({ includeEmpty: false }, (_, col) => {
      if (col > lastCol) lastCol = col;
    });
    h2.eachCell({ includeEmpty: false }, (_, col) => {
      if (col > lastCol) lastCol = col;
    });

    const colInfo = [];
    let currentGroup = null;
    for (let c = 5; c <= lastCol; c++) {
      const v1 = readCellString(h1.getCell(c));
      if (v1) currentGroup = v1;
      const v2 = readCellString(h2.getCell(c));
      const v3 = readCellString(h3.getCell(c));
      colInfo.push({ col: c, group: currentGroup, sub: v2, title: v3 });
    }

    const formatifCols = [];
    const sumatifCols = [];
    const ujianCols = [];

    for (const ci of colInfo) {
      if (!ci.group) continue;
      const g = String(ci.group).trim();
      const tpMatch = g.match(/^TP\s*(\d+)$/i);
      if (tpMatch) {
        const kField = String(ci.sub || "").toLowerCase();
        if (["k1", "k2", "k3", "k4"].includes(kField)) {
          formatifCols.push({
            col: ci.col,
            tpNo: `TP ${parseInt(tpMatch[1], 10)}`,
            kField,
          });
        }
      } else if (g.toUpperCase() === "SUMATIF") {
        const nm = ci.title || ci.sub;
        if (nm) sumatifCols.push({ col: ci.col, lmName: nm });
      } else if (g.toUpperCase() === "UJIAN") {
        if (ci.sub) ujianCols.push({ col: ci.col, ujianKey: normKey(ci.sub) });
      }
    }

    const c3 = readCellString(h3.getCell(3)).toLowerCase();
    const dataStartRow = c3.includes("lingkup") ? 4 : 3;

    const tpNeeded = new Set(formatifCols.map((c) => c.tpNo));
    for (const no of tpNeeded) {
      if (tpByNo.has(no.toUpperCase())) continue;
      try {
        const created = await pb
          .collection("tujuan_pembelajaran")
          .create(
            { no_tp: no, mapel_id: targetMapel.id, kelas_id: currentKelas.id },
            { requestKey: null },
          );
        tpByNo.set(no.toUpperCase(), created);
        result.formatif.created++;
      } catch (err) {
        result.formatif.errors.push(
          `Gagal buat ${no}: ${err?.message || "unknown"}`,
        );
      }
    }

    const lmColsResolved = [];
    for (const sc of sumatifCols) {
      const key = normText(sc.lmName);
      let lm = lmByName.get(key);
      if (!lm) {
        try {
          lm = await pb.collection("lingkup_materi").create(
            {
              nama: String(sc.lmName).trim(),
              mapel_id: targetMapel.id,
              kelas_id: currentKelas.id,
              guru_id: user?.id,
            },
            { requestKey: null },
          );
          lmByName.set(key, lm);
          result.sumatif.created++;
        } catch (err) {
          result.sumatif.errors.push(
            `Gagal buat LM "${sc.lmName}": ${err?.message || "unknown"}`,
          );
          continue;
        }
      }
      lmColsResolved.push({ col: sc.col, lm });
    }

    const ujianColsResolved = [];
    for (const uc of ujianCols) {
      const u = ujianByKey.get(uc.ujianKey);
      if (!u) {
        result.ujian.errors.push(
          `Ujian "${uc.ujianKey}" tidak ditemukan / belum aktif, kolom dilewati.`,
        );
        continue;
      }
      ujianColsResolved.push({ col: uc.col, ujian: u });
    }

    const colByTpK = new Map();
    formatifCols.forEach((c) => colByTpK.set(`${c.tpNo}|${c.kField}`, c.col));
    const uniqueTpNos = [...new Set(formatifCols.map((c) => c.tpNo))];

    const lastRow = sheet.rowCount;
    const tasks = [];

    for (let r = dataStartRow; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      const nama = readCellString(row.getCell(3));
      const nis = readCellString(row.getCell(2));
      if (!nama && !nis) continue;

      const siswa = findSiswa(nama, nis);
      if (!siswa) {
        result.formatif.errors.push(
          `Baris ${r}: siswa "${nama || nis}" tidak ditemukan.`,
        );
        continue;
      }

      // FORMATIF
      for (const tpNo of uniqueTpNos) {
        const tp = tpByNo.get(tpNo.toUpperCase());
        if (!tp) continue;
        const existing = nfMap[siswa.id]?.[tp.id];

        const payload = {
          k1: existing?.k1 ?? -1,
          k2: existing?.k2 ?? -1,
          k3: existing?.k3 ?? -1,
          k4: existing?.k4 ?? -1,
        };
        let hasChange = false;
        let anyExcelFilled = false;

        for (const kField of ["k1", "k2", "k3", "k4"]) {
          const col = colByTpK.get(`${tpNo}|${kField}`);
          if (!col) continue;
          const raw = readCellNumber(row.getCell(col));
          const excelFilled = raw !== null && raw >= 0 && raw <= 100;
          if (excelFilled) anyExcelFilled = true;
          const curVal = payload[kField];
          const curFilled = typeof curVal === "number" && curVal !== -1;

          if (excelFilled) {
            if (!curFilled) {
              payload[kField] = raw;
              hasChange = true;
            } else {
              result.formatif.skipped++;
            }
          } else {
            if (curFilled) {
              payload[kField] = -1;
              hasChange = true;
              result.formatif.cleared++;
            }
          }
        }

        if (!hasChange) continue;
        if (!existing?.recordId && !anyExcelFilled) continue;

        const anyExcelFilledCaptured = anyExcelFilled;
        tasks.push(async () => {
          try {
            let saved;
            if (existing?.recordId) {
              saved = await pb
                .collection("nilai_formatif")
                .update(existing.recordId, payload, { requestKey: null });
            } else {
              saved = await pb.collection("nilai_formatif").create(
                {
                  tp_id: tp.id,
                  siswa_id: siswa.id,
                  kelas_id: currentKelas.id,
                  ...payload,
                },
                { requestKey: null },
              );
            }
            if (!nfMap[siswa.id]) nfMap[siswa.id] = {};
            nfMap[siswa.id][tp.id] = { recordId: saved.id, ...payload };
            if (anyExcelFilledCaptured) result.formatif.saved++;
          } catch (err) {
            result.formatif.errors.push(
              `Baris ${r} ${tpNo}: ${err?.message || "gagal"}`,
            );
          }
        });
      }

      // SUMATIF
      for (const sc of lmColsResolved) {
        const raw = readCellNumber(row.getCell(sc.col));
        const excelFilled = raw !== null && raw >= 0 && raw <= 100;
        const existing = nsMap[siswa.id]?.[sc.lm.id];
        const curVal = existing?.nilai;
        const curFilled = typeof curVal === "number" && curVal !== -1;
        const lm = sc.lm;

        if (excelFilled) {
          if (curFilled) {
            result.sumatif.skipped++;
            continue;
          }
          tasks.push(async () => {
            try {
              let saved;
              if (existing?.recordId) {
                saved = await pb
                  .collection("nilai_sumatif")
                  .update(
                    existing.recordId,
                    { nilai: raw },
                    { requestKey: null },
                  );
              } else {
                saved = await pb.collection("nilai_sumatif").create(
                  {
                    lm_id: lm.id,
                    siswa_id: siswa.id,
                    kelas_id: currentKelas.id,
                    nilai: raw,
                  },
                  { requestKey: null },
                );
              }
              if (!nsMap[siswa.id]) nsMap[siswa.id] = {};
              nsMap[siswa.id][lm.id] = { recordId: saved.id, nilai: raw };
              result.sumatif.saved++;
            } catch (err) {
              result.sumatif.errors.push(
                `Baris ${r} "${lm.nama}": ${err?.message || "gagal"}`,
              );
            }
          });
        } else {
          if (curFilled && existing?.recordId) {
            tasks.push(async () => {
              try {
                await pb
                  .collection("nilai_sumatif")
                  .update(
                    existing.recordId,
                    { nilai: -1 },
                    { requestKey: null },
                  );
                nsMap[siswa.id][lm.id] = {
                  recordId: existing.recordId,
                  nilai: -1,
                };
                result.sumatif.cleared++;
              } catch (err) {
                result.sumatif.errors.push(
                  `Baris ${r} "${lm.nama}": ${err?.message || "gagal clear"}`,
                );
              }
            });
          }
        }
      }

      // UJIAN
      for (const uc of ujianColsResolved) {
        const raw = readCellNumber(row.getCell(uc.col));
        const excelFilled = raw !== null && raw >= 0 && raw <= 100;
        const existing = nuMap[uc.ujian.id]?.[siswa.id];
        const curVal = existing?.nilai;
        const curFilled = typeof curVal === "number" && curVal !== -1;
        const ujian = uc.ujian;

        if (excelFilled) {
          if (curFilled) {
            result.ujian.skipped++;
            continue;
          }
          tasks.push(async () => {
            try {
              let saved;
              if (existing?.recordId) {
                saved = await pb
                  .collection("nilai_ujian")
                  .update(
                    existing.recordId,
                    { nilai: raw },
                    { requestKey: null },
                  );
              } else {
                saved = await pb.collection("nilai_ujian").create(
                  {
                    siswa_id: siswa.id,
                    pengaturan_ujian_id: ujian.id,
                    mapel_id: targetMapel.id,
                    nilai: raw,
                  },
                  { requestKey: null },
                );
              }
              if (!nuMap[ujian.id]) nuMap[ujian.id] = {};
              nuMap[ujian.id][siswa.id] = { recordId: saved.id, nilai: raw };
              result.ujian.saved++;
            } catch (err) {
              result.ujian.errors.push(
                `Baris ${r} "${ujian.nama_ujian}": ${err?.message || "gagal"}`,
              );
            }
          });
        } else {
          if (curFilled && existing?.recordId) {
            tasks.push(async () => {
              try {
                await pb
                  .collection("nilai_ujian")
                  .update(
                    existing.recordId,
                    { nilai: -1 },
                    { requestKey: null },
                  );
                nuMap[ujian.id][siswa.id] = {
                  recordId: existing.recordId,
                  nilai: -1,
                };
                result.ujian.cleared++;
              } catch (err) {
                result.ujian.errors.push(
                  `Baris ${r} "${ujian.nama_ujian}": ${err?.message || "gagal clear"}`,
                );
              }
            });
          }
        }
      }
    }

    await runPool(tasks, 6);
    return result;
  }

  // ================================================================
  // RENDER
  // ================================================================
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-neutral-500">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-black" />
          <p className="mt-3 text-sm">Memuat daftar kelas...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      {/* Banner */}
      <div className="mb-5 w-full">
        <div className="relative overflow-hidden rounded-2xl bg-black p-6 text-white shadow-lg md:p-8">
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-white/5" />
          <div className="relative z-10">
            <span className="block text-xs font-semibold tracking-widest text-neutral-400">
              Panel ICT
            </span>
            <h1 className="mt-1 text-2xl font-extrabold tracking-wide md:text-3xl">
              Manajemen Nilai Semua Kelas
            </h1>
            <p className="mt-1 text-sm text-neutral-300">
              Pilih kelas, lalu kelola nilai per mata pelajaran. Export & import
              massal tersedia.
            </p>
          </div>
        </div>
      </div>

      {/* Pilih Kelas + Info + Export/Import */}
      <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        {/* Baris 1: pemilih kelas custom */}
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => geserKelas(-1)}
            disabled={kelasIdx <= 0}
            aria-label="Kelas sebelumnya"
            className="inline-flex h-12 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-300 bg-white text-neutral-700 transition hover:border-black hover:text-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <div
            ref={kelasWrapRef}
            className="relative min-w-0 flex-1 sm:max-w-md"
          >
            <button
              type="button"
              onClick={() => (kelasOpen ? tutupKelas() : bukaKelas())}
              disabled={kelasList.length === 0}
              aria-haspopup="listbox"
              aria-expanded={kelasOpen}
              className={`flex h-12 w-full items-center gap-3 rounded-xl border bg-white px-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-not-allowed disabled:bg-neutral-50 ${
                kelasOpen
                  ? "border-black ring-2 ring-black/10"
                  : "border-neutral-300 hover:border-black"
              }`}
            >
              <span className="flex h-7 min-w-7 flex-shrink-0 items-center justify-center rounded-md bg-black px-1.5 text-xs font-bold text-white">
                {kelasTerpilih?.tingkat ?? "-"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold leading-tight text-neutral-900">
                  {kelasTerpilih?.nama_kelas || "Pilih kelas"}
                </span>
                <span className="block text-[11px] leading-tight text-neutral-500">
                  {kelasList.length === 0
                    ? "Belum ada kelas"
                    : `Ganti kelas · ${kelasList.length} tersedia`}
                </span>
              </span>
              <svg
                className={`h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform duration-200 ${
                  kelasOpen ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {kelasOpen && (
              <>
                {/* Backdrop: gelap di HP, transparan di desktop */}
                <div
                  className="fixed inset-0 z-[60] bg-black/40 sm:bg-transparent"
                  onClick={tutupKelas}
                  aria-hidden="true"
                />

                {/* Panel: bottom sheet di HP, popover di desktop */}
                <div className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[80vh] flex-col overflow-hidden rounded-t-2xl border border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-full sm:min-w-[22rem] sm:rounded-2xl sm:pb-0">
                  {/* Header khusus HP */}
                  <div className="flex-shrink-0 sm:hidden">
                    <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-300" />
                    <div className="flex items-center justify-between px-4 pb-1 pt-2">
                      <h3 className="text-sm font-bold text-neutral-900">
                        Pilih kelas
                      </h3>
                      <button
                        type="button"
                        onClick={tutupKelas}
                        aria-label="Tutup"
                        className="-mr-1 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Pencarian */}
                  <div className="flex-shrink-0 border-b border-neutral-100 p-3">
                    <div className="relative">
                      <svg
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                        />
                      </svg>
                      <input
                        ref={kelasSearchRef}
                        type="text"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="daftar-kelas"
                        aria-activedescendant={
                          kelasFlat[activeIdx]
                            ? `kelas-opt-${kelasFlat[activeIdx].id}`
                            : undefined
                        }
                        value={searchKelas}
                        onChange={(e) => {
                          setSearchKelas(e.target.value);
                          setActiveIdx(0);
                        }}
                        onKeyDown={onKelasKeyDown}
                        placeholder="Cari kelas atau tingkat"
                        autoComplete="off"
                        className="h-11 w-full rounded-lg bg-neutral-100 pl-9 pr-9 text-base text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black/30 sm:text-sm"
                      />
                      {searchKelas && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchKelas("");
                            setActiveIdx(0);
                            kelasSearchRef.current?.focus();
                          }}
                          aria-label="Hapus pencarian"
                          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-300 text-[10px] text-neutral-700 hover:bg-neutral-400"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Daftar kelas */}
                  <div
                    id="daftar-kelas"
                    ref={kelasListRef}
                    role="listbox"
                    aria-label="Daftar kelas"
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 sm:max-h-80"
                  >
                    {kelasGroups.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <p className="text-sm font-semibold text-neutral-700">
                          Tidak ada kelas yang cocok
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">
                          Coba kata kunci lain.
                        </p>
                        {searchKelas && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchKelas("");
                              setActiveIdx(0);
                              kelasSearchRef.current?.focus();
                            }}
                            className="mt-3 inline-flex h-8 items-center rounded-lg border border-neutral-300 px-3 text-xs font-semibold text-neutral-800 hover:border-black"
                          >
                            Hapus pencarian
                          </button>
                        )}
                      </div>
                    ) : (
                      kelasGroups.map(([tingkat, items]) => (
                        <div
                          key={tingkat}
                          role="group"
                          aria-label={`Tingkat ${tingkat}`}
                        >
                          <div className="sticky top-0 z-10 bg-white/95 px-4 py-1.5 text-[11px] font-semibold text-neutral-500 backdrop-blur">
                            Tingkat {tingkat}
                            <span className="font-normal text-neutral-400">
                              {" "}
                              · {items.length} kelas
                            </span>
                          </div>
                          {items.map((k) => {
                            const idx = kelasIdxMap.get(k.id) ?? 0;
                            const isSelected = k.id === selectedKelasId;
                            const isActive = idx === activeIdx;
                            return (
                              <div
                                key={k.id}
                                id={`kelas-opt-${k.id}`}
                                role="option"
                                aria-selected={isSelected}
                                data-idx={idx}
                                onMouseEnter={() => setActiveIdx(idx)}
                                onClick={() => pilihKelas(k)}
                                className={`mx-2 flex min-h-[44px] scroll-mt-8 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm transition-colors ${
                                  isActive ? "bg-neutral-100" : ""
                                } ${
                                  isSelected
                                    ? "font-bold text-black"
                                    : "font-medium text-neutral-700"
                                }`}
                              >
                                <span className="truncate">{k.nama_kelas}</span>
                                {isSelected && (
                                  <svg
                                    className="h-4 w-4 flex-shrink-0 text-black"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Petunjuk keyboard (desktop) */}
                  <div className="hidden flex-shrink-0 border-t border-neutral-100 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-400 sm:block">
                    ↑ ↓ untuk bergerak · Enter untuk memilih · Esc untuk menutup
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => geserKelas(1)}
            disabled={kelasIdx < 0 || kelasIdx >= kelasList.length - 1}
            aria-label="Kelas berikutnya"
            className="inline-flex h-12 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-300 bg-white text-neutral-700 transition hover:border-black hover:text-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {/* Baris 2: info kelas + export/import */}
        {currentKelas && (
          <div className="mt-4 flex flex-col gap-3 border-t border-neutral-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-neutral-900">
                {currentKelas.nama_kelas}
              </h2>
              <p className="text-xs text-neutral-500">
                Tingkat {currentKelas.tingkat} · {mapel.length} mata pelajaran
                {ujianAktif.length > 0 && ` · ${ujianAktif.length} ujian aktif`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleImportAllMapel(file);
                }}
              />
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                disabled={importing || mapel.length === 0}
                className="inline-flex h-10 items-center justify-center gap-1.5 truncate rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 transition hover:border-black hover:bg-neutral-50 disabled:opacity-50"
              >
                {importing
                  ? importProgress || "Mengimpor..."
                  : "⬆ Import Semua Mapel"}
              </button>
              <button
                type="button"
                onClick={handleExportPerMapel}
                disabled={exporting || mapel.length === 0}
                className="inline-flex h-10 items-center justify-center gap-1.5 truncate rounded-lg bg-black px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {exporting
                  ? exportProgress || "Mengexport..."
                  : "⬇ Export Semua Mapel"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Grid Mapel */}
      {loadingMapel ? (
        <div className="flex min-h-[30vh] items-center justify-center text-neutral-500">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-black" />
            <p className="mt-3 text-sm">Memuat mata pelajaran...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mapel.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center">
              <p className="text-sm text-neutral-400">
                Belum ada mata pelajaran untuk kelas ini.
              </p>
            </div>
          ) : (
            mapel.map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  router.push(
                    `/ict/nilai-siswa/full-data/${currentKelas.id}/${item.id}`,
                  )
                }
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 pr-12 text-left shadow-sm transition-all duration-300 hover:border-black hover:bg-black hover:shadow-lg hover:shadow-neutral-400/40 active:scale-[0.98]"
              >
                <div className="flex items-start justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 transition-colors duration-300 group-hover:text-neutral-400">
                    {item.kode_mapel || "MPL"}
                  </span>
                  <span className="text-[10px] font-medium text-neutral-400 transition-colors duration-300 group-hover:text-neutral-400">
                    {currentKelas.nama_kelas?.split(" ")[0] || "Kelas"}
                  </span>
                </div>

                <h2 className="mt-2 text-lg font-extrabold tracking-wide text-neutral-900 transition-colors duration-300 group-hover:text-white">
                  {item.nama_mapel || item.nama}
                </h2>

                {item.kategori === KATEGORI_KODING && (
                  <span className="mt-2 inline-block rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors group-hover:bg-white group-hover:text-black">
                    Koding
                  </span>
                )}

                <hr className="my-3 border-neutral-100 transition-colors duration-300 group-hover:border-neutral-700" />

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-xs font-bold text-neutral-700 transition-colors duration-300 group-hover:border-neutral-600 group-hover:bg-neutral-800 group-hover:text-white">
                    {item.guru_pengampu !== "Belum ditentukan" &&
                    item.guru_pengampu !== "Walikelas"
                      ? item.guru_pengampu.substring(0, 2).toUpperCase()
                      : "G"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-neutral-400 transition-colors duration-300">
                      Guru Pengampu
                    </span>
                    <p className="truncate text-sm font-semibold text-neutral-700 transition-colors duration-300 group-hover:text-white">
                      {item.guru_pengampu}
                    </p>
                  </div>
                </div>

                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-300 transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-white">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Modal Hasil Import */}
      {importResult && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setImportResult(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-neutral-900">
                  Hasil import
                </h3>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {importResult.totalSaved} nilai tersimpan
                  {importResult.totalCleared > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-amber-600">
                        {importResult.totalCleared} nilai dikosongkan (-1)
                      </span>
                    </>
                  )}{" "}
                  dari{" "}
                  {importResult.sheets.filter((s) => s.status === "ok").length}{" "}
                  sheet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="-mr-1 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {importResult.sheets.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-neutral-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-neutral-900">
                        {s.mapelName || s.sheetName}
                        {s.isKoding && (
                          <span className="ml-1.5 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
                            Koding
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        Sheet: {s.sheetName}
                      </p>
                    </div>
                    {s.status === "ok" && (
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        <span className="rounded-md bg-neutral-900 px-1.5 py-0.5 font-bold text-white">
                          F: {s.formatif?.saved || 0}
                        </span>
                        <span className="rounded-md bg-neutral-300 px-1.5 py-0.5 font-bold text-neutral-900">
                          S: {s.sumatif?.saved || 0}
                        </span>
                        <span className="rounded-md border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-bold text-neutral-700">
                          U: {s.ujian?.saved || 0}
                        </span>
                      </div>
                    )}
                    {s.status === "skipped" && (
                      <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500">
                        Dilewati
                      </span>
                    )}
                    {s.status === "error" && (
                      <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        Error
                      </span>
                    )}
                  </div>
                  {s.status === "skipped" && (
                    <p className="mt-2 text-xs text-neutral-500">{s.reason}</p>
                  )}
                  {s.status === "error" && (
                    <p className="mt-2 text-xs text-red-600">{s.reason}</p>
                  )}
                  {["formatif", "sumatif", "ujian"].map((k) => {
                    const errs = s[k]?.errors || [];
                    if (errs.length === 0) return null;
                    return (
                      <div
                        key={k}
                        className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-red-100 bg-red-50 p-2"
                      >
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
                          {k} — {errs.length} peringatan
                        </p>
                        <ul className="space-y-0.5 text-[11px] text-red-600">
                          {errs.slice(0, 20).map((e, j) => (
                            <li key={j}>• {e}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-black px-4 text-xs font-semibold text-white transition-colors hover:bg-neutral-800"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
