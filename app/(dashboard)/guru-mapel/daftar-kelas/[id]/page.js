"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
// Sesuaikan path import berikut dengan lokasi file pocketbase client di project-mu
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// =========================================================
// Helper
// =========================================================
function getInitials(name) {
  if (!name) return "-";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function waLink(nomor) {
  if (!nomor) return null;
  const digits = nomor.replace(/[^0-9]/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}`;
}

function tahunAjaranLabel(ta) {
  if (!ta) return "-";
  return `${ta.tahun} · Sem ${ta.semester}`;
}

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

// Palet warna dirotasi berdasarkan hash id mapel, konsisten dengan halaman Guru Pengajar
const PALETTES = [
  { chip: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100" },
  { chip: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100" },
  { chip: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100" },
  { chip: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100" },
  { chip: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100" },
  { chip: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-100" },
];
function paletteForKey(key) {
  const str = key || "";
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.4 1.26 4.83L2 22l5.35-1.28a9.9 9.9 0 0 0 4.69 1.18h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.83 14.16c-.25.7-1.23 1.28-2.02 1.44-.55.11-1.26.2-3.67-.79-3.08-1.27-5.06-4.4-5.21-4.6-.15-.2-1.25-1.66-1.25-3.17 0-1.5.79-2.24 1.07-2.54.28-.3.6-.37.8-.37.2 0 .4 0 .58.01.19.01.44-.07.68.53.25.6.85 2.08.92 2.23.07.15.12.33.02.53-.1.2-.15.33-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.61.17.3.76 1.26 1.63 2.04 1.12 1 2.06 1.32 2.36 1.47.3.15.48.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.68-.15.28.1 1.76.83 2.06.98.3.15.5.23.58.35.07.13.07.7-.18 1.4Z" />
    </svg>
  );
}

// Kartu satu orang tenaga pengajar (wali kelas / pendamping) + tombol kirim pesan
function TenagaCard({ label, person }) {
  const wa = waLink(person?.no_whatsapp);

  if (!person) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-white p-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="mt-0.5 text-sm text-slate-400">Belum diatur</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
          {getInitials(person.nama_lengkap)}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {person.nama_lengkap}
          </p>
          <span
            className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
              person.is_aktif === false
                ? "bg-slate-100 text-slate-500"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {person.is_aktif === false ? "Nonaktif" : "Aktif"}
          </span>
        </div>
      </div>

      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
        >
          <WhatsAppIcon />
          <span className="hidden sm:inline">Kirim Pesan</span>
        </a>
      )}
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "siswa", label: "Siswa" },
  { key: "mapel", label: "Mata Pelajaran" },
];

export default function DetailKelasPage() {
  const router = useRouter();
  const { id } = useParams();

  // ---------------- Auth ----------------
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    getCurrentUser();
    setCheckingAuth(false);
  }, [router]);

  // ---------------- Data ----------------
  const [kelas, setKelas] = useState(null);
  const [siswaList, setSiswaList] = useState([]);
  const [plotingList, setPlotingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const loadAll = useCallback(async () => {
    if (!id) {
      // id kosong biasanya berarti file ini nggak ditaruh di folder route
      // dinamis (contoh: app/.../data-kelas/[id]/page.js). Tampilkan pesan
      // yang jelas alih-alih membiarkan halaman nyangkut di spinner selamanya.
      setLoading(false);
      setErrorMsg(
        "ID kelas tidak ditemukan di URL. Pastikan halaman ini diakses lewat route dinamis, misalnya /data-kelas/[id].",
      );
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setNotFound(false);
    try {
      const [kelasRec, siswaRec, plotingRecRaw] = await Promise.all([
        pb.collection("kelas").getOne(id, {
          expand: "walikelas_id,pendamping_id,tahun_ajaran_id",
          requestKey: null,
        }),
        pb.collection("siswa").getFullList({
          filter: `kelas_id="${id}"`,
          sort: "nama_siswa",
          requestKey: null,
        }),
        // kelas_id di ploting_guru sekarang multi-select (maxSelect 100 — satu guru
        // bisa diploting ke beberapa kelas paralel sekaligus dengan Lingkup Materi
        // yang sama), jadi filter pakai "~" (array contains), lalu divalidasi ulang
        // manual di JS biar aman dari kemungkinan false-positive substring match.
        pb.collection("ploting_guru").getFullList({
          filter: `kelas_id~"${id}"`,
          expand: "guru_id,mapel_id",
          requestKey: null,
        }),
      ]);

      const plotingRec = plotingRecRaw.filter((p) => {
        const kelasIds = Array.isArray(p.kelas_id) ? p.kelas_id : [p.kelas_id];
        return kelasIds.includes(id);
      });

      setKelas(kelasRec);
      setSiswaList(siswaRec);
      setPlotingList(plotingRec);
    } catch (e) {
      if (e?.status === 404) {
        setNotFound(true);
      } else {
        setErrorMsg("Gagal memuat data kelas.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!checkingAuth) loadAll();
  }, [checkingAuth, loadAll]);

  const totalMapel = useMemo(
    () =>
      new Set(plotingList.map((p) => firstOf(p.mapel_id)).filter(Boolean)).size,
    [plotingList],
  );

  // ---------------- Tab & pencarian siswa ----------------
  const [activeTab, setActiveTab] = useState("overview");
  const [searchSiswa, setSearchSiswa] = useState("");
  const filteredSiswa = useMemo(() => {
    const term = searchSiswa.trim().toLowerCase();
    if (!term) return siswaList;
    return siswaList.filter(
      (s) =>
        s.nama_siswa.toLowerCase().includes(term) ||
        (s.nis || "").toLowerCase().includes(term) ||
        (s.nisn || "").toLowerCase().includes(term),
    );
  }, [siswaList, searchSiswa]);

  // =========================================================
  // Render
  // =========================================================
  if (checkingAuth || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Memuat...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-medium text-slate-700">Kelas tidak ditemukan.</p>
          <button
            onClick={() => router.push("/data-kelas")}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Kembali ke Data Kelas
          </button>
        </div>
      </div>
    );
  }

  const walikelas = kelas?.expand?.walikelas_id || null;
  const pendamping = kelas?.expand?.pendamping_id || null;
  const tahunAjaran = kelas?.expand?.tahun_ajaran_id || null;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push("/data-kelas")}
          className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <span aria-hidden>←</span> Data Kelas
          <span className="text-slate-300">/</span>
          <span className="font-medium text-slate-700">
            {kelas?.nama_kelas}
          </span>
        </button>

        {errorMsg && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}

        {/* Hero card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-indigo-500 p-6 text-white shadow-lg shadow-indigo-200/60">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-white/10" />

          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 text-base font-bold backdrop-blur-sm">
                {(kelas?.nama_kelas || "").split(" ")[0]}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-100">
                  Tingkat {kelas?.tingkat ?? "-"}
                </p>
                <h2 className="text-2xl font-bold leading-tight">
                  {kelas?.nama_kelas}
                </h2>
                <p className="mt-0.5 text-xs text-indigo-200">
                  {tahunAjaranLabel(tahunAjaran)}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white/10 px-5 py-3 text-right backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-100">
                Jumlah Siswa
              </p>
              <p className="text-3xl font-bold leading-tight">
                {siswaList.length}
              </p>
              <p className="text-[11px] text-indigo-200">siswa terdaftar</p>
            </div>
          </div>

          <div className="relative mt-6 grid gap-4 border-t border-white/20 pt-4 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
                {getInitials(walikelas?.nama_lengkap)}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">
                  Wali Kelas
                </p>
                <p className="text-sm font-semibold">
                  {walikelas?.nama_lengkap || "Belum diatur"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
                {getInitials(pendamping?.nama_lengkap)}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">
                  Guru Pendamping
                </p>
                <p className="text-sm font-semibold">
                  {pendamping?.nama_lengkap || "Belum diatur"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm ${
                activeTab === tab.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
              {tab.key === "siswa" && ` (${siswaList.length})`}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {activeTab === "overview" && (
          <div className="mt-5 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-semibold text-slate-900">
                  {kelas?.tingkat ?? "-"}
                </p>
                <p className="text-xs text-slate-500">Tingkat</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-semibold text-slate-900">
                  {siswaList.length}
                </p>
                <p className="text-xs text-slate-500">Jumlah Siswa</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-semibold text-slate-900">
                  {totalMapel}
                </p>
                <p className="text-xs text-slate-500">Mata Pelajaran</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-lg font-semibold text-slate-900">
                  {tahunAjaranLabel(tahunAjaran)}
                </p>
                <p className="text-xs text-slate-500">Tahun Ajaran</p>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Tenaga Pengajar
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <TenagaCard label="Wali Kelas" person={walikelas} />
                <TenagaCard label="Guru Pendamping" person={pendamping} />
              </div>
            </div>
          </div>
        )}

        {/* Tab: Siswa */}
        {activeTab === "siswa" && (
          <div className="mt-5">
            <input
              type="text"
              value={searchSiswa}
              onChange={(e) => setSearchSiswa(e.target.value)}
              placeholder="Cari nama, NIS, atau NISN..."
              className="mb-4 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {filteredSiswa.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  {searchSiswa
                    ? "Tidak ada siswa yang cocok."
                    : "Belum ada siswa terdaftar di kelas ini."}
                </p>
              ) : (
                <>
                  {/* Tabel untuk layar sedang ke atas */}
                  <table className="hidden w-full text-left text-sm sm:table">
                    <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Nama Siswa</th>
                        <th className="px-4 py-2.5 font-medium">NIS</th>
                        <th className="px-4 py-2.5 font-medium">NISN</th>
                        <th className="px-4 py-2.5 font-medium">
                          Jenis Kelamin
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSiswa.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            {s.nama_siswa}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            {s.nis || "-"}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            {s.nisn || "-"}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                s.jenis_kelamin === "P"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-sky-50 text-sky-700"
                              }`}
                            >
                              {s.jenis_kelamin === "P"
                                ? "Perempuan"
                                : s.jenis_kelamin === "L"
                                  ? "Laki-laki"
                                  : "-"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Kartu untuk layar kecil */}
                  <div className="divide-y divide-slate-100 sm:hidden">
                    {filteredSiswa.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-4"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {s.nama_siswa}
                          </p>
                          <p className="text-xs text-slate-400">
                            NIS {s.nis || "-"} · NISN {s.nisn || "-"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.jenis_kelamin === "P"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-sky-50 text-sky-700"
                          }`}
                        >
                          {s.jenis_kelamin === "P"
                            ? "P"
                            : s.jenis_kelamin === "L"
                              ? "L"
                              : "-"}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab: Mata Pelajaran */}
        {activeTab === "mapel" && (
          <div className="mt-5">
            {plotingList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
                <p className="text-sm text-slate-400">
                  Belum ada guru yang diploting untuk kelas ini.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {plotingList.map((p) => {
                  const mapel = p.expand?.mapel_id;
                  const guru = p.expand?.guru_id;
                  const palette = paletteForKey(
                    mapel?.id || mapel?.nama_mapel || "",
                  );
                  const kelasIds = Array.isArray(p.kelas_id)
                    ? p.kelas_id
                    : p.kelas_id
                      ? [p.kelas_id]
                      : [];
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${palette.chip}`}
                      >
                        {mapel?.nama_mapel || "-"}
                      </span>
                      <p className="mt-2 text-sm font-medium text-slate-800">
                        {guru?.nama_lengkap || "(guru tidak ditemukan)"}
                      </p>
                      {kelasIds.length > 1 && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          Mengajar di {kelasIds.length} kelas
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
