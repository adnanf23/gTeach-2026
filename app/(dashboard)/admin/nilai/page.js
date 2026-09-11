"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// ================================================================
// KONFIGURASI
// ================================================================
const NAMA_BOBOT = {
  formatif: "Formatif",
  sumatif: "Sumatif",
  uts: "Ujian Tengah Semester",
  uas: "Ujian Akhir Semester",
  kehadiran: "Kehadiran",
};

const JENIS_UTS = "ahb";
const JENIS_UAS = "asas";

const TABS = [
  { id: "umum", label: "Umum" },
  { id: "vocab", label: "Vocab" },
  { id: "tahfizh", label: "Tahfizh" },
];

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

function getGradeColor(value) {
  if (value === null || value === undefined || isNaN(Number(value)))
    return "text-slate-400";
  return Number(value) < 70 ? "text-red-600" : "text-emerald-700";
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

        const [
          siswaData,
          mapelKhusus,
          mapelTingkat,
          plotingData,
          presentaseData,
          ujianData,
          absensiData,
        ] = await Promise.all([
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
          pb.collection("presentase_penilaian").getFullList({
            requestKey: null,
          }),
          pb.collection("pengaturan_ujian").getFullList({
            filter: `status_akses = "buka" && (target_kelas_id ~ "${kelasData.id}" || target_tingkat ~ "${String(kelasData.tingkat)}")`,
            requestKey: null,
          }),
          pb.collection("absensi").getFullList({
            filter: `kelas_id ~ "${kelasData.id}"`,
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

        function getBobot(nama) {
          const found = presentaseData.find(
            (p) =>
              (p.nama_presentase || "").trim().toLowerCase() ===
              nama.toLowerCase(),
          );
          return found ? Number(found.angka_presentase) || 0 : 0;
        }
        const bobotFormatif = getBobot(NAMA_BOBOT.formatif);
        const bobotSumatif = getBobot(NAMA_BOBOT.sumatif);
        const bobotUts = getBobot(NAMA_BOBOT.uts);
        const bobotUas = getBobot(NAMA_BOBOT.uas);
        const bobotKehadiran = getBobot(NAMA_BOBOT.kehadiran);

        const kehadiranMap = {};
        siswaData.forEach((s) => {
          const records = absensiData.filter((a) => a.siswa_id === s.id);
          if (records.length === 0) {
            kehadiranMap[s.id] = null;
            return;
          }
          const hadir = records.filter((a) => a.status === "hadir").length;
          kehadiranMap[s.id] = (hadir / records.length) * 100;
        });

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
              filter: mapelFilter,
              requestKey: null,
            }),
            pb.collection("lingkup_mater").getFullList({
              filter: mapelFilter,
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
            const kehadiranVal = kehadiranMap[s.id];

            const otherComponents = [
              { value: formatifAvg, bobot: bobotFormatif },
              { value: sumatifAvg, bobot: bobotSumatif },
              { value: utsVal, bobot: bobotUts },
              { value: uasVal, bobot: bobotUas },
            ].filter(
              (k) =>
                k.value !== null &&
                k.value !== undefined &&
                !isNaN(k.value) &&
                k.bobot > 0,
            );

            let komponen = [...otherComponents];
            if (otherComponents.length > 0) {
              if (
                kehadiranVal !== null &&
                kehadiranVal !== undefined &&
                !isNaN(kehadiranVal) &&
                bobotKehadiran > 0
              ) {
                komponen.push({ value: kehadiranVal, bobot: bobotKehadiran });
              }
            }

            const totalBobot = komponen.reduce((a, k) => a + k.bobot, 0);
            if (totalBobot === 0) {
              nilaiAkhir[m.id][s.id] = null;
              return;
            }
            const weightedSum = komponen.reduce(
              (a, k) => a + k.value * k.bobot,
              0,
            );
            nilaiAkhir[m.id][s.id] = weightedSum / totalBobot;
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

  // ================= EXPORT EXCEL =================
  async function handleExportLeger() {
    if (!selectedKelas) return;
    try {
      setExporting(true);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistem Penilaian";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet(`LEGER ${selectedKelas.nama_kelas}`, {
        properties: { tabColor: { argb: "FF2E7D32" } },
      });

      const GREEN = "FFD9EAD3";
      const YELLOW = "FFFFFF00";
      const CYAN = "FF7FFFD4";

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
        if (colNumber >= 3 && colNumber < colJumlah) return GREEN;
        if (colNumber === colJumlah || colNumber === colRata) return YELLOW;
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
          styleBody(cell, CYAN);
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

  // ================= RENDER =================
  if (loadingKelas) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="mt-3 text-sm">Memuat data kelas...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="py-8 lg:p-10 space-y-6 max-w-full mx-auto px-4">
      {/* ============ HEADER ============ */}
      <div>
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white rounded-3xl p-6 md:p-8 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="absolute right-0 bottom-0 w-80 h-80 bg-white/5 rounded-full translate-x-10 translate-y-20 pointer-events-none" />
          <div className="relative z-10 space-y-1">
            <span className="text-xs uppercase tracking-widest text-blue-200 font-semibold block">
              Rekap Nilai
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide uppercase">
              Rekap Nilai Semua Kelas
            </h1>
            <p className="text-sm text-blue-100">
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
                      ? "border-blue-600 text-blue-700"
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
          {/* Breadcrumb (navigasi step, bukan "kembali") */}
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
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* ============ STEP 1: PILIH KELAS ============ */}
          {!selectedKelas && (
            <>
              <div className="mb-4">
                <h1 className="mb-1 text-lg font-bold text-slate-800">
                  Pilih Kelas
                </h1>
                <p className="text-xs text-slate-500">
                  Pilih kelas untuk melihat dan mengexport leger nilainya.
                </p>
              </div>

              {/* Search & Filter */}
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
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>

                <div className="sm:w-56">
                  <select
                    value={filterTingkat}
                    onChange={(e) => setFilterTingkat(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
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

              {/* Grid Kelas */}
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
                      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-200 hover:bg-blue-600 active:scale-[0.98]"
                    >
                      <h3 className="text-base font-semibold text-slate-900 group-hover:text-white transition-colors duration-300">
                        {kelas.nama_kelas}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 group-hover:text-blue-100 transition-colors duration-300">
                        <span className="flex items-center gap-1">
                          <svg
                            className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-200 transition-colors duration-300"
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
                            className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-200 transition-colors duration-300"
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
                      <div className="absolute top-3 right-12 text-[10px] font-medium text-slate-400 group-hover:text-blue-200 transition-colors duration-300">
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
              {/* Card Export + Navigasi */}
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

                  {/* 
                    Tombol aksi di step leger:
                    - "← Kembali" → kembali ke HALAMAN SEBELUMNYA (browser back)
                    - "🔄 Ganti Kelas" → kembali ke STEP pilih kelas
                    - "⬇ Export Excel"
                  */}
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
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap inline-flex items-center gap-2"
                    >
                      {exporting ? "Mengexport..." : "⬇ Export Excel"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabel Leger */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
                {loadingLeger ? (
                  <div className="p-10 text-center text-gray-400">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
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
                        <th className="px-2 py-2 font-bold sticky left-0 z-20 bg-gray-50 border border-gray-200 min-w-[36px]">
                          No
                        </th>
                        <th className="px-3 py-2 font-bold sticky left-[36px] z-20 bg-gray-50 border border-gray-200 min-w-[160px] text-left">
                          Nama
                        </th>
                        {mapelList.map((m) => (
                          <th
                            key={m.id}
                            className="px-2 py-2 font-bold border border-gray-200 bg-emerald-50 min-w-[80px]"
                          >
                            <div>{m.nama_mapel || m.nama}</div>
                            <div className="text-[10px] font-normal normal-case text-gray-500">
                              {m.guru_pengampu}
                            </div>
                          </th>
                        ))}
                        <th className="px-2 py-2 font-bold border border-gray-200 bg-yellow-100 min-w-[70px]">
                          Jumlah
                        </th>
                        <th className="px-2 py-2 font-bold border border-gray-200 bg-yellow-100 min-w-[70px]">
                          Rata Rata
                        </th>
                        <th className="px-2 py-2 font-bold border border-gray-200 bg-gray-100 min-w-[50px]">
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
                              <td className="px-2 py-1.5 text-center border border-gray-100 font-mono font-bold bg-yellow-50">
                                {formatGrade(jumlahMap[siswa.id])}
                              </td>
                              <td className="px-2 py-1.5 text-center border border-gray-100 font-mono font-bold bg-yellow-50">
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
                        <tr className="bg-cyan-100 font-bold">
                          <td
                            colSpan={2}
                            className="px-3 py-1.5 border border-gray-100 sticky left-0 z-10 bg-cyan-100"
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
                        <tr className="bg-cyan-100 font-bold">
                          <td
                            colSpan={2}
                            className="px-3 py-1.5 border border-gray-100 sticky left-0 z-10 bg-cyan-100"
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
                        <tr className="bg-cyan-100 font-bold">
                          <td
                            colSpan={2}
                            className="px-3 py-1.5 border border-gray-100 sticky left-0 z-10 bg-cyan-100"
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
