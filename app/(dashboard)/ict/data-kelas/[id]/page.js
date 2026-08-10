"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  LayoutGrid,
  Users,
  BookOpen,
  Search,
  GraduationCap,
  UserCheck,
  Award,
  CalendarDays,
  Hash,
  School,
  Loader2,
  UserMinus,
  BookMarked,
  Layers,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...c) {
  return c.filter(Boolean).join(" ");
}

const TINGKAT_LABEL = {
  1: "Tingkat 1",
  2: "Tingkat 2",
  3: "Tingkat 3",
  4: "Tingkat 4",
  5: "Tingkat 5",
  6: "Tingkat 6",
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function Spinner({ className = "w-4 h-4" }) {
  return <Loader2 className={cn(className, "animate-spin")} />;
}

function Badge({ children, variant = "gray", dot = false }) {
  const map = {
    gray: "bg-zinc-100 text-zinc-500 ring-zinc-200/60",
    blue: "bg-blue-50 text-blue-600 ring-blue-200/60",
    green: "bg-emerald-50 text-emerald-600 ring-emerald-200/60",
    amber: "bg-amber-50 text-amber-600 ring-amber-200/60",
    red: "bg-red-50 text-red-600 ring-red-200/60",
    violet: "bg-violet-50 text-violet-600 ring-violet-200/60",
    teal: "bg-teal-50 text-teal-600 ring-teal-200/60",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1",
        map[variant],
      )}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      )}
      {children}
    </span>
  );
}

function Avatar({ name = "?", size = "sm", colorClass }) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const palette = [
    "bg-blue-100 text-blue-700",
    "bg-violet-100 text-violet-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-pink-100 text-pink-700",
    "bg-teal-100 text-teal-700",
    "bg-orange-100 text-orange-700",
    "bg-indigo-100 text-indigo-700",
  ];
  const bg =
    colorClass || palette[(name || "?").charCodeAt(0) % palette.length];
  const sz = {
    xs: "w-6 h-6 text-[9px]",
    sm: "w-8 h-8 text-[11px]",
    md: "w-10 h-10 text-[13px]",
    lg: "w-12 h-12 text-[16px]",
  }[size];
  return (
    <span
      className={cn(
        "rounded-full flex items-center justify-center font-bold shrink-0 select-none ring-2 ring-white",
        bg,
        sz,
      )}
    >
      {initials}
    </span>
  );
}

