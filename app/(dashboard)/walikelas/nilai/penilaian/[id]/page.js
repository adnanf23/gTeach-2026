"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  FormatifTable,
  SumatifTable,
  UjianTable,
  RaporTable,
} from "@/components/organism/table/penilaian-tables";

// ================================================================
// KONFIGURASI
// ================================================================
const JENIS_UTS = "ahb";
const JENIS_UAS = "asas";

const SEMUA_KRITERIA = ["k1", "k2", "k3", "k4"];

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

// ================================================================
// STYLE BERSAMA
// ================================================================
const CARD = "rounded-2xl border border-slate-200 bg-white shadow-sm";

const BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white hover:bg-blue-700`;
const BTN_OUTLINE = `${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const BTN_GHOST = `${BTN} text-slate-600 hover:bg-slate-100`;
const BTN_DANGER = `${BTN} bg-red-600 text-white hover:bg-red-700`;

const SCAN_STEPS = [
  { key: "pick", label: "Pilih foto" },
  { key: "preview", label: "Pratinjau" },
  { key: "scanning", label: "Membaca" },
  { key: "staging", label: "Periksa" },
  { key: "done", label: "Selesai" },
];

// ================================================================
// KOMPONEN UI KECIL
// ================================================================
const ICONS = {
  back: ["m12 19-7-7 7-7", "M19 12H5"],
  plus: ["M5 12h14", "M12 5v14"],
  download: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "m7 10 5 5 5-5",
    "M12 15V3",
  ],
  upload: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "m17 8-5-5-5 5",
    "M12 3v12",
  ],
  camera: [
    "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
    "M9 13a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  ],
  scan: [
    "M3 7V5a2 2 0 0 1 2-2h2",
    "M17 3h2a2 2 0 0 1 2 2v2",
    "M21 17v2a2 2 0 0 1-2 2h-2",
    "M7 21H5a2 2 0 0 1-2-2v-2",
    "M7 12h10",
  ],
  trash: [
    "M3 6h18",
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  ],
  x: ["M18 6 6 18", "m6 6 12 12"],
  check: ["M20 6 9 17l-5-5"],
  alert: [
    "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    "M12 9v4",
    "M12 17h.01",
  ],
  swap: ["m21 16-4 4-4-4", "M17 20V4", "m3 8 4-4 4 4", "M7 4v16"],
  chevron: ["m6 9 6 6 6-6"],
};

