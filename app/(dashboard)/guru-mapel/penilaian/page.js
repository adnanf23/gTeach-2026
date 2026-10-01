"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// Role yang boleh mengakses halaman ini
const ALLOWED_ROLES = ["guru mapel"];

// jenis_ujian di pengaturan_ujian yang dipetakan ke UTS / UAS (label saja)
const JENIS_LABEL = {
  ahb: "UTS",
  asas: "UAS",
  asat: "Akhir Tahun",
  lainnya: "Lainnya",
};

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
// FITUR BARU: Kriteria aktif per TP (K1-K4)
// ================================================================
const SEMUA_KRITERIA = ["k1", "k2", "k3", "k4"];
const LS_KEY_KRITERIA_TP = "kriteria_tp_map_v1";

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

// ================================================================
// UTIL – abaikan -1 sebagai kosong
// ================================================================
function average(arr) {
  const nums = arr.filter(
    (v) => typeof v === "number" && !isNaN(v) && v !== -1,
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatGrade(value) {
  if (value === null || value === undefined || value === -1) return "—";
  const num = Number(value);
  if (isNaN(num) || num < 0) return "—";
  const clamped = Math.min(num, 99.99);
  const formatted = clamped.toFixed(2);
  const [whole, decimal] = formatted.split(".");
  return `${whole.padStart(2, "0")}.${decimal}`;
}

function nilaiColor(n) {
  if (n === null || n === undefined || n === -1 || Number.isNaN(Number(n)))
    return "text-slate-400";
  return Number(n) < 70 ? "text-red-600" : "text-emerald-600";
}

function tpNumber(tp) {
  const m = String(tp.no_tp || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
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

// --- Helper untuk export Excel ---
function numOrNull(v) {
  return typeof v === "number" && !isNaN(v) && v !== -1 ? v : null;
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

// --- Helper kriteria per TP (module-level, dipakai juga saat export) ---
function getActiveKForTpFromMap(tpId, map) {
  const setting = map[tpId];
  if (!setting) return SEMUA_KRITERIA;
  const active = SEMUA_KRITERIA.filter((k) => setting[k]);
  return active.length > 0 ? active : [SEMUA_KRITERIA[0]];
}

// ================================================================
// KOMPONEN INPUT NILAI – tampilkan "" jika nilai -1
// ================================================================
function NilaiInput({
  value,
  onChange,
  onBlur,
  saving,
  saved,
  width = "w-16",
}) {
  const displayValue = value === -1 ? "" : (value ?? "");
  return (
    <div className="relative inline-block">
      <input
        type="number"
        min={0}
        max={100}
        step="0.1"
        value={displayValue}
        onChange={onChange}
        onBlur={onBlur}
        placeholder="—"
        className={`${width} rounded-lg border px-2 py-1 text-center text-xs font-semibold outline-none transition ${
          saved
            ? "border-emerald-300 bg-emerald-50"
            : "border-slate-200 focus:border-blue-500"
        }`}
      />
      {saving && (
        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      )}
    </div>
  );
}

export default function PenilaianGuruMapelPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");

  // Step 1: pilih mapel (= pilih satu record ploting_guru milik guru ini)
  const [plotingList, setPlotingList] = useState([]);
  const [loadingPloting, setLoadingPloting] = useState(true);
  const [selectedPlotingId, setSelectedPlotingId] = useState(null);

  const selectedPloting = useMemo(
    () => plotingList.find((p) => p.id === selectedPlotingId) || null,
    [plotingList, selectedPlotingId],
  );
  const selectedMapelId = useMemo(
    () => firstOf(selectedPloting?.mapel_id) || null,
    [selectedPloting],
  );

  // Step 2: pilih kelas (dari kelas_id multi-select ploting terpilih)
  const [kelasOptions, setKelasOptions] = useState([]);
  const [loadingKelasOptions, setLoadingKelasOptions] = useState(false);
  const [selectedKelasId, setSelectedKelasId] = useState(null);

  const selectedKelas = useMemo(
    () =>
      kelasOptions.find((k) => k.kelas.id === selectedKelasId)?.kelas || null,
    [kelasOptions, selectedKelasId],
  );

  const [siswaList, setSiswaList] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [innerTab, setInnerTab] = useState("formatif");

  // ---- Formatif ----
  const [tpList, setTpList] = useState([]);
  const [nilaiFormatif, setNilaiFormatif] = useState({});
  const [addingTp, setAddingTp] = useState(false);
  const [selectedNoTp, setSelectedNoTp] = useState("");
  const [savingTp, setSavingTp] = useState(false);
  const [savingFCell, setSavingFCell] = useState(null);
  const [savedFFlash, setSavedFFlash] = useState(null);

  // =========================================================
  // FITUR BARU: Kriteria aktif per TP
  // Struktur: { [tpId]: { k1: bool, k2: bool, k3: bool, k4: bool } }
  // =========================================================
  const [kriteriaTpMap, setKriteriaTpMap] = useState({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY_KRITERIA_TP);
      if (saved) setKriteriaTpMap(JSON.parse(saved));
    } catch (e) {
      console.warn("Gagal load kriteria TP:", e);
    }
  }, []);

  function getActiveKForTp(tpId) {
    return getActiveKForTpFromMap(tpId, kriteriaTpMap);
  }

  function toggleKriteriaForTp(tpId, k) {
    const current = kriteriaTpMap[tpId] || {
      k1: true,
      k2: true,
      k3: true,
      k4: true,
    };
    const next = { ...current, [k]: !current[k] };
    // minimal 1 K aktif per TP
    if (!SEMUA_KRITERIA.some((key) => next[key])) return;
    const newMap = { ...kriteriaTpMap, [tpId]: next };
    setKriteriaTpMap(newMap);
    try {
      localStorage.setItem(LS_KEY_KRITERIA_TP, JSON.stringify(newMap));
    } catch (e) {
      console.warn("Gagal simpan kriteria TP:", e);
    }
  }

  // ---- Sumatif ----
  const [lpList, setLpList] = useState([]);
  const [nilaiSumatif, setNilaiSumatif] = useState({});
  const [showAddLp, setShowAddLp] = useState(false);
  const [namaLp, setNamaLp] = useState("");
  const [savingLp, setSavingLp] = useState(false);
  const [savingSCell, setSavingSCell] = useState(null);
  const [savedSFlash, setSavedSFlash] = useState(null);

  // ---- Ujian ----
  const [ujianAktif, setUjianAktif] = useState([]);
  const [loadingUjianAktif, setLoadingUjianAktif] = useState(false);
  const [selectedUjianId, setSelectedUjianId] = useState(null);
  const [nilaiUjian, setNilaiUjian] = useState({});
  const [loadingNilaiUjian, setLoadingNilaiUjian] = useState(false);
  const [savingUCell, setSavingUCell] = useState(null);
  const [savedUFlash, setSavedUFlash] = useState(null);

  // ---- Konfirmasi Hapus ----
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ---- Export state ----
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

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
      setLoadingPloting(false);
      return;
    }
    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // 2. Ambil semua ploting_guru milik guru ini
  useEffect(() => {
    if (!authChecked || unauthorized || !user?.id) return;
    let isMounted = true;

    async function fetchPloting() {
      setLoadingPloting(true);
      setError("");
      try {
        const records = await pb.collection("ploting_guru").getFullList({
          filter: `guru_id = "${user.id}"`,
          expand: "mapel_id,kelas_id",
          requestKey: null,
        });
        records.sort((a, b) =>
          (a.expand?.mapel_id?.nama_mapel || "").localeCompare(
            b.expand?.mapel_id?.nama_mapel || "",
          ),
        );
        if (!isMounted) return;
        setPlotingList(records);
      } catch (err) {
        console.error("Error fetching ploting_guru:", err);
        if (isMounted) setError("Gagal memuat daftar mata pelajaran Anda.");
      } finally {
        if (isMounted) setLoadingPloting(false);
      }
    }

    fetchPloting();
    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized, user]);

  // 3. Bangun daftar kelas dari kelas_id ploting terpilih
  useEffect(() => {
    if (!selectedPloting) {
      setKelasOptions([]);
      setSelectedKelasId(null);
      return;
    }
    let isMounted = true;

    async function fetchKelasOptions() {
      setLoadingKelasOptions(true);
      setError("");
      setSelectedKelasId(null);
      try {
        const kelasArr = Array.isArray(selectedPloting.expand?.kelas_id)
          ? selectedPloting.expand.kelas_id
          : selectedPloting.expand?.kelas_id
            ? [selectedPloting.expand.kelas_id]
            : [];

        const counts = await Promise.all(
          kelasArr.map((k) =>
            pb
              .collection("siswa")
              .getList(1, 1, {
                filter: `kelas_id = "${k.id}"`,
                requestKey: null,
                fields: "id",
              })
              .then((r) => r.totalItems)
              .catch(() => 0),
          ),
        );

        const options = kelasArr
          .map((k, idx) => ({ kelas: k, siswaCount: counts[idx] }))
          .sort((a, b) => {
            const t =
              (Number(a.kelas.tingkat) || 0) - (Number(b.kelas.tingkat) || 0);
            if (t !== 0) return t;
            return (a.kelas.nama_kelas || "").localeCompare(
              b.kelas.nama_kelas || "",
            );
          });

        if (!isMounted) return;
        setKelasOptions(options);
      } catch (err) {
        console.error("Error building kelas options:", err);
        if (isMounted)
          setError("Gagal memuat daftar kelas untuk mata pelajaran ini.");
      } finally {
        if (isMounted) setLoadingKelasOptions(false);
      }
    }

    fetchKelasOptions();
    return () => {
      isMounted = false;
    };
  }, [selectedPloting]);

  // 4. Ambil siswa + TP + LP + nilai_formatif + nilai_sumatif
  useEffect(() => {
    if (!selectedKelas || !selectedMapelId) {
      setSiswaList([]);
      setTpList([]);
      setLpList([]);
      setNilaiFormatif({});
      setNilaiSumatif({});
      return;
    }
    let isMounted = true;

    async function fetchDetail() {
      setLoadingDetail(true);
      setError("");
      try {
        const [siswaRecords, tpRecords, lpRecords] = await Promise.all([
          pb.collection("siswa").getFullList({
            filter: `kelas_id = "${selectedKelas.id}"`,
            sort: "nama_siswa",
            requestKey: null,
          }),
          pb.collection("tujuan_pembelajaran").getFullList({
            filter: `mapel_id ~ "${selectedMapelId}" && kelas_id ~ "${selectedKelas.id}"`,
            requestKey: null,
          }),
          pb.collection("lingkup_materi").getFullList({
            filter: `mapel_id ~ "${selectedMapelId}" && kelas_id ~ "${selectedKelas.id}"`,
            requestKey: null,
          }),
        ]);

        const tpSorted = tpRecords.sort((a, b) => tpNumber(a) - tpNumber(b));

        let nfMap = {};
        if (tpSorted.length > 0) {
          const tpFilter = tpSorted
            .map((tp) => `tp_id ~ "${tp.id}"`)
            .join(" || ");
          const nfData = await pb.collection("nilai_formatif").getFullList({
            filter: `kelas_id ~ "${selectedKelas.id}" && (${tpFilter})`,
            requestKey: null,
          });
          nfData.forEach((n) => {
            const sid = firstOf(n.siswa_id);
            const tid = firstOf(n.tp_id);
            if (!nfMap[sid]) nfMap[sid] = {};
            nfMap[sid][tid] = {
              recordId: n.id,
              k1: n.k1 ?? -1,
              k2: n.k2 ?? -1,
              k3: n.k3 ?? -1,
              k4: n.k4 ?? -1,
            };
          });
        }

        let nsMap = {};
        if (lpRecords.length > 0) {
          const lpFilter = lpRecords
            .map((lp) => `lm_id ~ "${lp.id}"`)
            .join(" || ");
          const nsData = await pb.collection("nilai_sumatif").getFullList({
            filter: `kelas_id ~ "${selectedKelas.id}" && (${lpFilter})`,
            requestKey: null,
          });
          nsData.forEach((n) => {
            const sid = firstOf(n.siswa_id);
            const lid = firstOf(n.lm_id);
            if (!nsMap[sid]) nsMap[sid] = {};
            nsMap[sid][lid] = { recordId: n.id, nilai: n.nilai };
          });
        }

        if (!isMounted) return;
        setSiswaList(siswaRecords);
        setTpList(tpSorted);
        setLpList(lpRecords);
        setNilaiFormatif(nfMap);
        setNilaiSumatif(nsMap);
      } catch (err) {
        console.error("Error fetching detail:", err);
        if (isMounted) setError("Gagal memuat data materi/nilai kelas ini.");
      } finally {
        if (isMounted) setLoadingDetail(false);
      }
    }

    fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedKelas, selectedMapelId]);

  // 5. Ambil ujian aktif
  useEffect(() => {
    if (!selectedKelas) {
      setUjianAktif([]);
      setSelectedUjianId(null);
      return;
    }
    let isMounted = true;

    async function fetchUjianAktif() {
      setLoadingUjianAktif(true);
      setSelectedUjianId(null);
      try {
        const ujianData = await pb.collection("pengaturan_ujian").getFullList({
          filter: `status_akses = "buka" && (target_kelas_id ~ "${selectedKelas.id}" || target_tingkat ~ "${String(selectedKelas.tingkat)}")`,
          requestKey: null,
        });
        if (!isMounted) return;
        setUjianAktif(ujianData);
      } catch (err) {
        if (!err?.isAbort) {
          console.error("Error fetching ujian aktif:", err);
          if (isMounted) setError("Gagal memuat daftar ujian aktif.");
        }
      } finally {
        if (isMounted) setLoadingUjianAktif(false);
      }
    }

    fetchUjianAktif();
    return () => {
      isMounted = false;
    };
  }, [selectedKelas]);

  // 6. Ambil nilai_ujian saat ujian dipilih
  useEffect(() => {
    if (!selectedUjianId || !selectedMapelId || siswaList.length === 0) {
      setNilaiUjian({});
      return;
    }
    let isMounted = true;

    async function fetchNilaiUjian() {
      setLoadingNilaiUjian(true);
      try {
        const filterSiswa = siswaList
          .map((s) => `siswa_id = "${s.id}"`)
          .join(" || ");
        const data = await pb.collection("nilai_ujian").getFullList({
          filter: `pengaturan_ujian_id = "${selectedUjianId}" && mapel_id = "${selectedMapelId}" && (${filterSiswa})`,
          requestKey: null,
        });
        if (!isMounted) return;
        const map = {};
        data.forEach((n) => {
          const sid = firstOf(n.siswa_id);
          map[sid] = { recordId: n.id, nilai: n.nilai };
        });
        setNilaiUjian(map);
      } catch (err) {
        if (!err?.isAbort) {
          console.error("Error fetching nilai ujian:", err);
          if (isMounted) setError("Gagal memuat nilai ujian.");
        }
      } finally {
        if (isMounted) setLoadingNilaiUjian(false);
      }
    }

    fetchNilaiUjian();
    return () => {
      isMounted = false;
    };
  }, [selectedUjianId, selectedMapelId, siswaList]);

  // ================= NILAI AKHIR =================
  // PERUBAHAN: Formatif dihitung dari slot maksimal = Σ (jumlah K aktif tiap TP).
  // Nilai kosong dianggap 0 (tidak mengurangi pembagi).
  const formatifAvgMap = useMemo(() => {
    const result = {};
    const totalSlotMaksimal = tpList.reduce(
      (sum, tp) => sum + getActiveKForTp(tp.id).length,
      0,
    );

    siswaList.forEach((s) => {
      const perTp = nilaiFormatif[s.id] || {};
      let totalNilai = 0;

      tpList.forEach((tp) => {
        const rec = perTp[tp.id];
        if (!rec) return;
        getActiveKForTp(tp.id).forEach((k) => {
          const val = rec[k];
          if (typeof val === "number" && !isNaN(val) && val !== -1) {
            totalNilai += val;
          }
        });
      });

      result[s.id] =
        totalSlotMaksimal > 0 ? totalNilai / totalSlotMaksimal : null;
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nilaiFormatif, siswaList, tpList, kriteriaTpMap]);

  // PERUBAHAN: Sumatif juga dihitung dari total LP (nilai kosong = 0).
  const sumatifAvgMap = useMemo(() => {
    const result = {};
    const totalLpMaksimal = lpList.length;

    siswaList.forEach((s) => {
      const perLp = nilaiSumatif[s.id] || {};
      let totalNilai = 0;

      Object.values(perLp).forEach((r) => {
        if (typeof r.nilai === "number" && !isNaN(r.nilai) && r.nilai !== -1) {
          totalNilai += r.nilai;
        }
      });

      result[s.id] = totalLpMaksimal > 0 ? totalNilai / totalLpMaksimal : null;
    });
    return result;
  }, [nilaiSumatif, siswaList, lpList]);

  // ---------------- Handlers: Tambah TP ----------------
  async function handleAddTp() {
    if (!selectedNoTp || !selectedMapelId || !selectedKelas) return;
    setSavingTp(true);
    setError("");
    try {
      const created = await pb.collection("tujuan_pembelajaran").create(
        {
          no_tp: selectedNoTp,
          mapel_id: selectedMapelId,
          kelas_id: selectedKelas.id,
        },
        { requestKey: null },
      );
      setTpList((prev) =>
        [...prev, created].sort((a, b) => tpNumber(a) - tpNumber(b)),
      );
      setSelectedNoTp("");
      setAddingTp(false);
    } catch (err) {
      console.error("Gagal menambah TP:", err?.response?.data || err);
      setError("Gagal menambah TP.");
    } finally {
      setSavingTp(false);
    }
  }

  // ---------------- Handlers: Hapus TP ----------------
  function handleDeleteTp(tp) {
    setConfirmDialog({ type: "tp", data: tp });
  }

  async function confirmDeleteTp(tp) {
    setDeleting(true);
    setError("");
    try {
      const related = await pb.collection("nilai_formatif").getFullList({
        filter: `tp_id ~ "${tp.id}"`,
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

      // Bersihkan pengaturan kriteria TP ini dari localStorage
      if (kriteriaTpMap[tp.id]) {
        const newMap = { ...kriteriaTpMap };
        delete newMap[tp.id];
        setKriteriaTpMap(newMap);
        try {
          localStorage.setItem(LS_KEY_KRITERIA_TP, JSON.stringify(newMap));
        } catch (e) {
          console.warn(e);
        }
      }

      setConfirmDialog(null);
    } catch (err) {
      console.error("Gagal hapus TP:", err?.response?.data || err);
      setError("Gagal menghapus TP.");
    } finally {
      setDeleting(false);
    }
  }

  // ---------------- Handlers: Nilai Formatif ----------------
  function handleFormatifChange(siswaId, tpId, kField, rawValue) {
    setNilaiFormatif((prev) => ({
      ...prev,
      [siswaId]: {
        ...prev[siswaId],
        [tpId]: {
          ...(prev[siswaId]?.[tpId] || {}),
          [kField]: rawValue,
        },
      },
    }));
  }

  async function handleFormatifBlur(siswaId, tpId, kField) {
    const rec = nilaiFormatif[siswaId]?.[tpId];
    const rawValue = rec?.[kField];
    let nilaiValue;
    if (rawValue === "" || rawValue === undefined || rawValue === null) {
      nilaiValue = -1;
    } else {
      const num = Number(rawValue);
      if (Number.isNaN(num)) return;
      nilaiValue = Math.min(100, Math.max(0, num));
    }

    if (rec?.[kField] === nilaiValue) return;

    const cellKey = `f-${siswaId}-${tpId}-${kField}`;
    setSavingFCell(cellKey);
    setError("");
    try {
      let saved;
      if (rec?.recordId) {
        const currentValues = {
          k1: rec.k1 ?? -1,
          k2: rec.k2 ?? -1,
          k3: rec.k3 ?? -1,
          k4: rec.k4 ?? -1,
        };
        currentValues[kField] = nilaiValue;
        saved = await pb
          .collection("nilai_formatif")
          .update(rec.recordId, currentValues, { requestKey: null });
      } else {
        const data = {
          tp_id: tpId,
          siswa_id: siswaId,
          kelas_id: selectedKelas.id,
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
      setSavedFFlash(cellKey);
      setTimeout(() => setSavedFFlash((k) => (k === cellKey ? null : k)), 1200);
    } catch (err) {
      console.error(
        "Gagal menyimpan nilai formatif:",
        err?.response?.data || err,
      );
      setError("Gagal menyimpan nilai formatif.");
    } finally {
      setSavingFCell((k) => (k === cellKey ? null : k));
    }
  }

  // ---------------- Handlers: Tambah LP ----------------
  async function handleAddLp(e) {
    e.preventDefault();
    if (!namaLp.trim() || !selectedMapelId || !selectedKelas) return;
    setSavingLp(true);
    setError("");
    try {
      const created = await pb.collection("lingkup_materi").create(
        {
          nama: namaLp.trim(),
          mapel_id: selectedMapelId,
          kelas_id: selectedKelas.id,
          guru_id: user?.id,
        },
        { requestKey: null },
      );
      setLpList((prev) => [...prev, created]);
      setNamaLp("");
      setShowAddLp(false);
    } catch (err) {
      console.error("Gagal menambah LP:", err?.response?.data || err);
      setError("Gagal menambah LP.");
    } finally {
      setSavingLp(false);
    }
  }

  // ---------------- Handlers: Hapus LP ----------------
  function handleDeleteLp(lp) {
    setConfirmDialog({ type: "lp", data: lp });
  }

  async function confirmDeleteLp(lp) {
    setDeleting(true);
    setError("");
    try {
      const related = await pb.collection("nilai_sumatif").getFullList({
        filter: `lm_id ~ "${lp.id}"`,
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
    } catch (err) {
      console.error("Gagal hapus LP:", err?.response?.data || err);
      setError("Gagal menghapus LP.");
    } finally {
      setDeleting(false);
    }
  }

  // ---------------- Handlers: Nilai Sumatif ----------------
  function handleSumatifChange(siswaId, lpId, rawValue) {
    setNilaiSumatif((prev) => ({
      ...prev,
      [siswaId]: {
        ...prev[siswaId],
        [lpId]: { ...(prev[siswaId]?.[lpId] || {}), nilai: rawValue },
      },
    }));
  }

  async function handleSumatifBlur(siswaId, lpId) {
    const rec = nilaiSumatif[siswaId]?.[lpId];
    const rawValue = rec?.nilai;
    if (rawValue === "" || rawValue === undefined || rawValue === null) return;
    const nilaiNum = Number(rawValue);
    if (Number.isNaN(nilaiNum)) return;
    const clamped = Math.min(100, Math.max(0, nilaiNum));

    const cellKey = `s-${siswaId}-${lpId}`;
    setSavingSCell(cellKey);
    setError("");
    try {
      let saved;
      if (rec?.recordId) {
        saved = await pb
          .collection("nilai_sumatif")
          .update(rec.recordId, { nilai: clamped }, { requestKey: null });
      } else {
        saved = await pb.collection("nilai_sumatif").create(
          {
            lm_id: lpId,
            siswa_id: siswaId,
            kelas_id: selectedKelas.id,
            nilai: clamped,
          },
          { requestKey: null },
        );
      }
      setNilaiSumatif((prev) => ({
        ...prev,
        [siswaId]: {
          ...prev[siswaId],
          [lpId]: { recordId: saved.id, nilai: clamped },
        },
      }));
      setSavedSFlash(cellKey);
      setTimeout(() => setSavedSFlash((k) => (k === cellKey ? null : k)), 1200);
    } catch (err) {
      console.error(
        "Gagal menyimpan nilai sumatif:",
        err?.response?.data || err,
      );
      setError("Gagal menyimpan nilai sumatif.");
    } finally {
      setSavingSCell((k) => (k === cellKey ? null : k));
    }
  }

  // ---------------- Handlers: Nilai Ujian ----------------
  function handleUjianChange(siswaId, rawValue) {
    setNilaiUjian((prev) => ({
      ...prev,
      [siswaId]: { ...(prev[siswaId] || {}), nilai: rawValue },
    }));
  }

  async function handleUjianBlur(siswaId) {
    if (!selectedUjianId || !selectedPloting || !selectedMapelId) return;
    const existing = nilaiUjian[siswaId];
    const rawValue = existing?.nilai;
    if (rawValue === "" || rawValue === undefined || rawValue === null) return;
    const nilaiNum = Number(rawValue);
    if (Number.isNaN(nilaiNum)) return;
    const clamped = Math.min(100, Math.max(0, nilaiNum));

    setSavingUCell(siswaId);
    setError("");
    try {
      let saved;
      if (existing?.recordId) {
        saved = await pb
          .collection("nilai_ujian")
          .update(existing.recordId, { nilai: clamped }, { requestKey: null });
      } else {
        saved = await pb.collection("nilai_ujian").create(
          {
            siswa_id: siswaId,
            ploting_guru_id: selectedPloting.id,
            pengaturan_ujian_id: selectedUjianId,
            mapel_id: selectedMapelId,
            nilai: clamped,
          },
          { requestKey: null },
        );
      }
      setNilaiUjian((prev) => ({
        ...prev,
        [siswaId]: { recordId: saved.id, nilai: clamped },
      }));
      setSavedUFlash(siswaId);
      setTimeout(() => setSavedUFlash((k) => (k === siswaId ? null : k)), 1200);
    } catch (err) {
      console.error("Gagal menyimpan nilai ujian:", err?.response?.data || err);
      setError("Gagal menyimpan nilai ujian.");
    } finally {
      setSavingUCell((k) => (k === siswaId ? null : k));
    }
  }

  // ================================================================
  // EXPORT EXCEL — 1 SHEET PER KELAS YANG DIAJAR
  // ================================================================
  async function handleExportPerKelas() {
    if (!user?.id) return;
    try {
      setExporting(true);
      setExportProgress("Mengambil data...");
      setError("");

      // Snapshot kriteria TP saat ini (dari state, jaga-jaga jika LS belum sinkron)
      const kriteriaSnapshot = { ...kriteriaTpMap };

      // 1. Ambil semua ploting guru ini
      const plotings = await pb.collection("ploting_guru").getFullList({
        filter: `guru_id = "${user.id}"`,
        expand: "mapel_id,kelas_id",
        requestKey: null,
      });

      // 2. Kelompokkan: kelas -> set of mapel yang diajar di kelas itu
      const kelasMap = new Map();
      plotings.forEach((p) => {
        const mapelId = firstOf(p.mapel_id);
        if (!mapelId) return;
        const kelasArr = Array.isArray(p.expand?.kelas_id)
          ? p.expand.kelas_id
          : p.expand?.kelas_id
            ? [p.expand.kelas_id]
            : [];
        kelasArr.forEach((k) => {
          if (!k?.id) return;
          if (!kelasMap.has(k.id)) {
            kelasMap.set(k.id, { kelas: k, mapelIds: new Set() });
          }
          kelasMap.get(k.id).mapelIds.add(mapelId);
        });
      });

      if (kelasMap.size === 0) {
        alert("Belum ada kelas yang Anda ajar.");
        return;
      }

      const kelasList = Array.from(kelasMap.values()).sort((a, b) => {
        const t =
          (Number(a.kelas.tingkat) || 0) - (Number(b.kelas.tingkat) || 0);
        if (t !== 0) return t;
        return (a.kelas.nama_kelas || "").localeCompare(
          b.kelas.nama_kelas || "",
        );
      });

      const mapelIdsArr = Array.from(
        new Set(plotings.map((p) => firstOf(p.mapel_id)).filter(Boolean)),
      );
      const mapelFilter = mapelIdsArr
        .map((id) => `mapel_id ~ "${id}"`)
        .join(" || ");

      // 3. Fetch master + nilai
      const [mapelAll, tpAll, lmAll, nfAll, nsAll] = await Promise.all([
        pb.collection("mata_pelajaran").getFullList({
          filter: mapelIdsArr.map((id) => `id = "${id}"`).join(" || "),
          requestKey: null,
        }),
        pb.collection("tujuan_pembelajaran").getFullList({
          filter: mapelFilter,
          requestKey: null,
        }),
        pb.collection("lingkup_materi").getFullList({
          filter: mapelFilter,
          sort: "created",
          requestKey: null,
        }),
        pb.collection("nilai_formatif").getFullList({ requestKey: null }),
        pb.collection("nilai_sumatif").getFullList({ requestKey: null }),
      ]);

      const mapelById = new Map(mapelAll.map((m) => [m.id, m]));
      const tpById = new Map(tpAll.map((t) => [t.id, t]));
      const lmById = new Map(lmAll.map((l) => [l.id, l]));
      const lmOrder = new Map(lmAll.map((l, i) => [l.id, i]));

      // Map: mapelId -> { noTp -> tpId }  (untuk cek kriteria per TP)
      const tpIdByMapelNumber = new Map();
      tpAll.forEach((tp) => {
        const mapelId = firstOf(tp.mapel_id);
        if (!mapelIdsArr.includes(mapelId)) return;
        const noTp = parseInt(String(tp.no_tp || "").replace(/\D/g, ""), 10);
        if (!noTp) return;
        if (!tpIdByMapelNumber.has(mapelId))
          tpIdByMapelNumber.set(mapelId, new Map());
        tpIdByMapelNumber.get(mapelId).set(noTp, tp.id);
      });

      // 4. Workbook
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
      const GREEN = "FFD9EAD3";
      const GREEN_ALT = "FFEAF4E4";
      const ORANGE = "FFFCE5CD";
      const YELLOW_LIGHT = "FFFFF2CC";

      function styleHead(cell, argb) {
        cell.font = { bold: true, size: 10 };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb },
        };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = border;
      }

      const collator = new Intl.Collator("id", { numeric: true });

      for (let i = 0; i < kelasList.length; i++) {
        const { kelas, mapelIds } = kelasList[i];
        setExportProgress(
          `Menyusun sheet ${i + 1}/${kelasList.length}: ${kelas.nama_kelas}`,
        );
        await new Promise((r) => setTimeout(r, 0));

        // Siswa kelas ini
        const siswaKelas = await pb.collection("siswa").getFullList({
          filter: `kelas_id = "${kelas.id}"`,
          sort: "nama_siswa",
          requestKey: null,
        });
        const siswaSorted = [...siswaKelas].sort((a, b) =>
          collator.compare(a.nama_siswa || "", b.nama_siswa || ""),
        );

        const nfKelas = nfAll.filter((n) => firstOf(n.kelas_id) === kelas.id);
        const nsKelas = nsAll.filter((n) => firstOf(n.kelas_id) === kelas.id);

        // Mapel yang diajar di kelas ini
        const mapelKelas = Array.from(mapelIds)
          .map((id) => mapelById.get(id))
          .filter(Boolean)
          .sort((a, b) =>
            (a.nama_mapel || "").localeCompare(b.nama_mapel || ""),
          );

        // Data struktur
        const fData = new Map();
        const sData = new Map();
        const lmNamesByMapel = new Map();
        const maxTpByMapel = new Map();

        mapelKelas.forEach((m) => {
          fData.set(m.id, new Map());
          sData.set(m.id, new Map());
          lmNamesByMapel.set(m.id, []);
          maxTpByMapel.set(m.id, 0);
        });

        // maxTp dari master TP
        tpAll.forEach((tp) => {
          const mapelId = firstOf(tp.mapel_id);
          if (!mapelIds.has(mapelId)) return;
          const noTp = parseInt(String(tp.no_tp || "").replace(/\D/g, ""), 10);
          if (!noTp) return;
          if (noTp > (maxTpByMapel.get(mapelId) || 0)) {
            maxTpByMapel.set(mapelId, noTp);
          }
        });

        // Nilai formatif
        nfKelas.forEach((n) => {
          const tp = tpById.get(firstOf(n.tp_id));
          if (!tp) return;
          const mapelId = firstOf(tp.mapel_id);
          if (!mapelIds.has(mapelId)) return;
          const noTp = parseInt(String(tp.no_tp || "").replace(/\D/g, ""), 10);
          if (!noTp) return;
          const ks = [n.k1, n.k2, n.k3, n.k4].map(numOrNull);
          if (ks.every((v) => v === null)) return;
          const sid = firstOf(n.siswa_id);
          const perSiswa = fData.get(mapelId);
          if (!perSiswa.has(sid)) perSiswa.set(sid, {});
          perSiswa.get(sid)[noTp] = ks;
        });

        // LM names dari master
        const lmNameOrderByMapel = new Map();
        mapelKelas.forEach((m) => lmNameOrderByMapel.set(m.id, new Map()));
        lmAll.forEach((l) => {
          const mapelId = firstOf(l.mapel_id);
          if (!mapelIds.has(mapelId)) return;
          const nm = (l.nama || "-").trim();
          const ord = lmOrder.get(l.id) ?? 0;
          const nmOrder = lmNameOrderByMapel.get(mapelId);
          if (!nmOrder.has(nm) || ord < nmOrder.get(nm)) {
            nmOrder.set(nm, ord);
          }
        });
        lmNameOrderByMapel.forEach((nmOrder, mapelId) => {
          lmNamesByMapel.set(
            mapelId,
            Array.from(nmOrder.entries())
              .sort((a, b) => a[1] - b[1])
              .map((e) => e[0]),
          );
        });

        // Nilai sumatif
        nsKelas.forEach((n) => {
          const lm = lmById.get(firstOf(n.lm_id));
          if (!lm) return;
          const mapelId = firstOf(lm.mapel_id);
          if (!mapelIds.has(mapelId)) return;
          const nilai = numOrNull(n.nilai);
          if (nilai === null) return;
          const namaLm = (lm.nama || "-").trim();
          const sid = firstOf(n.siswa_id);
          const perSiswa = sData.get(mapelId);
          if (!perSiswa.has(sid)) perSiswa.set(sid, {});
          perSiswa.get(sid)[namaLm] = nilai;
        });

        // Global max untuk kelas ini
        const maxTpGlobal = Math.max(0, ...maxTpByMapel.values());
        const maxLmGlobal = Math.max(
          0,
          ...Array.from(lmNamesByMapel.values()).map((arr) => arr.length),
        );

        const sheet = workbook.addWorksheet(
          safeSheetName(kelas.nama_kelas, usedNames),
        );

        // Header 2 baris
        const FIXED = 4;
        const tpEnd = FIXED + maxTpGlobal * 4;
        const lastCol = tpEnd + maxLmGlobal;
        const h1 = sheet.getRow(1);
        const h2 = sheet.getRow(2);

        ["No", "NIS", "Nama Siswa", "Mapel"].forEach((label, c) => {
          sheet.mergeCells(1, c + 1, 2, c + 1);
          h1.getCell(c + 1).value = label;
          styleHead(h1.getCell(c + 1), GREEN);
          styleHead(h2.getCell(c + 1), GREEN);
        });

        for (let t = 1; t <= maxTpGlobal; t++) {
          const startCol = FIXED + (t - 1) * 4 + 1;
          sheet.mergeCells(1, startCol, 1, startCol + 3);
          h1.getCell(startCol).value = `TP ${t}`;
          const argb = t % 2 === 0 ? GREEN_ALT : GREEN;
          for (let k = 0; k < 4; k++) {
            styleHead(h1.getCell(startCol + k), argb);
            h2.getCell(startCol + k).value = `K${k + 1}`;
            styleHead(h2.getCell(startCol + k), argb);
          }
        }

        if (maxLmGlobal > 0) {
          const s = tpEnd + 1;
          if (maxLmGlobal > 1) sheet.mergeCells(1, s, 1, lastCol);
          h1.getCell(s).value = "SUMATIF";
          for (let l = 0; l < maxLmGlobal; l++) {
            styleHead(h1.getCell(s + l), ORANGE);
            h2.getCell(s + l).value = `LM ${l + 1}`;
            styleHead(h2.getCell(s + l), ORANGE);
          }
        }
        h1.height = 22;
        h2.height = 20;

        // Blok per mapel
        mapelKelas.forEach((m) => {
          const mapelName = (m.nama_mapel || m.nama || "-").trim();
          const lmNames = lmNamesByMapel.get(m.id) || [];

          // Baris judul lingkup materi
          if (lmNames.length > 0) {
            const titleRow = sheet.addRow([]);
            titleRow.getCell(3).value = "Lingkup Materi";
            titleRow.getCell(4).value = mapelName;
            lmNames.forEach((nm, l) => {
              titleRow.getCell(tpEnd + l + 1).value = nm;
            });
            for (let c = 1; c <= lastCol; c++) {
              const cell = titleRow.getCell(c);
              cell.font = { bold: true, size: 9 };
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: YELLOW_LIGHT },
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

          // Map: noTp -> tpId untuk mapel ini
          const tpIdByNo = tpIdByMapelNumber.get(m.id) || new Map();

          // Baris per siswa
          if (siswaSorted.length === 0) {
            const row = sheet.addRow([]);
            sheet.mergeCells(row.number, 1, row.number, lastCol);
            row.getCell(1).value = "Belum ada siswa di kelas ini.";
            row.getCell(1).font = {
              italic: true,
              color: { argb: "FF888888" },
            };
            row.getCell(1).alignment = {
              horizontal: "center",
              vertical: "middle",
            };
            row.getCell(1).border = border;
          } else {
            siswaSorted.forEach((siswa, idx) => {
              const perTp = fData.get(m.id)?.get(siswa.id) || {};
              const perLm = sData.get(m.id)?.get(siswa.id) || {};
              const row = sheet.addRow([
                idx + 1,
                siswa.nis || "",
                siswa.nama_siswa,
                mapelName,
              ]);
              for (let t = 1; t <= maxTpGlobal; t++) {
                const ks = perTp[t] || [null, null, null, null];
                const tpId = tpIdByNo.get(t);
                const activeK = tpId
                  ? getActiveKForTpFromMap(tpId, kriteriaSnapshot)
                  : SEMUA_KRITERIA;
                for (let k = 0; k < 4; k++) {
                  const kField = SEMUA_KRITERIA[k];
                  const isActive = activeK.includes(kField);
                  row.getCell(FIXED + (t - 1) * 4 + k + 1).value = isActive
                    ? ks[k]
                    : null;
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
          }
        });

        // Lebar kolom
        sheet.getColumn(1).width = 6;
        sheet.getColumn(2).width = 14;
        sheet.getColumn(3).width = 28;
        sheet.getColumn(4).width = 26;
        for (let c = FIXED + 1; c <= tpEnd; c++) sheet.getColumn(c).width = 6;
        for (let c = tpEnd + 1; c <= lastCol; c++)
          sheet.getColumn(c).width = 14;

        sheet.views = [{ state: "frozen", xSplit: 4, ySplit: 2 }];
      }

      setExportProgress("Membuat file...");
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, "Nilai_Mentah_Per_Kelas.xlsx");
    } catch (err) {
      console.error("Gagal export nilai mentah per kelas:", err);
      alert(
        "Gagal export. Pastikan package 'exceljs' dan 'file-saver' sudah terinstall.",
      );
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  }

  function backToMapel() {
    setSelectedPlotingId(null);
  }
  function backToKelas() {
    setSelectedKelasId(null);
  }

  // ---------------- Render ----------------
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
          Halaman ini hanya dapat diakses oleh guru mata pelajaran.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <button
          type="button"
          onClick={backToMapel}
          className={
            selectedPloting
              ? "hover:text-slate-600 cursor-pointer"
              : "text-slate-600 font-medium"
          }
        >
          Penilaian
        </button>
        {selectedPloting && (
          <>
            <span>/</span>
            <button
              type="button"
              onClick={backToKelas}
              className={
                selectedKelas
                  ? "hover:text-slate-600 cursor-pointer"
                  : "text-slate-600 font-medium"
              }
            >
              {selectedPloting.expand?.mapel_id?.nama_mapel || "Mata Pelajaran"}
            </button>
          </>
        )}
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
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ============ STEP 1: PILIH MATA PELAJARAN ============ */}
      {!selectedPloting && (
        <>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="mb-1 text-lg font-bold text-slate-800">
                Pilih Mata Pelajaran
              </h1>
              <p className="text-xs text-slate-500">
                Pilih mata pelajaran untuk mengelola nilai kelas yang Anda ampu.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportPerKelas}
              disabled={exporting || loadingPloting || plotingList.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap inline-flex items-center gap-2 self-start sm:self-center transition"
            >
              {exporting
                ? exportProgress || "Mengexport..."
                : "⬇ Export Nilai Mentah (Per Kelas)"}
            </button>
          </div>

          {loadingPloting ? (
            <LoadingGrid />
          ) : plotingList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
              Anda belum di-plotting mengajar mata pelajaran apapun.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plotingList.map((p) => {
                const mapel = p.expand?.mapel_id;
                const kelasArr = Array.isArray(p.expand?.kelas_id)
                  ? p.expand.kelas_id
                  : p.expand?.kelas_id
                    ? [p.expand.kelas_id]
                    : [];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlotingId(p.id)}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-200 hover:bg-blue-600 active:scale-[0.98]"
                  >
                    <span className="inline-block text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase group-hover:bg-white/20 group-hover:text-white transition-colors duration-300">
                      {mapel?.kode_mapel || "MPL"}
                    </span>
                    <h3 className="text-sm font-bold text-slate-800 mt-2 group-hover:text-white transition-colors duration-300">
                      {mapel?.nama_mapel || "—"}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1 group-hover:text-blue-100 transition-colors duration-300">
                      Diampu di {kelasArr.length} kelas
                    </p>
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
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============ STEP 2: PILIH KELAS ============ */}
      {selectedPloting && !selectedKelas && (
        <>
          <div className="mb-6">
            <h1 className="text-lg font-bold text-slate-800">Pilih Kelas</h1>
            <p className="text-xs text-slate-500 mt-1">
              Pilih kelas untuk mengelola penilaian mata pelajaran{" "}
              <span className="font-semibold text-slate-700">
                {selectedPloting.expand?.mapel_id?.nama_mapel}
              </span>
              .
            </p>
          </div>

          {loadingKelasOptions ? (
            <LoadingGrid />
          ) : kelasOptions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
              Belum ada kelas yang di-plotting untuk mata pelajaran ini.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {kelasOptions.map(({ kelas, siswaCount }) => (
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
                      {siswaCount} siswa
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

      {/* ============ STEP 3: INPUT NILAI ============ */}
      {selectedPloting && selectedKelas && (
        <>
          {/* Gradient hero */}
          <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-blue-100 font-semibold">
                  {selectedPloting.expand?.mapel_id?.nama_mapel ||
                    "Mata Pelajaran"}
                </p>
                <h1 className="text-lg font-bold mt-0.5">
                  {selectedKelas.nama_kelas}
                </h1>
                <p className="text-xs text-blue-100 mt-1">
                  Input nilai untuk kelas ini. Halaman ini khusus input — export
                  &amp; rekap rapor dikelola wali kelas.
                </p>
              </div>
              <div className="flex gap-4 text-center">
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">Siswa</p>
                  <p className="text-lg font-bold">{siswaList.length}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">TP</p>
                  <p className="text-lg font-bold">{tpList.length}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">LP</p>
                  <p className="text-lg font-bold">{lpList.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Selector kelas cepat */}
          {kelasOptions.length > 1 && (
            <div className="mb-6 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-medium text-slate-400 shrink-0">
                Ganti kelas:
              </span>
              {kelasOptions.map(({ kelas }) => (
                <button
                  key={kelas.id}
                  type="button"
                  onClick={() => setSelectedKelasId(kelas.id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                    kelas.id === selectedKelasId
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
                  }`}
                >
                  {kelas.nama_kelas}
                </button>
              ))}
            </div>
          )}

          {/* Inner tab navigation */}
          <div className="mb-6 flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 no-scrollbar w-full sm:w-fit">
            <button
              type="button"
              onClick={() => setInnerTab("formatif")}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer min-w-[140px] flex-1 sm:flex-initial ${
                innerTab === "formatif"
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
              }`}
            >
              Nilai Formatif
            </button>
            <button
              type="button"
              onClick={() => setInnerTab("sumatif")}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer min-w-[140px] flex-1 sm:flex-initial ${
                innerTab === "sumatif"
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
              }`}
            >
              Nilai Sumatif
            </button>
            <button
              type="button"
              onClick={() => setInnerTab("ujian")}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer min-w-[140px] flex-1 sm:flex-initial ${
                innerTab === "ujian"
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
              }`}
            >
              Nilai Ujian {ujianAktif.length > 0 && `(${ujianAktif.length})`}
            </button>
          </div>

          {loadingDetail ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* ---------------- TAB: FORMATIF ---------------- */}
              {innerTab === "formatif" && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-400">
                      Tiap TP bisa punya kriteria berbeda — klik badge{" "}
                      <span className="font-bold text-slate-600">K1–K4</span> di
                      header TP. Nilai kosong dianggap <b>0</b>.
                    </p>
                    {!addingTp ? (
                      <button
                        type="button"
                        onClick={() => setAddingTp(true)}
                        disabled={tpList.length >= DAFTAR_NO_TP.length}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        + Tambah TP
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedNoTp}
                          onChange={(e) => setSelectedNoTp(e.target.value)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-500"
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
                          type="button"
                          onClick={handleAddTp}
                          disabled={!selectedNoTp || savingTp}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingTp ? "..." : "Simpan"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingTp(false);
                            setSelectedNoTp("");
                          }}
                          className="text-xs font-semibold text-slate-500 px-2"
                        >
                          Batal
                        </button>
                      </div>
                    )}
                  </div>

                  {tpList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                      Belum ada TP untuk mata pelajaran ini. Tambahkan TP untuk
                      mulai input nilai.
                    </div>
                  ) : siswaList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                      Belum ada siswa terdaftar di kelas ini.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-left uppercase tracking-wider text-slate-400 text-[10px] font-semibold border-b border-slate-100">
                            <th
                              rowSpan={2}
                              className="px-4 py-2.5 sticky left-0 z-10 bg-slate-50 min-w-[150px] align-bottom"
                            >
                              Nama Siswa
                            </th>
                            {tpList.map((tp) => {
                              const activeK = getActiveKForTp(tp.id);
                              return (
                                <th
                                  key={tp.id}
                                  colSpan={activeK.length}
                                  className="text-center px-2 py-2 font-semibold border-l border-slate-200"
                                >
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <span>{tp.no_tp}</span>
                                    {/* Toggle K per TP */}
                                    <div className="flex gap-0.5">
                                      {SEMUA_KRITERIA.map((k) => {
                                        const isActive = activeK.includes(k);
                                        return (
                                          <button
                                            key={k}
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              toggleKriteriaForTp(tp.id, k);
                                            }}
                                            title={
                                              isActive
                                                ? `${k.toUpperCase()} aktif – klik nonaktifkan`
                                                : `${k.toUpperCase()} nonaktif – klik aktifkan`
                                            }
                                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                              isActive
                                                ? "bg-emerald-600 text-white"
                                                : "bg-slate-200 text-slate-400 hover:bg-slate-300"
                                            }`}
                                          >
                                            {k.toUpperCase()}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTp(tp)}
                                      title={`Hapus ${tp.no_tp}`}
                                      className="text-[9px] font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-300 hover:border-red-600 rounded px-1.5 py-0.5 transition-colors normal-case tracking-normal"
                                    >
                                      Hapus
                                    </button>
                                  </div>
                                </th>
                              );
                            })}
                            <th
                              rowSpan={2}
                              className="px-4 py-2.5 text-center min-w-[100px] bg-blue-50/60 text-blue-600 align-bottom"
                            >
                              Nilai Akhir
                            </th>
                          </tr>
                          <tr className="bg-slate-50 text-slate-400 text-[9px] uppercase tracking-wider border-b border-slate-100">
                            {tpList.map((tp) => {
                              const activeK = getActiveKForTp(tp.id);
                              return activeK.map((k, i) => (
                                <th
                                  key={`${tp.id}-${k}`}
                                  className={`text-center px-1 py-1.5 font-semibold ${i === 0 ? "border-l border-slate-200" : ""}`}
                                >
                                  {k.toUpperCase()}
                                </th>
                              ));
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {siswaList.map((s) => {
                            const avg = formatifAvgMap[s.id];
                            return (
                              <tr
                                key={s.id}
                                className="hover:bg-slate-50/40 transition"
                              >
                                <td className="px-4 py-2 font-semibold text-slate-700 sticky left-0 z-10 bg-white min-w-[150px]">
                                  {s.nama_siswa}
                                </td>
                                {tpList.map((tp) => {
                                  const rec = nilaiFormatif[s.id]?.[tp.id];
                                  const activeK = getActiveKForTp(tp.id);
                                  return activeK.map((kField, i) => {
                                    const cellKey = `f-${s.id}-${tp.id}-${kField}`;
                                    return (
                                      <td
                                        key={cellKey}
                                        className={`px-1 py-1.5 text-center ${i === 0 ? "border-l border-slate-100" : ""}`}
                                      >
                                        <NilaiInput
                                          value={rec?.[kField]}
                                          onChange={(e) =>
                                            handleFormatifChange(
                                              s.id,
                                              tp.id,
                                              kField,
                                              e.target.value,
                                            )
                                          }
                                          onBlur={() =>
                                            handleFormatifBlur(
                                              s.id,
                                              tp.id,
                                              kField,
                                            )
                                          }
                                          saving={savingFCell === cellKey}
                                          saved={savedFFlash === cellKey}
                                          width="w-12"
                                        />
                                      </td>
                                    );
                                  });
                                })}
                                <td className="px-4 py-2 text-center bg-blue-50/30">
                                  <span
                                    className={`font-bold font-mono ${nilaiColor(avg)}`}
                                  >
                                    {formatGrade(avg)}
                                  </span>
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

              {/* ---------------- TAB: SUMATIF ---------------- */}
              {innerTab === "sumatif" && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-400">
                      Nilai akhir sumatif = total perolehan ÷ jumlah LP. Nilai
                      kosong dianggap <b>0</b>.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAddLp((v) => !v)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition whitespace-nowrap"
                    >
                      {showAddLp ? "Batal" : "+ Tambah LP"}
                    </button>
                  </div>

                  {showAddLp && (
                    <form
                      onSubmit={handleAddLp}
                      className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 flex flex-col sm:flex-row gap-3 items-end"
                    >
                      <div className="flex-1 w-full">
                        <label className="text-[11px] font-medium text-slate-500">
                          Nama Lingkup Materi
                        </label>
                        <input
                          type="text"
                          value={namaLp}
                          onChange={(e) => setNamaLp(e.target.value)}
                          placeholder="Contoh: Bilangan Cacah"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingLp}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {savingLp ? "Menyimpan..." : "Simpan LP"}
                      </button>
                    </form>
                  )}

                  {lpList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                      Belum ada LP untuk mata pelajaran ini. Tambahkan LP untuk
                      mulai input nilai.
                    </div>
                  ) : siswaList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                      Belum ada siswa terdaftar di kelas ini.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
                      <table className="w-full min-w-[640px] text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-left uppercase tracking-wider text-slate-400 text-[10px] font-semibold border-b border-slate-100">
                            <th className="px-4 py-2.5 sticky left-0 bg-slate-50 min-w-[160px]">
                              Nama Siswa
                            </th>
                            {lpList.map((lp) => (
                              <th
                                key={lp.id}
                                className="px-3 py-2.5 text-center min-w-[110px]"
                                title={lp.nama}
                              >
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <span className="line-clamp-2 normal-case font-semibold text-slate-500">
                                    {lp.nama}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLp(lp)}
                                    title={`Hapus ${lp.nama}`}
                                    className="text-[9px] font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-300 hover:border-red-600 rounded px-1.5 py-0.5 transition-colors normal-case tracking-normal"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </th>
                            ))}
                            <th className="px-4 py-2.5 text-center min-w-[100px] bg-blue-50/60 text-blue-600">
                              Nilai Akhir
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {siswaList.map((s) => {
                            const avg = sumatifAvgMap[s.id];
                            return (
                              <tr
                                key={s.id}
                                className="hover:bg-slate-50/40 transition"
                              >
                                <td className="px-4 py-2 font-semibold text-slate-700 sticky left-0 bg-white">
                                  {s.nama_siswa}
                                </td>
                                {lpList.map((lp) => {
                                  const rec = nilaiSumatif[s.id]?.[lp.id];
                                  const cellKey = `s-${s.id}-${lp.id}`;
                                  return (
                                    <td
                                      key={lp.id}
                                      className="px-3 py-2 text-center"
                                    >
                                      <NilaiInput
                                        value={rec?.nilai}
                                        onChange={(e) =>
                                          handleSumatifChange(
                                            s.id,
                                            lp.id,
                                            e.target.value,
                                          )
                                        }
                                        onBlur={() =>
                                          handleSumatifBlur(s.id, lp.id)
                                        }
                                        saving={savingSCell === cellKey}
                                        saved={savedSFlash === cellKey}
                                        width="w-16"
                                      />
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-2 text-center bg-blue-50/30">
                                  <span
                                    className={`font-bold font-mono ${nilaiColor(avg)}`}
                                  >
                                    {formatGrade(avg)}
                                  </span>
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

              {/* ---------------- TAB: UJIAN ---------------- */}
              {innerTab === "ujian" && (
                <div className="space-y-4">
                  {loadingUjianAktif ? (
                    <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-400 text-xs">
                      Memuat daftar ujian...
                    </div>
                  ) : ujianAktif.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                      Belum ada ujian yang diaktifkan oleh Admin untuk kelas
                      ini.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {ujianAktif.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSelectedUjianId(u.id)}
                            className={`text-xs font-bold px-4 py-2 rounded-full border transition-colors ${
                              selectedUjianId === u.id
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"
                            }`}
                          >
                            {u.nama_ujian}
                            <span className="ml-1.5 opacity-70">
                              ({JENIS_LABEL[u.jenis_ujian] || u.jenis_ujian})
                            </span>
                          </button>
                        ))}
                      </div>

                      {!selectedUjianId ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                          Pilih ujian di atas untuk mulai input nilai.
                        </div>
                      ) : loadingNilaiUjian ? (
                        <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-400 text-xs">
                          Memuat nilai ujian...
                        </div>
                      ) : siswaList.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                          Belum ada siswa terdaftar di kelas ini.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
                          <table className="w-full min-w-[420px] text-xs">
                            <thead>
                              <tr className="bg-slate-50 text-left uppercase tracking-wider text-slate-400 text-[10px] font-semibold border-b border-slate-100">
                                <th className="px-4 py-2.5 min-w-[180px]">
                                  Nama Siswa
                                </th>
                                <th className="px-4 py-2.5 text-center min-w-[120px] bg-blue-50/60 text-blue-600">
                                  Nilai Ujian
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {siswaList.map((s) => {
                                const rec = nilaiUjian[s.id];
                                return (
                                  <tr
                                    key={s.id}
                                    className="hover:bg-slate-50/40 transition"
                                  >
                                    <td className="px-4 py-2 font-semibold text-slate-700">
                                      {s.nama_siswa}
                                    </td>
                                    <td className="px-4 py-2 text-center bg-blue-50/20">
                                      <NilaiInput
                                        value={rec?.nilai}
                                        onChange={(e) =>
                                          handleUjianChange(
                                            s.id,
                                            e.target.value,
                                          )
                                        }
                                        onBlur={() => handleUjianBlur(s.id)}
                                        saving={savingUCell === s.id}
                                        saved={savedUFlash === s.id}
                                        width="w-20"
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
            </>
          )}
        </>
      )}

      {/* ================= MODAL KONFIRMASI HAPUS ================= */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !deleting && setConfirmDialog(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <span className="text-red-600 text-xl font-bold">!</span>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-800">
                  Konfirmasi Hapus
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {confirmDialog.type === "tp" ? (
                    <>
                      Yakin ingin menghapus{" "}
                      <span className="font-bold text-slate-800">
                        {confirmDialog.data.no_tp}
                      </span>
                      ?
                    </>
                  ) : (
                    <>
                      Yakin ingin menghapus LP{" "}
                      <span className="font-bold text-slate-800">
                        &quot;{confirmDialog.data.nama}&quot;
                      </span>
                      ?
                    </>
                  )}
                </p>
                <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  ⚠ Semua nilai{" "}
                  {confirmDialog.type === "tp" ? "formatif" : "sumatif"} terkait
                  akan ikut terhapus dan tidak bisa dikembalikan.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
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
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Menghapus..." : "Yakin, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}