function PersonCard({ user, roleLabel, icon: Icon }) {
  if (!user) {
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-50 border border-dashed border-zinc-200">
        <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-zinc-300" />
        </div>
        <div>
          <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest">
            {roleLabel}
          </p>
          <p className="text-[13px] text-zinc-400 italic mt-0.5">
            Belum ditetapkan
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
      <Avatar name={user.nama_lengkap || ""} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest">
          {roleLabel}
        </p>
        <p className="text-[13px] font-semibold text-zinc-900 truncate mt-0.5">
          {user.nama_lengkap || "-"}
        </p>
        {user.email && (
          <p className="text-[11px] text-zinc-400 truncate">{user.email}</p>
        )}
      </div>
      {user.is_aktif !== undefined && (
        <Badge variant={user.is_aktif ? "green" : "red"} dot>
          {user.is_aktif ? "Aktif" : "Nonaktif"}
        </Badge>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse bg-zinc-100 rounded-xl", className)} />
  );
}

// ─── Tabs Config ──────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", Icon: LayoutGrid },
  { id: "siswa", label: "Siswa", Icon: Users },
  { id: "mapel", label: "Mata Pelajaran", Icon: BookOpen },
];

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  colorClass = "bg-blue-50 text-blue-600",
}) {
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow">
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          colorClass,
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[18px] font-bold text-zinc-900 leading-none">
          {value}
        </p>
        <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">{label}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DetailKelasPage() {
  const { id } = useParams();
  const router = useRouter();

  const [kelas, setKelas] = useState(null);
  const [siswa, setSiswa] = useState([]);
  const [mapel, setMapel] = useState([]);

  const [loadKelas, setLoadKelas] = useState(true);
  const [loadSiswa, setLoadSiswa] = useState(false);
  const [loadMapel, setLoadMapel] = useState(false);

  const [fetchedSiswa, setFetchedSiswa] = useState(false);
  const [fetchedMapel, setFetchedMapel] = useState(false);

  const [tab, setTab] = useState("overview");
  const [searchSiswa, setSearchSiswa] = useState("");

  // ── Fetch kelas ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    setLoadKelas(true);
    pb.collection("kelas")
      .getOne(id, {
        expand: "walikelas_id,pendamping_id,tahun_ajaran_id",
        requestKey: null,
      })
      .then((data) => setKelas(data))
      .catch((err) => {
        console.error(err);
        setKelas(null);
      })
      .finally(() => setLoadKelas(false));
  }, [id]);

  // ── Fetch siswa ────────────────────────────────────────────────────────────

  const fetchSiswa = useCallback(async () => {
    if (fetchedSiswa || !id) return;
    setLoadSiswa(true);
    try {
      const data = await pb.collection("siswa").getFullList({
        filter: `kelas_id = "${id}"`,
        sort: "nama_siswa",
        requestKey: null,
      });
      setSiswa(data);
      setFetchedSiswa(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadSiswa(false);
    }
  }, [id, fetchedSiswa]);

  // ── Fetch mapel ────────────────────────────────────────────────────────────

  const fetchMapel = useCallback(async () => {
    if (fetchedMapel || !kelas) return;
    setLoadMapel(true);
    try {
      const tingkat = String(kelas.tingkat);
      console.log("[fetchMapel] kelas.id =", id, "tingkat =", tingkat);

      // Sengaja TANPA .catch(() => []) dulu, biar error PocketBase
      // (kalau ada) muncul jelas di console, bukan ke-swallow jadi [].
      const spesifik = await pb.collection("mata_pelajaran").getFullList({
        filter: `spesifik_kelas_id ~ "${id}"`,
        requestKey: null,
      });
      console.log("[fetchMapel] spesifik hasil:", spesifik.length, spesifik);

      const kandidatUmum = await pb.collection("mata_pelajaran").getFullList({
        filter: `target_tingkat ~ "${tingkat}"`,
        requestKey: null,
      });
      console.log(
        "[fetchMapel] kandidatUmum hasil:",
        kandidatUmum.length,
        kandidatUmum,
      );

      const umum = kandidatUmum.filter((m) => {
        const spesifikIds = Array.isArray(m.spesifik_kelas_id)
          ? m.spesifik_kelas_id
          : m.spesifik_kelas_id
            ? [m.spesifik_kelas_id]
            : [];
        return spesifikIds.length === 0;
      });
      console.log("[fetchMapel] umum setelah difilter:", umum.length, umum);

      const map = {};
      [...spesifik, ...umum].forEach((m) => {
        map[m.id] = m;
      });
      setMapel(Object.values(map));
      setFetchedMapel(true);
    } catch (err) {
      // biarkan error tampil apa adanya dulu untuk diagnosa
      console.error("[fetchMapel] ERROR:", err?.data || err);
    } finally {
      setLoadMapel(false);
    }
  }, [id, kelas, fetchedMapel]);

  useEffect(() => {
    if (tab === "siswa") fetchSiswa();
    if (tab === "mapel") fetchMapel();
  }, [tab, fetchSiswa, fetchMapel]);

  useEffect(() => {
    if (kelas && !fetchedSiswa) fetchSiswa();
  }, [kelas, fetchedSiswa, fetchSiswa]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const kapasitas = 28;
  const jumlahSiswa = fetchedSiswa ? siswa.length : null;
  const pct =
    jumlahSiswa !== null
      ? Math.min(Math.round((jumlahSiswa / kapasitas) * 100), 100)
      : null;

  const filteredSiswa = siswa.filter(
    (s) =>
      !searchSiswa ||
      (s.nama_siswa || "").toLowerCase().includes(searchSiswa.toLowerCase()) ||
      (s.nis || "").includes(searchSiswa) ||
      (s.nisn || "").includes(searchSiswa),
  );

  const walikelas = kelas?.expand?.walikelas_id;
  const pendamping = kelas?.expand?.pendamping_id;
  const tahunAjaran = kelas?.expand?.tahun_ajaran_id;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loadKelas) {
    return (
      <div className="min-h-screen bg-zinc-50/60 p-6">
        <div className="max-w-4xl mx-auto space-y-5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-52 w-full rounded-3xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  // ── Not Found ──────────────────────────────────────────────────────────────

  if (!kelas && !loadKelas) {
    return (
      <div className="min-h-screen bg-zinc-50/60 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto">
            <School className="w-8 h-8 text-zinc-300" />
          </div>
          <p className="text-zinc-700 font-semibold text-base">
            Kelas tidak ditemukan
          </p>
          <p className="text-zinc-400 text-sm">
            ID kelas tidak valid atau sudah dihapus.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali
          </button>
        </div>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  const gradientMap = {
    1: "from-blue-600 to-blue-800",
    2: "from-violet-600 to-violet-800",
    3: "from-emerald-600 to-emerald-800",
    4: "from-amber-500 to-orange-700",
    5: "from-rose-500 to-rose-700",
    6: "from-teal-600 to-teal-800",
  };
  const heroGradient =
    gradientMap[String(kelas.tingkat)] || "from-blue-600 to-blue-800";

  return (
    <div className="min-h-screen bg-zinc-50/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[13px]">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-700 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Data Kelas
          </button>
          <span className="text-zinc-200">/</span>
          <span className="text-zinc-700 font-medium">{kelas.nama_kelas}</span>
        </div>

        {/* ── Hero Card ──────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "relative overflow-hidden bg-gradient-to-br rounded-3xl p-6 text-white shadow-xl shadow-blue-900/10",
            heroGradient,
          )}
        >
          {/* Noise texture overlay */}
          <div className="absolute inset-0 opacity-[0.03] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjc1IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')] pointer-events-none" />

          {/* Decorative circles */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
          <div className="absolute -bottom-16 right-8 w-64 h-64 bg-white/5 rounded-full pointer-events-none" />
          <div className="absolute top-8 -right-4 w-28 h-28 bg-white/5 rounded-full pointer-events-none" />

          <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-5">
            {/* Left */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center font-bold text-lg shrink-0 ring-1 ring-white/20">
                {(kelas.nama_kelas || "K").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">
                    {TINGKAT_LABEL[String(kelas.tingkat)] ||
                      `Tingkat ${kelas.tingkat}`}
                  </span>
                  {tahunAjaran && (
                    <span className="bg-white/15 text-white/90 text-[10px] font-semibold px-2.5 py-0.5 rounded-full ring-1 ring-white/10">
                      {tahunAjaran.nama || tahunAjaran.tahun || "T.A."}
                    </span>
                  )}
                </div>
                <h1 className="text-[26px] font-bold tracking-tight leading-none">
                  {kelas.nama_kelas}
                </h1>
                <p className="text-white/40 text-[11px] font-mono mt-1">
                  {kelas.id}
                </p>
              </div>
            </div>

            {/* Right: kapasitas */}
            <div className="shrink-0 bg-white/10 rounded-2xl p-4 backdrop-blur-sm ring-1 ring-white/10 min-w-[130px]">
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-2">
                Kapasitas
              </p>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-bold leading-none tabular-nums">
                  {jumlahSiswa !== null ? (
                    jumlahSiswa
                  ) : (
                    <span className="text-2xl opacity-50">—</span>
                  )}
                </span>
                <span className="text-white/50 text-base mb-0.5">
                  /{kapasitas}
                </span>
              </div>
              <p className="text-white/50 text-[11px] mt-0.5">siswa</p>
              {pct !== null && (
                <div className="mt-3">
                  <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700",
                        pct >= 95
                          ? "bg-red-300"
                          : pct >= 75
                            ? "bg-amber-300"
                            : "bg-emerald-300",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-white/40 text-[10px] mt-1 text-right">
                    {pct}%
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Teacher row */}
          <div className="relative mt-5 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { user: walikelas, label: "Wali Kelas" },
              { user: pendamping, label: "Guru Pendamping" },
            ].map(({ user, label }) => (
              <div key={label} className="flex items-center gap-3">
                {user ? (
                  <>
                    <Avatar
                      name={user.nama_lengkap || ""}
                      size="sm"
                      colorClass="bg-white/20 text-white"
                    />
                    <div>
                      <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">
                        {label}
                      </p>
                      <p className="text-white font-semibold text-[13px]">
                        {user.nama_lengkap}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/10 flex items-center justify-center shrink-0">
                      <UserMinus className="w-3.5 h-3.5 text-white/40" />
                    </div>
                    <div>
                      <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">
                        {label}
                      </p>
                      <p className="text-white/40 italic text-[13px]">
                        Belum ditetapkan
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-2xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium rounded-xl transition-all duration-150",
                tab === t.id
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              <t.Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
              {t.id === "siswa" && fetchedSiswa && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-bold rounded-full",
                    tab === "siswa"
                      ? "bg-blue-100 text-blue-600"
                      : "bg-zinc-200 text-zinc-500",
                  )}
                >
                  {siswa.length}
                </span>
              )}
              {t.id === "mapel" && fetchedMapel && mapel.length > 0 && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-bold rounded-full",
                    tab === "mapel"
                      ? "bg-violet-100 text-violet-600"
                      : "bg-zinc-200 text-zinc-500",
                  )}
                >
                  {mapel.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ──────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={Layers}
                label="Tingkat"
                value={kelas.tingkat}
                colorClass="bg-blue-50 text-blue-600"
              />
              <StatCard
                icon={Users}
                label="Jumlah Siswa"
                value={jumlahSiswa !== null ? jumlahSiswa : "—"}
                colorClass="bg-violet-50 text-violet-600"
              />
              <StatCard
                icon={School}
                label="Sisa Slot"
                value={jumlahSiswa !== null ? kapasitas - jumlahSiswa : "—"}
                colorClass="bg-emerald-50 text-emerald-600"
              />
              <StatCard
                icon={BookMarked}
                label="Mata Pelajaran"
                value={fetchedMapel ? mapel.length : "—"}
                colorClass="bg-amber-50 text-amber-600"
              />
            </div>

            {/* Tenaga Pengajar */}
            <div>
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <GraduationCap className="w-3.5 h-3.5" />
                Tenaga Pengajar
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PersonCard
                  user={walikelas}
                  roleLabel="Wali Kelas"
                  icon={UserCheck}
                />
                <PersonCard
                  user={pendamping}
                  roleLabel="Guru Pendamping"
                  icon={UserCheck}
                />
              </div>
            </div>

            {/* Info Rekord */}
            <div>
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Hash className="w-3.5 h-3.5" />
                Informasi Rekord
              </h3>
              <div className="bg-white border border-zinc-100 rounded-2xl shadow-sm overflow-hidden">
                {[
                  ["ID Kelas", kelas.id],
                  ["Nama Kelas", kelas.nama_kelas],
                  [
                    "Tingkat",
                    TINGKAT_LABEL[String(kelas.tingkat)] ||
                      `Tingkat ${kelas.tingkat}`,
                  ],
                  [
                    "Wali Kelas",
                    walikelas?.nama_lengkap +
                      " (" +
                      kelas.expand?.walikelas_id?.username +
                      ") " || "-",
                  ],
                  [
                    "Guru Pendamping",
                    pendamping?.nama_lengkap +
                      " (" +
                      kelas.expand?.pendamping_id?.username +
                      ") " || "-",
                  ],
                  [
                    "Tahun Ajaran",
                    tahunAjaran?.nama ||
                      tahunAjaran?.tahun ||
                      kelas.tahun_ajaran_id ||
                      "-",
                  ],
                  [
                    "Dibuat",
                    kelas.created
                      ? new Date(kelas.created).toLocaleString("id-ID", {
                          dateStyle: "long",
                          timeStyle: "short",
                        })
                      : "-",
                  ],
                  [
                    "Diperbarui",
                    kelas.updated
                      ? new Date(kelas.updated).toLocaleString("id-ID", {
                          dateStyle: "long",
                          timeStyle: "short",
                        })
                      : "-",
                  ],
                ].map(([k, v], i) => (
                  <div
                    key={k}
                    className={cn(
                      "flex items-start gap-4 px-5 py-3 text-[12px] group hover:bg-zinc-50/80 transition-colors",
                      i !== 0 && "border-t border-zinc-50",
                    )}
                  >
                    <span className="w-36 shrink-0 text-zinc-400 font-medium pt-px">
                      {k}
                    </span>
                    <span className="text-zinc-700 font-mono break-all">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Siswa ─────────────────────────────────────────────────────── */}
        {tab === "siswa" && (
          <div className="space-y-4">
            {loadSiswa ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <Spinner className="w-6 h-6" />
                <span className="text-[13px]">Memuat daftar siswa...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Cari nama, NIS, atau NISN..."
                      value={searchSiswa}
                      onChange={(e) => setSearchSiswa(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-[13px] text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all shadow-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="blue">{siswa.length} siswa</Badge>
                    <Badge
                      variant={
                        pct >= 95 ? "red" : pct >= 75 ? "amber" : "green"
                      }
                    >
                      {kapasitas - siswa.length} slot tersisa
                    </Badge>
                  </div>
                </div>

                {siswa.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-400">
                    <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center mb-1">
                      <Users className="w-7 h-7 text-zinc-300" />
                    </div>
                    <p className="font-semibold text-zinc-500 text-[14px]">
                      Belum ada siswa
                    </p>
                    <p className="text-[12px] text-zinc-400">
                      Belum ada siswa yang terdaftar di kelas ini
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px] min-w-[500px]">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-100">
                            <th className="px-5 py-3.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest w-10">
                              #
                            </th>
                            <th className="px-5 py-3.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                              Nama Siswa
                            </th>
                            <th className="px-5 py-3.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                              NIS
                            </th>
                            <th className="px-5 py-3.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                              NISN
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                          {filteredSiswa.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-5 py-10 text-center text-zinc-400 text-[13px] italic"
                              >
                                Tidak ada siswa yang sesuai pencarian
                              </td>
                            </tr>
                          ) : (
                            filteredSiswa.map((s, i) => (
                              <tr
                                key={s.id}
                                className="hover:bg-zinc-50/70 transition-colors"
                              >
                                <td className="px-5 py-3.5 text-zinc-400 text-[11px] tabular-nums">
                                  {i + 1}
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <Avatar
                                      name={s.nama_siswa || "?"}
                                      size="xs"
                                    />
                                    <span className="font-semibold text-zinc-800">
                                      {s.nama_siswa || "-"}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 font-mono text-[12px] text-zinc-500">
                                  {s.nis || (
                                    <span className="text-zinc-300">—</span>
                                  )}
                                </td>
                                <td className="px-5 py-3.5 font-mono text-[12px] text-zinc-500">
                                  {s.nisn || (
                                    <span className="text-zinc-300">—</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-5 py-3 border-t border-zinc-50 bg-zinc-50/50 text-[12px] text-zinc-400 flex justify-between items-center">
                      <span>
                        Menampilkan{" "}
                        <strong className="text-zinc-600">
                          {filteredSiswa.length}
                        </strong>{" "}
                        dari{" "}
                        <strong className="text-zinc-600">
                          {siswa.length}
                        </strong>{" "}
                        siswa
                      </span>
                      <span>
                        <strong className="text-zinc-600">
                          {kapasitas - siswa.length}
                        </strong>{" "}
                        slot tersisa
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: Mata Pelajaran ─────────────────────────────────────────────── */}
        {tab === "mapel" && (
          <div className="space-y-4">
            {loadMapel ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <Spinner className="w-6 h-6" />
                <span className="text-[13px]">Memuat mata pelajaran...</span>
              </div>
            ) : mapel.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-400">
                <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center mb-1">
                  <BookOpen className="w-7 h-7 text-zinc-300" />
                </div>
                <p className="font-semibold text-zinc-500 text-[14px]">
                  Belum ada mata pelajaran
                </p>
                <p className="text-[12px] text-zinc-400 text-center max-w-xs">
                  Mapel akan muncul jika ada{" "}
                  <code className="text-[11px] bg-zinc-100 px-1 py-0.5 rounded font-mono">
                    target_tingkat
                  </code>{" "}
                  yang sesuai atau di-assign langsung ke kelas ini
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-zinc-400">
                    Untuk{" "}
                    <strong className="text-zinc-600">
                      {TINGKAT_LABEL[String(kelas.tingkat)] ||
                        `Tingkat ${kelas.tingkat}`}
                    </strong>
                  </p>
                  <Badge variant="violet">{mapel.length} mata pelajaran</Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mapel.map((m, i) => {
                    const accents = [
                      { bg: "bg-blue-50", icon: "bg-blue-100 text-blue-600" },
                      {
                        bg: "bg-violet-50",
                        icon: "bg-violet-100 text-violet-600",
                      },
                      {
                        bg: "bg-emerald-50",
                        icon: "bg-emerald-100 text-emerald-600",
                      },
                      {
                        bg: "bg-amber-50",
                        icon: "bg-amber-100 text-amber-600",
                      },
                      { bg: "bg-teal-50", icon: "bg-teal-100 text-teal-600" },
                      { bg: "bg-rose-50", icon: "bg-rose-100 text-rose-600" },
                    ];
                    const { icon: iconCls } = accents[i % accents.length];

                    const isSpesifik = Array.isArray(m.spesifik_kelas_id)
                      ? m.spesifik_kelas_id.includes(id)
                      : m.spesifik_kelas_id === id;

                    return (
                      <div
                        key={m.id}
                        className="bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm flex gap-3 hover:shadow-md hover:border-zinc-200 transition-all"
                      >
                        <div
                          className={cn(
                            "w-11 h-11 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0",
                            iconCls,
                          )}
                        >
                          {(m.kode_mapel || m.nama_mapel || "?")
                            .slice(0, 3)
                            .toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="font-semibold text-zinc-900 text-[13px] leading-snug">
                              {m.nama_mapel || "-"}
                            </p>
                            <Badge variant={isSpesifik ? "violet" : "gray"}>
                              {isSpesifik ? "Spesifik" : "Umum"}
                            </Badge>
                          </div>
                          <p className="text-[11px] font-mono text-zinc-400">
                            {m.kode_mapel || "-"}
                          </p>

                          {Array.isArray(m.target_tingkat) &&
                            m.target_tingkat.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {m.target_tingkat.map((t) => (
                                  <Badge
                                    key={t}
                                    variant={
                                      String(t) === String(kelas.tingkat)
                                        ? "blue"
                                        : "gray"
                                    }
                                  >
                                    {TINGKAT_LABEL[String(t)] || `T${t}`}
                                  </Badge>
                                ))}
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
