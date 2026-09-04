"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useParams, useRouter } from "next/navigation";
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
  if (value === null || value === undefined || value === -1) return "-";
  const num = Number(value);
  if (isNaN(num) || num < 0) return "-";
  const clamped = Math.min(num, 99.99);
  const formatted = clamped.toFixed(2);
  const [whole, decimal] = formatted.split(".");
  return `${whole.padStart(2, "0")}.${decimal}`;
}

function getGradeColor(value) {
  if (
    value === null ||
    value === undefined ||
    value === -1 ||
    isNaN(Number(value))
  )
    return "text-slate-400";
  return Number(value) < 70 ? "text-red-600" : "text-emerald-600";
}

function tpNumber(tp) {
  const m = String(tp.no_tp || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

const DAFTAR_NO_TP = [
  "TP 1",
  "TP 2",
  "TP 3",
  "TP 4",
  "TP 5",
  "TP 6",
  "TP 7",
  "TP 8",
  "TP 9",
  "TP 10",
];

// ================================================================
// KOMPONEN INPUT NILAI
// ================================================================
function NilaiInput({ value, status, disabled, onSave, width = "w-16" }) {
  // Ubah -1 menjadi string kosong untuk ditampilkan
  const displayValue = value === -1 ? "" : (value ?? "");
  return (
    <input
      type="number"
      min={0}
      max={100}
      step="0.1"
      disabled={disabled}
      defaultValue={displayValue}
      onBlur={(e) => onSave(e.target.value)}
      className={`${width} text-center rounded-lg border px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-400 ${
        status === "error"
          ? "border-red-400 bg-red-50"
          : status === "saving"
            ? "border-blue-300 bg-blue-50"
            : status === "saved"
              ? "border-green-400 bg-green-50"
              : "border-gray-200"
      }`}
    />
  );
}

export default function PenilaianMapelPage() {
  const { id: mapelId } = useParams();
  const router = useRouter();
  const user = getCurrentUser();

  const [loading, setLoading] = useState(true);
  const [kelas, setKelas] = useState(null);
  const [mapel, setMapel] = useState(null);
  const [siswaList, setSiswaList] = useState([]);
  const [activeTab, setActiveTab] = useState("formatif");

  // FORMATIF
  const [tpList, setTpList] = useState([]);
  const [nilaiFormatif, setNilaiFormatif] = useState({});
  const [addingTp, setAddingTp] = useState(false);
  const [selectedNoTp, setSelectedNoTp] = useState("");
  const [savingTp, setSavingTp] = useState(false);

  // SUMATIF
  const [lpList, setLpList] = useState([]);
  const [nilaiSumatif, setNilaiSumatif] = useState({});
  const [showAddLp, setShowAddLp] = useState(false);
  const [namaLp, setNamaLp] = useState("");
  const [savingLp, setSavingLp] = useState(false);

  // UJIAN
  const [ujianAktif, setUjianAktif] = useState([]);
  const [selectedUjianId, setSelectedUjianId] = useState(null);
  const [nilaiUjian, setNilaiUjian] = useState({});

  // ABSENSI
  const [absensiList, setAbsensiList] = useState([]);

  // BOBOT
  const [presentaseList, setPresentaseList] = useState([]);

  // STATUS CELL
  const [cellStatus, setCellStatus] = useState({});
  const [exporting, setExporting] = useState(false);

  // ================= LOAD DATA =================
  useEffect(() => {
    async function loadData() {
      if (!user || !mapelId) {
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

        const mapelData = await pb
          .collection("mata_pelajaran")
          .getOne(mapelId, { requestKey: null });
        setMapel(mapelData);

        const [
          siswaData,
          tpData,
          lpData,
          presentaseData,
          ujianData,
          absensiData,
        ] = await Promise.all([
          pb.collection("siswa").getFullList({
            filter: `kelas_id = "${kelasData.id}"`,
            sort: "nama_siswa",
            requestKey: null,
          }),
          pb.collection("tujuan_pembelajaran").getFullList({
            filter: `mapel_id ~ "${mapelId}"`,
            requestKey: null,
          }),
          pb.collection("lingkup_mater").getFullList({
            filter: `mapel_id ~ "${mapelId}"`,
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
        setTpList(tpData.sort((a, b) => tpNumber(a) - tpNumber(b)));
        setLpList(lpData);
        setPresentaseList(presentaseData);
        setUjianAktif(ujianData);
        setAbsensiList(absensiData);

        // Nilai Formatif
        if (tpData.length > 0) {
          const tpFilter = tpData
            .map((tp) => `tp_id ~ "${tp.id}"`)
            .join(" || ");
          const nfData = await pb.collection("nilai_formatif").getFullList({
            filter: `kelas_id ~ "${kelasData.id}" && (${tpFilter})`,
            requestKey: null,
          });
          const map = {};
          nfData.forEach((n) => {
            if (!map[n.siswa_id]) map[n.siswa_id] = {};
            map[n.siswa_id][n.tp_id] = {
              recordId: n.id,
              k1: n.k1 ?? -1,
              k2: n.k2 ?? -1,
              k3: n.k3 ?? -1,
              k4: n.k4 ?? -1,
            };
          });
          setNilaiFormatif(map);
        }

        // Nilai Sumatif
        if (lpData.length > 0) {
          const lpFilter = lpData
            .map((lp) => `lm_id ~ "${lp.id}"`)
            .join(" || ");
          const nsData = await pb.collection("nilai_sumatif").getFullList({
            filter: `kelas_id ~ "${kelasData.id}" && (${lpFilter})`,
            requestKey: null,
          });
          const map = {};
          nsData.forEach((n) => {
            if (!map[n.siswa_id]) map[n.siswa_id] = {};
            map[n.siswa_id][n.lm_id] = { recordId: n.id, nilai: n.nilai };
          });
          setNilaiSumatif(map);
        }

        // Nilai Ujian
        if (ujianData.length > 0) {
          const ujianFilter = ujianData
            .map((u) => `pengaturan_ujian_id = "${u.id}"`)
            .join(" || ");
          const nuData = await pb.collection("nilai_ujian").getFullList({
            filter: `${ujianFilter}`,
            requestKey: null,
          });
          const map = {};
          nuData.forEach((n) => {
            if (!map[n.pengaturan_ujian_id]) map[n.pengaturan_ujian_id] = {};
            map[n.pengaturan_ujian_id][n.siswa_id] = {
              recordId: n.id,
              nilai: n.nilai,
            };
          });
          setNilaiUjian(map);
          if (!selectedUjianId) setSelectedUjianId(ujianData[0].id);
        }
      } catch (error) {
        if (!error?.isAbort) console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapelId]);

  // ================= BOBOT =================
  function getBobot(nama) {
    const found = presentaseList.find(
      (p) =>
        (p.nama_presentase || "").trim().toLowerCase() === nama.toLowerCase(),
    );
    return found ? Number(found.angka_presentase) || 0 : 0;
  }
  const bobotFormatif = getBobot(NAMA_BOBOT.formatif);
  const bobotSumatif = getBobot(NAMA_BOBOT.sumatif);
  const bobotUts = getBobot(NAMA_BOBOT.uts);
  const bobotUas = getBobot(NAMA_BOBOT.uas);
  const bobotKehadiran = getBobot(NAMA_BOBOT.kehadiran);

  // ================= RATA-RATA =================
  const formatifAvgMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => {
      const perTp = nilaiFormatif[s.id] || {};
      const semuaK = [];
      Object.values(perTp).forEach((rec) => {
        ["k1", "k2", "k3", "k4"].forEach((k) => {
          const val = rec[k];
          if (typeof val === "number" && !isNaN(val) && val !== -1) {
            semuaK.push(val);
          }
        });
      });
      result[s.id] = average(semuaK);
    });
    return result;
  }, [nilaiFormatif, siswaList]);

  const sumatifAvgMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => {
      const perLp = nilaiSumatif[s.id] || {};
      const vals = Object.values(perLp)
        .map((r) => r.nilai)
        .filter((v) => typeof v === "number" && !isNaN(v) && v !== -1);
      result[s.id] = average(vals);
    });
    return result;
  }, [nilaiSumatif, siswaList]);

  const utsIds = useMemo(
    () =>
      ujianAktif.filter((u) => u.jenis_ujian === JENIS_UTS).map((u) => u.id),
    [ujianAktif],
  );
  const uasIds = useMemo(
    () =>
      ujianAktif.filter((u) => u.jenis_ujian === JENIS_UAS).map((u) => u.id),
    [ujianAktif],
  );

  function avgUjian(ids, siswaId) {
    const vals = ids
      .map((uid) => nilaiUjian[uid]?.[siswaId]?.nilai)
      .filter((v) => typeof v === "number" && !isNaN(v) && v !== -1);
    return average(vals);
  }
  const utsAvgMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => (result[s.id] = avgUjian(utsIds, s.id)));
    return result;
  }, [nilaiUjian, utsIds, siswaList]);
  const uasAvgMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => (result[s.id] = avgUjian(uasIds, s.id)));
    return result;
  }, [nilaiUjian, uasIds, siswaList]);

  const kehadiranMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => {
      const records = absensiList.filter((a) => a.siswa_id === s.id);
      if (records.length === 0) {
        result[s.id] = null;
        return;
      }
      const hadir = records.filter((a) => a.status === "hadir").length;
      result[s.id] = (hadir / records.length) * 100;
    });
    return result;
  }, [absensiList, siswaList]);

  // ================= RAPOR MAP =================
  const raporMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => {
      const formatifVal = formatifAvgMap[s.id];
      const sumatifVal = sumatifAvgMap[s.id];

      const formatifKosong =
        formatifVal === null || formatifVal === undefined || isNaN(formatifVal);
      const sumatifKosong =
        sumatifVal === null || sumatifVal === undefined || isNaN(sumatifVal);

      if (formatifKosong && sumatifKosong) {
        result[s.id] = 0;
        return;
      }

      const komponen = [
        { value: formatifAvgMap[s.id], bobot: bobotFormatif },
        { value: sumatifAvgMap[s.id], bobot: bobotSumatif },
        { value: utsAvgMap[s.id], bobot: bobotUts },
        { value: uasAvgMap[s.id], bobot: bobotUas },
        { value: kehadiranMap[s.id], bobot: bobotKehadiran },
      ].filter(
        (k) =>
          k.value !== null &&
          k.value !== undefined &&
          !isNaN(k.value) &&
          k.value !== -1 &&
          k.bobot > 0,
      );

      const totalBobot = komponen.reduce((a, k) => a + k.bobot, 0);
      if (totalBobot === 0) {
        result[s.id] = null;
        return;
      }
      const weightedSum = komponen.reduce((a, k) => a + k.value * k.bobot, 0);
      result[s.id] = weightedSum / totalBobot;
    });
    return result;
  }, [
    formatifAvgMap,
    sumatifAvgMap,
    utsAvgMap,
    uasAvgMap,
    kehadiranMap,
    bobotFormatif,
    bobotSumatif,
    bobotUts,
    bobotUas,
    bobotKehadiran,
    siswaList,
  ]);

  // ================= TAMBAH TP =================
  async function handleAddTp() {
    if (!selectedNoTp || !kelas) return;
    try {
      setSavingTp(true);
      const created = await pb
        .collection("tujuan_pembelajaran")
        .create(
          { no_tp: selectedNoTp, mapel_id: mapelId },
          { requestKey: null },
        );
      setTpList((prev) =>
        [...prev, created].sort((a, b) => tpNumber(a) - tpNumber(b)),
      );
      setSelectedNoTp("");
      setAddingTp(false);
    } catch (error) {
      if (!error?.isAbort)
        console.error("Gagal menambah TP:", error?.response?.data || error);
    } finally {
      setSavingTp(false);
    }
  }

  // ================= SIMPAN NILAI FORMATIF =================
  async function handleSaveFormatif(siswaId, tpId, kField, rawValue) {
    const cellKey = `f-${siswaId}-${tpId}-${kField}`;
    const existing = nilaiFormatif[siswaId]?.[tpId];
    const nilaiValue = rawValue === "" ? -1 : Number(rawValue);

    if (
      nilaiValue !== -1 &&
      (Number.isNaN(nilaiValue) || nilaiValue < 0 || nilaiValue > 100)
    ) {
      setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      return;
    }
    if (existing?.[kField] === nilaiValue) return;

    setCellStatus((prev) => ({ ...prev, [cellKey]: "saving" }));
    try {
      let saved;
      if (existing?.recordId) {
        const currentValues = {
          k1: existing.k1 ?? -1,
          k2: existing.k2 ?? -1,
          k3: existing.k3 ?? -1,
          k4: existing.k4 ?? -1,
        };
        currentValues[kField] = nilaiValue;
        saved = await pb
          .collection("nilai_formatif")
          .update(existing.recordId, currentValues, { requestKey: null });
      } else {
        const data = {
          tp_id: tpId,
          siswa_id: siswaId,
          kelas_id: kelas.id,
          k1: -1,
          k2: -1,
          k3: -1,
          k4: -1,
        };
        data[kField] = nilaiValue;
        saved = await pb
          .collection("nilai_formatif")
          .create(data, { requestKey: null });
      }

      setNilaiFormatif((prev) => ({
        ...prev,
        [siswaId]: {
          ...prev[siswaId],
          [tpId]: {
            ...(prev[siswaId]?.[tpId] || {}),
            recordId: saved.id,
            [kField]: nilaiValue,
          },
        },
      }));
      setCellStatus((prev) => ({ ...prev, [cellKey]: "saved" }));
      setTimeout(
        () => setCellStatus((prev) => ({ ...prev, [cellKey]: undefined })),
        1200,
      );
    } catch (error) {
      if (!error?.isAbort) {
        console.error(
          "Gagal menyimpan nilai formatif:",
          error?.response?.data || error,
        );
        setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      }
    }
  }

  // ================= TAMBAH LP =================
  async function handleAddLp(e) {
    e.preventDefault();
    if (!namaLp.trim() || !kelas) return;
    try {
      setSavingLp(true);
      const created = await pb
        .collection("lingkup_mater")
        .create(
          { nama: namaLp.trim(), mapel_id: mapelId },
          { requestKey: null },
        );
      setLpList((prev) => [...prev, created]);
      setNamaLp("");
      setShowAddLp(false);
    } catch (error) {
      if (!error?.isAbort)
        console.error("Gagal menambah LP:", error?.response?.data || error);
    } finally {
      setSavingLp(false);
    }
  }

  // ================= SIMPAN NILAI SUMATIF =================
  async function handleSaveSumatif(siswaId, lpId, rawValue) {
    const cellKey = `s-${siswaId}-${lpId}`;
    const existing = nilaiSumatif[siswaId]?.[lpId];
    const nilaiValue = rawValue === "" ? null : Number(rawValue);

    if (
      nilaiValue !== null &&
      (Number.isNaN(nilaiValue) || nilaiValue < 0 || nilaiValue > 100)
    ) {
      setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      return;
    }
    if (nilaiValue === null) return;
    if (existing?.nilai === nilaiValue) return;

    setCellStatus((prev) => ({ ...prev, [cellKey]: "saving" }));
    try {
      let saved;
      if (existing?.recordId) {
        saved = await pb
          .collection("nilai_sumatif")
          .update(
            existing.recordId,
            { nilai: nilaiValue },
            { requestKey: null },
          );
      } else {
        saved = await pb.collection("nilai_sumatif").create(
          {
            lm_id: lpId,
            siswa_id: siswaId,
            kelas_id: kelas.id,
            nilai: nilaiValue,
          },
          { requestKey: null },
        );
      }
      setNilaiSumatif((prev) => ({
        ...prev,
        [siswaId]: {
          ...prev[siswaId],
          [lpId]: { recordId: saved.id, nilai: nilaiValue },
        },
      }));
      setCellStatus((prev) => ({ ...prev, [cellKey]: "saved" }));
      setTimeout(
        () => setCellStatus((prev) => ({ ...prev, [cellKey]: undefined })),
        1200,
      );
    } catch (error) {
      if (!error?.isAbort) {
        console.error(
          "Gagal menyimpan nilai sumatif:",
          error?.response?.data || error,
        );
        setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      }
    }
  }

  // ================= SIMPAN NILAI UJIAN =================
  async function handleSaveUjian(siswaId, rawValue) {
    if (!selectedUjianId) return;
    const cellKey = `u-${siswaId}`;
    const existing = nilaiUjian[selectedUjianId]?.[siswaId];
    const nilaiValue = rawValue === "" ? null : Number(rawValue);

    if (
      nilaiValue !== null &&
      (Number.isNaN(nilaiValue) || nilaiValue < 0 || nilaiValue > 100)
    ) {
      setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      return;
    }
    if (nilaiValue === null) return;
    if (existing?.nilai === nilaiValue) return;

    setCellStatus((prev) => ({ ...prev, [cellKey]: "saving" }));
    try {
      let saved;
      if (existing?.recordId) {
        saved = await pb
          .collection("nilai_ujian")
          .update(
            existing.recordId,
            { nilai: nilaiValue },
            { requestKey: null },
          );
      } else {
        saved = await pb.collection("nilai_ujian").create(
          {
            siswa_id: siswaId,
            pengaturan_ujian_id: selectedUjianId,
            nilai: nilaiValue,
          },
          { requestKey: null },
        );
      }
      setNilaiUjian((prev) => ({
        ...prev,
        [selectedUjianId]: {
          ...prev[selectedUjianId],
          [siswaId]: { recordId: saved.id, nilai: nilaiValue },
        },
      }));
      setCellStatus((prev) => ({ ...prev, [cellKey]: "saved" }));
      setTimeout(
        () => setCellStatus((prev) => ({ ...prev, [cellKey]: undefined })),
        1200,
      );
    } catch (error) {
      if (!error?.isAbort) {
        console.error(
          "Gagal menyimpan nilai ujian:",
          error?.response?.data || error,
        );
        setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      }
    }
  }

  // ================= EXPORT RAPOR (5 Sheet + Border + Auto Width + Fixed Width) =================
  async function handleExportRapor() {
    if (!mapel || !kelas) return;
    try {
      setExporting(true);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistem Penilaian";
      workbook.created = new Date();

      // ========== WARNA ==========
      const GREEN = "FFD9EAD3";
      const YELLOW = "FFFFFF00";
      const CYAN = "FFE0FFFF"; // MODIFIKASI: warna cyan untuk nilai mentah

      // ========== UTILITY ==========
      function setAutoWidth(worksheet) {
        worksheet.columns.forEach((column) => {
          let maxLength = 0;
          column.eachCell({ includeEmpty: true }, (cell) => {
            const cellValue = cell.value ? cell.value.toString() : "";
            maxLength = Math.max(maxLength, cellValue.length);
          });
          column.width = Math.min(Math.max(maxLength + 4, 10), 50);
        });
      }

      function setFixedWidth(worksheet, colIndex, width) {
        if (worksheet.columns[colIndex - 1]) {
          worksheet.columns[colIndex - 1].width = width;
        }
      }

      function addBorder(cell) {
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
      }

      function styleHeader(cell) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GREEN },
        };
        cell.font = { bold: true, color: { argb: "FF000000" }, size: 11 };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        addBorder(cell);
      }

      function styleBody(cell) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
        addBorder(cell);
      }

      function styleResult(cell) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: YELLOW },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        addBorder(cell);
      }

      function styleNilai(cell) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: CYAN },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        addBorder(cell);
      }

      function styleRow(row, styleFn) {
        row.eachCell({ includeEmpty: true }, (cell) => styleFn(cell));
      }

      function addHeading(worksheet, title, colCount, rowIndex = 1) {
        const row = worksheet.getRow(rowIndex);
        row.getCell(1).value = title;
        worksheet.mergeCells(rowIndex, 1, rowIndex, colCount);
        const mergedCell = worksheet.getCell(rowIndex, 1);
        mergedCell.font = { bold: true, size: 16, color: { argb: "FF000000" } };
        mergedCell.alignment = { horizontal: "center", vertical: "middle" };
        addBorder(mergedCell);
        row.height = 30;
      }

      // ================================================================
      // 1. SHEET DATA KELAS
      // ================================================================
      const sheetKelas = workbook.addWorksheet("DATA KELAS", {
        properties: { tabColor: { argb: GREEN } },
      });
      const headerKelas = ["No", "Nama Siswa", "Jenis Kelamin", "NIS", "NISN"];
      const colCountKelas = headerKelas.length;

      addHeading(sheetKelas, "DATA KELAS", colCountKelas);
      sheetKelas.addRow([]);
      sheetKelas.addRow([`Kelas: ${kelas.nama_kelas}`]);
      sheetKelas.addRow([`Mata Pelajaran: ${mapel.nama_mapel}`]);
      sheetKelas.addRow([]);

      const headerRowKelas = sheetKelas.addRow(headerKelas);
      styleRow(headerRowKelas, styleHeader);
      headerRowKelas.height = 25;

      siswaList.forEach((s, idx) => {
        const row = sheetKelas.addRow([
          idx + 1,
          s.nama_siswa,
          s.jenis_kelamin || "-",
          s.nis || "-",
          s.nisn || "-",
        ]);
        styleRow(row, styleBody);
      });
      setAutoWidth(sheetKelas);

      // ================================================================
      // 2. SHEET FORMATIF
      // ================================================================
      const sheetFormatif = workbook.addWorksheet("FORMATIF", {
        properties: { tabColor: { argb: GREEN } },
      });

      const totalCols = 4 + tpList.length * 4 + 1;
      addHeading(sheetFormatif, "DAFTAR NILAI FORMATIF", totalCols, 1);
      addHeading(
        sheetFormatif,
        "NILAI FORMATIF SETIAP TUJUAN PEMBELAJARAN",
        totalCols,
        2,
      );
      sheetFormatif.addRow([]);

      const headerRow1 = sheetFormatif.addRow([]);
      let colIdx = 1;
      const colNomor = colIdx;
      headerRow1.getCell(colIdx).value = "NOMOR";
      colIdx++;
      const colNama = colIdx;
      headerRow1.getCell(colIdx).value = "NAMA";
      colIdx++;
      const colLP = colIdx;
      headerRow1.getCell(colIdx).value = "L/P";
      colIdx++;
      const colKelas = colIdx;
      headerRow1.getCell(colIdx).value = "NIS";
      colIdx++;
      tpList.forEach((tp) => {
        const start = colIdx;
        const end = colIdx + 3;
        headerRow1.getCell(start).value = tp.no_tp;
        sheetFormatif.mergeCells(4, start, 4, end);
        colIdx += 4;
      });
      const colRata = colIdx;
      headerRow1.getCell(colIdx).value = "RATA-RATA NILAI";

      const headerRow2 = sheetFormatif.addRow([]);
      colIdx = 5;
      tpList.forEach(() => {
        headerRow2.getCell(colIdx).value = "K1";
        headerRow2.getCell(colIdx + 1).value = "K2";
        headerRow2.getCell(colIdx + 2).value = "K3";
        headerRow2.getCell(colIdx + 3).value = "K4";
        colIdx += 4;
      });

      styleRow(headerRow1, styleHeader);
      styleRow(headerRow2, styleHeader);
      styleResult(headerRow1.getCell(colRata));

      [colNomor, colNama, colLP, colKelas, colRata].forEach((col) => {
        sheetFormatif.mergeCells(4, col, 5, col);
      });

      headerRow1.height = 20;
      headerRow2.height = 15;

      // Data
      siswaList.forEach((siswa, idx) => {
        const rowData = [];
        rowData.push(idx + 1);
        rowData.push(siswa.nama_siswa);
        rowData.push(siswa.jenis_kelamin || "-");
        rowData.push(siswa.nis);
        tpList.forEach((tp) => {
          const rec = nilaiFormatif[siswa.id]?.[tp.id] || {};
          rowData.push(rec.k1 !== -1 ? rec.k1 : null);
          rowData.push(rec.k2 !== -1 ? rec.k2 : null);
          rowData.push(rec.k3 !== -1 ? rec.k3 : null);
          rowData.push(rec.k4 !== -1 ? rec.k4 : null);
        });
        const avg = formatifAvgMap[siswa.id];
        rowData.push(avg !== null ? Number(avg.toFixed(2)) : null);

        const row = sheetFormatif.addRow(rowData);
        styleRow(row, styleBody);

        // MODIFIKASI: warnai K1-K4 dengan cyan
        let colStart = 5;
        for (let i = 0; i < tpList.length; i++) {
          for (let j = 0; j < 4; j++) {
            styleNilai(row.getCell(colStart + j));
          }
          colStart += 4;
        }
        styleResult(row.getCell(colRata));

        row.height = 18;
      });

      setAutoWidth(sheetFormatif);
      setFixedWidth(sheetFormatif, 3, 5);
      setFixedWidth(sheetFormatif, 1, 10);
      let startCol = 5;
      for (let i = 0; i < tpList.length; i++) {
        for (let j = 0; j < 4; j++) {
          setFixedWidth(sheetFormatif, startCol + j, 6);
        }
        startCol += 4;
      }

      // ================================================================
      // 3. SHEET SUMATIF
      // ================================================================
      const sheetSumatif = workbook.addWorksheet("SUMATIF", {
        properties: { tabColor: { argb: GREEN } },
      });

      const colCountSumatif = 5 + lpList.length + 3;
      const colRataSumatif = 5 + lpList.length + 1;
      addHeading(sheetSumatif, "DAFTAR NILAI SUMATIF", colCountSumatif, 1);
      sheetSumatif.addRow([]);

      const headerSumatif = ["NOMOR", "NIS", "NAMA", "L/P", "KELAS"];
      lpList.forEach((lp) => headerSumatif.push(lp.nama || "LM"));
      headerSumatif.push(
        "Rata-rata",
        "Sumatif Tengah Semester (STS)",
        "Sumatif Akhir Semester (SAS)",
      );

      const headerRowSumatif = sheetSumatif.addRow(headerSumatif);
      styleRow(headerRowSumatif, styleHeader);
      styleResult(headerRowSumatif.getCell(colRataSumatif));
      headerRowSumatif.height = 25;

      siswaList.forEach((siswa, idx) => {
        const rowData = [];
        rowData.push(idx + 1);
        rowData.push(siswa.nis || "-");
        rowData.push(siswa.nama_siswa);
        rowData.push(siswa.jenis_kelamin || "-");
        rowData.push(kelas.nama_kelas);
        lpList.forEach((lp) => {
          const rec = nilaiSumatif[siswa.id]?.[lp.id] || {};
          rowData.push(
            rec.nilai !== undefined && rec.nilai !== null ? rec.nilai : null,
          );
        });
        const avgSum = sumatifAvgMap[siswa.id];
        rowData.push(avgSum !== null ? Number(avgSum.toFixed(2)) : null);
        const sts = utsAvgMap[siswa.id];
        const sas = uasAvgMap[siswa.id];
        rowData.push(sts !== null ? Number(sts.toFixed(2)) : null);
        rowData.push(sas !== null ? Number(sas.toFixed(2)) : null);

        const row = sheetSumatif.addRow(rowData);
        styleRow(row, styleBody);

        // MODIFIKASI: warnai LP, STS, SAS dengan cyan
        const colLPStart = 6;
        for (let i = 0; i < lpList.length; i++) {
          styleNilai(row.getCell(colLPStart + i));
        }
        styleNilai(row.getCell(colRataSumatif + 1));
        styleNilai(row.getCell(colRataSumatif + 2));
        styleResult(row.getCell(colRataSumatif));
      });

      setAutoWidth(sheetSumatif);
      setFixedWidth(sheetSumatif, 4, 5);

      // ================================================================
      // 4. SHEET KEHADIRAN
      // ================================================================
      const sheetKehadiran = workbook.addWorksheet("KEHADIRAN", {
        properties: { tabColor: { argb: GREEN } },
      });

      const colCountKehadiran = 11;
      const colPersenKehadiran = 11;
      addHeading(
        sheetKehadiran,
        "DAFTAR HADIR PESERTA DIDIK",
        colCountKehadiran,
        1,
      );
      sheetKehadiran.addRow([]);

      const headerKehadiran = [
        "NO",
        "NIS",
        "NAMA",
        "L/P",
        "KELAS",
        "KETIDAKHADIRAN",
        "Jumlah",
        "Sakit",
        "Izin",
        "Alpa",
        "% Kehadiran",
      ];
      const headerRowKehadiran = sheetKehadiran.addRow(headerKehadiran);
      styleRow(headerRowKehadiran, styleHeader);
      styleResult(headerRowKehadiran.getCell(colPersenKehadiran));
      headerRowKehadiran.height = 25;

      siswaList.forEach((siswa, idx) => {
        const absensiSiswa = absensiList.filter((a) => a.siswa_id === siswa.id);
        const total = absensiSiswa.length;
        const sakit = absensiSiswa.filter((a) => a.status === "sakit").length;
        const izin = absensiSiswa.filter((a) => a.status === "izin").length;
        const alpa = absensiSiswa.filter((a) => a.status === "alpha").length;
        const hadir = absensiSiswa.filter((a) => a.status === "hadir").length;
        const ketidakhadiran = total - hadir;
        const persenKehadiran = total > 0 ? (hadir / total) * 100 : null;

        const row = sheetKehadiran.addRow([
          idx + 1,
          siswa.nis || "-",
          siswa.nama_siswa,
          siswa.jenis_kelamin || "-",
          kelas.nama_kelas,
          ketidakhadiran,
          total,
          sakit,
          izin,
          alpa,
          persenKehadiran !== null ? Number(persenKehadiran.toFixed(2)) : null,
        ]);
        styleRow(row, styleBody);
        styleResult(row.getCell(colPersenKehadiran));
      });

      setAutoWidth(sheetKehadiran);
      setFixedWidth(sheetKehadiran, 4, 5);
      setFixedWidth(sheetKehadiran, 6, 10);
      setFixedWidth(sheetKehadiran, 7, 10);
      setFixedWidth(sheetKehadiran, 8, 10);
      setFixedWidth(sheetKehadiran, 9, 10);
      setFixedWidth(sheetKehadiran, 10, 10);
      setFixedWidth(sheetKehadiran, 11, 17);

      // ================================================================
      // 5. SHEET NILAI AKHIR
      // ================================================================
      const sheetAkhir = workbook.addWorksheet("NILAI AKHIR", {
        properties: { tabColor: { argb: GREEN } },
      });

      const headerAkhir = [
        "NO",
        "Nama Siswa",
        `Formatif (${bobotFormatif}%)`,
        `Sumatif (${bobotSumatif}%)`,
        `UTS (${bobotUts}%)`,
        `UAS (${bobotUas}%)`,
        `Kehadiran (${bobotKehadiran}%)`,
        "Nilai Akhir Rapor",
      ];
      const colCountAkhir = headerAkhir.length;
      const colNilaiAkhir = colCountAkhir;

      addHeading(sheetAkhir, "NILAI AKHIR RAPOR", colCountAkhir, 1);
      sheetAkhir.addRow([]);

      const headerRowAkhir = sheetAkhir.addRow(headerAkhir);
      styleRow(headerRowAkhir, styleHeader);
      styleResult(headerRowAkhir.getCell(colNilaiAkhir));
      headerRowAkhir.height = 25;

      siswaList.forEach((siswa, idx) => {
        const row = sheetAkhir.addRow([
          idx + 1,
          siswa.nama_siswa,
          formatifAvgMap[siswa.id] !== null
            ? Number(formatifAvgMap[siswa.id].toFixed(2))
            : null,
          sumatifAvgMap[siswa.id] !== null
            ? Number(sumatifAvgMap[siswa.id].toFixed(2))
            : null,
          utsAvgMap[siswa.id] !== null
            ? Number(utsAvgMap[siswa.id].toFixed(2))
            : null,
          uasAvgMap[siswa.id] !== null
            ? Number(uasAvgMap[siswa.id].toFixed(2))
            : null,
          kehadiranMap[siswa.id] !== null
            ? Number(kehadiranMap[siswa.id].toFixed(2))
            : null,
          raporMap[siswa.id] !== null
            ? Number(raporMap[siswa.id].toFixed(2))
            : null,
        ]);
        styleRow(row, styleBody);

        // MODIFIKASI: warnai komponen (kolom 3-7) dengan cyan
        for (let i = 3; i <= 7; i++) {
          styleNilai(row.getCell(i));
        }
        styleResult(row.getCell(colNilaiAkhir));
      });

      setAutoWidth(sheetAkhir);

      // ================================================================
      // GENERATE FILE
      // ================================================================
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(
        blob,
        `Rapor_${mapel.nama_mapel}_${kelas.nama_kelas}.xlsx`.replace(
          /\s+/g,
          "_",
        ),
      );
    } catch (error) {
      console.error("Gagal export:", error);
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
          <p className="mt-3 text-sm">Memuat data penilaian...</p>
        </div>
      </div>
    );
  }

  if (!kelas || !mapel) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">
          Data Tidak Ditemukan
        </h1>
        <p className="mt-2 text-sm text-red-600">
          Kelas atau mata pelajaran tidak ditemukan.
        </p>
      </div>
    );
  }

  const TABS = [
    { key: "formatif", label: "Nilai Formatif" },
    { key: "sumatif", label: "Nilai Sumatif" },
    {
      key: "ujian",
      label: `Nilai Ujian${
        ujianAktif.length > 0 ? ` (${ujianAktif.length})` : ""
      }`,
    },
    { key: "rapor", label: "Nilai Rapor" },
  ];

  return (
    <section className="py-8 lg:p-10 space-y-6 max-w-7xl mx-auto px-4">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="text-sm font-semibold text-slate-600 hover:text-blue-600 mb-4 inline-flex items-center gap-1"
        >
          ← Kembali
        </button>
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white rounded-3xl p-6 md:p-8 shadow-lg">
          <div className="absolute right-0 bottom-0 w-80 h-80 bg-white/5 rounded-full translate-x-10 translate-y-20 pointer-events-none" />
          <div className="relative z-10 space-y-1">
            <span className="text-xs uppercase tracking-widest text-blue-200 font-semibold block">
              {kelas.nama_kelas} · Tingkat {kelas.tingkat}
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide uppercase">
              {mapel.nama_mapel}
            </h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================= TAB FORMATIF ================= */}
      {activeTab === "formatif" && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700">
                Tujuan Pembelajaran (TP)
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Setiap TP memiliki 4 kriteria penilaian (K1-K4). Nilai akhir
                formatif = rata-rata semua K yang terisi.
              </p>
            </div>
            {!addingTp ? (
              <button
                onClick={() => setAddingTp(true)}
                disabled={tpList.length >= DAFTAR_NO_TP.length}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 rounded-full px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                + Tambah TP
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={selectedNoTp}
                  onChange={(e) => setSelectedNoTp(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">Pilih TP</option>
                  {DAFTAR_NO_TP.filter(
                    (no) => !tpList.some((tp) => tp.no_tp === no),
                  ).map((no) => (
                    <option key={no} value={no}>
                      {no}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddTp}
                  disabled={!selectedNoTp || savingTp}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg"
                >
                  {savingTp ? "..." : "Simpan"}
                </button>
                <button
                  onClick={() => {
                    setAddingTp(false);
                    setSelectedNoTp("");
                  }}
                  className="text-xs font-semibold text-gray-500 px-2"
                >
                  Batal
                </button>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
            {tpList.length === 0 ? (
              <div className="p-8 text-center text-gray-400 font-medium text-sm">
                Belum ada TP. Tambahkan TP terlebih dahulu untuk mulai menginput
                nilai formatif.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th
                      rowSpan={2}
                      className="text-left px-4 py-3 font-bold sticky left-0 z-20 bg-gray-50 min-w-[150px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] align-bottom"
                    >
                      Siswa
                    </th>
                    {tpList.map((tp) => (
                      <th
                        key={tp.id}
                        colSpan={4}
                        className="text-center px-2 py-2 font-bold border-l border-gray-200 min-w-[80px]"
                      >
                        {tp.no_tp}
                      </th>
                    ))}
                    <th
                      rowSpan={2}
                      className="text-center px-4 py-3 font-bold min-w-[110px] bg-blue-50 text-blue-700 align-bottom whitespace-nowrap"
                    >
                      Nilai Akhir
                    </th>
                  </tr>
                  <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
                    {tpList.map((tp) =>
                      ["K1", "K2", "K3", "K4"].map((k, i) => (
                        <th
                          key={`${tp.id}-${k}`}
                          className={`text-center px-1 py-1.5 font-semibold min-w-[50px] ${
                            i === 0 ? "border-l border-gray-200" : ""
                          }`}
                        >
                          {k}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {siswaList.map((siswa, idx) => {
                    const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                    const avg = formatifAvgMap[siswa.id];
                    return (
                      <tr key={siswa.id} className={rowBg}>
                        <td
                          className={`px-4 py-2 font-semibold text-gray-800 sticky left-0 z-10 min-w-[150px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${rowBg}`}
                        >
                          {siswa.nama_siswa}
                        </td>
                        {tpList.map((tp) => {
                          const rec = nilaiFormatif[siswa.id]?.[tp.id];
                          return ["k1", "k2", "k3", "k4"].map((kField, i) => {
                            const cellKey = `f-${siswa.id}-${tp.id}-${kField}`;
                            return (
                              <td
                                key={cellKey}
                                className={`px-1 py-1.5 text-center ${
                                  i === 0 ? "border-l border-gray-100" : ""
                                }`}
                              >
                                <NilaiInput
                                  key={`${siswa.id}-${tp.id}-${kField}`}
                                  value={rec?.[kField]}
                                  status={cellStatus[cellKey]}
                                  onSave={(v) =>
                                    handleSaveFormatif(
                                      siswa.id,
                                      tp.id,
                                      kField,
                                      v,
                                    )
                                  }
                                  width="w-16" // MODIFIKASI: lebar input diperbesar
                                />
                              </td>
                            );
                          });
                        })}
                        <td
                          className={`px-4 py-2 text-center font-extrabold font-mono ${getGradeColor(
                            avg,
                          )} bg-blue-50/50 whitespace-nowrap`}
                        >
                          {formatGrade(avg)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB SUMATIF ================= */}
      {activeTab === "sumatif" && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700">
                  Lingkup Materi (LP)
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Nilai akhir sumatif = rata-rata semua LP yang terisi.
                </p>
              </div>
              <button
                onClick={() => setShowAddLp((v) => !v)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 rounded-full px-4 py-2 whitespace-nowrap"
              >
                {showAddLp ? "Batal" : "+ Tambah LP"}
              </button>
            </div>

            {showAddLp && (
              <form
                onSubmit={handleAddLp}
                className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-end"
              >
                <div className="flex-1 w-full">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Nama Lingkup Materi
                  </label>
                  <input
                    type="text"
                    value={namaLp}
                    onChange={(e) => setNamaLp(e.target.value)}
                    placeholder="Contoh: Bilangan Bulat"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingLp}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap"
                >
                  {savingLp ? "Menyimpan..." : "Simpan LP"}
                </button>
              </form>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
            {lpList.length === 0 ? (
              <div className="p-8 text-center text-gray-400 font-medium text-sm">
                Belum ada LP. Tambahkan LP terlebih dahulu untuk mulai menginput
                nilai sumatif.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-bold sticky left-0 z-20 bg-gray-50 min-w-[150px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                      Siswa
                    </th>
                    {lpList.map((lp) => (
                      <th
                        key={lp.id}
                        className="text-center px-3 py-3 font-bold min-w-[120px]"
                      >
                        {lp.nama}
                      </th>
                    ))}
                    <th className="text-center px-4 py-3 font-bold min-w-[110px] bg-blue-50 text-blue-700 whitespace-nowrap">
                      Nilai Akhir
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {siswaList.map((siswa, idx) => {
                    const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                    const avg = sumatifAvgMap[siswa.id];
                    return (
                      <tr key={siswa.id} className={rowBg}>
                        <td
                          className={`px-4 py-2.5 font-semibold text-gray-800 sticky left-0 z-10 min-w-[150px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${rowBg}`}
                        >
                          {siswa.nama_siswa}
                        </td>
                        {lpList.map((lp) => {
                          const rec = nilaiSumatif[siswa.id]?.[lp.id];
                          const cellKey = `s-${siswa.id}-${lp.id}`;
                          return (
                            <td key={lp.id} className="px-3 py-2 text-center">
                              <NilaiInput
                                key={`${siswa.id}-${lp.id}`}
                                value={rec?.nilai}
                                status={cellStatus[cellKey]}
                                onSave={(v) =>
                                  handleSaveSumatif(siswa.id, lp.id, v)
                                }
                                width="w-24" // MODIFIKASI: lebar input diperbesar
                              />
                            </td>
                          );
                        })}
                        <td
                          className={`px-4 py-2.5 text-center font-extrabold font-mono ${getGradeColor(
                            avg,
                          )} bg-blue-50/50 whitespace-nowrap`}
                        >
                          {formatGrade(avg)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB UJIAN ================= */}
      {activeTab === "ujian" && (
        <div className="space-y-4">
          {ujianAktif.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 text-center text-gray-400 font-medium text-sm">
              Belum ada ujian yang diaktifkan oleh Admin untuk kelas ini.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {ujianAktif.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUjianId(u.id)}
                    className={`text-xs font-bold px-4 py-2 rounded-full border transition-colors ${
                      selectedUjianId === u.id
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
                    }`}
                  >
                    {u.nama_ujian}
                    <span className="ml-1.5 opacity-70">
                      (
                      {u.jenis_ujian === JENIS_UTS
                        ? "UTS"
                        : u.jenis_ujian === JENIS_UAS
                          ? "UAS"
                          : u.jenis_ujian}
                      )
                    </span>
                  </button>
                ))}
              </div>

              {!selectedUjianId ? (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 text-center text-gray-400 font-medium text-sm">
                  Pilih ujian di atas untuk mulai input nilai.
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-bold min-w-[180px]">
                          Siswa
                        </th>
                        <th className="text-center px-4 py-3 font-bold min-w-[120px]">
                          Nilai Ujian
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {siswaList.map((siswa, idx) => {
                        const rec = nilaiUjian[selectedUjianId]?.[siswa.id];
                        const cellKey = `u-${siswa.id}`;
                        return (
                          <tr
                            key={siswa.id}
                            className={
                              idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                            }
                          >
                            <td className="px-4 py-2.5 font-semibold text-gray-800">
                              {siswa.nama_siswa}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <NilaiInput
                                key={`${siswa.id}-${selectedUjianId}`}
                                value={rec?.nilai}
                                status={cellStatus[cellKey]}
                                onSave={(v) => handleSaveUjian(siswa.id, v)}
                                width="w-24" // MODIFIKASI: lebar input diperbesar
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================= TAB RAPOR ================= */}
      {activeTab === "rapor" && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700">
                Rekap Nilai Rapor
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Nilai akhir dihitung berdasarkan bobot dari Admin: Formatif{" "}
                {bobotFormatif}%, Sumatif {bobotSumatif}%, UTS {bobotUts}%, UAS{" "}
                {bobotUas}%, Kehadiran {bobotKehadiran}%.
              </p>
            </div>
            <button
              onClick={handleExportRapor}
              disabled={exporting}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap inline-flex items-center gap-2"
            >
              {exporting ? "Mengexport..." : "⬇ Export Excel"}
            </button>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-bold sticky left-0 z-20 bg-gray-50 min-w-[150px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                    Siswa
                  </th>
                  <th className="text-center px-3 py-3 font-bold min-w-[100px]">
                    Formatif
                  </th>
                  <th className="text-center px-3 py-3 font-bold min-w-[100px]">
                    Sumatif
                  </th>
                  <th className="text-center px-3 py-3 font-bold min-w-[90px]">
                    UTS
                  </th>
                  <th className="text-center px-3 py-3 font-bold min-w-[90px]">
                    UAS
                  </th>
                  <th className="text-center px-3 py-3 font-bold min-w-[100px]">
                    Kehadiran
                  </th>
                  <th className="text-center px-4 py-3 font-bold min-w-[120px] bg-blue-50 text-blue-700 whitespace-nowrap">
                    Nilai Akhir
                  </th>
                </tr>
              </thead>
              <tbody>
                {siswaList.map((siswa, idx) => {
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                  return (
                    <tr key={siswa.id} className={rowBg}>
                      <td
                        className={`px-4 py-2.5 font-semibold text-gray-800 sticky left-0 z-10 min-w-[150px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${rowBg}`}
                      >
                        {siswa.nama_siswa}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-center font-semibold ${getGradeColor(
                          formatifAvgMap[siswa.id],
                        )} whitespace-nowrap`}
                      >
                        {formatGrade(formatifAvgMap[siswa.id])}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-center font-semibold ${getGradeColor(
                          sumatifAvgMap[siswa.id],
                        )} whitespace-nowrap`}
                      >
                        {formatGrade(sumatifAvgMap[siswa.id])}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-center font-semibold ${getGradeColor(
                          utsAvgMap[siswa.id],
                        )} whitespace-nowrap`}
                      >
                        {formatGrade(utsAvgMap[siswa.id])}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-center font-semibold ${getGradeColor(
                          uasAvgMap[siswa.id],
                        )} whitespace-nowrap`}
                      >
                        {formatGrade(uasAvgMap[siswa.id])}
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold text-slate-600 whitespace-nowrap">
                        {kehadiranMap[siswa.id] !== null
                          ? `${kehadiranMap[siswa.id].toFixed(1)}%`
                          : "-"}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-center font-extrabold font-mono ${getGradeColor(
                          raporMap[siswa.id],
                        )} bg-blue-50/50 whitespace-nowrap`}
                      >
                        {formatGrade(raporMap[siswa.id])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
