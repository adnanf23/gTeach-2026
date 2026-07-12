"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// Role yang boleh mengakses halaman ini
const ALLOWED_ROLES = ["guru mapel"];

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function nilaiColor(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "text-slate-400";
  if (n >= 80) return "text-emerald-600";
  if (n >= 60) return "text-amber-600";
  return "text-red-600";
}

export default function PenilaianMapelPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [error, setError] = useState("");

  // Step 1: Kelas yang diampu oleh guru ini (dari ploting_guru)
  const [kelasList, setKelasList] = useState([]);
  const [loadingKelas, setLoadingKelas] = useState(true);
  const [selectedKelas, setSelectedKelas] = useState(null);

  // Step 2: Mapel yang diampu guru ini di kelas terpilih
  const [plotingList, setPlotingList] = useState([]);
  const [loadingPloting, setLoadingPloting] = useState(false);
  const [selectedPlotingId, setSelectedPlotingId] = useState(null);

  const selectedPloting = useMemo(
    () => plotingList.find((p) => p.id === selectedPlotingId) || null,
    [plotingList, selectedPlotingId],
  );

  // Step 3: data inti
  const [siswaList, setSiswaList] = useState([]);
  const [lingkupList, setLingkupList] = useState([]);
  const [tpByLingkup, setTpByLingkup] = useState({});
  const [nilaiMap, setNilaiMap] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Ujian data
  const [ujianList, setUjianList] = useState([]);
  const [nilaiUjianMap, setNilaiUjianMap] = useState({});
  const [loadingUjian, setLoadingUjian] = useState(false);

  const [innerTab, setInnerTab] = useState("materi");

  // ---- Form Lingkup Materi ----
  const [showLingkupForm, setShowLingkupForm] = useState(false);
  const [lingkupForm, setLingkupForm] = useState({
    nama_lingkup: "",
    capaian_kompetensi: "",
  });
  const [editingLingkupId, setEditingLingkupId] = useState(null);
  const [savingLingkup, setSavingLingkup] = useState(false);

  // ---- Form Tujuan Pembelajaran ----
  const [addingTpFor, setAddingTpFor] = useState(null);
  const [tpDraft, setTpDraft] = useState("");
  const [editingTp, setEditingTp] = useState(null);
  const [savingTp, setSavingTp] = useState(false);

  // ---- Nilai ----
  const [savingCell, setSavingCell] = useState(null);
  const [savedFlash, setSavedFlash] = useState(null);

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
      setLoadingKelas(false);
      return;
    }

    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // 2. Ambil kelas yang diampu oleh guru ini (dari ploting_guru)
  useEffect(() => {
    if (!authChecked || unauthorized || !user?.id) return;
    let isMounted = true;

    async function fetchKelas() {
      setLoadingKelas(true);
      setError("");
      try {
        // Ambil semua ploting_guru untuk guru ini
        const plotingRecords = await pb.collection("ploting_guru").getFullList({
          filter: `guru_id = "${user.id}"`,
          expand: "kelas_id",
          requestKey: null,
        });

        // Kumpulkan semua kelas_id dari ploting_guru (bisa multi-select)
        const kelasIdSet = new Set();
        plotingRecords.forEach((p) => {
          const kelasIds = Array.isArray(p.kelas_id)
            ? p.kelas_id
            : [p.kelas_id];
          kelasIds.forEach((kid) => {
            if (kid) kelasIdSet.add(kid);
          });
        });

        if (kelasIdSet.size === 0) {
          setKelasList([]);
          setLoadingKelas(false);
          return;
        }

        // Ambil data kelas berdasarkan ID yang terkumpul
        const kelasIds = Array.from(kelasIdSet);
        const kelasPromises = kelasIds.map((id) =>
          pb.collection("kelas").getOne(id, {
            expand: "tahun_ajaran_id",
            requestKey: null,
          }),
        );

        const kelasRecords = await Promise.all(kelasPromises);
        // Urutkan berdasarkan tingkat dan nama
        kelasRecords.sort(
          (a, b) =>
            (a.tingkat || 0) - (b.tingkat || 0) ||
            (a.nama_kelas || "").localeCompare(b.nama_kelas || ""),
        );

        if (!isMounted) return;
        setKelasList(kelasRecords);
        if (kelasRecords.length === 1) setSelectedKelas(kelasRecords[0]);
      } catch (err) {
        console.error("Error fetching kelas:", err);
        if (isMounted) setError("Gagal memuat data kelas Anda.");
      } finally {
        if (isMounted) setLoadingKelas(false);
      }
    }

    fetchKelas();
    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized, user]);

  // 3. Ambil daftar mapel yang diampu guru ini di kelas terpilih
  useEffect(() => {
    if (!selectedKelas) {
      setPlotingList([]);
      setSelectedPlotingId(null);
      return;
    }
    let isMounted = true;

    async function fetchPloting() {
      setLoadingPloting(true);
      setError("");
      setSelectedPlotingId(null);
      try {
        // Ambil ploting_guru untuk guru ini dan kelas ini
        const records = await pb.collection("ploting_guru").getFullList({
          filter: `guru_id = "${user.id}"`,
          expand: "mapel_id,guru_id",
          requestKey: null,
        });

        // Filter manual untuk kelas yang dipilih
        const filteredRecords = records.filter((p) => {
          const kelasIds = Array.isArray(p.kelas_id)
            ? p.kelas_id
            : [p.kelas_id];
          return kelasIds.includes(selectedKelas.id);
        });

        // Urutkan berdasarkan nama mapel
        filteredRecords.sort((a, b) =>
          (a.expand?.mapel_id?.nama_mapel || "").localeCompare(
            b.expand?.mapel_id?.nama_mapel || "",
          ),
        );

        if (isMounted) {
          setPlotingList(filteredRecords);
          if (filteredRecords.length === 1) {
            setSelectedPlotingId(filteredRecords[0].id);
          }
        }
      } catch (err) {
        console.error("Error fetching ploting:", err);
        if (isMounted)
          setError("Gagal memuat daftar mata pelajaran untuk kelas ini.");
      } finally {
        if (isMounted) setLoadingPloting(false);
      }
    }

    fetchPloting();
    return () => {
      isMounted = false;
    };
  }, [selectedKelas, user]);

  // 4. Ambil siswa, lingkup materi, TP, dan nilai untuk mapel terpilih
  useEffect(() => {
    if (!selectedKelas || !selectedPloting) {
      setSiswaList([]);
      setLingkupList([]);
      setTpByLingkup({});
      setNilaiMap({});
      return;
    }
    let isMounted = true;

    async function fetchDetail() {
      setLoadingDetail(true);
      setError("");
      try {
        const [siswaRecords, lingkupRecords] = await Promise.all([
          pb.collection("siswa").getFullList({
            filter: `kelas_id = "${selectedKelas.id}"`,
            sort: "nama_siswa",
            requestKey: null,
          }),
          pb.collection("lingkup_materi").getFullList({
            filter: `ploting_guru_id = "${selectedPloting.id}"`,
            requestKey: null,
          }),
        ]);

        let tpGrouped = {};
        if (lingkupRecords.length > 0) {
          const tpFilter = lingkupRecords
            .map((l) => `lingkup_materi_id = "${l.id}"`)
            .join(" || ");
          const tpRecords = await pb
            .collection("tujuan_pembelajaran")
            .getFullList({
              filter: tpFilter,
              sort: "urutan",
              requestKey: null,
            });
          for (const tp of tpRecords) {
            const lid = firstOf(tp.lingkup_materi_id);
            if (!tpGrouped[lid]) tpGrouped[lid] = [];
            tpGrouped[lid].push(tp);
          }
        }

        let nilaiGrouped = {};
        for (const s of siswaRecords) nilaiGrouped[s.id] = {};

        if (siswaRecords.length > 0 && lingkupRecords.length > 0) {
          const siswaFilter = siswaRecords
            .map((s) => `siswa_id = "${s.id}"`)
            .join(" || ");
          const lingkupFilter = lingkupRecords
            .map((l) => `lingkup_materi_id = "${l.id}"`)
            .join(" || ");
          const nilaiRecords = await pb.collection("nilai_harian").getFullList({
            filter: `(${siswaFilter}) && (${lingkupFilter})`,
            requestKey: null,
          });
          for (const n of nilaiRecords) {
            const sid = firstOf(n.siswa_id);
            const lid = firstOf(n.lingkup_materi_id);
            if (!nilaiGrouped[sid]) nilaiGrouped[sid] = {};
            nilaiGrouped[sid][lid] = { id: n.id, nilai: n.nilai };
          }
        }

        // Ambil data ujian yang terbuka
        await fetchUjian(siswaRecords);

        if (!isMounted) return;
        setSiswaList(siswaRecords);
        setLingkupList(lingkupRecords);
        setTpByLingkup(tpGrouped);
        setNilaiMap(nilaiGrouped);
      } catch (err) {
        console.error("Error fetching detail:", err);
        if (isMounted)
          setError("Gagal memuat data materi/nilai mata pelajaran ini.");
      } finally {
        if (isMounted) setLoadingDetail(false);
      }
    }

    fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedKelas, selectedPloting]);

  // Fungsi untuk fetch ujian yang terbuka (sama dengan walas)
  async function fetchUjian(siswaRecords) {
    if (!selectedKelas) return;

    try {
      setLoadingUjian(true);
      const tingkat = selectedKelas.tingkat || 1;

      const ujianRecords = await pb.collection("pengaturan_ujian").getFullList({
        filter: `status_akses = "buka" && target_tingkat ~ "${tingkat}"`,
        requestKey: null,
      });

      const validUjian = ujianRecords.filter((ujian) => {
        if (!ujian.target_kelas_id || ujian.target_kelas_id.length === 0) {
          return true;
        }
        const targetIds = Array.isArray(ujian.target_kelas_id)
          ? ujian.target_kelas_id
          : [ujian.target_kelas_id];
        return targetIds.includes(selectedKelas.id);
      });

      setUjianList(validUjian);

      if (siswaRecords && siswaRecords.length > 0 && validUjian.length > 0) {
        const siswaFilter = siswaRecords
          .map((s) => `siswa_id = "${s.id}"`)
          .join(" || ");
        const ujianFilter = validUjian
          .map((u) => `pengaturan_ujian_id = "${u.id}"`)
          .join(" || ");

        const nilaiUjianRecords = await pb
          .collection("nilai_ujian")
          .getFullList({
            filter: `(${siswaFilter}) && (${ujianFilter})`,
            requestKey: null,
          });

        const nilaiUjianGrouped = {};
        for (const s of siswaRecords) nilaiUjianGrouped[s.id] = {};

        for (const n of nilaiUjianRecords) {
          const sid = firstOf(n.siswa_id);
          const ujid = firstOf(n.pengaturan_ujian_id);
          if (!nilaiUjianGrouped[sid]) nilaiUjianGrouped[sid] = {};
          nilaiUjianGrouped[sid][ujid] = { id: n.id, nilai: n.nilai };
        }

        setNilaiUjianMap(nilaiUjianGrouped);
      }
    } catch (err) {
      console.error("Error fetching ujian:", err);
    } finally {
      setLoadingUjian(false);
    }
  }

  // ---------------- Handlers: Lingkup Materi (sama dengan walas) ----------------
  function openAddLingkup() {
    setEditingLingkupId(null);
    setLingkupForm({ nama_lingkup: "", capaian_kompetensi: "" });
    setShowLingkupForm(true);
  }

  function openEditLingkup(l) {
    setEditingLingkupId(l.id);
    setLingkupForm({
      nama_lingkup: l.nama_lingkup || "",
      capaian_kompetensi: l.capaian_kompetensi || "",
    });
    setShowLingkupForm(true);
  }

  async function submitLingkup() {
    if (!lingkupForm.nama_lingkup.trim() || !selectedPloting) return;
    setSavingLingkup(true);
    setError("");
    try {
      if (editingLingkupId) {
        const updated = await pb
          .collection("lingkup_materi")
          .update(editingLingkupId, {
            nama_lingkup: lingkupForm.nama_lingkup.trim(),
            capaian_kompetensi: lingkupForm.capaian_kompetensi.trim(),
          });
        setLingkupList((prev) =>
          prev.map((l) => (l.id === updated.id ? updated : l)),
        );
      } else {
        await pb.collection("lingkup_materi").create({
          ploting_guru_id: selectedPloting.id,
          guru_id: selectedPloting.guru_id,
          kelas_id: selectedKelas.id,
          mapel_id: selectedPloting.mapel_id,
          nama: namaLingkup,
        });
        setLingkupList((prev) => [...prev, created]);
        setTpByLingkup((prev) => ({ ...prev, [created.id]: [] }));
        setNilaiMap((prev) => {
          const next = {};
          for (const sid of Object.keys(prev)) next[sid] = { ...prev[sid] };
          return next;
        });
      }
      setShowLingkupForm(false);
      setEditingLingkupId(null);
      setLingkupForm({ nama_lingkup: "", capaian_kompetensi: "" });
    } catch (err) {
      console.error("Error saving lingkup materi:", err);
      setError("Gagal menyimpan lingkup materi.");
    } finally {
      setSavingLingkup(false);
    }
  }

  async function deleteLingkup(id) {
    if (
      !confirm(
        "Hapus lingkup materi ini? Tujuan pembelajaran dan seluruh nilai harian terkait juga akan terhapus.",
      )
    )
      return;
    try {
      await pb.collection("lingkup_materi").delete(id);
      setLingkupList((prev) => prev.filter((l) => l.id !== id));
      setTpByLingkup((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNilaiMap((prev) => {
        const next = {};
        for (const sid of Object.keys(prev)) {
          const row = { ...prev[sid] };
          delete row[id];
          next[sid] = row;
        }
        return next;
      });
    } catch (err) {
      console.error("Error deleting lingkup materi:", err);
      setError("Gagal menghapus lingkup materi.");
    }
  }

  // ---------------- Handlers: Tujuan Pembelajaran (sama dengan walas) ----------------
  async function submitTp(lingkupId) {
    if (!tpDraft.trim()) return;
    setSavingTp(true);
    setError("");
    try {
      const urutan = (tpByLingkup[lingkupId]?.length || 0) + 1;
      const created = await pb.collection("tujuan_pembelajaran").create({
        lingkup_materi_id: lingkupId,
        deskripsi: tpDraft.trim(),
        urutan,
      });
      setTpByLingkup((prev) => ({
        ...prev,
        [lingkupId]: [...(prev[lingkupId] || []), created],
      }));
      setTpDraft("");
      setAddingTpFor(null);
    } catch (err) {
      console.error("Error saving tujuan pembelajaran:", err);
      setError("Gagal menyimpan tujuan pembelajaran.");
    } finally {
      setSavingTp(false);
    }
  }

  async function updateTp() {
    if (!editingTp?.deskripsi?.trim()) return;
    setSavingTp(true);
    setError("");
    try {
      const updated = await pb
        .collection("tujuan_pembelajaran")
        .update(editingTp.id, {
          deskripsi: editingTp.deskripsi.trim(),
        });
      setTpByLingkup((prev) => ({
        ...prev,
        [editingTp.lingkupId]: (prev[editingTp.lingkupId] || []).map((t) =>
          t.id === updated.id ? updated : t,
        ),
      }));
      setEditingTp(null);
    } catch (err) {
      console.error("Error updating tujuan pembelajaran:", err);
      setError("Gagal memperbarui tujuan pembelajaran.");
    } finally {
      setSavingTp(false);
    }
  }

  async function deleteTp(lingkupId, tpId) {
    if (!confirm("Hapus tujuan pembelajaran ini?")) return;
    try {
      await pb.collection("tujuan_pembelajaran").delete(tpId);
      setTpByLingkup((prev) => ({
        ...prev,
        [lingkupId]: (prev[lingkupId] || []).filter((t) => t.id !== tpId),
      }));
    } catch (err) {
      console.error("Error deleting tujuan pembelajaran:", err);
      setError("Gagal menghapus tujuan pembelajaran.");
    }
  }

  // ---------------- Handlers: Nilai Harian (sama dengan walas) ----------------
  function handleNilaiChange(siswaId, lingkupId, rawValue) {
    setNilaiMap((prev) => ({
      ...prev,
      [siswaId]: {
        ...prev[siswaId],
        [lingkupId]: {
          ...(prev[siswaId]?.[lingkupId] || {}),
          nilai: rawValue,
        },
      },
    }));
  }

  async function handleNilaiBlur(siswaId, lingkupId) {
    const cell = nilaiMap[siswaId]?.[lingkupId];
    const rawValue = cell?.nilai;
    if (rawValue === "" || rawValue === undefined || rawValue === null) return;

    const nilaiNum = Number(rawValue);
    if (Number.isNaN(nilaiNum)) return;

    const clamped = Math.min(100, Math.max(0, nilaiNum));
    const key = `${siswaId}_${lingkupId}`;
    setSavingCell(key);
    setError("");
    try {
      if (cell?.id) {
        await pb.collection("nilai_harian").update(cell.id, { nilai: clamped });
      } else {
        const created = await pb.collection("nilai_harian").create({
          siswa_id: siswaId,
          lingkup_materi_id: lingkupId,
          nilai: clamped,
        });
        setNilaiMap((prev) => ({
          ...prev,
          [siswaId]: {
            ...prev[siswaId],
            [lingkupId]: { id: created.id, nilai: clamped },
          },
        }));
      }
      if (clamped !== nilaiNum) {
        setNilaiMap((prev) => ({
          ...prev,
          [siswaId]: {
            ...prev[siswaId],
            [lingkupId]: { ...prev[siswaId]?.[lingkupId], nilai: clamped },
          },
        }));
      }
      setSavedFlash(key);
      setTimeout(() => setSavedFlash((k) => (k === key ? null : k)), 1200);
    } catch (err) {
      console.error("Error saving nilai:", err);
      setError("Gagal menyimpan nilai. Periksa koneksi lalu coba lagi.");
    } finally {
      setSavingCell((k) => (k === key ? null : k));
    }
  }

  // ---------------- Handlers: Nilai Ujian (sama dengan walas) ----------------
  function handleNilaiUjianChange(siswaId, ujianId, rawValue) {
    setNilaiUjianMap((prev) => ({
      ...prev,
      [siswaId]: {
        ...prev[siswaId],
        [ujianId]: {
          ...(prev[siswaId]?.[ujianId] || {}),
          nilai: rawValue,
        },
      },
    }));
  }

  async function handleNilaiUjianBlur(siswaId, ujianId) {
    const cell = nilaiUjianMap[siswaId]?.[ujianId];
    const rawValue = cell?.nilai;
    if (rawValue === "" || rawValue === undefined || rawValue === null) return;

    const nilaiNum = Number(rawValue);
    if (Number.isNaN(nilaiNum)) return;

    const clamped = Math.min(100, Math.max(0, nilaiNum));
    const key = `ujian_${siswaId}_${ujianId}`;
    setSavingCell(key);
    setError("");
    try {
      if (cell?.id) {
        await pb.collection("nilai_ujian").update(cell.id, {
          nilai: clamped,
          ploting_guru_id: selectedPloting.id,
        });
      } else {
        const created = await pb.collection("nilai_ujian").create({
          siswa_id: siswaId,
          pengaturan_ujian_id: ujianId,
          ploting_guru_id: selectedPloting.id,
          nilai: clamped,
        });
        setNilaiUjianMap((prev) => ({
          ...prev,
          [siswaId]: {
            ...prev[siswaId],
            [ujianId]: { id: created.id, nilai: clamped },
          },
        }));
      }
      if (clamped !== nilaiNum) {
        setNilaiUjianMap((prev) => ({
          ...prev,
          [siswaId]: {
            ...prev[siswaId],
            [ujianId]: { ...prev[siswaId]?.[ujianId], nilai: clamped },
          },
        }));
      }
      setSavedFlash(key);
      setTimeout(() => setSavedFlash((k) => (k === key ? null : k)), 1200);
    } catch (err) {
      console.error("Error saving nilai ujian:", err);
      setError("Gagal menyimpan nilai ujian. Periksa koneksi lalu coba lagi.");
    } finally {
      setSavingCell((k) => (k === key ? null : k));
    }
  }

  // Nilai akhir realtime
  const nilaiAkhirBySiswa = useMemo(() => {
    const result = {};
    for (const s of siswaList) {
      const row = nilaiMap[s.id] || {};
      const nums = lingkupList
        .map((l) => row[l.id]?.nilai)
        .filter(
          (v) =>
            v !== "" &&
            v !== undefined &&
            v !== null &&
            !Number.isNaN(Number(v)),
        )
        .map(Number);
      result[s.id] = nums.length
        ? nums.reduce((a, b) => a + b, 0) / nums.length
        : null;
    }
    return result;
  }, [siswaList, lingkupList, nilaiMap]);

  const rataRataKelas = useMemo(() => {
    const vals = Object.values(nilaiAkhirBySiswa).filter((v) => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [nilaiAkhirBySiswa]);

  function handleTabChange(tab) {
    setInnerTab(tab);
  }

  function backToKelas() {
    setSelectedKelas(null);
    setSelectedPlotingId(null);
  }

  function backToMapel() {
    setSelectedPlotingId(null);
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
          Halaman ini hanya dapat diakses oleh guru mapel.
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
          onClick={backToKelas}
          className={`${selectedKelas ? "hover:text-slate-600 cursor-pointer" : "text-slate-600 font-medium"}`}
        >
          Penilaian
        </button>
        {selectedKelas && (
          <>
            <span>/</span>
            <button
              type="button"
              onClick={backToMapel}
              className={`${selectedPloting ? "hover:text-slate-600 cursor-pointer" : "text-slate-600 font-medium"}`}
            >
              {selectedKelas.nama_kelas}
            </button>
          </>
        )}
        {selectedPloting && (
          <>
            <span>/</span>
            <span className="text-slate-600 font-medium">
              {selectedPloting.expand?.mapel_id?.nama_mapel || "Mata Pelajaran"}
            </span>
          </>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ============ STEP 1: PILIH KELAS ============ */}
      {!selectedKelas && (
        <>
          <h1 className="mb-1 text-lg font-bold text-slate-800">Pilih Kelas</h1>
          <p className="mb-6 text-xs text-slate-500">
            Pilih kelas yang Anda ampu untuk mengelola penilaian.
          </p>

          {loadingKelas ? (
            <LoadingGrid />
          ) : kelasList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
              Anda belum ditugaskan sebagai guru mapel di kelas manapun.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {kelasList.map((kelas) => {
                const tahunAjaran = kelas.expand?.tahun_ajaran_id;
                return (
                  <button
                    key={kelas.id}
                    type="button"
                    onClick={() => setSelectedKelas(kelas)}
                    className="text-left rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white uppercase text-sm shadow-sm">
                        {kelas.nama_kelas?.substring(0, 2) ||
                          `${kelas.tingkat || 1}A`}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">
                          {kelas.nama_kelas}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {tahunAjaran
                            ? `${tahunAjaran.tahun} · Sem. ${tahunAjaran.semester}`
                            : "Tahun ajaran —"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============ STEP 2: PILIH MAPEL ============ */}
      {selectedKelas && !selectedPloting && (
        <>
          <h1 className="mb-1 text-lg font-bold text-slate-800">
            Pilih Mata Pelajaran
          </h1>
          <p className="mb-6 text-xs text-slate-500">
            Kelas{" "}
            <span className="font-semibold text-slate-700">
              {selectedKelas.nama_kelas}
            </span>{" "}
            — pilih mata pelajaran yang Anda ampu.
          </p>

          {loadingPloting ? (
            <LoadingGrid />
          ) : plotingList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
              Anda tidak mengajar mata pelajaran apapun di kelas ini.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plotingList.map((p) => {
                const mapel = p.expand?.mapel_id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlotingId(p.id)}
                    className="text-left rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition"
                  >
                    <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                      {mapel?.kode_mapel || "MPL"}
                    </span>
                    <h3 className="text-sm font-bold text-slate-800 mt-2">
                      {mapel?.nama_mapel || "—"}
                    </h3>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============ STEP 3: KELOLA MATERI & NILAI ============ */}
      {selectedKelas && selectedPloting && (
        <>
          {/* Gradient hero - khusus guru mapel */}
          <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-blue-100 font-semibold">
                  {selectedKelas.nama_kelas}
                </p>
                <h1 className="text-lg font-bold mt-0.5">
                  {selectedPloting.expand?.mapel_id?.nama_mapel ||
                    "Mata Pelajaran"}
                </h1>
                <p className="text-xs text-blue-100 mt-1">
                  Anda mengajar mata pelajaran ini
                </p>
              </div>
              <div className="flex gap-4 text-center">
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">Siswa</p>
                  <p className="text-lg font-bold">{siswaList.length}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">
                    Lingkup Materi
                  </p>
                  <p className="text-lg font-bold">{lingkupList.length}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">
                    Ujian Aktif
                  </p>
                  <p className="text-lg font-bold">{ujianList.length}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">
                    Rata-rata Kelas
                  </p>
                  <p className="text-lg font-bold">
                    {rataRataKelas !== null ? rataRataKelas.toFixed(1) : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Inner tab navigation - sama dengan walas */}
          <div className="mb-6 flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 no-scrollbar w-full sm:w-fit">
            <button
              type="button"
              onClick={() => handleTabChange("materi")}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer min-w-[160px] flex-1 sm:flex-initial ${
                innerTab === "materi"
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
              }`}
            >
              Lingkup Materi & TP
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("nilai")}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer min-w-[160px] flex-1 sm:flex-initial ${
                innerTab === "nilai"
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
              }`}
            >
              Tabel Penilaian
            </button>
            {ujianList.length > 0 && (
              <button
                type="button"
                onClick={() => handleTabChange("ujian")}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer min-w-[160px] flex-1 sm:flex-initial ${
                  innerTab === "ujian"
                    ? "bg-white text-blue-600 shadow-sm border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                }`}
              >
                Ujian Aktif ({ujianList.length})
              </button>
            )}
          </div>

          {loadingDetail ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* ---------------- TAB: LINGKUP MATERI & TP ---------------- */}
              {innerTab === "materi" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    {!showLingkupForm && (
                      <button
                        type="button"
                        onClick={openAddLingkup}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
                      >
                        + Tambah Lingkup Materi
                      </button>
                    )}
                  </div>

                  {showLingkupForm && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                      <h3 className="text-xs font-bold text-slate-700">
                        {editingLingkupId
                          ? "Edit Lingkup Materi"
                          : "Lingkup Materi Baru"}
                      </h3>
                      <div>
                        <label className="text-[11px] font-medium text-slate-500">
                          Nama Lingkup Materi
                        </label>
                        <input
                          type="text"
                          value={lingkupForm.nama_lingkup}
                          onChange={(e) =>
                            setLingkupForm((f) => ({
                              ...f,
                              nama_lingkup: e.target.value,
                            }))
                          }
                          placeholder="Contoh: Bilangan Cacah"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-slate-500">
                          Capaian Kompetensi
                        </label>
                        <textarea
                          value={lingkupForm.capaian_kompetensi}
                          onChange={(e) =>
                            setLingkupForm((f) => ({
                              ...f,
                              capaian_kompetensi: e.target.value,
                            }))
                          }
                          rows={2}
                          placeholder="Deskripsi capaian kompetensi..."
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 resize-none"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setShowLingkupForm(false);
                            setEditingLingkupId(null);
                          }}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          disabled={
                            savingLingkup || !lingkupForm.nama_lingkup.trim()
                          }
                          onClick={submitLingkup}
                          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingLingkup ? "Menyimpan..." : "Simpan"}
                        </button>
                      </div>
                    </div>
                  )}

                  {lingkupList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                      Belum ada lingkup materi untuk mata pelajaran ini.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lingkupList.map((l, idx) => (
                        <div
                          key={l.id}
                          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-xs font-bold">
                                {idx + 1}
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-slate-800">
                                  {l.nama_lingkup}
                                </h3>
                                {l.capaian_kompetensi && (
                                  <p className="text-[11px] text-slate-500 mt-1 max-w-xl">
                                    {l.capaian_kompetensi}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditLingkup(l)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                                title="Edit"
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteLingkup(l.id)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Hapus"
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Tujuan Pembelajaran */}
                          <div className="mt-3 pl-10 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Tujuan Pembelajaran
                            </p>
                            {(tpByLingkup[l.id] || []).length === 0 &&
                              addingTpFor !== l.id && (
                                <p className="text-[11px] text-slate-400 italic">
                                  Belum ada tujuan pembelajaran.
                                </p>
                              )}
                            <ul className="space-y-1">
                              {(tpByLingkup[l.id] || []).map((tp, tIdx) =>
                                editingTp?.id === tp.id ? (
                                  <li
                                    key={tp.id}
                                    className="flex gap-2 items-center"
                                  >
                                    <input
                                      type="text"
                                      value={editingTp.deskripsi}
                                      onChange={(e) =>
                                        setEditingTp((prev) => ({
                                          ...prev,
                                          deskripsi: e.target.value,
                                        }))
                                      }
                                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-blue-500"
                                    />
                                    <button
                                      type="button"
                                      disabled={savingTp}
                                      onClick={updateTp}
                                      className="text-[11px] font-semibold text-blue-600 hover:underline"
                                    >
                                      Simpan
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingTp(null)}
                                      className="text-[11px] text-slate-400 hover:underline"
                                    >
                                      Batal
                                    </button>
                                  </li>
                                ) : (
                                  <li
                                    key={tp.id}
                                    className="flex items-start justify-between gap-2 group"
                                  >
                                    <span className="text-[11px] text-slate-600">
                                      <span className="text-slate-400 font-mono">
                                        {tIdx + 1}.
                                      </span>{" "}
                                      {tp.deskripsi}
                                    </span>
                                    <span className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingTp({
                                            id: tp.id,
                                            lingkupId: l.id,
                                            deskripsi: tp.deskripsi,
                                          })
                                        }
                                        className="text-[10px] font-semibold text-blue-600 hover:underline"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteTp(l.id, tp.id)}
                                        className="text-[10px] font-semibold text-red-500 hover:underline"
                                      >
                                        Hapus
                                      </button>
                                    </span>
                                  </li>
                                ),
                              )}
                            </ul>

                            {addingTpFor === l.id ? (
                              <div className="flex gap-2 items-center pt-1">
                                <input
                                  type="text"
                                  autoFocus
                                  value={tpDraft}
                                  onChange={(e) => setTpDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") submitTp(l.id);
                                    if (e.key === "Escape") {
                                      setAddingTpFor(null);
                                      setTpDraft("");
                                    }
                                  }}
                                  placeholder="Tulis tujuan pembelajaran..."
                                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-blue-500"
                                />
                                <button
                                  type="button"
                                  disabled={savingTp || !tpDraft.trim()}
                                  onClick={() => submitTp(l.id)}
                                  className="text-[11px] font-semibold text-blue-600 hover:underline disabled:opacity-40"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingTpFor(null);
                                    setTpDraft("");
                                  }}
                                  className="text-[11px] text-slate-400 hover:underline"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setAddingTpFor(l.id);
                                  setTpDraft("");
                                }}
                                className="text-[11px] font-semibold text-blue-600 hover:underline pt-1"
                              >
                                + Tambah Tujuan Pembelajaran
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- TAB: TABEL PENILAIAN ---------------- */}
              {innerTab === "nilai" && (
                <div className="space-y-3">
                  {lingkupList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                      Tambahkan lingkup materi terlebih dahulu di tab "Lingkup
                      Materi & TP" sebelum mengisi nilai.
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
                            <th className="px-4 py-2.5 text-center w-10 sticky left-0 bg-slate-50">
                              No
                            </th>
                            <th className="px-4 py-2.5 sticky left-10 bg-slate-50 min-w-[160px]">
                              Nama Siswa
                            </th>
                            {lingkupList.map((l) => (
                              <th
                                key={l.id}
                                className="px-3 py-2.5 text-center min-w-[110px]"
                                title={l.nama_lingkup}
                              >
                                <span className="line-clamp-2 normal-case font-semibold text-slate-500">
                                  {l.nama_lingkup}
                                </span>
                              </th>
                            ))}
                            <th className="px-4 py-2.5 text-center min-w-[100px] bg-blue-50/60 text-blue-600">
                              Nilai Akhir
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {siswaList.map((s, idx) => {
                            const akhir = nilaiAkhirBySiswa[s.id];
                            return (
                              <tr
                                key={s.id}
                                className="hover:bg-slate-50/40 transition"
                              >
                                <td className="px-4 py-2 text-center text-slate-400 font-mono sticky left-0 bg-white">
                                  {idx + 1}
                                </td>
                                <td className="px-4 py-2 font-semibold text-slate-700 sticky left-10 bg-white">
                                  {s.nama_siswa}
                                </td>
                                {lingkupList.map((l) => {
                                  const cell = nilaiMap[s.id]?.[l.id];
                                  const key = `${s.id}_${l.id}`;
                                  const isSaving = savingCell === key;
                                  const isSaved = savedFlash === key;
                                  return (
                                    <td
                                      key={l.id}
                                      className="px-3 py-2 text-center"
                                    >
                                      <div className="relative inline-block">
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          value={cell?.nilai ?? ""}
                                          onChange={(e) =>
                                            handleNilaiChange(
                                              s.id,
                                              l.id,
                                              e.target.value,
                                            )
                                          }
                                          onBlur={() =>
                                            handleNilaiBlur(s.id, l.id)
                                          }
                                          className={`w-16 rounded-lg border px-2 py-1 text-center text-xs outline-none transition ${
                                            isSaved
                                              ? "border-emerald-300 bg-emerald-50"
                                              : "border-slate-200 focus:border-blue-500"
                                          }`}
                                          placeholder="—"
                                        />
                                        {isSaving && (
                                          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-2 text-center bg-blue-50/30">
                                  <span
                                    className={`font-bold ${nilaiColor(akhir)}`}
                                  >
                                    {akhir !== null ? akhir.toFixed(1) : "—"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {lingkupList.length > 0 && siswaList.length > 0 && (
                    <p className="text-[11px] text-slate-400">
                      Nilai tersimpan otomatis saat Anda pindah dari kolom (klik
                      di luar kolom). "Nilai Akhir" dihitung real-time dari
                      rata-rata seluruh lingkup materi yang sudah diisi.
                    </p>
                  )}
                </div>
              )}

              {/* ---------------- TAB: UJIAN AKTIF ---------------- */}
              {innerTab === "ujian" && (
                <div className="space-y-3">
                  {ujianList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
                      Tidak ada ujian yang terbuka untuk kelas ini.
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
                            <th className="px-4 py-2.5 text-center w-10 sticky left-0 bg-slate-50">
                              No
                            </th>
                            <th className="px-4 py-2.5 sticky left-10 bg-slate-50 min-w-[160px]">
                              Nama Siswa
                            </th>
                            {ujianList.map((u) => (
                              <th
                                key={u.id}
                                className="px-3 py-2.5 text-center min-w-[130px]"
                                title={u.nama_ujian}
                              >
                                <span className="line-clamp-2 normal-case font-semibold text-slate-500">
                                  {u.nama_ujian}
                                </span>
                                <span className="block text-[8px] text-slate-400 font-normal mt-0.5">
                                  {u.jenis_ujian || "Ujian"}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {siswaList.map((s, idx) => (
                            <tr
                              key={s.id}
                              className="hover:bg-slate-50/40 transition"
                            >
                              <td className="px-4 py-2 text-center text-slate-400 font-mono sticky left-0 bg-white">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-2 font-semibold text-slate-700 sticky left-10 bg-white">
                                {s.nama_siswa}
                              </td>
                              {ujianList.map((u) => {
                                const cell = nilaiUjianMap[s.id]?.[u.id];
                                const key = `ujian_${s.id}_${u.id}`;
                                const isSaving = savingCell === key;
                                const isSaved = savedFlash === key;
                                return (
                                  <td
                                    key={u.id}
                                    className="px-3 py-2 text-center"
                                  >
                                    <div className="relative inline-block">
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={cell?.nilai ?? ""}
                                        onChange={(e) =>
                                          handleNilaiUjianChange(
                                            s.id,
                                            u.id,
                                            e.target.value,
                                          )
                                        }
                                        onBlur={() =>
                                          handleNilaiUjianBlur(s.id, u.id)
                                        }
                                        className={`w-16 rounded-lg border px-2 py-1 text-center text-xs outline-none transition ${
                                          isSaved
                                            ? "border-emerald-300 bg-emerald-50"
                                            : "border-slate-200 focus:border-blue-500"
                                        }`}
                                        placeholder="—"
                                      />
                                      {isSaving && (
                                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {ujianList.length > 0 && siswaList.length > 0 && (
                    <p className="text-[11px] text-slate-400">
                      Nilai ujian tersimpan otomatis saat Anda pindah dari kolom
                      (klik di luar kolom). Hanya ujian dengan status "buka"
                      yang ditampilkan.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </>
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
