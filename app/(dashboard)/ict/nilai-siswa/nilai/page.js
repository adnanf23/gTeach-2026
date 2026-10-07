"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// ================================================================
// KONFIGURASI
// ================================================================
const JENIS_UTS = "ahb";
const JENIS_UAS = "asas";

const TABS = [
  { id: "umum", label: "Umum" },
  { id: "vocab", label: "Vocab" },
  { id: "tahfizh", label: "Tahfizh" },
];

const URUTAN_MAPEL = ["matematika", "mtk", "inggris"];

// ================================================================
// UTIL
// ================================================================
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function average(arr) {
  const nums = arr.filter(
    (v) => typeof v === "number" && !isNaN(v) && v !== -1,
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatGrade(value) {
  if (value === null || value === undefined || isNaN(Number(value))) return "0";
  return Math.round(Number(value)).toString();
}

// Monokrom: nilai < 70 pakai teks abu tipis, sisanya hitam pekat.
// Tetap ada diferensiasi visual tanpa warna.
function getGradeColor(value) {
  if (value === null || value === undefined || isNaN(Number(value)))
    return "text-gray-300";
  return Number(value) < 70 ? "text-gray-400" : "text-gray-900";
}

function getKelasBadge(kelas) {
  if (!kelas) return "-";
  const nama = kelas.nama_kelas || "";
  const match = nama.match(/(\d+[A-Za-z]+)$/);
  if (match) return match[1].toUpperCase();
  const tingkat = kelas.tingkat || "";
  const firstChar = nama.replace(/\d+/g, "").trim().charAt(0) || "A";
  return `${tingkat}${firstChar}`;
}

function safeSheetName(name, used) {
  const base =
    String(name || "Kelas")
      .replace(/[\\/*?:\[\]]/g, "-")
      .trim()
      .slice(0, 31) || "Kelas";
  let final = base;
  let i = 2;
  while (used.has(final.toLowerCase())) {
    const suffix = ` (${i++})`;
    final = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(final.toLowerCase());
  return final;
}

function numOrNull(v) {
  return typeof v === "number" && !isNaN(v) && v !== -1 ? v : null;
}

function groupBy(arr, keyFn) {
  const m = new Map();
  arr.forEach((x) => {
    const k = keyFn(x);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  });
  return m;
}

// ================================================================
// PAGE
// ================================================================
export default function RekapNilaiPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [activeTab, setActiveTab] = useState("umum");

  const [kelasList, setKelasList] = useState([]);
  const [siswaCountMap, setSiswaCountMap] = useState({});
  const [loadingKelas, setLoadingKelas] = useState(true);

  const [selectedKelasId, setSelectedKelasId] = useState(null);

  const [search, setSearch] = useState("");
  const [filterTingkat, setFilterTingkat] = useState("");

  const [loadingLeger, setLoadingLeger] = useState(false);
  const [siswaList, setSiswaList] = useState([]);
  const [mapelList, setMapelList] = useState([]);
  const [nilaiAkhirMap, setNilaiAkhirMap] = useState({});
  const [exporting, setExporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [error, setError] = useState("");

  const selectedKelas = useMemo(
    () => kelasList.find((k) => k.id === selectedKelasId) || null,
    [kelasList, selectedKelasId],
  );

  // ================= LOAD KELAS =================
  useEffect(() => {
    async function loadKelas() {
      if (!user) {
        setLoadingKelas(false);
        return;
      }
      try {
        setLoadingKelas(true);
        const [kelasData, siswaData] = await Promise.all([
          pb.collection("kelas").getFullList({
            sort: "tingkat,nama_kelas",
            requestKey: null,
          }),
          pb.collection("siswa").getFullList({
            fields: "id,kelas_id",
            requestKey: null,
          }),
        ]);

        const countMap = {};
        siswaData.forEach((s) => {
          const kid = firstOf(s.kelas_id);
          if (kid) countMap[kid] = (countMap[kid] || 0) + 1;
        });

        setKelasList(kelasData);
        setSiswaCountMap(countMap);
      } catch (error) {
        if (!error?.isAbort) console.error("Gagal memuat kelas:", error);
      } finally {
        setLoadingKelas(false);
      }
    }
    loadKelas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tingkatOptions = useMemo(() => {
    const set = new Set(kelasList.map((k) => String(k.tingkat || "")));
    return Array.from(set)
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));
  }, [kelasList]);

  const filteredKelas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kelasList.filter((k) => {
      if (filterTingkat && String(k.tingkat) !== filterTingkat) return false;
      if (q && !(k.nama_kelas || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [kelasList, search, filterTingkat]);

  // ================= LOAD LEGER =================
  useEffect(() => {
    if (!selectedKelasId || kelasList.length === 0) return;
    if (activeTab !== "umum") return;

    const kelasData = kelasList.find((k) => k.id === selectedKelasId);
    if (!kelasData) return;

    let cancelled = false;

    async function loadLeger() {
      try {
        setLoadingLeger(true);
        setError("");
        setSiswaList([]);
        setMapelList([]);
        setNilaiAkhirMap({});

        const [siswaData, mapelKhusus, mapelTingkat, plotingData, ujianData] =
          await Promise.all([
            pb.collection("siswa").getFullList({
              filter: `kelas_id = "${kelasData.id}"`,
              sort: "nama_siswa",
              requestKey: null,
            }),
            pb.collection("mata_pelajaran").getFullList({
              filter: `spesifik_kelas_id ~ "${kelasData.id}"`,
              requestKey: null,
            }),
            pb.collection("mata_pelajaran").getFullList({
              filter: `target_tingkat ~ "${String(kelasData.tingkat)}"`,
              requestKey: null,
            }),
            pb.collection("ploting_guru").getFullList({
              filter: `kelas_id ~ "${kelasData.id}"`,
              expand: "guru_id",
              requestKey: null,
            }),
            pb.collection("pengaturan_ujian").getFullList({
              filter: `status_akses = "buka" && (target_kelas_id ~ "${kelasData.id}" || target_tingkat ~ "${String(kelasData.tingkat)}")`,
              requestKey: null,
            }),
          ]);

        if (cancelled) return;
        setSiswaList(siswaData);

        const combined = [...mapelKhusus, ...mapelTingkat];
        const uniqueMapelRaw = Array.from(
          new Map(combined.map((m) => [m.id, m])).values(),
        );

        const uniqueMapel = uniqueMapelRaw.filter((m) => {
          if ((m.kategori || "").toLowerCase() !== "umum") return false;
          const spesifik = m.spesifik_kelas_id;
          const punyaRestriksi = Array.isArray(spesifik) && spesifik.length > 0;
          if (!punyaRestriksi) return true;
          return spesifik.includes(kelasData.id);
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

        const mapelByName = new Map();
        uniqueMapel.forEach((m) => {
          const key = (m.nama_mapel || m.nama || "").trim();
          if (!mapelByName.has(key)) {
            mapelByName.set(key, m);
          } else {
            const existing = mapelByName.get(key);
            const existingGuru = guruMap.get(existing.id);
            const newGuru = guruMap.get(m.id);
            if (!existingGuru && newGuru) mapelByName.set(key, m);
          }
        });
        const deduplicatedMapel = Array.from(mapelByName.values());

        const sortedMapel = deduplicatedMapel
          .sort((a, b) =>
            (a.nama_mapel || a.nama || "").localeCompare(
              b.nama_mapel || b.nama || "",
            ),
          )
          .map((m) => ({
            ...m,
            guru_pengampu: guruMap.get(m.id) || "Walikelas",
          }));

        if (cancelled) return;
        setMapelList(sortedMapel);

        const utsIds = ujianData
          .filter((u) => u.jenis_ujian === JENIS_UTS)
          .map((u) => u.id);
        const uasIds = ujianData
          .filter((u) => u.jenis_ujian === JENIS_UAS)
          .map((u) => u.id);

        let nilaiUjianData = [];
        if (ujianData.length > 0) {
          const ujianFilter = ujianData
            .map((u) => `pengaturan_ujian_id = "${u.id}"`)
            .join(" || ");
          nilaiUjianData = await pb.collection("nilai_ujian").getFullList({
            filter: ujianFilter,
            requestKey: null,
          });
        }
        if (cancelled) return;

        const ujianMap = {};
        nilaiUjianData.forEach((n) => {
          if (!ujianMap[n.pengaturan_ujian_id])
            ujianMap[n.pengaturan_ujian_id] = {};
          ujianMap[n.pengaturan_ujian_id][n.siswa_id] = n.nilai;
        });

        function avgUjian(ids, siswaId) {
          const vals = ids
            .map((uid) => ujianMap[uid]?.[siswaId])
            .filter((v) => typeof v === "number" && !isNaN(v) && v !== -1);
          return average(vals);
        }
        const utsAvgMap = {};
        const uasAvgMap = {};
        siswaData.forEach((s) => {
          utsAvgMap[s.id] = avgUjian(utsIds, s.id);
          uasAvgMap[s.id] = avgUjian(uasIds, s.id);
        });

        let tpAll = [];
        let lpAll = [];
        if (sortedMapel.length > 0) {
          const mapelFilter = sortedMapel
            .map((m) => `mapel_id ~ "${m.id}"`)
            .join(" || ");
          [tpAll, lpAll] = await Promise.all([
            pb.collection("tujuan_pembelajaran").getFullList({
              filter: `(${mapelFilter}) && kelas_id ~ "${kelasData.id}"`,
              requestKey: null,
            }),
            pb.collection("lingkup_materi").getFullList({
              filter: `(${mapelFilter}) && kelas_id ~ "${kelasData.id}"`,
              requestKey: null,
            }),
          ]);
        }
        if (cancelled) return;

        const tpToMapel = {};
        tpAll.forEach((tp) => {
          tpToMapel[tp.id] = tp.mapel_id;
        });
        const lpToMapel = {};
        lpAll.forEach((lp) => {
          lpToMapel[lp.id] = lp.mapel_id;
        });

        const [nfData, nsData] = await Promise.all([
          pb.collection("nilai_formatif").getFullList({
            filter: `kelas_id = "${kelasData.id}"`,
            requestKey: null,
          }),
          pb.collection("nilai_sumatif").getFullList({
            filter: `kelas_id = "${kelasData.id}"`,
            requestKey: null,
          }),
        ]);
        if (cancelled) return;

        const formatifValues = {};
        nfData.forEach((n) => {
          const mapelId = tpToMapel[n.tp_id];
          if (!mapelId) return;
          if (!formatifValues[mapelId]) formatifValues[mapelId] = {};
          if (!formatifValues[mapelId][n.siswa_id])
            formatifValues[mapelId][n.siswa_id] = [];
          ["k1", "k2", "k3", "k4"].forEach((k) => {
            const val = n[k];
            if (typeof val === "number" && !isNaN(val) && val !== -1) {
              formatifValues[mapelId][n.siswa_id].push(val);
            }
          });
        });

        const sumatifValues = {};
        nsData.forEach((n) => {
          const mapelId = lpToMapel[n.lm_id];
          if (!mapelId) return;
          if (!sumatifValues[mapelId]) sumatifValues[mapelId] = {};
          if (!sumatifValues[mapelId][n.siswa_id])
            sumatifValues[mapelId][n.siswa_id] = [];
          if (
            typeof n.nilai === "number" &&
            !isNaN(n.nilai) &&
            n.nilai !== -1
          ) {
            sumatifValues[mapelId][n.siswa_id].push(n.nilai);
          }
        });

        const nilaiAkhir = {};
        sortedMapel.forEach((m) => {
          nilaiAkhir[m.id] = {};
          siswaData.forEach((s) => {
            const formatifAvg = average(formatifValues[m.id]?.[s.id] || []);
            const sumatifAvg = average(sumatifValues[m.id]?.[s.id] || []);
            const utsVal = utsAvgMap[s.id];
            const uasVal = uasAvgMap[s.id];

            const komponen = [formatifAvg, sumatifAvg, utsVal, uasVal].filter(
              (v) => v !== null && v !== undefined && !isNaN(v) && v !== -1,
            );

            if (komponen.length === 0) {
              nilaiAkhir[m.id][s.id] = null;
              return;
            }
            nilaiAkhir[m.id][s.id] =
              komponen.reduce((a, b) => a + b, 0) / komponen.length;
          });
        });

        if (cancelled) return;
        setNilaiAkhirMap(nilaiAkhir);
      } catch (err) {
        if (!err?.isAbort) {
          console.error("Gagal memuat data leger:", err);
          if (!cancelled) setError("Gagal memuat data leger kelas ini.");
        }
      } finally {
        if (!cancelled) setLoadingLeger(false);
      }
    }

    loadLeger();

    return () => {
      cancelled = true;
    };
  }, [selectedKelasId, kelasList, activeTab]);

  // ================= JUMLAH, RATA-RATA, RANK =================
  const { jumlahMap, rataRataMap, rankMap } = useMemo(() => {
    const jumlah = {};
    const rata = {};
    siswaList.forEach((s) => {
      let sum = 0;
      let count = 0;
      mapelList.forEach((m) => {
        const v = nilaiAkhirMap[m.id]?.[s.id];
        if (typeof v === "number" && !isNaN(v)) {
          sum += v;
          count++;
        }
      });
      jumlah[s.id] = count > 0 ? sum : null;
      rata[s.id] = count > 0 ? sum / count : null;
    });

    const sorted = [...siswaList]
      .filter((s) => rata[s.id] !== null)
      .sort((a, b) => rata[b.id] - rata[a.id]);
    const rank = {};
    sorted.forEach((s, idx) => {
      rank[s.id] = idx + 1;
    });
    siswaList.forEach((s) => {
      if (rank[s.id] === undefined) rank[s.id] = sorted.length + 1;
    });

    return { jumlahMap: jumlah, rataRataMap: rata, rankMap: rank };
  }, [siswaList, mapelList, nilaiAkhirMap]);

  const mapelStats = useMemo(() => {
    const stats = {};
    mapelList.forEach((m) => {
      const vals = siswaList
        .map((s) => nilaiAkhirMap[m.id]?.[s.id])
        .filter((v) => typeof v === "number" && !isNaN(v));
      stats[m.id] = {
        rata: vals.length
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : null,
        tertinggi: vals.length ? Math.max(...vals) : null,
        terendah: vals.length ? Math.min(...vals) : null,
      };
    });
    return stats;
  }, [mapelList, siswaList, nilaiAkhirMap]);

  // ================= EXPORT LEGER (SINGLE KELAS) =================
  async function handleExportLeger() {
    if (!selectedKelas) return;
    try {
      setExporting(true);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistem Penilaian";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet(`LEGER ${selectedKelas.nama_kelas}`, {
        properties: { tabColor: { argb: "FF111827" } },
      });

      // Warna monokrom untuk Excel
      const HEADER_MAPEL = "FFF3F4F6"; // abu terang
      const HEADER_SUM = "FFE5E7EB"; // abu medium
      const HEADER_RANK = "FFD1D5DB"; // abu lebih gelap
      const HEADER_MAIN = "FF111827"; // hitam (judul kolom tetap)
      const SUMMARY_ROW = "FFE5E7EB";

      function addBorder(cell) {
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
      }
      function fillCell(cell, argb) {
        if (!argb) return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      }
      function styleHeader(cell, argb, horizontal = "center") {
        fillCell(cell, argb);
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal, vertical: "middle", wrapText: true };
        addBorder(cell);
      }
      function styleBody(cell, argb, horizontal = "center") {
        fillCell(cell, argb);
        cell.alignment = { horizontal, vertical: "middle" };
        addBorder(cell);
      }

      const totalCols = 2 + mapelList.length + 3;
      const colJumlah = 3 + mapelList.length;
      const colRata = colJumlah + 1;
      const colRank = colRata + 1;

      function fillForColumn(colNumber) {
        if (colNumber >= 3 && colNumber < colJumlah) return HEADER_MAPEL;
        if (colNumber === colJumlah || colNumber === colRata) return HEADER_SUM;
        if (colNumber === colRank) return HEADER_RANK;
        return null;
      }

      sheet.mergeCells(1, 1, 1, totalCols);
      const title = sheet.getCell(1, 1);
      title.value = `LEGER NILAI RAPOR - ${selectedKelas.nama_kelas} TAHUN AJARAN 2026/2027`;
      title.font = { bold: true, size: 14 };
      title.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(1).height = 26;

      sheet.addRow([]);

      const headerRow = sheet.addRow([]);
      headerRow.getCell(1).value = "No";
      headerRow.getCell(2).value = "NAMA";
      let col = 3;
      mapelList.forEach((m) => {
        headerRow.getCell(col).value = `${m.nama_mapel || m.nama}`;
        col++;
      });
      headerRow.getCell(colJumlah).value = "JUMLAH";
      headerRow.getCell(colRata).value = "RATA RATA";
      headerRow.getCell(colRank).value = "RANK";

      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const horiz = colNumber === 2 ? "left" : "center";
        styleHeader(cell, fillForColumn(colNumber), horiz);
      });
      headerRow.height = 40;

      siswaList.forEach((siswa, idx) => {
        const row = sheet.addRow([]);
        row.getCell(1).value = idx + 1;
        row.getCell(2).value = siswa.nama_siswa;

        let c = 3;
        mapelList.forEach((m) => {
          const v = nilaiAkhirMap[m.id]?.[siswa.id];
          row.getCell(c).value =
            typeof v === "number" && !isNaN(v) ? Math.round(v) : 0;
          c++;
        });

        const jml = jumlahMap[siswa.id];
        const rata = rataRataMap[siswa.id];
        row.getCell(colJumlah).value = jml !== null ? Math.round(jml) : 0;
        row.getCell(colRata).value = rata !== null ? Math.round(rata) : 0;
        row.getCell(colRank).value = rankMap[siswa.id] ?? 0;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const horiz = colNumber === 2 ? "left" : "center";
          styleBody(cell, fillForColumn(colNumber), horiz);
        });
      });

      function addSummaryRow(label, valueFn) {
        const row = sheet.addRow([]);
        sheet.mergeCells(row.number, 1, row.number, 2);
        row.getCell(1).value = label;

        let c = 3;
        mapelList.forEach((m) => {
          const v = valueFn(m);
          row.getCell(c).value =
            v !== null && v !== undefined ? Math.round(v) : 0;
          c++;
        });

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          styleBody(cell, SUMMARY_ROW);
          if (colNumber === 1) cell.font = { bold: true };
        });
      }
      addSummaryRow("Nilai Rata-Rata", (m) => mapelStats[m.id]?.rata);
      addSummaryRow("Nilai Tertinggi", (m) => mapelStats[m.id]?.tertinggi);
      addSummaryRow("Nilai Terendah", (m) => mapelStats[m.id]?.terendah);

      sheet.getColumn(1).width = 6;
      sheet.getColumn(2).width = 28;
      for (let i = 3; i < colJumlah; i++) sheet.getColumn(i).width = 10;
      sheet.getColumn(colJumlah).width = 8;
      sheet.getColumn(colRata).width = 8;
      sheet.getColumn(colRank).width = 6;

      sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(
        blob,
        `Leger_${selectedKelas.nama_kelas}.xlsx`.replace(/\s+/g, "_"),
      );
    } catch (error) {
      console.error("Gagal export leger:", error);
      alert(
        "Gagal export. Pastikan package 'exceljs' dan 'file-saver' sudah terinstall.",
      );
    } finally {
      setExporting(false);
    }
  }

  // ================= EXPORT NILAI MENTAH =================
  async function handleExportSemuaMentah() {
    if (kelasList.length === 0) return;
    try {
      setExportingAll(true);
      setExportProgress("Mengambil data...");

      const [siswaAll, mapelAll, tpAll, lmAll, nfAll, nsAll] =
        await Promise.all([
          pb
            .collection("siswa")
            .getFullList({ sort: "nama_siswa", requestKey: null }),
          pb.collection("mata_pelajaran").getFullList({ requestKey: null }),
          pb
            .collection("tujuan_pembelajaran")
            .getFullList({ requestKey: null }),
          pb
            .collection("lingkup_materi")
            .getFullList({ sort: "created", requestKey: null }),
          pb.collection("nilai_formatif").getFullList({ requestKey: null }),
          pb.collection("nilai_sumatif").getFullList({ requestKey: null }),
        ]);

      const mapelById = new Map(mapelAll.map((m) => [m.id, m]));
      const tpById = new Map(tpAll.map((t) => [t.id, t]));
      const lmById = new Map(lmAll.map((l) => [l.id, l]));
      const lmOrder = new Map(lmAll.map((l, i) => [l.id, i]));

      const siswaByKelas = groupBy(siswaAll, (s) => firstOf(s.kelas_id));
      const nfByKelas = groupBy(nfAll, (n) => firstOf(n.kelas_id));
      const nsByKelas = groupBy(nsAll, (n) => firstOf(n.kelas_id));

      const masterIdx = new Map();
      mapelAll.forEach((m, i) => {
        const nm = (m.nama_mapel || m.nama || "").trim();
        if (!masterIdx.has(nm)) masterIdx.set(nm, i);
      });
      const rankMapel = (nm) => {
        const low = nm.toLowerCase();
        const idx = URUTAN_MAPEL.findIndex((k) => low.includes(k));
        return idx === -1 ? 1000 : idx;
      };

      const collator = new Intl.Collator("id", { numeric: true });
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
      // Monokrom
      const HEAD_TP_A = "FFE5E7EB";
      const HEAD_TP_B = "FFF3F4F6";
      const HEAD_SUM = "FFD1D5DB";
      const ROW_TITLE = "FFF3F4F6";

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

      for (let i = 0; i < kelasList.length; i++) {
        const kelas = kelasList[i];
        setExportProgress(
          `Menyusun sheet ${i + 1}/${kelasList.length}: ${kelas.nama_kelas}`,
        );
        await new Promise((r) => setTimeout(r, 0));

        const sheet = workbook.addWorksheet(
          safeSheetName(kelas.nama_kelas, usedNames),
        );
        const siswaKelas = siswaByKelas.get(kelas.id) || [];
        const nfKelas = nfByKelas.get(kelas.id) || [];
        const nsKelas = nsByKelas.get(kelas.id) || [];

        const data = new Map();
        let maxTp = 1;
        nfKelas.forEach((n) => {
          const tp = tpById.get(firstOf(n.tp_id));
          if (!tp) return;
          const mapel = mapelById.get(firstOf(tp.mapel_id));
          if (!mapel) return;
          const noTp = parseInt(String(tp.no_tp || "").replace(/\D/g, ""), 10);
          if (!noTp) return;

          const namaMapel = (mapel.nama_mapel || mapel.nama || "-").trim();
          const ks = [n.k1, n.k2, n.k3, n.k4].map(numOrNull);
          if (ks.every((v) => v === null)) return;

          if (!data.has(namaMapel)) data.set(namaMapel, new Map());
          const perSiswa = data.get(namaMapel);
          const sid = firstOf(n.siswa_id);
          if (!perSiswa.has(sid)) perSiswa.set(sid, {});
          perSiswa.get(sid)[noTp] = ks;
          if (noTp > maxTp) maxTp = noTp;
        });

        const sData = new Map();
        nsKelas.forEach((n) => {
          const lm = lmById.get(firstOf(n.lm_id));
          if (!lm) return;
          const mapel = mapelById.get(firstOf(lm.mapel_id));
          if (!mapel) return;
          const nilai = numOrNull(n.nilai);
          if (nilai === null) return;

          const namaMapel = (mapel.nama_mapel || mapel.nama || "-").trim();
          const namaLm = (lm.nama || "-").trim();
          if (!sData.has(namaMapel)) {
            sData.set(namaMapel, { order: new Map(), perSiswa: new Map() });
          }
          const entry = sData.get(namaMapel);
          const ord = lmOrder.get(lm.id) ?? 0;
          if (!entry.order.has(namaLm) || ord < entry.order.get(namaLm)) {
            entry.order.set(namaLm, ord);
          }
          const sid = firstOf(n.siswa_id);
          if (!entry.perSiswa.has(sid)) entry.perSiswa.set(sid, {});
          entry.perSiswa.get(sid)[namaLm] = nilai;
        });

        const lmNamesByMapel = new Map();
        let maxLm = 0;
        sData.forEach((entry, nm) => {
          const names = Array.from(entry.order.entries())
            .sort((a, b) => a[1] - b[1])
            .map((e) => e[0]);
          lmNamesByMapel.set(nm, names);
          if (names.length > maxLm) maxLm = names.length;
        });

        const mapelNames = Array.from(
          new Set([...data.keys(), ...sData.keys()]),
        ).sort(
          (a, b) =>
            rankMapel(a) - rankMapel(b) ||
            (masterIdx.get(a) ?? 0) - (masterIdx.get(b) ?? 0),
        );

        const FIXED = 4;
        const tpEnd = FIXED + maxTp * 4;
        const lastCol = tpEnd + maxLm;
        const h1 = sheet.getRow(1);
        const h2 = sheet.getRow(2);

        ["No", "NIS", "Nama Siswa", "Mapel"].forEach((label, c) => {
          sheet.mergeCells(1, c + 1, 2, c + 1);
          h1.getCell(c + 1).value = label;
          styleHead(h1.getCell(c + 1), HEAD_TP_A);
          styleHead(h2.getCell(c + 1), HEAD_TP_A);
        });
        for (let t = 1; t <= maxTp; t++) {
          const startCol = FIXED + (t - 1) * 4 + 1;
          sheet.mergeCells(1, startCol, 1, startCol + 3);
          h1.getCell(startCol).value = `TP ${t}`;
          const argb = t % 2 === 0 ? HEAD_TP_B : HEAD_TP_A;
          for (let k = 0; k < 4; k++) {
            styleHead(h1.getCell(startCol + k), argb);
            h2.getCell(startCol + k).value = `K${k + 1}`;
            styleHead(h2.getCell(startCol + k), argb);
          }
        }
        if (maxLm > 0) {
          const s = tpEnd + 1;
          if (maxLm > 1) sheet.mergeCells(1, s, 1, lastCol);
          h1.getCell(s).value = "SUMATIF";
          for (let l = 0; l < maxLm; l++) {
            styleHead(h1.getCell(s + l), HEAD_SUM);
            h2.getCell(s + l).value = `LM ${l + 1}`;
            styleHead(h2.getCell(s + l), HEAD_SUM);
          }
        }
        h1.height = 22;
        h2.height = 20;

        const targetMapel = mapelNames.length > 0 ? mapelNames : ["-"];
        const siswaSorted = [...siswaKelas].sort((a, b) =>
          collator.compare(a.nama_siswa || "", b.nama_siswa || ""),
        );

        targetMapel.forEach((namaMapel) => {
          const lmNames = lmNamesByMapel.get(namaMapel) || [];

          if (lmNames.length > 0) {
            const titleRow = sheet.addRow([]);
            titleRow.getCell(3).value = "Lingkup Materi";
            titleRow.getCell(4).value = namaMapel;
            lmNames.forEach((nm, l) => {
              titleRow.getCell(tpEnd + l + 1).value = nm;
            });
            for (let c = 1; c <= lastCol; c++) {
              const cell = titleRow.getCell(c);
              cell.font = { bold: true, size: 9 };
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: ROW_TITLE },
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

          siswaSorted.forEach((siswa, idx) => {
            const perTp = data.get(namaMapel)?.get(siswa.id) || {};
            const perLm = sData.get(namaMapel)?.perSiswa.get(siswa.id) || {};
            const row = sheet.addRow([
              idx + 1,
              siswa.nis || "",
              siswa.nama_siswa,
              namaMapel,
            ]);
            for (let t = 1; t <= maxTp; t++) {
              const ks = perTp[t] || [null, null, null, null];
              for (let k = 0; k < 4; k++) {
                row.getCell(FIXED + (t - 1) * 4 + k + 1).value = ks[k];
              }
            }
            lmNames.forEach((nm, l) => {
              row.getCell(tpEnd + l + 1).value = perLm[nm] ?? null;
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
        });

        sheet.getColumn(1).width = 6;
        sheet.getColumn(2).width = 14;
        sheet.getColumn(3).width = 28;
        sheet.getColumn(4).width = 26;
        for (let c = FIXED + 1; c <= tpEnd; c++) sheet.getColumn(c).width = 6;
        for (let c = tpEnd + 1; c <= lastCol; c++)
          sheet.getColumn(c).width = 14;

        sheet.views = [{ state: "frozen", xSplit: 4, ySplit: 2 }];
        sheet.autoFilter = {
          from: { row: 2, column: 1 },
          to: { row: 2, column: lastCol },
        };
      }

      setExportProgress("Membuat file...");
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, "Nilai_Mentah_Semua_Kelas.xlsx");
    } catch (error) {
      console.error("Gagal export nilai mentah:", error);
      alert(
        "Gagal export nilai mentah semua kelas. Cek console untuk detailnya.",
      );
    } finally {
      setExportingAll(false);
      setExportProgress("");
    }
  }

  // ================= RENDER =================
  if (loadingKelas) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-gray-900" />
          <p className="mt-3 text-sm">Memuat data kelas...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="py-8 lg:p-10 space-y-6 max-w-full mx-auto px-4">
      {/* ============ HEADER ============ */}
      <div>
        <div className="relative overflow-hidden bg-gradient-to-r from-gray-800 via-gray-900 to-black text-white rounded-3xl p-6 md:p-8 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="absolute right-0 bottom-0 w-80 h-80 bg-white/5 rounded-full translate-x-10 translate-y-20 pointer-events-none" />
          <div className="relative z-10 space-y-1">
            <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold block">
              Rekap Nilai
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide uppercase">
              Rekap Nilai Semua Kelas
            </h1>
            <p className="text-sm text-gray-300">
              Lihat dan export leger nilai semua kelas dalam satu halaman.
            </p>
          </div>
        </div>

        <div className="mt-6 border-b border-gray-200">
          <nav className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedKelasId(null);
                    setSearch("");
                    setFilterTingkat("");
                  }}
                  className={`px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    active
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ============ TAB UMUM ============ */}
      {activeTab === "umum" && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => setSelectedKelasId(null)}
              className={
                selectedKelas
                  ? "hover:text-slate-600 cursor-pointer"
                  : "text-slate-600 font-medium"
              }
            >
              Pilih Kelas
            </button>
            {selectedKelas && (
              <>
                <span>/</span>
                <span className="text-slate-600 font-medium">
                  {selectedKelas.nama_kelas}
                </span>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm text-zinc-800">
              {error}
            </div>
          )}

          {/* ============ STEP 1: PILIH KELAS ============ */}
          {!selectedKelas && (
            <>
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="mb-1 text-lg font-bold text-slate-800">
                    Pilih Kelas
                  </h1>
                  <p className="text-xs text-slate-500">
                    Pilih kelas untuk melihat dan mengexport leger nilainya.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportSemuaMentah}
                  disabled={exportingAll || kelasList.length === 0}
                  className="bg-gray-900 hover:bg-black disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap inline-flex items-center gap-2 self-start md:self-center"
                >
                  {exportingAll
                    ? exportProgress || "Mengexport..."
                    : "⬇ Export Nilai Mentah Semua Kelas"}
                </button>
              </div>

              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                    />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama kelas..."
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 transition"
                  />
                </div>

                <div className="sm:w-56">
                  <select
                    value={filterTingkat}
                    onChange={(e) => setFilterTingkat(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 transition"
                  >
                    <option value="">Semua Tingkat</option>
                    {tingkatOptions.map((t) => (
                      <option key={t} value={t}>
                        Tingkat {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredKelas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-sm">
                  {kelasList.length === 0
                    ? "Belum ada kelas terdaftar."
                    : "Tidak ada kelas yang cocok dengan pencarian/filter."}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredKelas.map((kelas) => (
                    <button
                      key={kelas.id}
                      type="button"
                      onClick={() => setSelectedKelasId(kelas.id)}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-gray-900 hover:shadow-lg hover:shadow-gray-300 hover:bg-gray-900 active:scale-[0.98]"
                    >
                      <h3 className="text-base font-semibold text-slate-900 group-hover:text-white transition-colors duration-300">
                        {kelas.nama_kelas}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 group-hover:text-gray-300 transition-colors duration-300">
                        <span className="flex items-center gap-1">
                          <svg
                            className="w-3.5 h-3.5 text-slate-400 group-hover:text-gray-400 transition-colors duration-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2"
                            />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          Tingkat {kelas.tingkat}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg
                            className="w-3.5 h-3.5 text-slate-400 group-hover:text-gray-400 transition-colors duration-300"
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
                          {siswaCountMap[kelas.id] || 0} siswa
                        </span>
                      </div>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-white group-hover:translate-x-1.5 transition-all duration-300">
                        <svg
                          className="w-5 h-5"
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
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                      <div className="absolute top-3 right-12 text-[10px] font-medium text-slate-400 group-hover:text-gray-400 transition-colors duration-300">
                        {getKelasBadge(kelas)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ============ STEP 2: LEGER ============ */}
          {selectedKelas && (
            <>
              <div className="bg-white rounded-lg shadow-md p-4 md:p-6 border border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-gray-800">
                      REKAP NILAI LEGER — {selectedKelas.nama_kelas}
                    </h2>
                    <p className="text-xs text-gray-500">
                      Download file Excel nilai leger kelas ini yang tersedia
                      secara realtime.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 self-start md:self-center">
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap inline-flex items-center gap-1.5"
                    >
                      ← Kembali
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedKelasId(null)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap inline-flex items-center gap-1.5"
                    >
                      🔄 Ganti Kelas
                    </button>
                    <button
                      onClick={handleExportLeger}
                      disabled={
                        exporting || mapelList.length === 0 || loadingLeger
                      }
                      className="bg-gray-900 hover:bg-black disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap inline-flex items-center gap-2"
                    >
                      {exporting ? "Mengexport..." : "⬇ Export Excel"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
                {loadingLeger ? (
                  <div className="p-10 text-center text-gray-400">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-gray-900" />
                    <p className="mt-3 text-sm">Memuat data leger...</p>
                  </div>
                ) : mapelList.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 font-medium text-sm">
                    Belum ada mata pelajaran umum untuk kelas ini.
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-gray-700 uppercase tracking-wider">
                        <th className="px-2 py-2 font-bold sticky left-0 z-20 bg-gray-100 border border-gray-200 min-w-[36px]">
                          No
                        </th>
                        <th className="px-3 py-2 font-bold sticky left-[36px] z-20 bg-gray-100 border border-gray-200 min-w-[160px] text-left">
                          Nama
                        </th>
                        {mapelList.map((m) => (
                          <th
                            key={m.id}
                            className="px-2 py-2 font-bold border border-gray-200 bg-zinc-100 min-w-[80px]"
                          >
                            <div>{m.nama_mapel || m.nama}</div>
                            <div className="text-[10px] font-normal normal-case text-gray-500">
                              {m.guru_pengampu}
                            </div>
                          </th>
                        ))}
                        <th className="px-2 py-2 font-bold border border-gray-200 bg-zinc-200 min-w-[70px]">
                          Jumlah
                        </th>
                        <th className="px-2 py-2 font-bold border border-gray-200 bg-zinc-200 min-w-[70px]">
                          Rata Rata
                        </th>
                        <th className="px-2 py-2 font-bold border border-gray-200 bg-zinc-300 min-w-[50px]">
                          Rank
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {siswaList.length === 0 ? (
                        <tr>
                          <td
                            colSpan={mapelList.length + 5}
                            className="p-6 text-center text-gray-400"
                          >
                            Belum ada siswa di kelas ini.
                          </td>
                        </tr>
                      ) : (
                        siswaList.map((siswa, idx) => {
                          const rowBg =
                            idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                          const rata = rataRataMap[siswa.id];
                          return (
                            <tr key={siswa.id} className={rowBg}>
                              <td
                                className={`px-2 py-1.5 text-center border border-gray-100 sticky left-0 z-10 ${rowBg}`}
                              >
                                {idx + 1}
                              </td>
                              <td
                                className={`px-3 py-1.5 font-semibold text-gray-800 border border-gray-100 sticky left-[36px] z-10 ${rowBg}`}
                              >
                                {siswa.nama_siswa}
                              </td>
                              {mapelList.map((m) => {
                                const v = nilaiAkhirMap[m.id]?.[siswa.id];
                                return (
                                  <td
                                    key={m.id}
                                    className={`px-2 py-1.5 text-center border border-gray-100 font-mono font-semibold ${getGradeColor(v)}`}
                                  >
                                    {formatGrade(v)}
                                  </td>
                                );
                              })}
                              <td className="px-2 py-1.5 text-center border border-gray-100 font-mono font-bold bg-zinc-100">
                                {formatGrade(jumlahMap[siswa.id])}
                              </td>
                              <td className="px-2 py-1.5 text-center border border-gray-100 font-mono font-bold bg-zinc-100">
                                {formatGrade(rata)}
                              </td>
                              <td className="px-2 py-1.5 text-center border border-gray-100 font-bold">
                                {rankMap[siswa.id] ?? "-"}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {mapelList.length > 0 && (
                      <tfoot>
                        <tr className="bg-zinc-200 font-bold">
                          <td
                            colSpan={2}
                            className="px-3 py-1.5 border border-gray-100 sticky left-0 z-10 bg-zinc-200"
                          >
                            Nilai Rata-Rata
                          </td>
                          {mapelList.map((m) => (
                            <td
                              key={m.id}
                              className="px-2 py-1.5 text-center border border-gray-100"
                            >
                              {formatGrade(mapelStats[m.id]?.rata)}
                            </td>
                          ))}
                          <td colSpan={3} className="border border-gray-100" />
                        </tr>
                        <tr className="bg-zinc-200 font-bold">
                          <td
                            colSpan={2}
                            className="px-3 py-1.5 border border-gray-100 sticky left-0 z-10 bg-zinc-200"
                          >
                            Nilai Tertinggi
                          </td>
                          {mapelList.map((m) => (
                            <td
                              key={m.id}
                              className="px-2 py-1.5 text-center border border-gray-100"
                            >
                              {formatGrade(mapelStats[m.id]?.tertinggi)}
                            </td>
                          ))}
                          <td colSpan={3} className="border border-gray-100" />
                        </tr>
                        <tr className="bg-zinc-200 font-bold">
                          <td
                            colSpan={2}
                            className="px-3 py-1.5 border border-gray-100 sticky left-0 z-10 bg-zinc-200"
                          >
                            Nilai Terendah
                          </td>
                          {mapelList.map((m) => (
                            <td
                              key={m.id}
                              className="px-2 py-1.5 text-center border border-gray-100"
                            >
                              {formatGrade(mapelStats[m.id]?.terendah)}
                            </td>
                          ))}
                          <td colSpan={3} className="border border-gray-100" />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ============ TAB VOCAB ============ */}
      {activeTab === "vocab" && (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">📖</div>
          <h2 className="text-lg font-bold text-gray-800">Rekap Nilai Vocab</h2>
          <p className="mt-2 text-sm text-gray-500">
            Fitur rekap nilai Vocab sedang dalam pengembangan.
          </p>
        </div>
      )}

      {/* ============ TAB TAHFIZH ============ */}
      {activeTab === "tahfizh" && (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">🕌</div>
          <h2 className="text-lg font-bold text-gray-800">
            Rekap Nilai Tahfizh
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Fitur rekap nilai Tahfizh sedang dalam pengembangan.
          </p>
        </div>
      )}
    </section>
  );
}
