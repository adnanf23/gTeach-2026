"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// Sesuaikan kalau nama role guru mapel di sistemmu berbeda.
const ALLOWED_ROLES = ["guru mapel"];

function getKelasInitials(kelas) {
  if (!kelas) return "-";

  const nama = kelas.nama_kelas || "";
  const tingkat = kelas.tingkat || "";

  const match = nama.match(/(\d+[A-Za-z]+)$/);
  if (match) return match[1].toUpperCase();

  const firstChar = nama.replace(/\d+/g, "").trim().charAt(0) || "A";
  return `${tingkat}${firstChar}`;
}

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

function tahunAjaranLabel(ta) {
  if (!ta) return "-";
  return `${ta.tahun} · Sem ${ta.semester}`;
}

// =========================================================
// Ikon (inline SVG) — disamakan dengan halaman admin catatan kasus
// =========================================================
const ICON_PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  users: (
    <>
      <path d="M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </>
  ),
  school: (
    <>
      <path d="M14 22v-4a2 2 0 1 0-4 0v4" />
      <path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2" />
      <path d="M18 5v17" />
      <path d="m4 6 8-4 8 4" />
      <path d="M6 5v17" />
      <circle cx="12" cy="9" r="2" />
    </>
  ),
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
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// =========================================================
// StatsOverview — 3 kartu (gradient + 2 putih) ala Catatan Kasus
// =========================================================
function StatsOverview({ totalKelas, totalMapel, totalSiswa, loading }) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {/* Total Kelas — gradient biru */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 p-5 text-white shadow-sm">
        <div className="pointer-events-none absolute -right-8 -bottom-10 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-2 text-blue-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
              <Icon name="school" className="h-4 w-4" />
            </span>
            <p className="text-xs font-medium">Total kelas</p>
          </div>
          <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">
            {totalKelas}
          </p>
          <p className="mt-3 text-xs text-blue-100">
            Kelas tempat Anda mengajar
          </p>
        </div>
      </div>

      {/* Mata Pelajaran Diampu */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Icon name="book" className="h-4 w-4" />
          </span>
          <p className="text-xs font-medium">Mata pelajaran diampu</p>
        </div>
        <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-slate-900">
          {totalMapel}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Total mapel yang Anda ampu
        </p>
      </div>

      {/* Total Siswa Terjangkau */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Icon name="users" className="h-4 w-4" />
          </span>
          <p className="text-xs font-medium">Total siswa terjangkau</p>
        </div>
        <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-slate-900">
          {totalSiswa}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Siswa dari seluruh kelas Anda
        </p>
      </div>
    </div>
  );
}

export default function DataKelasListPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");

  const [loading, setLoading] = useState(true);
  const [kelasCards, setKelasCards] = useState([]); // [{ kelas, mapelList, siswaCount }]
  const [searchTerm, setSearchTerm] = useState("");

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
      setLoading(false);
      return;
    }

    setUser(currentUser);
    setAuthChecked(true);
  }, [router]);

  // 2. Ambil semua ploting_guru milik guru ini, lalu "flatten" kelas_id
  useEffect(() => {
    if (!authChecked || unauthorized || !user?.id) return;
    let isMounted = true;

    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const plotingRecords = await pb.collection("ploting_guru").getFullList({
          filter: `guru_id = "${user.id}"`,
          expand: "kelas_id,mapel_id",
          requestKey: null,
        });

        const kelasMap = {};
        for (const p of plotingRecords) {
          const kelasArr = Array.isArray(p.expand?.kelas_id)
            ? p.expand.kelas_id
            : p.expand?.kelas_id
              ? [p.expand.kelas_id]
              : [];
          const mapel = p.expand?.mapel_id;

          for (const k of kelasArr) {
            if (!kelasMap[k.id]) {
              kelasMap[k.id] = { kelas: k, mapelList: [] };
            }
            if (
              mapel &&
              !kelasMap[k.id].mapelList.some((m) => m.id === mapel.id)
            ) {
              kelasMap[k.id].mapelList.push(mapel);
            }
          }
        }

        const kelasIds = Object.keys(kelasMap);

        const counts = await Promise.all(
          kelasIds.map((kid) =>
            pb
              .collection("siswa")
              .getList(1, 1, {
                filter: `kelas_id = "${kid}"`,
                requestKey: null,
                fields: "id",
              })
              .then((r) => r.totalItems)
              .catch(() => 0),
          ),
        );

        const cards = kelasIds.map((kid, idx) => ({
          kelas: kelasMap[kid].kelas,
          mapelList: kelasMap[kid].mapelList.sort((a, b) =>
            (a.nama_mapel || "").localeCompare(b.nama_mapel || ""),
          ),
          siswaCount: counts[idx],
        }));

        cards.sort((a, b) => {
          const t =
            (Number(a.kelas.tingkat) || 0) - (Number(b.kelas.tingkat) || 0);
          if (t !== 0) return t;
          return (a.kelas.nama_kelas || "").localeCompare(
            b.kelas.nama_kelas || "",
          );
        });

        if (isMounted) setKelasCards(cards);
      } catch (err) {
        console.error("Error fetching data kelas guru mapel:", err);
        if (isMounted) setError("Gagal memuat daftar kelas Anda.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [authChecked, unauthorized, user]);

  const filteredCards = useMemo(() => {
    if (!searchTerm.trim()) return kelasCards;
    const q = searchTerm.toLowerCase();
    return kelasCards.filter(
      (c) =>
        c.kelas.nama_kelas?.toLowerCase().includes(q) ||
        c.mapelList.some((m) => m.nama_mapel?.toLowerCase().includes(q)),
    );
  }, [kelasCards, searchTerm]);

  const totalMapelUnik = useMemo(() => {
    const set = new Set();
    kelasCards.forEach((c) => c.mapelList.forEach((m) => set.add(m.id)));
    return set.size;
  }, [kelasCards]);

  const totalSiswa = useMemo(
    () => kelasCards.reduce((a, c) => a + c.siswaCount, 0),
    [kelasCards],
  );

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
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 lg:p-10">
      {/* ============ HEADER — gradient hero ============ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 p-6 text-white shadow-lg md:p-8">
        <div className="pointer-events-none absolute -right-10 -bottom-20 h-80 w-80 rounded-full bg-white/5" />
        <div className="relative z-10 space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-widest text-blue-200">
            Data Kelas
          </span>
          <h1 className="text-2xl font-extrabold uppercase tracking-wide md:text-3xl">
            Kelas Mengajar
          </h1>
          <p className="text-sm text-blue-100">
            Kelas tempat Anda mengajar sebagai guru mata pelajaran.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ============ STATS — 3 kartu (gradient + 2 putih) ============ */}
      {!loading && kelasCards.length > 0 && (
        <StatsOverview
          totalKelas={kelasCards.length}
          totalMapel={totalMapelUnik}
          totalSiswa={totalSiswa}
          loading={loading}
        />
      )}

      {/* ============ SEARCH ============ */}
      {!loading && kelasCards.length > 0 && (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <Icon name="search" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama kelas / mapel..."
            aria-label="Cari nama kelas atau mapel"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      )}

      {/* ============ GRID ============ */}
      {loading ? (
        <LoadingGrid />
      ) : kelasCards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
          Anda belum di-plotting mengajar mata pelajaran apapun di kelas
          manapun.
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 text-xs">
          Tidak ada kelas/mapel yang cocok dengan pencarian.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCards.map(({ kelas, mapelList, siswaCount }) => {
            const tahunAjaran = kelas.expand?.tahun_ajaran_id;
            return (
              <button
                key={kelas.id}
                type="button"
                onClick={() =>
                  router.push(`/guru-mapel/daftar-kelas/${kelas.id}`)
                }
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-200 active:scale-[0.98]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-900 transition-colors duration-300 group-hover:text-white">
                      {kelas.nama_kelas}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 transition-colors duration-300 group-hover:text-blue-100">
                      <span className="flex items-center gap-1">
                        <Icon
                          name="user"
                          className="h-3.5 w-3.5 text-slate-400 transition-colors duration-300 group-hover:text-blue-200"
                        />
                        Tingkat {kelas.tingkat || "-"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon
                          name="users"
                          className="h-3.5 w-3.5 text-slate-400 transition-colors duration-300 group-hover:text-blue-200"
                        />
                        {siswaCount} siswa
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 transition-colors duration-300 group-hover:text-blue-200">
                      {tahunAjaran
                        ? tahunAjaranLabel(tahunAjaran)
                        : "Tahun ajaran —"}
                    </p>
                  </div>

                  <span className="flex h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600 transition-colors duration-300 group-hover:bg-white/20 group-hover:text-white">
                    {getKelasInitials(kelas)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 transition-colors duration-300 group-hover:border-white/20">
                  {mapelList.map((m) => {
                    const palette = paletteForKey(m.id || m.nama_mapel);
                    return (
                      <span
                        key={m.id}
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${palette.chip} transition-colors duration-300 group-hover:bg-white/20 group-hover:text-white group-hover:ring-0`}
                      >
                        {m.nama_mapel}
                      </span>
                    );
                  })}
                  <span className="ml-auto text-slate-300 transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-white">
                    <Icon name="chevronRight" className="h-4 w-4" />
                  </span>
                </div>

                {/* Shimmer ala catatan kasus */}
                <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/15 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
              </button>
            );
          })}
        </div>
      )}
    </section>
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
