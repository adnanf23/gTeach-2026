"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// Role yang boleh MENGEDIT data di halaman ini. Role lain tetap bisa
// membuka & melihat halaman ini (read-only), sesuai permintaan: "ga perlu
// minta akses, cukup perlihatkan datanya, tapi tidak bisa memodifikasi".
const EDITABLE_ROLES = ["guru mapel"];

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function nilaiColor(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "text-slate-400";
  if (n >= 80) return "text-emerald-600";
  if (n >= 60) return "text-amber-600";
  return "text-red-600";
}

export default function PenilaianGuruMapelPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState("");

  // true jika user login TAPI rolenya bukan "guru mapel" -> boleh lihat,
  // tidak boleh mengedit apapun di halaman ini.
  const isReadOnly = Boolean(user) && !EDITABLE_ROLES.includes(user.role);

  // Step 1: pilih mapel (= pilih satu record ploting_guru milik guru ini)
  const [plotingList, setPlotingList] = useState([]);
  const [loadingPloting, setLoadingPloting] = useState(true);
  const [selectedPlotingId, setSelectedPlotingId] = useState(null);

  const selectedPloting = useMemo(
    () => plotingList.find((p) => p.id === selectedPlotingId) || null,
    [plotingList, selectedPlotingId],
  );

  // id mapel murni (bukan objek expand) dari ploting terpilih — dipakai utk filter
  const selectedMapelId = useMemo(
    () => firstOf(selectedPloting?.mapel_id) || null,
    [selectedPloting],
  );

  // Kelas-kelas dalam ploting terpilih (kelas_id multi-select), plus jumlah siswa per kelas
  const [kelasOptions, setKelasOptions] = useState([]); // [{ kelas, siswaCount }]
  const [loadingKelasOptions, setLoadingKelasOptions] = useState(false);
  const [selectedKelasId, setSelectedKelasId] = useState(null);

  const selectedKelas = useMemo(
    () =>
      kelasOptions.find((k) => k.kelas.id === selectedKelasId)?.kelas || null,
    [kelasOptions, selectedKelasId],
  );

  // Step 3: data inti (siswa, lingkup materi, TP, nilai) untuk kelas terpilih
  const [siswaList, setSiswaList] = useState([]);
  const [lingkupList, setLingkupList] = useState([]);
  const [tpByLingkup, setTpByLingkup] = useState({});
  const [nilaiMap, setNilaiMap] = useState({}); // { siswaId: { lingkupId: { id, nilai } } }
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [innerTab, setInnerTab] = useState("materi"); // 'materi' | 'nilai' | 'ujian'

  // ---- Ujian ----
  const [ujianAktif, setUjianAktif] = useState([]);
  const [loadingUjianAktif, setLoadingUjianAktif] = useState(false);
  const [selectedUjianId, setSelectedUjianId] = useState(null);
  // nilaiUjian[siswaId] = { recordId, nilai }
  const [nilaiUjian, setNilaiUjian] = useState({});
  const [loadingNilaiUjian, setLoadingNilaiUjian] = useState(false);
  const [savingUjianCell, setSavingUjianCell] = useState(null);
  const [savedUjianFlash, setSavedUjianFlash] = useState(null);

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
  const [editingTp, setEditingTp] = useState(null); // { id, lingkupId, deskripsi }
  const [savingTp, setSavingTp] = useState(false);

  // ---- Nilai ----
  const [savingCell, setSavingCell] = useState(null);
  const [savedFlash, setSavedFlash] = useState(null);

  const canEdit = Boolean(selectedPloting && selectedKelas) && !isReadOnly;

  // 1. Cek auth (role apapun boleh masuk & melihat; hanya "guru mapel" yang
  //    boleh mengedit — lihat isReadOnly di atas)
  useEffect(() => {
    const currentUser = getCurrentUser();

    if (!isAuthenticated() || !currentUser) {
      router.push("/login");
      return;
    }

    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // 2. Ambil semua ploting_guru milik guru ini (= daftar mapel yang diampu).
  //    Catatan: untuk role selain "guru mapel", daftar ini akan kosong
  //    kecuali mereka juga tercatat sebagai guru_id di ploting_guru — itu
  //    wajar karena halaman ini menampilkan data pengampuan milik user yang
  //    sedang login, bukan seluruh sekolah (untuk itu pakai halaman "Pantau
  //    Nilai" khusus admin/ICT).
  useEffect(() => {
    if (!authChecked || !user?.id) return;
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
        if (records.length === 1) setSelectedPlotingId(records[0].id);
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
  }, [authChecked, user]);

  // 3. Bangun daftar kelas dari kelas_id (multi-select) milik ploting terpilih,
  //    lengkap dengan jumlah siswa per kelas.
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
        if (options.length === 1) setSelectedKelasId(options[0].kelas.id);
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

  // 4. Ambil siswa (kelas terpilih), lingkup materi & TP, dan nilai harian
  //
  //    PENTING (fix sinkronisasi): lingkup_materi & nilai_harian di-query
  //    dengan kombinasi mapel_id + kelas_id — filter YANG SAMA PERSIS
  //    dengan yang dipakai halaman "Detail Penilaian" milik wali
  //    kelas/pendamping. Sebelumnya halaman ini memfilter pakai
  //    ploting_guru_id, sehingga begitu ploting guru direset/diganti oleh
  //    admin, data lama tidak lagi muncul di sini walau masih tampil di
  //    halaman wali kelas (dan sebaliknya).
  useEffect(() => {
    if (!selectedPloting || !selectedKelas || !selectedMapelId) {
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
          // mapel_id & kelas_id di lingkup_materi multi-relation, wajib ?~
          // (any-match) — lihat catatan di halaman detail-penilaian.
          pb.collection("lingkup_materi").getFullList({
            filter: `mapel_id ?~ "${selectedMapelId}" && kelas_id ?~ "${selectedKelas.id}"`,
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
          // Filter nilai_harian juga disamakan dengan halaman wali kelas:
          // kelas_id + mapel_id, bukan cuma siswa_id/lingkup_materi_id.
          const nilaiRecords = await pb.collection("nilai_harian").getFullList({
            filter: `kelas_id ?~ "${selectedKelas.id}" && mapel_id ?~ "${selectedMapelId}"`,
            requestKey: null,
          });
          for (const n of nilaiRecords) {
            const sid = firstOf(n.siswa_id);
            const lid = firstOf(n.lingkup_materi_id);
            if (!nilaiGrouped[sid]) nilaiGrouped[sid] = {};
            nilaiGrouped[sid][lid] = { id: n.id, nilai: n.nilai };
          }
        }

        if (!isMounted) return;
        setSiswaList(siswaRecords);
        setLingkupList(lingkupRecords);
        setTpByLingkup(tpGrouped);
        setNilaiMap(nilaiGrouped);
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
  }, [selectedPloting, selectedKelas, selectedMapelId]);

  // 5. Ambil ujian yang aktif (status_akses = "buka") untuk kelas/tingkat terpilih
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
          filter: `status_akses = "buka" && (target_kelas_id ?~ "${selectedKelas.id}" || target_tingkat ?~ "${String(selectedKelas.tingkat)}")`,
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

  // 6. Ambil nilai_ujian saat ujian dipilih (khusus ploting_guru_id ini)
  useEffect(() => {
    if (!selectedUjianId || !selectedPloting || siswaList.length === 0) {
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
          filter: `pengaturan_ujian_id = "${selectedUjianId}" && ploting_guru_id = "${selectedPloting.id}" && (${filterSiswa})`,
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
  }, [selectedUjianId, selectedPloting, siswaList]);

  // ---------------- Handlers: Lingkup Materi ----------------
  function openAddLingkup() {
    if (isReadOnly) return;
    setEditingLingkupId(null);
    setLingkupForm({ nama_lingkup: "", capaian_kompetensi: "" });
    setShowLingkupForm(true);
  }

  function openEditLingkup(l) {
    if (isReadOnly) return;
    setEditingLingkupId(l.id);
    setLingkupForm({
      nama_lingkup: l.nama_lingkup || "",
      capaian_kompetensi: l.capaian_kompetensi || "",
    });
    setShowLingkupForm(true);
  }

  async function submitLingkup() {
    if (isReadOnly) return;
    if (!lingkupForm.nama_lingkup.trim() || !selectedPloting || !selectedKelas)
      return;
    setSavingLingkup(true);
    setError("");
    try {
      if (editingLingkupId) {
        const updated = await pb
          .collection("lingkup_materi")
          .update(editingLingkupId, {
            kelas_id: [selectedKelas.id],
            nama_lingkup: lingkupForm.nama_lingkup.trim(),
            capaian_kompetensi: lingkupForm.capaian_kompetensi.trim(),
          });
        setLingkupList((prev) =>
          prev.map((l) => (l.id === updated.id ? updated : l)),
        );
      } else {
        const created = await pb.collection("lingkup_materi").create({
          ploting_guru_id: selectedPloting.id,
          guru_id: selectedPloting.guru_id || user.id,
          mapel_id: selectedMapelId,
          kelas_id: [selectedKelas.id],
          nama_lingkup: lingkupForm.nama_lingkup.trim(),
          capaian_kompetensi: lingkupForm.capaian_kompetensi.trim(),
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
    if (isReadOnly) return;
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

  // ---------------- Handlers: Tujuan Pembelajaran ----------------
  async function submitTp(lingkupId) {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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

  // ---------------- Handlers: Nilai Harian ----------------
  function handleNilaiChange(siswaId, lingkupId, rawValue) {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
        // FIX: sertakan guru_id, kelas_id, mapel_id saat membuat record baru.
        // Tanpa ini, halaman "Detail Penilaian" milik wali kelas/pendamping
        // (yang memfilter nilai_harian berdasarkan kelas_id & mapel_id)
        // tidak akan pernah menampilkan nilai yang diinput dari sini.
        const created = await pb.collection("nilai_harian").create({
          siswa_id: siswaId,
          lingkup_materi_id: lingkupId,
          nilai: clamped,
          guru_id: selectedPloting?.guru_id || user.id,
          kelas_id: selectedKelas.id,
          mapel_id: selectedMapelId,
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

  // ---------------- Handlers: Nilai Ujian ----------------
  function handleNilaiUjianChange(siswaId, rawValue) {
    if (isReadOnly) return;
    setNilaiUjian((prev) => ({
      ...prev,
      [siswaId]: { ...(prev[siswaId] || {}), nilai: rawValue },
    }));
  }

  async function handleNilaiUjianBlur(siswaId) {
    if (isReadOnly) return;
    if (!selectedUjianId || !selectedPloting) return;
    const existing = nilaiUjian[siswaId];
    const rawValue = existing?.nilai;
    if (rawValue === "" || rawValue === undefined || rawValue === null) return;

    const nilaiNum = Number(rawValue);
    if (Number.isNaN(nilaiNum)) return;

    const clamped = Math.min(100, Math.max(0, nilaiNum));
    setSavingUjianCell(siswaId);
    setError("");
    try {
      let saved;
      if (existing?.recordId) {
        saved = await pb.collection("nilai_ujian").update(existing.recordId, {
          nilai: clamped,
        });
      } else {
        saved = await pb.collection("nilai_ujian").create({
          siswa_id: siswaId,
          ploting_guru_id: selectedPloting.id,
          pengaturan_ujian_id: selectedUjianId,
          nilai: clamped,
        });
      }
      setNilaiUjian((prev) => ({
        ...prev,
        [siswaId]: { recordId: saved.id, nilai: clamped },
      }));
      setSavedUjianFlash(siswaId);
      setTimeout(
        () => setSavedUjianFlash((k) => (k === siswaId ? null : k)),
        1200,
      );
    } catch (err) {
      console.error("Error saving nilai ujian:", err);
      setError("Gagal menyimpan nilai ujian. Periksa koneksi lalu coba lagi.");
    } finally {
      setSavingUjianCell((k) => (k === siswaId ? null : k));
    }
  }

  // Nilai akhir realtime = rata-rata seluruh lingkup materi yang sudah terisi
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <button
          type="button"
          onClick={backToMapel}
          className={`${selectedPloting ? "hover:text-slate-600 cursor-pointer" : "text-slate-600 font-medium"}`}
        >
          Penilaian
        </button>
        {selectedPloting && (
          <>
            <span>/</span>
            <button
              type="button"
              onClick={backToKelas}
              className={`${selectedKelas ? "hover:text-slate-600 cursor-pointer" : "text-slate-600 font-medium"}`}
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
          <h1 className="mb-1 text-lg font-bold text-slate-800">
            Pilih Mata Pelajaran
          </h1>
          <p className="mb-6 text-xs text-slate-500">
            Pilih mata pelajaran yang ingin Anda kelola penilaiannya.
          </p>

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
                    className="text-left rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition"
                  >
                    <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                      {mapel?.kode_mapel || "MPL"}
                    </span>
                    <h3 className="text-sm font-bold text-slate-800 mt-2">
                      {mapel?.nama_mapel || "—"}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Diampu di {kelasArr.length} kelas:{" "}
                      {kelasArr.map((k) => k.nama_kelas).join(", ") || "—"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============ STEP 2: PILIH KELAS (dari kelas_id multi-select) ============ */}
      {selectedPloting && !selectedKelas && (
        <>
          <h1 className="mb-1 text-lg font-bold text-slate-800">Pilih Kelas</h1>
          <p className="mb-6 text-xs text-slate-500">
            Mata pelajaran{" "}
            <span className="font-semibold text-slate-700">
              {selectedPloting.expand?.mapel_id?.nama_mapel}
            </span>{" "}
            — Lingkup Materi & Tujuan Pembelajaran akan dikelola secara terpisah
            untuk setiap kelas.
          </p>

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
                        Tingkat {kelas.tingkat || "—"} · {siswaCount} siswa
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ STEP 3: KELOLA MATERI & NILAI ============ */}
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
                  Lingkup Materi khusus untuk kelas ini (tidak dibagikan ke
                  kelas lain)
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
                    Rata-rata Kelas
                  </p>
                  <p className="text-lg font-bold">
                    {rataRataKelas !== null ? rataRataKelas.toFixed(1) : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Selector kelas cepat kalau lebih dari 1 kelas paralel */}
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
            <button
              type="button"
              onClick={() => handleTabChange("ujian")}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer min-w-[160px] flex-1 sm:flex-initial ${
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
              {/* ---------------- TAB: LINGKUP MATERI & TP ---------------- */}
              {innerTab === "materi" && (
                <div className="space-y-4">
                  {isReadOnly && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500">
                      Anda melihat data ini dalam mode{" "}
                      <strong>lihat saja</strong> (read-only). Hanya guru mata
                      pelajaran yang bersangkutan yang dapat mengubah data ini.
                    </div>
                  )}
                  <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-[11px] text-amber-700">
                    Lingkup Materi & Tujuan Pembelajaran di bawah ini{" "}
                    <strong>
                      khusus untuk kelas {selectedKelas.nama_kelas}
                    </strong>
                    . Perubahan di sini tidak memengaruhi kelas lain.
                  </div>

                  {!isReadOnly && (
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
                  )}

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
                      Belum ada lingkup materi untuk kelas ini.
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
                            {!isReadOnly && (
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
                            )}
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
                                    {!isReadOnly && (
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
                                    )}
                                  </li>
                                ),
                              )}
                            </ul>

                            {!isReadOnly &&
                              (addingTpFor === l.id ? (
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
                              ))}
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
                                          disabled={isReadOnly}
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
                                          className={`w-16 rounded-lg border px-2 py-1 text-center text-xs outline-none transition disabled:bg-slate-50 disabled:text-slate-400 ${
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
                      rata-rata seluruh lingkup materi yang sudah diisi. Data
                      ini juga langsung terlihat di dashboard wali kelas/guru
                      pendamping kelas {selectedKelas.nama_kelas}.
                    </p>
                  )}
                </div>
              )}

              {/* ---------------- TAB: NILAI UJIAN ---------------- */}
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
                                <th className="px-4 py-2.5 text-center w-10">
                                  No
                                </th>
                                <th className="px-4 py-2.5 min-w-[180px]">
                                  Nama Siswa
                                </th>
                                <th className="px-4 py-2.5 text-center min-w-[120px] bg-blue-50/60 text-blue-600">
                                  Nilai Ujian
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {siswaList.map((s, idx) => {
                                const cell = nilaiUjian[s.id];
                                const isSaving = savingUjianCell === s.id;
                                const isSaved = savedUjianFlash === s.id;
                                return (
                                  <tr
                                    key={s.id}
                                    className="hover:bg-slate-50/40 transition"
                                  >
                                    <td className="px-4 py-2 text-center text-slate-400 font-mono">
                                      {idx + 1}
                                    </td>
                                    <td className="px-4 py-2 font-semibold text-slate-700">
                                      {s.nama_siswa}
                                    </td>
                                    <td className="px-4 py-2 text-center bg-blue-50/20">
                                      <div className="relative inline-block">
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          step="0.1"
                                          disabled={isReadOnly}
                                          value={cell?.nilai ?? ""}
                                          onChange={(e) =>
                                            handleNilaiUjianChange(
                                              s.id,
                                              e.target.value,
                                            )
                                          }
                                          onBlur={() =>
                                            handleNilaiUjianBlur(s.id)
                                          }
                                          className={`w-20 rounded-lg border px-2 py-1 text-center text-xs font-semibold outline-none transition disabled:bg-slate-50 disabled:text-slate-400 ${
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