function Icon({ name, className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {(ICONS[name] || []).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

function Modal({ onClose, size = "max-w-md", children }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full ${size} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose, disabled }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          disabled={disabled}
          aria-label="Tutup"
          className="-mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
        >
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

function ModalFooter({ left, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
      <div className="min-w-0 text-xs text-slate-500">{left}</div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  );
}

function StatBox({ value, label, tone = "slate" }) {
  const tones = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    slate: "border-slate-100 bg-slate-50 text-slate-700",
  };
  return (
    <div className={`rounded-xl border px-3 py-3 text-center ${tones[tone]}`}>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium leading-tight">
        {label}
      </div>
    </div>
  );
}

function ErrorList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="max-h-40 overflow-y-auto rounded-xl border border-red-100 bg-red-50 p-3 text-left">
      <div className="mb-1 text-xs font-bold text-red-700">
        {title} ({items.length})
      </div>
      <ul className="space-y-0.5 text-xs text-red-600">
        {items.map((err, i) => (
          <li key={i}>• {err}</li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {text && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">{text}</p>
      )}
    </div>
  );
}

function SectionHeader({ title, description, children }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const tones = {
    success: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-slate-800 text-white",
  };
  return (
    <div
      role="status"
      className={`fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${tones[toast.type] || tones.info}`}
    >
      {toast.message}
    </div>
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

  // TOAST
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  // ================= PINDAH MAPEL CEPAT =================
  const [mapelList, setMapelList] = useState([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const quickRef = useRef(null);
  const quickInputRef = useRef(null);

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

  // STATUS CELL
  const [cellStatus, setCellStatus] = useState({});
  const [exporting, setExporting] = useState(false);

  // KONFIRMASI HAPUS
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // TEMPLATE & IMPORT
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateTpCount, setTemplateTpCount] = useState(1);
  const [templateKCount, setTemplateKCount] = useState(4);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importInputRef = useRef(null);

  // SCAN KERTAS
  const [scanOpen, setScanOpen] = useState(false);
  const [scanStep, setScanStep] = useState("pick");
  const [scanImageFile, setScanImageFile] = useState(null);
  const [scanImageUrl, setScanImageUrl] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanRawText, setScanRawText] = useState("");
  const [scanRows, setScanRows] = useState([]);
  const [scanDetectedTp, setScanDetectedTp] = useState("");
  const [scanKCount, setScanKCount] = useState(4);
  const [scanSaving, setScanSaving] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanShowRawText, setScanShowRawText] = useState(false);
  const scanInputRef = useRef(null);

  // ================= CLICK OUTSIDE HANDLER =================
  useEffect(() => {
    function onDocClick(e) {
      if (!quickRef.current) return;
      if (!quickRef.current.contains(e.target)) {
        setQuickOpen(false);
        setQuickSearch("");
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") {
        setQuickOpen(false);
        setQuickSearch("");
      }
    }
    if (quickOpen) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onEsc);
      setTimeout(() => quickInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [quickOpen]);

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

        const [siswaData, tpData, lpData, ujianData, absensiData] =
          await Promise.all([
            pb.collection("siswa").getFullList({
              filter: `kelas_id = "${kelasData.id}"`,
              sort: "nama_siswa",
              requestKey: null,
            }),
            pb.collection("tujuan_pembelajaran").getFullList({
              filter: `mapel_id ~ "${mapelId}" && kelas_id ~ "${kelasData.id}"`,
              requestKey: null,
            }),
            pb.collection("lingkup_materi").getFullList({
              filter: `mapel_id ~ "${mapelId}" && kelas_id ~ "${kelasData.id}"`,
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
        setUjianAktif(ujianData);
        setAbsensiList(absensiData);

        // ================= FETCH DAFTAR MAPEL UNTUK PINDAH CEPAT =================
        try {
          const [mapelKhusus, mapelTingkat, plotingData] = await Promise.all([
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
          ]);

          const combinedMapel = [...mapelKhusus, ...mapelTingkat];
          const uniqueMapelRaw = Array.from(
            new Map(combinedMapel.map((item) => [item.id, item])).values(),
          );

          const uniqueMapel = uniqueMapelRaw.filter((m) => {
            const spesifik = m.spesifik_kelas_id;
            const punyaRestriksi =
              Array.isArray(spesifik) && spesifik.length > 0;
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

          const mapelWithGuru = uniqueMapel.map((m) => ({
            ...m,
            guru_pengampu: guruMap.get(m.id) || "Walikelas",
          }));

          mapelWithGuru.sort((a, b) =>
            (a.nama_mapel || a.nama || "").localeCompare(
              b.nama_mapel || b.nama || "",
              "id",
              { numeric: true, sensitivity: "base" },
            ),
          );

          setMapelList(mapelWithGuru);
        } catch (err) {
          console.error("Gagal fetch mapel list:", err);
        }

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

        if (ujianData.length > 0) {
          const ujianFilter = ujianData
            .map((u) => `pengaturan_ujian_id = "${u.id}"`)
            .join(" || ");

          const siswaFilter = siswaData.length
            ? siswaData.map((s) => `siswa_id = "${s.id}"`).join(" || ")
            : `id = ""`;

          const nuData = await pb.collection("nilai_ujian").getFullList({
            filter: `mapel_id = "${mapelId}" && (${ujianFilter}) && (${siswaFilter})`,
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

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (scanImageUrl) URL.revokeObjectURL(scanImageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup toast timer
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // ================= PINDAH KE MAPEL LAIN =================
  function pindahKeMapel(item) {
    setQuickOpen(false);
    setQuickSearch("");
    router.push(`/walikelas/nilai/penilaian/${item.id}`);
  }

  // ================= FILTER LIST UNTUK QUICK SWITCH =================
  const quickList = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q) return mapelList;

    return mapelList.filter((m) => {
      const nama = (m.nama_mapel || m.nama || "").toLowerCase();
      const kode = (m.kode_mapel || "").toLowerCase();
      const guru = (m.guru_pengampu || "").toLowerCase();
      return nama.includes(q) || kode.includes(q) || guru.includes(q);
    });
  }, [mapelList, quickSearch]);

  // ================= INDEKS MAPEL SEKARANG & NAVIGASI =================
  const currentIndex = useMemo(
    () => mapelList.findIndex((m) => m.id === mapelId),
    [mapelList, mapelId],
  );
  const prevMapel = currentIndex > 0 ? mapelList[currentIndex - 1] : null;
  const nextMapel =
    currentIndex >= 0 && currentIndex < mapelList.length - 1
      ? mapelList[currentIndex + 1]
      : null;

  // ================= RATA-RATA =================
  const formatifAvgMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => {
      const perTp = nilaiFormatif[s.id] || {};
      const semuaNilai = [];
      tpList.forEach((tp) => {
        const rec = perTp[tp.id];
        if (!rec) return;
        SEMUA_KRITERIA.forEach((k) => {
          const val = rec[k];
          if (typeof val === "number" && !isNaN(val) && val !== -1) {
            semuaNilai.push(val);
          }
        });
      });
      result[s.id] = average(semuaNilai);
    });
    return result;
  }, [nilaiFormatif, siswaList, tpList]);

  const sumatifAvgMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => {
      const perLp = nilaiSumatif[s.id] || {};
      const semuaNilai = [];
      Object.values(perLp).forEach((r) => {
        if (typeof r.nilai === "number" && !isNaN(r.nilai) && r.nilai !== -1) {
          semuaNilai.push(r.nilai);
        }
      });
      result[s.id] = average(semuaNilai);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nilaiUjian, utsIds, siswaList]);
  const uasAvgMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => (result[s.id] = avgUjian(uasIds, s.id)));
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nilaiUjian, uasIds, siswaList]);

  const raporMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => {
      const komponen = [
        formatifAvgMap[s.id],
        sumatifAvgMap[s.id],
        utsAvgMap[s.id],
        uasAvgMap[s.id],
      ].filter((v) => v !== null && v !== undefined && !isNaN(v) && v !== -1);

      if (komponen.length === 0) {
        result[s.id] = null;
        return;
      }
      result[s.id] = komponen.reduce((a, b) => a + b, 0) / komponen.length;
    });
    return result;
  }, [formatifAvgMap, sumatifAvgMap, utsAvgMap, uasAvgMap, siswaList]);

  // ================= TAMBAH TP =================
  async function handleAddTp() {
    if (!selectedNoTp || !kelas) return;
    try {
      setSavingTp(true);
      const created = await pb.collection("tujuan_pembelajaran").create(
        {
          no_tp: selectedNoTp,
          mapel_id: mapelId,
          kelas_id: kelas.id,
        },
        { requestKey: null },
      );
      setTpList((prev) =>
        [...prev, created].sort((a, b) => tpNumber(a) - tpNumber(b)),
      );
      setSelectedNoTp("");
      setAddingTp(false);
      showToast(`${created.no_tp} berhasil ditambahkan`, "success");
    } catch (error) {
      if (!error?.isAbort) {
        console.error("Gagal menambah TP:", error?.response?.data || error);
        showToast("Gagal menambahkan TP", "error");
      }
    } finally {
      setSavingTp(false);
    }
  }

  // ================= HAPUS TP =================
  function handleDeleteTp(tp) {
    setConfirmDialog({ type: "tp", data: tp });
  }

  async function confirmDeleteTp(tp) {
    setDeleting(true);
    try {
      const related = await pb.collection("nilai_formatif").getFullList({
        filter: `tp_id = "${tp.id}"`,
        requestKey: null,
      });
      await Promise.all(
        related.map((r) =>
          pb.collection("nilai_formatif").delete(r.id, { requestKey: null }),
        ),
      );
      await pb
        .collection("tujuan_pembelajaran")
        .delete(tp.id, { requestKey: null });

      setTpList((prev) => prev.filter((t) => t.id !== tp.id));
      setNilaiFormatif((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((siswaId) => {
          if (next[siswaId]?.[tp.id]) {
            const copy = { ...next[siswaId] };
            delete copy[tp.id];
            next[siswaId] = copy;
          }
        });
        return next;
      });

      setConfirmDialog(null);
      showToast(`${tp.no_tp} dihapus`, "info");
    } catch (error) {
      if (!error?.isAbort) {
        console.error("Gagal hapus TP:", error?.response?.data || error);
        showToast("Gagal menghapus TP", "error");
      }
    } finally {
      setDeleting(false);
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
      const created = await pb.collection("lingkup_materi").create(
        {
          nama: namaLp.trim(),
          mapel_id: mapelId,
          kelas_id: kelas.id,
          guru_id: user?.id,
        },
        { requestKey: null },
      );
      setLpList((prev) => [...prev, created]);
      setNamaLp("");
      setShowAddLp(false);
      showToast(`LP "${created.nama}" ditambahkan`, "success");
    } catch (error) {
      if (!error?.isAbort) {
        console.error("Gagal menambah LP:", error?.response?.data || error);
        showToast("Gagal menambahkan LP", "error");
      }
    } finally {
      setSavingLp(false);
    }
  }

  // ================= HAPUS LP =================
  function handleDeleteLp(lp) {
    setConfirmDialog({ type: "lp", data: lp });
  }

  async function confirmDeleteLp(lp) {
    setDeleting(true);
    try {
      const related = await pb.collection("nilai_sumatif").getFullList({
        filter: `lm_id = "${lp.id}"`,
        requestKey: null,
      });
      await Promise.all(
        related.map((r) =>
          pb.collection("nilai_sumatif").delete(r.id, { requestKey: null }),
        ),
      );
      await pb.collection("lingkup_materi").delete(lp.id, { requestKey: null });

      setLpList((prev) => prev.filter((l) => l.id !== lp.id));
      setNilaiSumatif((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((siswaId) => {
          if (next[siswaId]?.[lp.id]) {
            const copy = { ...next[siswaId] };
            delete copy[lp.id];
            next[siswaId] = copy;
          }
        });
        return next;
      });
      setConfirmDialog(null);
      showToast(`LP "${lp.nama}" dihapus`, "info");
    } catch (error) {
      if (!error?.isAbort) {
        console.error("Gagal hapus LP:", error?.response?.data || error);
        showToast("Gagal menghapus LP", "error");
      }
    } finally {
      setDeleting(false);
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
            mapel_id: mapelId,
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

  // ================= SCAN KERTAS =================
  function resetScan() {
    if (scanImageUrl) URL.revokeObjectURL(scanImageUrl);
    setScanStep("pick");
    setScanImageFile(null);
    setScanImageUrl(null);
    setScanProgress(0);
    setScanRawText("");
    setScanRows([]);
    setScanDetectedTp("");
    setScanKCount(4);
    setScanResult(null);
    setScanShowRawText(false);
  }

  function openScanModal() {
    resetScan();
    setScanOpen(true);
  }

  function closeScanModal() {
    if (scanSaving) return;
    if (scanImageUrl) URL.revokeObjectURL(scanImageUrl);
    setScanOpen(false);
    setScanStep("pick");
    setScanImageFile(null);
    setScanImageUrl(null);
    setScanProgress(0);
    setScanRawText("");
    setScanRows([]);
    setScanResult(null);
  }

  function handleScanPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (scanImageUrl) URL.revokeObjectURL(scanImageUrl);
    setScanImageFile(file);
    setScanImageUrl(URL.createObjectURL(file));
    setScanStep("preview");
  }

  async function preprocessImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 2600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let minLum = 255;
        let maxLum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (g < minLum) minLum = g;
          if (g > maxLum) maxLum = g;
        }
        const range = Math.max(1, maxLum - minLum);

        for (let i = 0; i < data.length; i += 4) {
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          let v = ((g - minLum) / range) * 255;
          v = Math.pow(v / 255, 0.6) * 255;
          v = Math.max(0, Math.min(255, v));
          data[i] = data[i + 1] = data[i + 2] = v;
        }
        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(img.src);
            resolve(blob);
          },
          "image/png",
          1.0,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(file);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleRunOcr() {
    if (!scanImageFile) return;
    try {
      setScanStep("scanning");
      setScanProgress(10);
      setScanRawText("");
      setScanRows([]);

      const processedBlob = await preprocessImage(scanImageFile);
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(processedBlob);
      });

      setScanProgress(20);

      const batches = [
        { start: 1, end: 15, label: "baris nomor 1 sampai 15" },
        { start: 16, end: 50, label: "baris nomor 16 sampai 50" },
      ];

      let detectedTp = "";
      let detectedK = 0;
      let allRows = [];
      const debugInfo = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        setScanProgress(20 + i * 30);

        try {
          const res = await fetch("/api/ocr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: base64,
              rowRange: batch.label,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            debugInfo.push({
              batch: batch.label,
              status: res.status,
              error: data?.error || "unknown",
            });
            if (i === 0) {
              throw new Error(data?.error || `Gagal memproses ${batch.label}`);
            }
            continue;
          }

          debugInfo.push({
            batch: batch.label,
            status: 200,
            tp: data.tp,
            kCount: data.kCount,
            rowCount: (data.rows || []).length,
          });

          if (data.tp && !detectedTp) detectedTp = data.tp;
          if (data.kCount && !detectedK) detectedK = data.kCount;
          if (Array.isArray(data.rows)) allRows.push(...data.rows);

          if (!data.rows || data.rows.length === 0) break;
        } catch (batchErr) {
          if (i === 0) throw batchErr;
          console.warn(`Batch ${i + 1} gagal, lanjut:`, batchErr);
        }

        if (i < batches.length - 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      setScanProgress(90);

      if (!detectedTp || detectedK === 0) {
        alert(
          "Tidak terdeteksi TP yang terisi. Pastikan foto jelas dan ada tulisan nilai di kolom TP.",
        );
        setScanStep("preview");
        return;
      }

      const seen = new Set();
      const uniqueRows = [];
      for (const r of allRows) {
        const nis = String(r.nis || "").replace(/\D/g, "");
        if (nis && !seen.has(nis)) {
          seen.add(nis);
          uniqueRows.push(r);
        }
      }

      setScanDetectedTp(detectedTp);
      setScanKCount(detectedK);

      const rows = uniqueRows.map((r, i) => {
        const nisClean = String(r.nis || "").replace(/\D/g, "");
        const siswa = siswaList.find(
          (s) => String(s.nis || "").replace(/\D/g, "") === nisClean,
        );
        const values = Array.isArray(r.values)
          ? r.values.map((v) =>
              v === null || v === undefined || v === "" ? "" : Number(v),
            )
          : [];

        return {
          key: `r-${i}-${Date.now()}`,
          rawLine: `${nisClean} ${values.join(" ")}`,
          nameRaw: siswa?.nama_siswa || nisClean,
          nisDetected: nisClean,
          values,
          matchedSiswaId: siswa?.id || null,
          matchedSiswaNama: siswa?.nama_siswa || "",
          matchedBy: siswa ? "nis" : "",
          confidence: siswa ? "exact" : "none",
          include: !!siswa,
        };
      });

      setScanRawText(JSON.stringify(debugInfo, null, 2));
      setScanRows(rows);
      setScanProgress(100);
      setScanStep("staging");
    } catch (error) {
      console.error("Gagal OCR:", error);
      alert(
        "Gagal melakukan scan: " +
          (error?.message || "Cek koneksi & GROQ_API_KEY."),
      );
      setScanStep("preview");
    }
  }

  function handleScanRowChange(key, patch) {
    setScanRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function handleScanRowValue(key, kIdx, val) {
    setScanRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const v = [...r.values];
        v[kIdx] = val === "" ? "" : Number(val);
        return { ...r, values: v };
      }),
    );
  }

  function handleScanRemoveRow(key) {
    setScanRows((prev) => prev.filter((r) => r.key !== key));
  }

  function handleScanAddRow() {
    setScanRows((prev) => [
      ...prev,
      {
        key: `r-manual-${Date.now()}`,
        rawLine: "(manual)",
        nameRaw: "",
        nisDetected: "",
        values: [],
        matchedSiswaId: null,
        matchedSiswaNama: "",
        matchedBy: "",
        confidence: "manual",
        include: true,
      },
    ]);
  }

  async function handleSaveScan() {
    if (!scanDetectedTp) {
      alert("TP tidak terdeteksi. Scan ulang.");
      return;
    }

    const rowsToSave = scanRows.filter(
      (r) =>
        r.include &&
        r.matchedSiswaId &&
        r.values.some(
          (v) => v !== "" && v !== undefined && v !== null && !isNaN(Number(v)),
        ),
    );
    if (rowsToSave.length === 0) {
      alert("Tidak ada baris yang bisa disimpan.");
      return;
    }

    try {
      setScanSaving(true);
      let savedCount = 0;
      let skippedCount = 0;
      const errors = [];

      let tp = tpList.find((t) => t.no_tp === scanDetectedTp);
      if (!tp) {
        try {
          tp = await pb.collection("tujuan_pembelajaran").create(
            {
              no_tp: scanDetectedTp,
              mapel_id: mapelId,
              kelas_id: kelas.id,
            },
            { requestKey: null },
          );
          setTpList((prev) =>
            [...prev, tp].sort((a, b) => tpNumber(a) - tpNumber(b)),
          );
        } catch (err) {
          alert(
            `Gagal membuat ${scanDetectedTp} baru: ${err?.message || "unknown error"}`,
          );
          return;
        }
      }

      const tpId = tp.id;
      const nilaiMap = JSON.parse(JSON.stringify(nilaiFormatif || {}));
      const kLabels = SEMUA_KRITERIA.slice(0, scanKCount);

      for (const row of rowsToSave) {
        const siswaId = row.matchedSiswaId;
        if (!nilaiMap[siswaId]) nilaiMap[siswaId] = {};
        let existingRec = nilaiMap[siswaId][tpId];

        const toSave = {};
        for (let k = 0; k < kLabels.length; k++) {
          const kField = kLabels[k];
          const raw = row.values[k];
          if (
            raw === "" ||
            raw === undefined ||
            raw === null ||
            isNaN(Number(raw))
          )
            continue;
          const val = Number(raw);
          if (val < 0 || val > 100) continue;

          const cur = existingRec?.[kField];
          if (cur === undefined || cur === null || cur === -1) {
            toSave[kField] = val;
          } else {
            skippedCount++;
          }
        }

        if (Object.keys(toSave).length === 0) continue;

        try {
          if (existingRec?.recordId) {
            const payload = {
              k1: existingRec.k1 ?? -1,
              k2: existingRec.k2 ?? -1,
              k3: existingRec.k3 ?? -1,
              k4: existingRec.k4 ?? -1,
            };
            for (const [kf, v] of Object.entries(toSave)) payload[kf] = v;
            const saved = await pb
              .collection("nilai_formatif")
              .update(existingRec.recordId, payload, { requestKey: null });
            existingRec = { recordId: saved.id, ...payload };
            nilaiMap[siswaId][tpId] = existingRec;
          } else {
            const payload = {
              tp_id: tpId,
              siswa_id: siswaId,
              kelas_id: kelas.id,
              k1: -1,
              k2: -1,
              k3: -1,
              k4: -1,
            };
            for (const [kf, v] of Object.entries(toSave)) payload[kf] = v;
            const saved = await pb
              .collection("nilai_formatif")
              .create(payload, { requestKey: null });
            existingRec = {
              recordId: saved.id,
              k1: payload.k1,
              k2: payload.k2,
              k3: payload.k3,
              k4: payload.k4,
            };
            nilaiMap[siswaId][tpId] = existingRec;
          }
          savedCount += Object.keys(toSave).length;
        } catch (err) {
          errors.push(
            `${row.matchedSiswaNama || row.nameRaw}: ${err?.message || "gagal"}`,
          );
        }
      }

      setNilaiFormatif(nilaiMap);
      setScanResult({ saved: savedCount, skipped: skippedCount, errors });
      setScanStep("done");
      showToast(`${savedCount} nilai berhasil disimpan`, "success");

      setTimeout(() => {
        if (scanImageUrl) URL.revokeObjectURL(scanImageUrl);
        setScanOpen(false);
        setScanStep("pick");
        setScanImageFile(null);
        setScanImageUrl(null);
        setScanProgress(0);
        setScanRawText("");
        setScanRows([]);
        setScanResult(null);
      }, 2000);
    } catch (error) {
      console.error("Gagal simpan hasil scan:", error);
      showToast("Gagal menyimpan hasil scan", "error");
    } finally {
      setScanSaving(false);
    }
  }

  // ================= DOWNLOAD TEMPLATE =================
  async function handleDownloadTemplate() {
    try {
      setDownloadingTemplate(true);

      const GREEN = "FFD9EAD3";
      const CYAN = "FFE0FFFF";
      const YELLOW = "FFFFFF00";

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistem Penilaian";
      workbook.created = new Date();

      const kLabels = SEMUA_KRITERIA.slice(0, templateKCount);
      const tpLabels = DAFTAR_NO_TP.slice(0, templateTpCount);
      const totalCols = 3 + templateTpCount * templateKCount;

      const sheet = workbook.addWorksheet("TEMPLATE FORMATIF");

      const addBorder = (cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
      };
      const styleHeaderCell = (cell, horizontal = "center") => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GREEN },
        };
        cell.font = { bold: true, color: { argb: "FF000000" }, size: 11 };
        cell.alignment = { horizontal, vertical: "middle", wrapText: true };
        addBorder(cell);
      };
      const styleBodyCell = (cell, horizontal = "center") => {
        cell.alignment = { horizontal, vertical: "middle" };
        addBorder(cell);
      };
      const styleInputCell = (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: CYAN },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        addBorder(cell);
      };
      const styleFilledCell = (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: YELLOW },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.font = { bold: true };
        addBorder(cell);
      };

      sheet.mergeCells(1, 1, 1, totalCols);
      const titleCell = sheet.getCell(1, 1);
      titleCell.value = `TEMPLATE NILAI FORMATIF - ${mapel?.nama_mapel || ""} - ${kelas?.nama_kelas || ""}`;
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(1).height = 26;

      const hr1 = sheet.getRow(2);
      hr1.getCell(1).value = "NO";
      hr1.getCell(2).value = "NAMA SISWA";
      hr1.getCell(3).value = "NIS";
      sheet.mergeCells(2, 1, 3, 1);
      sheet.mergeCells(2, 2, 3, 2);
      sheet.mergeCells(2, 3, 3, 3);

      tpLabels.forEach((tp, t) => {
        const startCol = 4 + t * templateKCount;
        hr1.getCell(startCol).value = tp;
        if (templateKCount > 1) {
          sheet.mergeCells(2, startCol, 2, startCol + templateKCount - 1);
        }
      });

      const hr2 = sheet.getRow(3);
      tpLabels.forEach((_, t) => {
        const startCol = 4 + t * templateKCount;
        for (let k = 0; k < templateKCount; k++) {
          hr2.getCell(startCol + k).value = kLabels[k].toUpperCase();
        }
      });

      for (let c = 1; c <= totalCols; c++) {
        styleHeaderCell(sheet.getCell(2, c), c === 2 ? "left" : "center");
        if (c >= 4) styleHeaderCell(sheet.getCell(3, c));
      }
      sheet.getRow(2).height = 26;
      sheet.getRow(3).height = 20;

      const tpIdByNo = new Map();
      tpList.forEach((tp) => tpIdByNo.set(tp.no_tp, tp.id));

      siswaList.forEach((s, idx) => {
        const r = sheet.getRow(4 + idx);
        r.getCell(1).value = idx + 1;
        r.getCell(2).value = s.nama_siswa;
        r.getCell(3).value = s.nis || "";

        styleBodyCell(r.getCell(1));
        styleBodyCell(r.getCell(2), "left");
        styleBodyCell(r.getCell(3));

        tpLabels.forEach((tpNo, t) => {
          const startCol = 4 + t * templateKCount;
          const tpId = tpIdByNo.get(tpNo);
          const rec = tpId ? nilaiFormatif[s.id]?.[tpId] : null;

          for (let k = 0; k < templateKCount; k++) {
            const kField = kLabels[k];
            const cell = r.getCell(startCol + k);
            const rawVal = rec?.[kField];

            if (
              rawVal !== undefined &&
              rawVal !== null &&
              rawVal !== -1 &&
              !isNaN(Number(rawVal))
            ) {
              cell.value = Number(rawVal);
              styleFilledCell(cell);
            } else {
              cell.value = null;
              styleInputCell(cell);
            }
          }
        });
      });

      sheet.getColumn(1).width = 6;
      sheet.getColumn(2).width = 28;
      sheet.getColumn(3).width = 14;
      for (let c = 4; c <= totalCols; c++) sheet.getColumn(c).width = 9;

      sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 3 }];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const fileName =
        `Template_Formatif_${mapel?.nama_mapel || "Mapel"}_${kelas?.nama_kelas || "Kelas"}.xlsx`.replace(
          /\s+/g,
          "_",
        );
      saveAs(blob, fileName);
      setShowTemplateDialog(false);
      showToast("Template diunduh", "success");
    } catch (error) {
      console.error("Gagal download template:", error);
      showToast("Gagal mengunduh template", "error");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  // ================= IMPORT NILAI FORMATIF =================
  async function handleImportFormatif(file) {
    if (!file) return;
    try {
      setImporting(true);
      setImportResult(null);

      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("Sheet tidak ditemukan pada file.");

      let tpHeaderRow = -1;
      for (let r = 1; r <= 5; r++) {
        const row = sheet.getRow(r);
        let found = false;
        row.eachCell({ includeEmpty: false }, (cell) => {
          const val = String(cell.value || "").trim();
          if (/^TP\s*\d+$/i.test(val)) found = true;
        });
        if (found) {
          tpHeaderRow = r;
          break;
        }
      }
      if (tpHeaderRow === -1) {
        throw new Error(
          "Format template tidak dikenali. Header TP tidak ditemukan.",
        );
      }
      const kHeaderRow = tpHeaderRow + 1;
      const dataStartRow = tpHeaderRow + 2;

      const headerRow1 = sheet.getRow(tpHeaderRow);
      const headerRow2 = sheet.getRow(kHeaderRow);

      const tpCells = [];
      headerRow1.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const val = readCellString(cell);
        const m = val.match(/^TP\s*(\d+)$/i);
        if (m) {
          tpCells.push({
            tpNo: `TP ${parseInt(m[1], 10)}`,
            startCol: colNumber,
          });
        }
      });
      tpCells.sort((a, b) => a.startCol - b.startCol);
      if (tpCells.length === 0) {
        throw new Error("Kolom TP tidak ditemukan pada header.");
      }

      for (let i = 0; i < tpCells.length; i++) {
        if (i < tpCells.length - 1) {
          tpCells[i].endCol = tpCells[i + 1].startCol - 1;
        } else {
          let lastCol = tpCells[i].startCol;
          headerRow2.eachCell({ includeEmpty: false }, (_, colNumber) => {
            if (colNumber > lastCol) lastCol = colNumber;
          });
          tpCells[i].endCol = lastCol;
        }
      }

      const colMap = [];
      for (const tp of tpCells) {
        for (let c = tp.startCol; c <= tp.endCol; c++) {
          const kVal = readCellString(headerRow2.getCell(c)).toLowerCase();
          if (SEMUA_KRITERIA.includes(kVal)) {
            colMap.push({ col: c, tpNo: tp.tpNo, kField: kVal });
          }
        }
      }
      if (colMap.length === 0) {
        throw new Error("Kolom kriteria (K1-K4) tidak ditemukan.");
      }

      const tpMap = new Map();
      tpList.forEach((tp) => tpMap.set(tp.no_tp, tp));

      const nilaiMap = JSON.parse(JSON.stringify(nilaiFormatif || {}));

      let createdTpCount = 0;
      let savedCount = 0;
      let skippedCount = 0;
      const errors = [];

      const lastRow = sheet.actualRowCount || sheet.rowCount;

      for (let rowNum = dataStartRow; rowNum <= lastRow; rowNum++) {
        const row = sheet.getRow(rowNum);
        const namaSiswa = readCellString(row.getCell(2));
        const nis = readCellString(row.getCell(3));

        if (!namaSiswa && !nis) continue;

        let siswa = null;
        if (nis) {
          siswa = siswaList.find(
            (s) =>
              String(s.nis || "")
                .replace(/\D/g, "")
                .trim() === String(nis).replace(/\D/g, "").trim(),
          );
        }
        if (!siswa && namaSiswa) {
          siswa = siswaList.find(
            (s) =>
              String(s.nama_siswa || "")
                .trim()
                .toLowerCase() === namaSiswa.toLowerCase(),
          );
        }
        if (!siswa) {
          errors.push(
            `Baris ${rowNum}: Siswa "${namaSiswa || nis}" tidak ditemukan.`,
          );
          continue;
        }

        const byTp = new Map();
        for (const cm of colMap) {
          const val = readCellNumber(row.getCell(cm.col));
          if (val === null || isNaN(val)) continue;
          if (val < 0 || val > 100) {
            errors.push(
              `Baris ${rowNum} ${cm.tpNo}-${cm.kField.toUpperCase()}: nilai ${val} di luar 0-100 (dilewati).`,
            );
            continue;
          }
          if (!byTp.has(cm.tpNo)) byTp.set(cm.tpNo, []);
          byTp.get(cm.tpNo).push({ kField: cm.kField, value: val });
        }

        for (const [tpNo, values] of byTp.entries()) {
          let tp = tpMap.get(tpNo);
          if (!tp) {
            try {
              const created = await pb.collection("tujuan_pembelajaran").create(
                {
                  no_tp: tpNo,
                  mapel_id: mapelId,
                  kelas_id: kelas.id,
                },
                { requestKey: null },
              );
              tp = created;
              tpMap.set(tpNo, tp);
              createdTpCount++;
            } catch (err) {
              errors.push(
                `Gagal membuat ${tpNo}: ${err?.message || "unknown error"}`,
              );
              continue;
            }
          }

          if (!nilaiMap[siswa.id]) nilaiMap[siswa.id] = {};
          let existingRec = nilaiMap[siswa.id][tp.id];

          const toSave = {};
          for (const { kField, value } of values) {
            const cur = existingRec?.[kField];
            if (cur === undefined || cur === null || cur === -1) {
              toSave[kField] = value;
            } else {
              skippedCount++;
            }
          }

          if (Object.keys(toSave).length === 0) continue;

          try {
            if (existingRec?.recordId) {
              const payload = {
                k1: existingRec.k1 ?? -1,
                k2: existingRec.k2 ?? -1,
                k3: existingRec.k3 ?? -1,
                k4: existingRec.k4 ?? -1,
              };
              for (const [k, v] of Object.entries(toSave)) payload[k] = v;
              const saved = await pb
                .collection("nilai_formatif")
                .update(existingRec.recordId, payload, { requestKey: null });
              existingRec = { recordId: saved.id, ...payload };
              nilaiMap[siswa.id][tp.id] = existingRec;
            } else {
              const payload = {
                tp_id: tp.id,
                siswa_id: siswa.id,
                kelas_id: kelas.id,
                k1: -1,
                k2: -1,
                k3: -1,
                k4: -1,
              };
              for (const [k, v] of Object.entries(toSave)) payload[k] = v;
              const saved = await pb
                .collection("nilai_formatif")
                .create(payload, { requestKey: null });
              existingRec = {
                recordId: saved.id,
                k1: payload.k1,
                k2: payload.k2,
                k3: payload.k3,
                k4: payload.k4,
              };
              nilaiMap[siswa.id][tp.id] = existingRec;
            }
            savedCount += Object.keys(toSave).length;
          } catch (err) {
            errors.push(
              `Baris ${rowNum} ${tpNo}: ${err?.message || "gagal menyimpan"}`,
            );
          }
        }
      }

      setTpList((prev) => {
        const map = new Map(prev.map((t) => [t.no_tp, t]));
        for (const [no, tp] of tpMap.entries()) {
          if (!map.has(no)) map.set(no, tp);
        }
        return Array.from(map.values()).sort(
          (a, b) => tpNumber(a) - tpNumber(b),
        );
      });
      setNilaiFormatif(nilaiMap);

      setImportResult({
        saved: savedCount,
        skipped: skippedCount,
        createdTp: createdTpCount,
        errors,
      });
      showToast(`${savedCount} nilai diimpor`, "success");
    } catch (error) {
      console.error("Gagal import:", error);
      showToast(
        "Gagal import: " + (error?.message || "File tidak valid"),
        "error",
      );
    } finally {
      setImporting(false);
    }
  }

  // ================= EXPORT RAPOR =================
  async function handleExportRapor() {
    if (!mapel || !kelas) return;
    try {
      setExporting(true);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistem Penilaian";
      workbook.created = new Date();

      const GREEN = "FFD9EAD3";
      const YELLOW = "FFFFFF00";
      const CYAN = "FFE0FFFF";

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

      function styleHeader(cell, horizontal = "center") {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GREEN },
        };
        cell.font = { bold: true, color: { argb: "FF000000" }, size: 11 };
        cell.alignment = {
          horizontal: horizontal,
          vertical: "middle",
          wrapText: true,
        };
        addBorder(cell);
      }

      function styleBody(cell, horizontal = "center") {
        cell.alignment = { horizontal: horizontal, vertical: "middle" };
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

      function styleRow(row, styleFn, horizontalMap = null) {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const horiz =
            horizontalMap && horizontalMap[colNumber]
              ? horizontalMap[colNumber]
              : "center";
          styleFn(cell, horiz);
        });
      }

      function addHeading(worksheet, title, colCount, rowIndex = 1) {
        const row = worksheet.getRow(rowIndex);
        row.getCell(1).value = title;
        worksheet.mergeCells(rowIndex, 1, rowIndex, colCount);
        const mergedCell = worksheet.getCell(rowIndex, 1);
        mergedCell.font = { bold: true, size: 16, color: { argb: "FF000000" } };
        mergedCell.alignment = { horizontal: "center", vertical: "middle" };
        row.height = 30;
      }

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
      styleRow(headerRowKelas, styleHeader, { 2: "left" });
      headerRowKelas.height = 25;

      siswaList.forEach((s, idx) => {
        const row = sheetKelas.addRow([
          idx + 1,
          s.nama_siswa,
          s.jenis_kelamin || "-",
          s.nis || "-",
          s.nisn || "-",
        ]);
        styleRow(row, styleBody, { 2: "left" });
      });
      setAutoWidth(sheetKelas);

      const sheetFormatif = workbook.addWorksheet("FORMATIF", {
        properties: { tabColor: { argb: GREEN } },
      });

      const tpColLayout = [];
      let colCursor = 5;
      tpList.forEach((tp) => {
        tpColLayout.push({
          tpId: tp.id,
          tpNo: tp.no_tp,
          startCol: colCursor,
          count: SEMUA_KRITERIA.length,
          activeK: SEMUA_KRITERIA,
        });
        colCursor += SEMUA_KRITERIA.length;
      });
      const colRata = colCursor;
      const totalCols = colCursor;

      addHeading(sheetFormatif, "DAFTAR NILAI FORMATIF", totalCols, 1);
      addHeading(
        sheetFormatif,
        "NILAI FORMATIF SETIAP TUJUAN PEMBELAJARAN",
        totalCols,
        2,
      );
      sheetFormatif.addRow([]);

      const headerRow1 = sheetFormatif.addRow([]);
      headerRow1.getCell(1).value = "NOMOR";
      headerRow1.getCell(2).value = "NAMA";
      headerRow1.getCell(3).value = "L/P";
      headerRow1.getCell(4).value = "NIS";

      tpColLayout.forEach((layout) => {
        headerRow1.getCell(layout.startCol).value = layout.tpNo;
        if (layout.count > 1) {
          sheetFormatif.mergeCells(
            4,
            layout.startCol,
            4,
            layout.startCol + layout.count - 1,
          );
        }
      });
      headerRow1.getCell(colRata).value = "RATA-RATA NILAI";

      const headerRow2 = sheetFormatif.addRow([]);
      tpColLayout.forEach((layout) => {
        layout.activeK.forEach((k, i) => {
          headerRow2.getCell(layout.startCol + i).value = k.toUpperCase();
        });
      });

      styleRow(headerRow1, styleHeader, { 2: "left" });
      styleRow(headerRow2, styleHeader);
      styleResult(headerRow1.getCell(colRata));

      [1, 2, 3, 4, colRata].forEach((col) => {
        sheetFormatif.mergeCells(4, col, 5, col);
      });

      headerRow1.height = 20;
      headerRow2.height = 15;

      siswaList.forEach((siswa, idx) => {
        const rowData = new Array(totalCols).fill(null);
        rowData[0] = idx + 1;
        rowData[1] = siswa.nama_siswa;
        rowData[2] = siswa.jenis_kelamin || "-";
        rowData[3] = siswa.nis;

        tpColLayout.forEach((layout) => {
          const rec = nilaiFormatif[siswa.id]?.[layout.tpId] || {};
          layout.activeK.forEach((k, i) => {
            const v = rec[k];
            rowData[layout.startCol - 1 + i] =
              v !== undefined && v !== -1 ? v : null;
          });
        });

        const avg = formatifAvgMap[siswa.id];
        rowData[colRata - 1] = avg !== null ? Number(avg.toFixed(2)) : null;

        const row = sheetFormatif.addRow(rowData);
        styleRow(row, styleBody, { 2: "left" });

        tpColLayout.forEach((layout) => {
          for (let i = 0; i < layout.count; i++) {
            styleNilai(row.getCell(layout.startCol + i));
          }
        });
        styleResult(row.getCell(colRata));

        row.height = 18;
      });

      setAutoWidth(sheetFormatif);
      setFixedWidth(sheetFormatif, 1, 10);
      setFixedWidth(sheetFormatif, 3, 5);

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
      styleRow(headerRowSumatif, styleHeader, { 3: "left" });
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
        styleRow(row, styleBody, { 3: "left" });

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

      const sheetAkhir = workbook.addWorksheet("NILAI AKHIR", {
        properties: { tabColor: { argb: GREEN } },
      });

      const headerAkhir = [
        "NO",
        "Nama Siswa",
        "Formatif",
        "Sumatif",
        "UTS",
        "UAS",
        "Nilai Akhir Rapor",
      ];
      const colCountAkhir = headerAkhir.length;
      const colNilaiAkhir = colCountAkhir;

      addHeading(sheetAkhir, "NILAI AKHIR RAPOR", colCountAkhir, 1);
      sheetAkhir.addRow([]);

      const headerRowAkhir = sheetAkhir.addRow(headerAkhir);
      styleRow(headerRowAkhir, styleHeader, { 2: "left" });
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
          raporMap[siswa.id] !== null
            ? Number(raporMap[siswa.id].toFixed(2))
            : null,
        ]);
        styleRow(row, styleBody, { 2: "left" });

        for (let i = 3; i <= 6; i++) {
          styleNilai(row.getCell(i));
        }
        styleResult(row.getCell(colNilaiAkhir));
      });

      setAutoWidth(sheetAkhir);

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
      showToast("Rapor berhasil diekspor", "success");
    } catch (error) {
      console.error("Gagal export:", error);
      showToast(
        "Gagal export. Pastikan package 'exceljs' dan 'file-saver' sudah terinstall.",
        "error",
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
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">
          Data tidak ditemukan
        </h1>
        <p className="mt-2 text-sm text-red-600">
          Kelas atau mata pelajaran tidak ditemukan.
        </p>
        <button onClick={() => router.back()} className={`${BTN_OUTLINE} mt-4`}>
          <Icon name="back" />
          Kembali
        </button>
      </div>
    );
  }

  const TABS = [
    { key: "formatif", label: "Nilai formatif" },
    { key: "sumatif", label: "Nilai sumatif" },
    {
      key: "ujian",
      label: `Nilai ujian${ujianAktif.length > 0 ? ` (${ujianAktif.length})` : ""}`,
    },
    { key: "rapor", label: "Nilai rapor" },
  ];

  const scanStepIdx = SCAN_STEPS.findIndex((s) => s.key === scanStep);

  // Dipakai oleh tabel staging di modal scan
  const thBase =
    "border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500";
  const tdBase = "border-b border-slate-100";

  // Ringkasan tab ujian
  const ujianTerpilih = ujianAktif.find((u) => u.id === selectedUjianId);
  const ujianNilaiList = selectedUjianId
    ? siswaList
        .map((s) => nilaiUjian[selectedUjianId]?.[s.id]?.nilai)
        .filter((v) => typeof v === "number" && !isNaN(v) && v !== -1)
    : [];
  const ujianStat = {
    filled: ujianNilaiList.length,
    total: siswaList.length,
    avg: average(ujianNilaiList),
    max: ujianNilaiList.length ? Math.max(...ujianNilaiList) : null,
    min: ujianNilaiList.length ? Math.min(...ujianNilaiList) : null,
    low: ujianNilaiList.filter((v) => v < 70).length,
  };
  const fmtStat = (v) =>
    v === null || v === undefined
      ? "-"
      : Number.isInteger(v)
        ? String(v)
        : v.toFixed(1);

  // Adapter status cell: handleSaveUjian memakai key `u-${siswaId}`,
  // sedangkan UjianTable (mode ujianList) membaca `u-${ujianId}-${siswaId}`
  const ujianCellStatus = { ...cellStatus };
  if (selectedUjianId) {
    siswaList.forEach((s) => {
      ujianCellStatus[`u-${selectedUjianId}-${s.id}`] = cellStatus[`u-${s.id}`];
    });
  }

  return (
    <section className="relative isolate mx-auto max-w-7xl space-y-5 px-4 py-6 lg:px-8 lg:py-8">
      <Toast toast={toast} />

      {/* ================= HEADER ================= */}
      <div className="space-y-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600"
        >
          <Icon name="back" />
          Kembali
        </button>

        <div className="relative z-40 rounded-2xl bg-blue-600 p-3 text-white shadow-sm min-[360px]:p-4 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-3 min-[360px]:gap-4 lg:flex-row lg:items-end lg:justify-between">
            {/* Judul */}
            <div className="min-w-0">
              <p className="text-[13px] text-blue-100 min-[360px]:text-sm">
                {kelas.nama_kelas}, tingkat {kelas.tingkat}
              </p>
              <h1 className="mt-0.5 break-words text-xl font-bold min-[360px]:text-2xl sm:text-3xl">
                {mapel.nama_mapel}
              </h1>
            </div>

            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {/* Statistik: satu baris, ringkas */}
              <div className="grid grid-cols-3 gap-1.5 min-[360px]:gap-2 sm:flex">
                {[
                  ["Siswa", siswaList.length],
                  ["TP", tpList.length],
                  ["LP", lpList.length],
                ].map(([label, n]) => (
                  <div
                    key={label}
                    className="flex h-10 items-baseline justify-center gap-1 rounded-xl bg-white/15 px-1.5 pt-2 min-[360px]:gap-1.5 min-[360px]:px-3 sm:min-w-[84px]"
                  >
                    <span className="text-base font-bold tabular-nums">
                      {n}
                    </span>
                    <span className="text-xs text-blue-100">{label}</span>
                  </div>
                ))}
              </div>

              {/* Pindah mapel + prev/next: satu baris */}
              {mapelList.length > 1 && (
                <div
                  className="relative flex min-w-0 items-center gap-1.5 min-[360px]:gap-2"
                  ref={quickRef}
                >
                  <button
                    type="button"
                    onClick={() => setQuickOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={quickOpen}
                    className="inline-flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-2.5 text-xs font-bold text-white transition hover:bg-white/20 min-[360px]:px-3 sm:flex-none sm:justify-start"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Icon
                        name="swap"
                        className="hidden h-4 w-4 min-[360px]:block"
                      />
                      <span className="truncate">
                        <span className="hidden min-[360px]:inline">
                          Pindah mapel
                        </span>
                        <span className="min-[360px]:hidden">Mapel</span>
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5">
                      {currentIndex >= 0 && (
                        <span className="rounded-md bg-white/20 px-1.5 py-0.5 font-mono text-[10px]">
                          {currentIndex + 1}/{mapelList.length}
                        </span>
                      )}
                      <Icon
                        name="chevron"
                        className={`h-3 w-3 transition-transform ${
                          quickOpen ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                  </button>

                  {(prevMapel || nextMapel) && (
                    <div className="inline-flex shrink-0 divide-x divide-white/20 overflow-hidden rounded-xl border border-white/20 bg-white/10">
                      <button
                        type="button"
                        onClick={() => prevMapel && pindahKeMapel(prevMapel)}
                        disabled={!prevMapel}
                        title={
                          prevMapel
                            ? `Sebelumnya: ${prevMapel.nama_mapel || prevMapel.nama}`
                            : "Tidak ada mapel sebelumnya"
                        }
                        aria-label="Mapel sebelumnya"
                        className="inline-flex h-10 w-9 items-center justify-center text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 min-[360px]:w-10"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => nextMapel && pindahKeMapel(nextMapel)}
                        disabled={!nextMapel}
                        title={
                          nextMapel
                            ? `Selanjutnya: ${nextMapel.nama_mapel || nextMapel.nama}`
                            : "Tidak ada mapel selanjutnya"
                        }
                        aria-label="Mapel selanjutnya"
                        className="inline-flex h-10 w-9 items-center justify-center text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 min-[360px]:w-10"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Dropdown: selebar baris kontrol di mobile */}
                  {quickOpen && (
                    <div
                      role="listbox"
                      className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl sm:left-auto sm:w-80"
                    >
                      <div className="border-b border-slate-100 p-2">
                        <input
                          ref={quickInputRef}
                          type="text"
                          value={quickSearch}
                          onChange={(e) => setQuickSearch(e.target.value)}
                          placeholder="Cari mapel atau guru..."
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>

                      <div className="max-h-[min(18rem,50vh)] overflow-y-auto py-1">
                        {quickList.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-slate-400">
                            Tidak ada mapel yang cocok.
                          </div>
                        ) : (
                          quickList.map((m) => {
                            const idx = mapelList.findIndex(
                              (x) => x.id === m.id,
                            );
                            const isCurrent = m.id === mapelId;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                role="option"
                                aria-selected={isCurrent}
                                disabled={isCurrent}
                                onClick={() => pindahKeMapel(m)}
                                className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors min-[360px]:gap-3 min-[360px]:px-3 ${
                                  isCurrent
                                    ? "cursor-default bg-blue-600 text-white"
                                    : "hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                                }`}
                              >
                                <span
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tabular-nums min-[360px]:h-8 min-[360px]:w-8 ${
                                    isCurrent
                                      ? "bg-white/20 text-white"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span
                                    className={`block truncate text-[13px] font-semibold min-[360px]:text-sm ${
                                      isCurrent
                                        ? "text-white"
                                        : "text-slate-800"
                                    }`}
                                  >
                                    {m.nama_mapel || m.nama || "-"}
                                  </span>
                                  <span
                                    className={`block truncate text-[11px] ${
                                      isCurrent
                                        ? "text-blue-100"
                                        : "text-slate-500"
                                    }`}
                                  >
                                    {m.kode_mapel ? `${m.kode_mapel} · ` : ""}
                                    {m.guru_pengampu || "Walikelas"}
                                  </span>
                                </span>
                                {isCurrent && (
                                  <span className="shrink-0 text-[10px] font-bold">
                                    Aktif
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-400">
                        Urutan alfabetis
                        <span className="hidden sm:inline">
                          {" "}
                          · Tekan <b>Esc</b> untuk menutup
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= TABS ================= */}
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          role="tablist"
          className="inline-flex min-w-full gap-1 rounded-xl bg-slate-100 p-1 sm:min-w-0"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                activeTab === tab.key
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ================= TAB FORMATIF ================= */}
      {activeTab === "formatif" && (
        <div className="space-y-4">
          <div className={`${CARD} space-y-4 p-4 sm:p-5`}>
            <SectionHeader
              title="Tujuan pembelajaran (TP)"
              description="Setiap TP dinilai dengan 4 kriteria (K1–K4). Nilai akhir adalah rata-rata kriteria yang terisi."
            >
              <button
                onClick={() => setShowTemplateDialog(true)}
                className={BTN_OUTLINE}
              >
                <Icon name="download" />
                Template
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
                className={BTN_OUTLINE}
              >
                <Icon name="upload" />
                {importing ? "Mengimpor..." : "Impor"}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleImportFormatif(file);
                }}
              />

              <button onClick={openScanModal} className={BTN_OUTLINE}>
                <Icon name="upload" />
                Upload scan
              </button>

              <span className="hidden h-6 w-px bg-slate-200 lg:block" />

              <button
                onClick={() => setAddingTp((v) => !v)}
                disabled={!addingTp && tpList.length >= DAFTAR_NO_TP.length}
                className={BTN_PRIMARY}
              >
                <Icon name={addingTp ? "x" : "plus"} />
                {addingTp ? "Batal" : "Tambah TP"}
              </button>
            </SectionHeader>

            {addingTp && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <select
                  value={selectedNoTp}
                  onChange={(e) => setSelectedNoTp(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                  className={BTN_PRIMARY}
                >
                  {savingTp ? "Menyimpan..." : "Simpan TP"}
                </button>
                <button
                  onClick={() => {
                    setAddingTp(false);
                    setSelectedNoTp("");
                  }}
                  className={BTN_GHOST}
                >
                  Batal
                </button>
              </div>
            )}
          </div>

          <div className={`${CARD} overflow-hidden`}>
            {tpList.length === 0 ? (
              <EmptyState
                title="Belum ada TP"
                text="Tambahkan TP terlebih dahulu untuk mulai menginput nilai formatif."
              />
            ) : (
              <FormatifTable
                siswaList={siswaList}
                tpList={tpList}
                kriteria={SEMUA_KRITERIA}
                nilai={nilaiFormatif}
                avgMap={formatifAvgMap}
                cellStatus={cellStatus}
                onSave={handleSaveFormatif}
                onDeleteTp={handleDeleteTp}
              />
            )}
          </div>
        </div>
      )}

      {/* ================= TAB SUMATIF ================= */}
      {activeTab === "sumatif" && (
        <div className="space-y-4">
          <div className={`${CARD} space-y-4 p-4 sm:p-5`}>
            <SectionHeader
              title="Lingkup materi (LP)"
              description="Nilai sumatif dihitung dari rata-rata nilai LP yang terisi."
            >
              <button
                onClick={() => setShowAddLp((v) => !v)}
                className={BTN_PRIMARY}
              >
                <Icon name={showAddLp ? "x" : "plus"} />
                {showAddLp ? "Batal" : "Tambah LP"}
              </button>
            </SectionHeader>

            {showAddLp && (
              <form
                onSubmit={handleAddLp}
                className="flex flex-col items-stretch gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 sm:flex-row sm:items-center"
              >
                <input
                  type="text"
                  value={namaLp}
                  onChange={(e) => setNamaLp(e.target.value)}
                  placeholder="Nama lingkup materi, contoh: Bilangan bulat"
                  aria-label="Nama lingkup materi"
                  className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  required
                />
                <button
                  type="submit"
                  disabled={savingLp}
                  className={BTN_PRIMARY}
                >
                  {savingLp ? "Menyimpan..." : "Simpan LP"}
                </button>
              </form>
            )}
          </div>

          <div className={`${CARD} overflow-hidden`}>
            {lpList.length === 0 ? (
              <EmptyState
                title="Belum ada LP"
                text="Tambahkan LP terlebih dahulu untuk mulai menginput nilai sumatif."
              />
            ) : (
              <SumatifTable
                siswaList={siswaList}
                lpList={lpList}
                nilai={nilaiSumatif}
                avgMap={sumatifAvgMap}
                cellStatus={cellStatus}
                onSave={handleSaveSumatif}
                onDeleteLp={handleDeleteLp}
              />
            )}
          </div>
        </div>
      )}

      {/* ================= TAB UJIAN ================= */}
      {activeTab === "ujian" && (
        <div className="space-y-4">
          {ujianAktif.length === 0 ? (
            <div className={CARD}>
              <EmptyState
                title="Belum ada ujian aktif"
                text="Ujian akan muncul di sini setelah diaktifkan oleh Admin untuk kelas ini."
              />
            </div>
          ) : (
            <>
              <div className={`${CARD} space-y-3 p-4 sm:p-5`}>
                <SectionHeader
                  title="Pilih ujian"
                  description="Nilai ujian disimpan otomatis saat kolom ditinggalkan."
                />
                <div className="flex flex-wrap gap-2">
                  {ujianAktif.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUjianId(u.id)}
                      className={`${BTN} border ${
                        selectedUjianId === u.id
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {u.nama_ujian}
                      <span className="opacity-70">
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
              </div>

              {!selectedUjianId ? (
                <div className={CARD}>
                  <EmptyState title="Pilih ujian di atas untuk mulai input nilai." />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Ringkasan: strip ringkas di atas tabel */}
                  <div
                    className={`${CARD} flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between`}
                  >
                    <div className="min-w-0 lg:w-72">
                      <h3 className="truncate text-sm font-bold text-slate-800">
                        {ujianTerpilih?.nama_ujian || "Ringkasan ujian"}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {ujianStat.filled} dari {ujianStat.total} siswa sudah
                        terisi
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{
                            width: `${
                              ujianStat.total
                                ? (ujianStat.filled / ujianStat.total) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-xl">
                      <StatBox
                        tone="blue"
                        value={fmtStat(ujianStat.avg)}
                        label="Rata-rata"
                      />
                      <StatBox
                        tone="emerald"
                        value={fmtStat(ujianStat.max)}
                        label="Tertinggi"
                      />
                      <StatBox
                        tone="slate"
                        value={fmtStat(ujianStat.min)}
                        label="Terendah"
                      />
                      <StatBox
                        tone="amber"
                        value={ujianStat.low}
                        label="Di bawah 70"
                      />
                    </div>
                  </div>

                  {/* Tabel: selebar penuh */}
                  <div className={`${CARD} overflow-hidden`}>
                    <UjianTable
                      siswaList={siswaList}
                      ujianList={ujianTerpilih ? [ujianTerpilih] : []}
                      nilai={nilaiUjian}
                      cellStatus={ujianCellStatus}
                      onSave={(siswaId, ujianId, rawValue) =>
                        handleSaveUjian(siswaId, rawValue)
                      }
                    />
                  </div>

                  <p className="text-xs text-slate-400">
                    Tekan Enter atau panah bawah untuk pindah ke siswa
                    berikutnya.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================= TAB RAPOR ================= */}
      {activeTab === "rapor" && (
        <div className="space-y-4">
          <div className={`${CARD} p-4 sm:p-5`}>
            <SectionHeader
              title="Rekap nilai rapor"
              description="Nilai akhir adalah rata-rata komponen formatif, sumatif, UTS, dan UAS yang tersedia. Nilai di bawah 70 berwarna merah."
            >
              <button
                onClick={handleExportRapor}
                disabled={exporting}
                className={BTN_PRIMARY}
              >
                <Icon name="download" />
                {exporting ? "Mengekspor..." : "Ekspor Excel"}
              </button>
            </SectionHeader>
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <RaporTable
              siswaList={siswaList}
              rows={{
                formatif: formatifAvgMap,
                sumatif: sumatifAvgMap,
                uts: utsAvgMap,
                uas: uasAvgMap,
                akhir: raporMap,
              }}
            />
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI HAPUS ================= */}
      {confirmDialog && (
        <Modal
          size="max-w-sm"
          onClose={() => !deleting && setConfirmDialog(null)}
        >
          <div className="flex items-start gap-3 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Icon name="alert" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-800">
                {confirmDialog.type === "tp"
                  ? `Hapus ${confirmDialog.data.no_tp}?`
                  : `Hapus LP "${confirmDialog.data.nama}"?`}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Semua nilai{" "}
                {confirmDialog.type === "tp" ? "formatif" : "sumatif"} terkait
                ikut terhapus dan tidak bisa dikembalikan.
              </p>
            </div>
          </div>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDialog(null)}
              disabled={deleting}
              className={BTN_GHOST}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDialog.type === "tp") {
                  confirmDeleteTp(confirmDialog.data);
                } else {
                  confirmDeleteLp(confirmDialog.data);
                }
              }}
              disabled={deleting}
              className={BTN_DANGER}
            >
              {deleting ? "Menghapus..." : "Ya, hapus"}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* ================= MODAL DOWNLOAD TEMPLATE ================= */}
      {showTemplateDialog && (
        <Modal
          size="max-w-md"
          onClose={() => !downloadingTemplate && setShowTemplateDialog(false)}
        >
          <ModalHeader
            title="Unduh template formatif"
            subtitle="Pilih jumlah TP dan jumlah kriteria (K) per TP."
            onClose={() => setShowTemplateDialog(false)}
            disabled={downloadingTemplate}
          />
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Jumlah TP
                </span>
                <select
                  value={templateTpCount}
                  onChange={(e) => setTemplateTpCount(Number(e.target.value))}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} TP
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  Jumlah K per TP
                </span>
                <select
                  value={templateKCount}
                  onChange={(e) => setTemplateKCount(Number(e.target.value))}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} K
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              <p>
                Template berisi <b>{siswaList.length} siswa</b> dengan kolom TP
                1 sampai TP {templateTpCount}, masing-masing K1 sampai K
                {templateKCount}.
              </p>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm border border-yellow-300 bg-yellow-300" />
                <span>Nilai yang sudah ada. Tidak ditimpa saat impor.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm border border-cyan-200 bg-cyan-100" />
                <span>Nilai kosong, siap diisi.</span>
              </div>
            </div>
          </div>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setShowTemplateDialog(false)}
              disabled={downloadingTemplate}
              className={BTN_GHOST}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className={BTN_PRIMARY}
            >
              <Icon name="download" />
              {downloadingTemplate ? "Mengunduh..." : "Unduh"}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* ================= MODAL HASIL IMPORT ================= */}
      {importResult && (
        <Modal size="max-w-md" onClose={() => setImportResult(null)}>
          <ModalHeader
            title="Hasil impor nilai formatif"
            subtitle="Nilai yang sudah terisi tidak ditimpa. Hanya kolom kosong yang diisi."
            onClose={() => setImportResult(null)}
          />
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-3 gap-2">
              <StatBox
                tone="emerald"
                value={importResult.saved}
                label="Nilai disimpan"
              />
              <StatBox
                tone="amber"
                value={importResult.skipped}
                label="Dilewati (sudah ada)"
              />
              <StatBox
                tone="blue"
                value={importResult.createdTp}
                label="TP dibuat"
              />
            </div>
            <ErrorList title="Peringatan" items={importResult.errors} />
          </div>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className={BTN_PRIMARY}
            >
              Tutup
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* ================= MODAL SCAN KERTAS ================= */}
      {scanOpen && (
        <Modal size="max-w-4xl" onClose={closeScanModal}>
          <ModalHeader
            title="Upload scan nilai"
            subtitle="Unggah foto kertas nilai, AI akan mendeteksi TP dan K yang terisi. Periksa hasilnya lalu simpan."
            onClose={closeScanModal}
            disabled={scanSaving}
          />

          <ol className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-xs">
            {SCAN_STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    i < scanStepIdx
                      ? "bg-blue-600 text-white"
                      : i === scanStepIdx
                        ? "bg-blue-600 text-white ring-4 ring-blue-100"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {i < scanStepIdx ? (
                    <Icon name="check" className="h-3 w-3" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={
                    i === scanStepIdx
                      ? "font-semibold text-slate-800"
                      : "hidden text-slate-400 sm:inline"
                  }
                >
                  {s.label}
                </span>
                {i < SCAN_STEPS.length - 1 && (
                  <span className="h-px w-4 bg-slate-200 sm:w-6" />
                )}
              </li>
            ))}
          </ol>

          <div className="flex-1 overflow-y-auto p-5">
            {scanStep === "pick" && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => scanInputRef.current?.click()}
                  className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Icon name="camera" className="h-10 w-10 text-slate-400" />
                  <span className="mt-3 text-sm font-semibold text-slate-700">
                    Pilih file foto kertas nilai
                  </span>
                  <span className="mt-1 text-xs text-slate-400">
                    JPG atau PNG, maksimal 20MB
                  </span>
                </button>
                <p className="text-xs text-slate-500">
                  Sistem mendeteksi TP yang terisi dan jumlah kolom K (K1–K4)
                  otomatis. Foto diproses dalam 2 batch untuk menghindari limit
                  server.
                </p>
                <input
                  ref={scanInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleScanPick}
                />
              </div>
            )}

            {scanStep === "preview" && scanImageUrl && (
              <div className="space-y-3">
                <div className="grid max-h-[55vh] place-items-center overflow-auto rounded-xl bg-slate-900 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={scanImageUrl}
                    alt="Foto kertas nilai"
                    className="max-h-[50vh] max-w-full object-contain"
                  />
                </div>
                <input
                  ref={scanInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleScanPick}
                />
              </div>
            )}

            {scanStep === "scanning" && (
              <div className="space-y-4 py-10 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  Memproses gambar...
                </p>
                <div className="mx-auto max-w-md">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-200"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs tabular-nums text-slate-500">
                    {scanProgress}%
                  </div>
                </div>
                <p className="mx-auto max-w-sm text-xs text-slate-400">
                  Tiap batch sekitar 10 detik, total 20–30 detik. Jangan tutup
                  jendela ini.
                </p>
              </div>
            )}

            {scanStep === "staging" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md bg-blue-100 px-2 py-1 font-bold text-blue-700">
                      {scanDetectedTp}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">
                      K1–K{scanKCount}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">
                      {scanRows.length} baris
                    </span>
                    <span className="rounded-md bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                      {scanRows.filter((r) => r.matchedSiswaId).length} cocok
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScanShowRawText((v) => !v)}
                      className={BTN_OUTLINE}
                    >
                      {scanShowRawText ? "Sembunyikan" : "Lihat"} info batch
                    </button>
                    <button onClick={handleScanAddRow} className={BTN_OUTLINE}>
                      <Icon name="plus" />
                      Baris manual
                    </button>
                  </div>
                </div>

                {scanShowRawText && (
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                    {scanRawText || "(kosong)"}
                  </pre>
                )}

                {scanRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                    Tidak ada baris terdeteksi. Coba foto yang lebih jelas atau
                    tambah baris manual.
                  </div>
                ) : (
                  <div className="max-h-[46vh] overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full border-separate border-spacing-0 text-xs">
                      <thead>
                        <tr>
                          <th
                            className={`${thBase} sticky top-0 z-10 w-10 px-2 py-2 text-center`}
                          >
                            Simpan
                          </th>
                          <th
                            className={`${thBase} sticky top-0 z-10 min-w-[200px] px-2 py-2 text-left`}
                          >
                            Siswa
                          </th>
                          <th
                            className={`${thBase} sticky top-0 z-10 min-w-[100px] px-2 py-2 text-center`}
                          >
                            NIS terbaca
                          </th>
                          {SEMUA_KRITERIA.slice(0, scanKCount).map((k) => (
                            <th
                              key={k}
                              className={`${thBase} sticky top-0 z-10 w-16 px-2 py-2 text-center`}
                            >
                              {k.toUpperCase()}
                            </th>
                          ))}
                          <th
                            className={`${thBase} sticky top-0 z-10 w-10 px-2 py-2`}
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {scanRows.map((row) => (
                          <tr
                            key={row.key}
                            className={
                              !row.matchedSiswaId
                                ? "bg-amber-50"
                                : row.matchedBy === "nis"
                                  ? "bg-emerald-50/50"
                                  : "bg-blue-50/50"
                            }
                          >
                            <td className={`${tdBase} px-2 py-1.5 text-center`}>
                              <input
                                type="checkbox"
                                checked={row.include}
                                aria-label="Sertakan baris ini"
                                onChange={(e) =>
                                  handleScanRowChange(row.key, {
                                    include: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 accent-blue-600"
                              />
                            </td>
                            <td className={`${tdBase} px-2 py-1.5`}>
                              <select
                                value={row.matchedSiswaId || ""}
                                onChange={(e) => {
                                  const sid = e.target.value;
                                  const s = siswaList.find((x) => x.id === sid);
                                  handleScanRowChange(row.key, {
                                    matchedSiswaId: sid || null,
                                    matchedSiswaNama: s?.nama_siswa || "",
                                    matchedBy: "manual",
                                  });
                                }}
                                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                              >
                                <option value="">Pilih siswa</option>
                                {siswaList.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.nis
                                      ? `${s.nis} — ${s.nama_siswa}`
                                      : s.nama_siswa}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className={`${tdBase} px-2 py-1.5 text-center`}>
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] ${
                                  row.nisDetected
                                    ? "bg-emerald-100 font-bold text-emerald-700"
                                    : "text-slate-300"
                                }`}
                              >
                                {row.nisDetected || "-"}
                              </span>
                            </td>
                            {SEMUA_KRITERIA.slice(0, scanKCount).map(
                              (_, kIdx) => (
                                <td
                                  key={kIdx}
                                  className={`${tdBase} px-1 py-1.5 text-center`}
                                >
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={row.values[kIdx] ?? ""}
                                    onChange={(e) =>
                                      handleScanRowValue(
                                        row.key,
                                        kIdx,
                                        e.target.value,
                                      )
                                    }
                                    className="h-8 w-14 rounded-md border border-slate-200 bg-white px-1 text-center text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  />
                                </td>
                              ),
                            )}
                            <td className={`${tdBase} px-1 py-1.5 text-center`}>
                              <button
                                onClick={() => handleScanRemoveRow(row.key)}
                                aria-label="Hapus baris"
                                title="Hapus baris"
                                className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Icon name="x" className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-700">
                    Periksa sebelum menyimpan.
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-300" />
                    Cocok via NIS
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-300" />
                    Cocok manual
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-300" />
                    Belum cocok, pilih siswa
                  </span>
                  <span>Nilai yang sudah ada tidak ditimpa.</span>
                </div>
              </div>
            )}

            {scanStep === "done" && scanResult && (
              <div className="space-y-4 py-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Icon name="check" className="h-6 w-6" />
                </div>
                <div className="text-base font-bold text-slate-800">
                  Selesai disimpan
                </div>
                <div className="mx-auto grid max-w-sm grid-cols-2 gap-2">
                  <StatBox
                    tone="emerald"
                    value={scanResult.saved}
                    label="Nilai disimpan"
                  />
                  <StatBox
                    tone="amber"
                    value={scanResult.skipped}
                    label="Dilewati"
                  />
                </div>
                <div className="mx-auto max-w-md">
                  <ErrorList title="Error" items={scanResult.errors} />
                </div>
                <p className="text-xs text-slate-400">
                  Menutup otomatis dalam beberapa detik...
                </p>
              </div>
            )}
          </div>

          <ModalFooter
            left={
              scanStep === "staging" && scanDetectedTp ? (
                <>
                  Target: <b>{scanDetectedTp}</b>
                </>
              ) : null
            }
          >
            {scanStep === "preview" && (
              <button
                onClick={() => scanInputRef.current?.click()}
                className={BTN_OUTLINE}
              >
                Ganti gambar
              </button>
            )}
            {scanStep === "staging" && (
              <button
                onClick={() => {
                  setScanStep("preview");
                  setScanRows([]);
                  setScanRawText("");
                }}
                className={BTN_GHOST}
              >
                Upload ulang
              </button>
            )}
            {(scanStep === "pick" || scanStep === "preview") && (
              <button onClick={closeScanModal} className={BTN_GHOST}>
                Batal
              </button>
            )}
            {scanStep === "preview" && (
              <button onClick={handleRunOcr} className={BTN_PRIMARY}>
                <Icon name="scan" />
                Proses
              </button>
            )}
            {scanStep === "staging" && (
              <button
                onClick={handleSaveScan}
                disabled={scanSaving}
                className={BTN_PRIMARY}
              >
                {scanSaving ? "Menyimpan..." : "Simpan ke sistem"}
              </button>
            )}
            {scanStep === "done" && (
              <button onClick={closeScanModal} className={BTN_PRIMARY}>
                Tutup
              </button>
            )}
          </ModalFooter>
        </Modal>
      )}
    </section>
  );
}
