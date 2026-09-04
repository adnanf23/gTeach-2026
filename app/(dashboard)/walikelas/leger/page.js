"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// ================================================================
// KONFIGURASI BOBOT PENILAIAN
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

// ================================================================
// UTIL
// ================================================================
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

export default function LegerPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [loading, setLoading] = useState(true);
  const [kelas, setKelas] = useState(null);
  const [siswaList, setSiswaList] = useState([]);
  const [mapelList, setMapelList] = useState([]);
  const [nilaiAkhirMap, setNilaiAkhirMap] = useState({});
  const [exporting, setExporting] = useState(false);

  // ================= LOAD DATA =================
  useEffect(() => {
    async function loadData() {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);

        const kelasData = await pb
          .collection("kelas")
          .getFirstListItem(
            `walikelas_id = "${user.id}" || pendamping_id = "${user.id}"`,
            { requestKey: null },
          );
        setKelas(kelasData);

        // ========== AMBIL MAPEL + GURU PENGAMPU ==========
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

        setSiswaList(siswaData);

        // ========== GABUNG & FILTER MAPEL ==========
        // - mapelKhusus sudah pasti cocok (filter spesifik_kelas_id ~ kelasData.id)
        // - mapelTingkat berisi semua mapel dengan target_tingkat sesuai,
        //   termasuk yang memiliki spesifik_kelas_id untuk kelas lain.
        //   Maka kita filter ulang: jika mapel punya spesifik_kelas_id,
        //   harus mengandung kelasData.id; jika tidak (generik), lolos.
        const combined = [...mapelKhusus, ...mapelTingkat];
        const uniqueMapelRaw = Array.from(
          new Map(combined.map((m) => [m.id, m])).values(),
        );

        const uniqueMapel = uniqueMapelRaw.filter((m) => {
          const spesifik = m.spesifik_kelas_id;
          const punyaRestriksi = Array.isArray(spesifik) && spesifik.length > 0;
          if (!punyaRestriksi) return true; // mapel generik
          return spesifik.includes(kelasData.id); // mapel khusus harus cocok
        });

        // ========== BUILD GURU MAP ==========
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

        // ========== DEDUPLIKASI BERDASARKAN NAMA MAPEL ==========
        const mapelByName = new Map();
        uniqueMapel.forEach((m) => {
          const key = (m.nama_mapel || m.nama || "").trim();
          if (!mapelByName.has(key)) {
            mapelByName.set(key, m);
          } else {
            // Jika sudah ada, pilih yang memiliki guru (jika yang baru punya guru dan yang lama tidak)
            const existing = mapelByName.get(key);
            const existingGuru = guruMap.get(existing.id);
            const newGuru = guruMap.get(m.id);
            if (!existingGuru && newGuru) {
              mapelByName.set(key, m);
            }
            // Jika keduanya punya guru, tetap pakai yang pertama (existing)
          }
        });
        const deduplicatedMapel = Array.from(mapelByName.values());

        // Urutkan berdasarkan nama, lalu tempel guru_pengampu
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

        setMapelList(sortedMapel);

        // ========== PERHITUNGAN NILAI (tidak berubah) ==========
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

        // Kehadiran
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

        // UTS / UAS
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

        // Formatif & Sumatif
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

        // Nilai Akhir
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

        setNilaiAkhirMap(nilaiAkhir);
      } catch (error) {
        if (!error?.isAbort) console.error("Gagal memuat data leger:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ================= STATISTIK PER MAPEL =================
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
    if (!kelas) return;
    try {
      setExporting(true);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistem Penilaian";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet(`LEGER ${kelas.nama_kelas}`, {
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
      // --- FUNGSI DENGAN PARAMETER HORIZONTAL ---
      function styleHeader(cell, argb, horizontal = "center") {
        fillCell(cell, argb);
        cell.font = { bold: true, size: 10 };
        cell.alignment = {
          horizontal: horizontal,
          vertical: "middle",
          wrapText: true,
        };
        addBorder(cell);
      }
      function styleBody(cell, argb, horizontal = "center") {
        fillCell(cell, argb);
        cell.alignment = {
          horizontal: horizontal,
          vertical: "middle",
        };
        addBorder(cell);
      }

      // Total kolom = 2 + mapel + 3 (Jumlah, Rata, Rank)
      const totalCols = 2 + mapelList.length + 3;
      const colJumlah = 3 + mapelList.length;
      const colRata = colJumlah + 1;
      const colRank = colRata + 1;

      function fillForColumn(colNumber) {
        if (colNumber >= 3 && colNumber < colJumlah) return GREEN;
        if (colNumber === colJumlah || colNumber === colRata) return YELLOW;
        return null;
      }

      // Judul
      sheet.mergeCells(1, 1, 1, totalCols);
      const title = sheet.getCell(1, 1);
      title.value = `LEGER NILAI RAPOR - ${kelas.nama_kelas} TAHUN AJARAN 2026/2027`;
      title.font = { bold: true, size: 14 };
      title.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(1).height = 26;

      sheet.addRow([]);

      // Header
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

      // ---- Header dengan alignment khusus untuk kolom 2 ----
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const horiz = colNumber === 2 ? "left" : "center";
        styleHeader(cell, fillForColumn(colNumber), horiz);
      });
      headerRow.height = 40;

      // Data siswa
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

        // ---- Data dengan alignment khusus untuk kolom 2 ----
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const horiz = colNumber === 2 ? "left" : "center";
          styleBody(cell, fillForColumn(colNumber), horiz);
        });
      });

      // Baris ringkasan (hanya mapel)
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
          styleBody(cell, CYAN); // tetap center untuk ringkasan
          if (colNumber === 1) cell.font = { bold: true };
        });
      }
      addSummaryRow("Nilai Rata-Rata", (m) => mapelStats[m.id]?.rata);
      addSummaryRow("Nilai Tertinggi", (m) => mapelStats[m.id]?.tertinggi);
      addSummaryRow("Nilai Terendah", (m) => mapelStats[m.id]?.terendah);

      // Lebar kolom (sudah diperkecil)
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
      saveAs(blob, `Leger_${kelas.nama_kelas}.xlsx`.replace(/\s+/g, "_"));
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
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="mt-3 text-sm">Memuat data leger...</p>
        </div>
      </div>
    );
  }

  if (!kelas) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">Akses Ditolak</h1>
        <p className="mt-2 text-sm text-red-600">
          Anda belum terdaftar sebagai wali kelas atau pendamping di kelas
          manapun.
        </p>
      </div>
    );
  }

  return (
    <section className="py-8 lg:p-10 space-y-6 max-w-full mx-auto px-4">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="text-sm font-semibold text-slate-600 hover:text-blue-600 mb-4 inline-flex items-center gap-1"
        >
          ← Kembali
        </button>
        {/* Header Gradient (tanpa tombol export) */}
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white rounded-3xl p-6 md:p-8 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="absolute right-0 bottom-0 w-80 h-80 bg-white/5 rounded-full translate-x-10 translate-y-20 pointer-events-none" />
          <div className="relative z-10 space-y-1">
            <span className="text-xs uppercase tracking-widest text-blue-200 font-semibold block">
              Tingkat {kelas.tingkat}
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide uppercase">
              Leger Nilai — {kelas.nama_kelas}
            </h1>
            <p className="text-sm text-blue-100">
              Rekap nilai akhir rapor untuk mata pelajaran yang diampu di kelas
              ini (bobot diatur admin).
            </p>
          </div>
        </div>

        {/* Card Putih untuk Rekap Nilai & Export */}
        <div className="mt-4 bg-white rounded-lg shadow-md p-4 md:p-6 border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-800">
                REKAP NILAI LEGER
              </h2>
              <p className="text-xs text-gray-500">
                Download file Excel nilai leger kelas anda yang tersedia secara
                realtime.
              </p>
            </div>
            <button
              onClick={handleExportLeger}
              disabled={exporting || mapelList.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap inline-flex items-center gap-2 self-start md:self-center"
            >
              {exporting ? "Mengexport..." : "⬇ Export Excel"}
            </button>
          </div>
        </div>
      </div>

      {/* Tabel Leger */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
        {mapelList.length === 0 ? (
          <div className="p-8 text-center text-gray-400 font-medium text-sm">
            Belum ada mata pelajaran yang diampu untuk kelas ini.
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
                <th className="px-2 py-2 font-bold border border-gray-200 bg-yellow-100 min-w-[70px]">
                  Rata Rata
                </th>
                <th className="px-2 py-2 font-bold border border-gray-200 bg-gray-100 min-w-[50px]">
                  Rank
                </th>
              </tr>
            </thead>
            <tbody>
              {siswaList.map((siswa, idx) => {
                const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
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
                    <td className="px-2 py-1.5 text-center border border-gray-100 font-mono font-bold bg-yellow-50">
                      {formatGrade(rata)}
                    </td>
                    <td className="px-2 py-1.5 text-center border border-gray-100 font-bold">
                      {rankMap[siswa.id] ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
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
                <td colSpan={4} className="border border-gray-100" />
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
                <td colSpan={4} className="border border-gray-100" />
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
                <td colSpan={4} className="border border-gray-100" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </section>
  );
}
