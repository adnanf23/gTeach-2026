"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

const ALLOWED_ROLES = ["admin", "ict"];

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function nilaiColor(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "text-slate-400";
  if (n >= 80) return "text-emerald-600";
  if (n >= 60) return "text-amber-600";
  return "text-red-600";
}

function progressColor(pct) {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  if (pct > 0) return "bg-orange-500";
  return "bg-slate-300";
}

function ProgressBar({ pct }) {
  const safePct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${progressColor(safePct)}`}
        style={{ width: `${safePct}%` }}
      />
    </div>
  );
}

async function countRecords(collection, filter) {
  try {
    const res = await pb.collection(collection).getList(1, 1, {
      filter,
      requestKey: null,
      fields: "id",
    });
    return res.totalItems;
  } catch (err) {
    console.error(`Gagal menghitung ${collection}:`, err);
    return 0;
  }
}

export default function PantauNilaiPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");

  // Tahun ajaran
  const [tahunAjaranList, setTahunAjaranList] = useState([]);
  const [selectedTahunAjaranId, setSelectedTahunAjaranId] = useState(null);
  const [loadingTahunAjaran, setLoadingTahunAjaran] = useState(true);

  // Overview kelas
  const [kelasOverview, setKelasOverview] = useState([]);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [searchKelas, setSearchKelas] = useState("");

  // Drill 1: kelas terpilih -> daftar mapel
  const [selectedKelas, setSelectedKelas] = useState(null);
  const [mapelOverview, setMapelOverview] = useState([]);
  const [loadingMapel, setLoadingMapel] = useState(false);

  // Drill 2: mapel terpilih -> tabel nilai
  const [selectedPloting, setSelectedPloting] = useState(null);
  const [siswaList, setSiswaList] = useState([]);
  const [lingkupList, setLingkupList] = useState([]);
  const [nilaiMap, setNilaiMap] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savingCell, setSavingCell] = useState(null);
  const [savedFlash, setSavedFlash] = useState(null);

  // 1. Auth
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!isAuthenticated() || !currentUser) {
      router.push("/login");
      return;
    }
    if (!ALLOWED_ROLES.includes(currentUser.role)) {
      setUnauthorized(true);
      setAuthChecked(true);
      setLoadingTahunAjaran(false);
      return;
    }
    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // 2. Ambil daftar tahun ajaran, default ke yang aktif
  useEffect(() => {
    if (!authChecked || unauthorized) return;
    let isMounted = true;

    async function fetchTahunAjaran() {
      setLoadingTahunAjaran(true);
      setError("");
      try {
        const records = await pb.collection("tahun_ajaran").getFullList({
          sort: "-tahun,-semester",
          requestKey: null,
        });
        if (!isMounted) return;
        setTahunAjaranList(records);
        // Default: tampilkan SEMUA kelas dulu (bukan langsung filter ke tahun ajaran
        // aktif), karena field tahun_ajaran_id di collection kelas sifatnya opsional —
        // banyak kelas lama yang belum diisi. Admin bisa mempersempit manual lewat
        // dropdown kalau mau.
        setSelectedTahunAjaranId("");
      } catch (err) {
        console.error("Error fetching tahun ajaran:", err);
        if (isMounted) setError("Gagal memuat daftar tahun ajaran.");
      } finally {
        if (isMounted) setLoadingTahunAjaran(false);
      }
    }

    fetchTahunAjaran();
    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized]);

  // 3. Ambil overview kelas + statistik kelengkapan nilai untuk tahun ajaran terpilih
  useEffect(() => {
    if (!authChecked || unauthorized) return;
    let isMounted = true;

    async function fetchOverview() {
      setLoadingOverview(true);
      setError("");
      setSelectedKelas(null);
      setSelectedPloting(null);
      try {
        const kelasRecords = await pb.collection("kelas").getFullList({
          filter: selectedTahunAjaranId
            ? `tahun_ajaran_id = "${selectedTahunAjaranId}"`
            : "",
          sort: "tingkat,nama_kelas",
          expand: "walikelas_id,pendamping_id",
          requestKey: null,
        });

        const stats = await Promise.all(
          kelasRecords.map(async (kelas) => {
            const [siswaCount, mapelCount, lingkupCount, nilaiCount] =
              await Promise.all([
                countRecords("siswa", `kelas_id = "${kelas.id}"`),
                countRecords("ploting_guru", `kelas_id = "${kelas.id}"`),
                countRecords(
                  "lingkup_materi",
                  `ploting_guru_id.kelas_id = "${kelas.id}"`,
                ),
                countRecords(
                  "nilai_harian",
                  `lingkup_materi_id.ploting_guru_id.kelas_id = "${kelas.id}"`,
                ),
              ]);
            const expected = siswaCount * lingkupCount;
            const pct = expected > 0 ? (nilaiCount / expected) * 100 : 0;
            return {
              ...kelas,
              siswaCount,
              mapelCount,
              lingkupCount,
              nilaiCount,
              expected,
              pct,
            };
          }),
        );

        if (isMounted) setKelasOverview(stats);
      } catch (err) {
        console.error("Error fetching overview kelas:", err);
        if (isMounted) setError("Gagal memuat data overview kelas.");
      } finally {
        if (isMounted) setLoadingOverview(false);
      }
    }

    fetchOverview();
    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized, selectedTahunAjaranId]);

  // 4. Drill ke kelas -> ambil daftar mapel + statistik per mapel
  useEffect(() => {
    if (!selectedKelas) {
      setMapelOverview([]);
      return;
    }
    let isMounted = true;

    async function fetchMapel() {
      setLoadingMapel(true);
      setError("");
      setSelectedPloting(null);
      try {
        const plotingRecords = await pb.collection("ploting_guru").getFullList({
          filter: `kelas_id = "${selectedKelas.id}"`,
          expand: "mapel_id,guru_id",
          requestKey: null,
        });
        plotingRecords.sort((a, b) =>
          (a.expand?.mapel_id?.nama_mapel || "").localeCompare(
            b.expand?.mapel_id?.nama_mapel || "",
          ),
        );

        const siswaCount = selectedKelas.siswaCount || 0;

        const stats = await Promise.all(
          plotingRecords.map(async (p) => {
            const [lingkupCount, nilaiCount] = await Promise.all([
              countRecords("lingkup_materi", `ploting_guru_id = "${p.id}"`),
              countRecords(
                "nilai_harian",
                `lingkup_materi_id.ploting_guru_id = "${p.id}"`,
              ),
            ]);
            const expected = siswaCount * lingkupCount;
            const pct = expected > 0 ? (nilaiCount / expected) * 100 : 0;
            return { ...p, lingkupCount, nilaiCount, expected, pct };
          }),
        );

        if (isMounted) setMapelOverview(stats);
      } catch (err) {
        console.error("Error fetching mapel overview:", err);
        if (isMounted) setError("Gagal memuat data mata pelajaran kelas ini.");
      } finally {
        if (isMounted) setLoadingMapel(false);
      }
    }

    fetchMapel();
    return () => {
      isMounted = false;
    };
  }, [selectedKelas]);

  // 5. Drill ke mapel -> ambil siswa, lingkup materi, nilai (read-only table)
  useEffect(() => {
    if (!selectedKelas || !selectedPloting) {
      setSiswaList([]);
      setLingkupList([]);
      setNilaiMap({});
      setEditMode(false);
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

        if (!isMounted) return;
        setSiswaList(siswaRecords);
        setLingkupList(lingkupRecords);
        setNilaiMap(nilaiGrouped);
      } catch (err) {
        console.error("Error fetching detail nilai:", err);
        if (isMounted) setError("Gagal memuat data nilai mata pelajaran ini.");
      } finally {
        if (isMounted) setLoadingDetail(false);
      }
    }

    fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedKelas, selectedPloting]);

  // ---------------- Handlers: Nilai (hanya aktif saat editMode) ----------------
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
      setSavedFlash(key);
      setTimeout(() => setSavedFlash((k) => (k === key ? null : k)), 1200);
    } catch (err) {
      console.error("Error saving nilai:", err);
      setError("Gagal menyimpan nilai.");
    } finally {
      setSavingCell((k) => (k === key ? null : k));
    }
  }

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

  const filteredKelasOverview = kelasOverview.filter((k) => {
    if (!searchKelas.trim()) return true;
    return k.nama_kelas?.toLowerCase().includes(searchKelas.toLowerCase());
  });

  const totalSekolah = useMemo(() => {
    const totalSiswa = kelasOverview.reduce((a, k) => a + k.siswaCount, 0);
    const totalExpected = kelasOverview.reduce((a, k) => a + k.expected, 0);
    const totalFilled = kelasOverview.reduce((a, k) => a + k.nilaiCount, 0);
    const pct = totalExpected > 0 ? (totalFilled / totalExpected) * 100 : 0;
    return { totalSiswa, totalKelas: kelasOverview.length, pct };
  }, [kelasOverview]);

  function backToOverview() {
    setSelectedKelas(null);
  }
  function backToMapel() {
    setSelectedPloting(null);
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
          Halaman ini hanya dapat diakses oleh admin atau ICT.
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
          onClick={backToOverview}
          className={`${selectedKelas ? "hover:text-slate-600 cursor-pointer" : "text-slate-600 font-medium"}`}
        >
          Pantau Nilai
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

      {/* Selector tahun ajaran - selalu tampil di level manapun */}
      {!loadingTahunAjaran && tahunAjaranList.length > 0 && (
        <div className="mb-6 flex items-center gap-2">
          <label className="text-[11px] font-medium text-slate-500">
            Tahun Ajaran:
          </label>
          <select
            value={selectedTahunAjaranId || ""}
            onChange={(e) => {
              setSelectedTahunAjaranId(e.target.value);
              setSelectedKelas(null);
              setSelectedPloting(null);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="">Semua Tahun Ajaran</option>
            {tahunAjaranList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tahun} · Semester {t.semester} {t.is_aktif ? "(Aktif)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ============ LEVEL 1: OVERVIEW SELURUH KELAS ============ */}
      {!selectedKelas && (
        <>
          {/* Hero ringkasan sekolah */}
          <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-blue-100 font-semibold">
                  Ringkasan Kelengkapan Nilai
                </p>
                <h1 className="text-lg font-bold mt-0.5">Seluruh Kelas</h1>
              </div>
              <div className="flex gap-4 text-center">
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">Kelas</p>
                  <p className="text-lg font-bold">{totalSekolah.totalKelas}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">Siswa</p>
                  <p className="text-lg font-bold">{totalSekolah.totalSiswa}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">
                    Nilai Terisi
                  </p>
                  <p className="text-lg font-bold">
                    {totalSekolah.pct.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold text-slate-700">Daftar Kelas</h2>
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Cari nama kelas..."
                value={searchKelas}
                onChange={(e) => setSearchKelas(e.target.value)}
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
          </div>

          {loadingOverview ? (
            <LoadingGrid />
          ) : filteredKelasOverview.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
              {searchKelas.trim()
                ? "Tidak ada kelas yang cocok."
                : selectedTahunAjaranId
                  ? 'Tidak ada kelas dengan tahun ajaran ini terpasang. Coba pilih "Semua Tahun Ajaran", kemungkinan field tahun_ajaran_id kelas ini belum diisi.'
                  : "Belum ada kelas terdaftar."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredKelasOverview.map((kelas) => (
                <button
                  key={kelas.id}
                  type="button"
                  onClick={() => setSelectedKelas(kelas)}
                  className="text-left rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white uppercase text-xs shadow-sm">
                        {kelas.nama_kelas?.substring(0, 2) ||
                          `${kelas.tingkat || 1}A`}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">
                          {kelas.nama_kelas}
                        </h3>
                        <p className="text-[10px] text-slate-400">
                          {kelas.expand?.walikelas_id?.nama_lengkap ||
                            "Wali kelas belum ditentukan"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        kelas.pct >= 100
                          ? "text-emerald-600"
                          : kelas.pct >= 50
                            ? "text-amber-600"
                            : "text-slate-400"
                      }`}
                    >
                      {kelas.pct.toFixed(0)}%
                    </span>
                  </div>

                  <div className="mt-3">
                    <ProgressBar pct={kelas.pct} />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span>{kelas.siswaCount} siswa</span>
                    <span>{kelas.mapelCount} mapel</span>
                    <span>
                      {kelas.nilaiCount}/{kelas.expected} nilai
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============ LEVEL 2: DAFTAR MAPEL DALAM KELAS ============ */}
      {selectedKelas && !selectedPloting && (
        <>
          <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-blue-100 font-semibold">
                  Kelengkapan Nilai per Mata Pelajaran
                </p>
                <h1 className="text-lg font-bold mt-0.5">
                  {selectedKelas.nama_kelas}
                </h1>
                <p className="text-xs text-blue-100 mt-1">
                  Wali kelas:{" "}
                  {selectedKelas.expand?.walikelas_id?.nama_lengkap || "—"} ·
                  Pendamping:{" "}
                  {selectedKelas.expand?.pendamping_id?.nama_lengkap || "—"}
                </p>
              </div>
              <div className="flex gap-4 text-center">
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">Siswa</p>
                  <p className="text-lg font-bold">
                    {selectedKelas.siswaCount}
                  </p>
                </div>
                <div className="rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-[10px] uppercase text-blue-100">
                    Rata-rata Isi
                  </p>
                  <p className="text-lg font-bold">
                    {selectedKelas.pct.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {loadingMapel ? (
            <LoadingGrid />
          ) : mapelOverview.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
              Belum ada guru mata pelajaran yang di-plotting untuk kelas ini.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mapelOverview.map((p) => {
                const mapel = p.expand?.mapel_id;
                const guru = p.expand?.guru_id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPloting(p)}
                    className="text-left rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                        {mapel?.kode_mapel || "MPL"}
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          p.pct >= 100
                            ? "text-emerald-600"
                            : p.pct >= 50
                              ? "text-amber-600"
                              : "text-slate-400"
                        }`}
                      >
                        {p.pct.toFixed(0)}%
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 mt-2">
                      {mapel?.nama_mapel || "—"}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Diampu oleh {guru?.nama_lengkap || "—"}
                    </p>
                    <div className="mt-3">
                      <ProgressBar pct={p.pct} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                      <span>{p.lingkupCount} lingkup materi</span>
                      <span>
                        {p.nilaiCount}/{p.expected} nilai
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============ LEVEL 3: TABEL NILAI (READ-ONLY / EDIT) ============ */}
      {selectedKelas && selectedPloting && (
        <>
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
                  Diampu oleh{" "}
                  {selectedPloting.expand?.guru_id?.nama_lengkap || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold shadow-sm transition ${
                  editMode
                    ? "bg-white text-blue-700"
                    : "bg-white/10 text-white hover:bg-white/20 border border-white/30"
                }`}
              >
                {editMode ? "✓ Mode Edit Aktif" : "Aktifkan Mode Edit"}
              </button>
            </div>
          </div>

          {!editMode && (
            <p className="mb-3 text-[11px] text-slate-400">
              Menampilkan data nilai secara read-only. Klik "Aktifkan Mode Edit"
              bila Anda perlu mengoreksi nilai secara langsung.
            </p>
          )}

          {loadingDetail ? (
            <LoadingSkeleton />
          ) : lingkupList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
              Guru mata pelajaran ini belum membuat lingkup materi.
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
                            <td key={l.id} className="px-3 py-2 text-center">
                              {editMode ? (
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
                                    onBlur={() => handleNilaiBlur(s.id, l.id)}
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
                              ) : (
                                <span
                                  className={`font-semibold ${nilaiColor(cell?.nilai ?? null)}`}
                                >
                                  {cell?.nilai ?? "—"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 text-center bg-blue-50/30">
                          <span className={`font-bold ${nilaiColor(akhir)}`}>
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
        </>
      )}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}
