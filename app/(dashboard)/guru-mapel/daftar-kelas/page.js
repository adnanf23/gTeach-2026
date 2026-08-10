"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// Sesuaikan kalau nama role guru mapel di sistemmu berbeda.
const ALLOWED_ROLES = ["guru mapel"];

function getInitials(name) {
  if (!name) return "-";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
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
  //    (multi-select, maxSelect 100) jadi daftar kartu per kelas.
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

        // kelasId -> { kelas, mapelList: [mapel, ...] }
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

        // Ambil jumlah siswa per kelas secara ringan (cuma totalItems, bukan getFullList)
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Data Kelas</h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelas tempat Anda mengajar sebagai guru mata pelajaran.
          </p>
        </div>

        {!loading && kelasCards.length > 0 && (
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Cari nama kelas / mapel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && kelasCards.length > 0 && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-sm">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-blue-100 font-semibold">
                Total Kelas
              </p>
              <p className="text-2xl font-bold mt-0.5">{kelasCards.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-blue-100 font-semibold">
                Mata Pelajaran Diampu
              </p>
              <p className="text-2xl font-bold mt-0.5">{totalMapelUnik}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-blue-100 font-semibold">
                Total Siswa Terjangkau
              </p>
              <p className="text-2xl font-bold mt-0.5">
                {kelasCards.reduce((a, c) => a + c.siswaCount, 0)}
              </p>
            </div>
          </div>
        </div>
      )}

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
                className="text-left rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white uppercase text-sm shadow-sm">
                    {getInitials(kelas.nama_kelas) || `${kelas.tingkat || 1}A`}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-800 truncate">
                      {kelas.nama_kelas}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tingkat {kelas.tingkat || "-"} ·{" "}
                      {tahunAjaran
                        ? tahunAjaranLabel(tahunAjaran)
                        : "Tahun ajaran —"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {mapelList.map((m) => {
                    const palette = paletteForKey(m.id || m.nama_mapel);
                    return (
                      <span
                        key={m.id}
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${palette.chip}`}
                      >
                        {m.nama_mapel}
                      </span>
                    );
                  })}
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                  <span>{siswaCount} siswa</span>
                  <span>{mapelList.length} mapel diampu</span>
                </div>
              </button>
            );
          })}
        </div>
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
