"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// ------------------------------------------------------------------
// Helper-helper kecil
// ------------------------------------------------------------------
const STATUS_CONFIG = {
  hadir: {
    label: "Hadir",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    ring: "ring-emerald-200",
  },
  sakit: {
    label: "Sakit",
    dot: "bg-amber-500",
    text: "text-amber-700",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
  },
  izin: {
    label: "Izin",
    dot: "bg-sky-500",
    text: "text-sky-700",
    bg: "bg-sky-50",
    ring: "ring-sky-200",
  },
  alpha: {
    label: "Alpha",
    dot: "bg-rose-500",
    text: "text-rose-700",
    bg: "bg-rose-50",
    ring: "ring-rose-200",
  },
};
const STATUS_ORDER = ["hadir", "sakit", "izin", "alpha"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatTanggalID(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}
function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

// ------------------------------------------------------------------
// Komponen utama
// ------------------------------------------------------------------
export default function AbsensiDashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const [kelasList, setKelasList] = useState([]);
  const [siswaList, setSiswaList] = useState([]);
  const [absensiRange, setAbsensiRange] = useState([]);
  const [loadingBase, setLoadingBase] = useState(true);
  const [errorBase, setErrorBase] = useState("");

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [absensiTanggal, setAbsensiTanggal] = useState([]);
  const [loadingTanggal, setLoadingTanggal] = useState(false);

  const [expandedKelas, setExpandedKelas] = useState(() => new Set());
  const [filterKelas, setFilterKelas] = useState("semua");
  const [filterStatus, setFilterStatus] = useState("semua"); // 'semua', 'sudah', 'belum'
  const [searchSiswa, setSearchSiswa] = useState("");

  const [user, setUser] = useState(null);
  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const loadBaseData = useCallback(async () => {
    setLoadingBase(true);
    setErrorBase("");
    try {
      const [kelas, siswa, absensi] = await Promise.all([
        pb.collection("kelas").getFullList({
          sort: "tingkat,nama_kelas",
          expand: "walikelas_id",
          requestKey: null,
        }),
        pb
          .collection("siswa")
          .getFullList({ sort: "nama_siswa", requestKey: null }),
        pb.collection("absensi").getFullList({
          filter: `tanggal >= "${daysAgoStr(30)} 00:00:00" && tanggal <= "${todayStr()} 23:59:59"`,
          sort: "-tanggal",
          requestKey: null,
        }),
      ]);
      setKelasList(kelas);
      setSiswaList(siswa);
      setAbsensiRange(absensi);
    } catch (err) {
      console.error(err);
      setErrorBase(
        "Gagal memuat data. Pastikan PocketBase berjalan dan kamu sudah login.",
      );
    } finally {
      setLoadingBase(false);
    }
  }, []);

  useEffect(() => {
    loadBaseData();
  }, [loadBaseData]);

  const loadAbsensiTanggal = useCallback(async (dateStr) => {
    setLoadingTanggal(true);
    try {
      const records = await pb.collection("absensi").getFullList({
        filter: `tanggal >= "${dateStr} 00:00:00" && tanggal <= "${dateStr} 23:59:59"`,
        expand: "siswa_id,kelas_id",
        requestKey: null,
      });
      setAbsensiTanggal(records);
    } catch (err) {
      console.error(err);
      setAbsensiTanggal([]);
    } finally {
      setLoadingTanggal(false);
    }
  }, []);

  useEffect(() => {
    loadAbsensiTanggal(selectedDate);
  }, [selectedDate, loadAbsensiTanggal]);

  const siswaPerKelas = useMemo(() => {
    const map = new Map();
    for (const s of siswaList) {
      const kid = firstOf(s.kelas_id);
      if (!kid) continue;
      if (!map.has(kid)) map.set(kid, []);
      map.get(kid).push(s);
    }
    return map;
  }, [siswaList]);

  const kelasSudahAbsenIds = useMemo(() => {
    const set = new Set();
    for (const a of absensiTanggal) {
      const kid = firstOf(a.kelas_id);
      if (kid) set.add(kid);
    }
    return set;
  }, [absensiTanggal]);

  const kelasSudah = useMemo(
    () => kelasList.filter((k) => kelasSudahAbsenIds.has(k.id)),
    [kelasList, kelasSudahAbsenIds],
  );
  const kelasBelum = useMemo(
    () => kelasList.filter((k) => !kelasSudahAbsenIds.has(k.id)),
    [kelasList, kelasSudahAbsenIds],
  );

  const statistikKelas = useMemo(() => {
    const map = new Map();
    for (const a of absensiRange) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      if (!map.has(kid)) map.set(kid, { hadir: 0, total: 0 });
      const entry = map.get(kid);
      entry.total += 1;
      if (a.status === "hadir") entry.hadir += 1;
    }
    const result = [];
    for (const k of kelasList) {
      const entry = map.get(k.id);
      if (!entry || entry.total === 0) continue;
      result.push({
        kelas: k,
        rate: (entry.hadir / entry.total) * 100,
        total: entry.total,
        hadir: entry.hadir,
      });
    }
    result.sort((a, b) => b.rate - a.rate);
    return result;
  }, [absensiRange, kelasList]);

  const terbaik = statistikKelas.slice(0, 5);
  const terendah = [...statistikKelas].reverse().slice(0, 5);

  const absensiPerKelas = useMemo(() => {
    const map = new Map();
    for (const a of absensiTanggal) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      if (!map.has(kid)) map.set(kid, []);
      map.get(kid).push(a);
    }
    return map;
  }, [absensiTanggal]);

  const kelasUntukDitampilkan = useMemo(() => {
    let list =
      filterKelas === "semua"
        ? kelasList
        : kelasList.filter((k) => k.id === filterKelas);

    // Filter by status
    if (filterStatus === "sudah") {
      list = list.filter((k) => kelasSudahAbsenIds.has(k.id));
    } else if (filterStatus === "belum") {
      list = list.filter((k) => !kelasSudahAbsenIds.has(k.id));
    }

    // Search filter
    if (searchSiswa.trim()) {
      const q = searchSiswa.trim().toLowerCase();
      list = list.filter((k) => {
        if (k.nama_kelas.toLowerCase().includes(q)) return true;
        return (siswaPerKelas.get(k.id) || []).some((s) =>
          s.nama_siswa.toLowerCase().includes(q),
        );
      });
    }
    return list;
  }, [
    kelasList,
    filterKelas,
    filterStatus,
    searchSiswa,
    siswaPerKelas,
    kelasSudahAbsenIds,
  ]);

  const toggleExpand = (kelasId) => {
    setExpandedKelas((prev) => {
      const next = new Set(prev);
      next.has(kelasId) ? next.delete(kelasId) : next.add(kelasId);
      return next;
    });
  };

  const totalSiswa = Array.from(siswaPerKelas.values()).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-neutral-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ---------------------------------------------------------- */}
        {/* Top bar: brand + tab pills + profile                       */}
        {/* ---------------------------------------------------------- */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white px-5 py-3 shadow-sm">
          <nav className="flex gap-1 rounded-full bg-neutral-100 p-1">
            <TabPill
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </TabPill>
            <TabPill
              active={activeTab === "absensi"}
              onClick={() => setActiveTab("absensi")}
            >
              Absensi
            </TabPill>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={loadBaseData}
              className="hidden items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 sm:flex"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Segarkan
            </button>
            <div className="flex items-center gap-2 rounded-full bg-neutral-50 py-1 pl-1 pr-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                {initials(user?.nama_lengkap || "G")}
              </div>
              <span className="max-w-[110px] truncate text-xs font-medium text-neutral-700">
                {user?.nama_lengkap || "Guru"}
              </span>
            </div>
          </div>
        </div>

        {errorBase && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {errorBase}
          </div>
        )}

        {loadingBase ? (
          <LoadingState label="Memuat data..." />
        ) : activeTab === "overview" ? (
          <OverviewTab
            user={user}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            totalKelas={kelasList.length}
            totalSiswa={totalSiswa}
            kelasSudah={kelasSudah}
            kelasBelum={kelasBelum}
            loadingTanggal={loadingTanggal}
            terbaik={terbaik}
            terendah={terendah}
            siswaPerKelas={siswaPerKelas}
            onLihatDetail={(kelasId, status) => {
              setActiveTab("absensi");
              setFilterKelas(kelasId || "semua");
              setFilterStatus(status || "semua");
              if (kelasId) {
                setExpandedKelas(new Set([kelasId]));
              } else {
                setExpandedKelas(new Set());
              }
            }}
          />
        ) : (
          <AbsensiTab
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            kelasList={kelasList}
            filterKelas={filterKelas}
            setFilterKelas={setFilterKelas}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            searchSiswa={searchSiswa}
            setSearchSiswa={setSearchSiswa}
            kelasUntukDitampilkan={kelasUntukDitampilkan}
            siswaPerKelas={siswaPerKelas}
            absensiPerKelas={absensiPerKelas}
            kelasSudahAbsenIds={kelasSudahAbsenIds}
            expandedKelas={expandedKelas}
            toggleExpand={toggleExpand}
            loadingTanggal={loadingTanggal}
          />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Primitives
// ------------------------------------------------------------------
function TabPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-32 text-neutral-400">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-neutral-200 border-t-blue-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

// ------------------------------------------------------------------
// Tab: Overview
// ------------------------------------------------------------------
function OverviewTab({
  user,
  selectedDate,
  setSelectedDate,
  totalKelas,
  totalSiswa,
  kelasSudah,
  kelasBelum,
  loadingTanggal,
  terbaik,
  terendah,
  siswaPerKelas,
  onLihatDetail,
}) {
  const persenSudah = totalKelas
    ? Math.round((kelasSudah.length / totalKelas) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Kelas"
          value={totalKelas}
          sub={`${totalSiswa} siswa`}
          variant="dark"
        />
        <StatCard
          label="Sudah Absen"
          value={loadingTanggal ? "…" : kelasSudah.length}
          sub={`${persenSudah}%`}
          variant="blue"
        />
        <StatCard
          label="Belum Absen"
          value={loadingTanggal ? "…" : kelasBelum.length}
          variant="light"
        />
        <StatCard
          label="Rata-rata Hadir"
          value={`${Math.round(avgRate(terbaik, terendah))}%`}
          sub="30 hari"
          variant="light"
        />
      </div>

      {/* Status Lists - Compact */}
      <div className="grid gap-4 lg:grid-cols-2">
        <StatusCard
          title="Sudah Absen"
          kelasArr={kelasSudah}
          siswaPerKelas={siswaPerKelas}
          onLihatDetail={onLihatDetail}
          emptyText="Belum ada kelas yang absen"
          variant="blue"
        />
        <StatusCard
          title="Belum Absen"
          kelasArr={kelasBelum}
          siswaPerKelas={siswaPerKelas}
          onLihatDetail={onLihatDetail}
          emptyText="Semua kelas sudah absen"
          variant="rose"
        />
      </div>

      {/* Ranking */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RankingCard
          title="Kehadiran Terbaik"
          subtitle="30 hari terakhir"
          data={terbaik}
          variant="emerald"
        />
        <RankingCard
          title="Kehadiran Terendah"
          subtitle="30 hari terakhir"
          data={terendah}
          variant="rose"
        />
      </div>
    </div>
  );
}

function avgRate(a, b) {
  const seen = new Set();
  const all = [...a, ...b].filter((x) => {
    if (seen.has(x.kelas.id)) return false;
    seen.add(x.kelas.id);
    return true;
  });
  if (!all.length) return 0;
  return all.reduce((s, x) => s + x.rate, 0) / all.length;
}

function StatCard({ label, value, sub, variant }) {
  const variants = {
    dark: {
      bg: "bg-neutral-900",
      text: "text-white",
      sub: "text-neutral-400",
      accent: "bg-white/5",
    },
    blue: {
      bg: "bg-blue-600",
      text: "text-white",
      sub: "text-blue-100",
      accent: "bg-white/10",
    },
    light: {
      bg: "bg-white",
      text: "text-neutral-900",
      sub: "text-neutral-400",
      accent: "bg-neutral-50/50",
    },
  };
  const v = variants[variant] || variants.light;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${v.bg} p-5 shadow-sm`}
    >
      <p className={`text-xs font-medium uppercase tracking-wide ${v.sub}`}>
        {label}
      </p>
      <p className={`mt-2 text-[26px] font-semibold leading-none ${v.text}`}>
        {value}
      </p>
      {sub && <p className={`mt-2 text-xs ${v.sub}`}>{sub}</p>}
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full ${v.accent}`}
      />
    </div>
  );
}

function StatusCard({
  title,
  kelasArr,
  siswaPerKelas,
  onLihatDetail,
  emptyText,
  variant,
}) {
  const color = variant === "blue" ? "blue" : "rose";
  const bgColor = variant === "blue" ? "bg-blue-50" : "bg-rose-50";
  const textColor = variant === "blue" ? "text-blue-600" : "text-rose-600";
  const hoverColor =
    variant === "blue" ? "hover:bg-blue-50" : "hover:bg-rose-50";

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${variant === "blue" ? "bg-blue-500" : "bg-rose-500"}`}
          />
          <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
        </div>
        <button
          onClick={() =>
            onLihatDetail(null, variant === "blue" ? "sudah" : "belum")
          }
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          Lihat semua →
        </button>
      </div>

      {kelasArr.length === 0 ? (
        <div className={`rounded-xl ${bgColor} py-6 text-center`}>
          <p className="text-sm text-neutral-500">{emptyText}</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {kelasArr.slice(0, 4).map((k) => (
            <li
              key={k.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${hoverColor}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-neutral-800">
                  {k.nama_kelas}
                </span>
                <span className="text-xs text-neutral-400">
                  {siswaPerKelas.get(k.id)?.length || 0} siswa
                </span>
              </div>
              <button
                onClick={() => onLihatDetail(k.id, null)}
                className={`text-xs font-medium ${textColor}`}
              >
                Detail →
              </button>
            </li>
          ))}
          {kelasArr.length > 4 && (
            <li className="px-3 py-2 text-center">
              <button
                onClick={() =>
                  onLihatDetail(null, variant === "blue" ? "sudah" : "belum")
                }
                className="text-xs text-neutral-400 hover:text-neutral-600"
              >
                + {kelasArr.length - 4} lainnya
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function RankingCard({ title, subtitle, data, variant }) {
  const barColor = variant === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  const textColor =
    variant === "emerald" ? "text-emerald-700" : "text-rose-700";

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
      <p className="mb-4 text-xs text-neutral-400">{subtitle}</p>
      {data.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-neutral-400">Belum ada data.</p>
        </div>
      ) : (
        <ul className="space-y-3.5">
          {data.map(({ kelas, rate }, i) => (
            <li key={kelas.id}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium text-neutral-700">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${i < 3 ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-600"} text-xs font-bold`}
                  >
                    {i + 1}
                  </span>
                  {kelas.nama_kelas}
                </span>
                <span className={`font-semibold ${textColor}`}>
                  {rate.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${Math.min(100, rate)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Tab: Absensi
// ------------------------------------------------------------------
function AbsensiTab({
  selectedDate,
  setSelectedDate,
  kelasList,
  filterKelas,
  setFilterKelas,
  filterStatus,
  setFilterStatus,
  searchSiswa,
  setSearchSiswa,
  kelasUntukDitampilkan,
  siswaPerKelas,
  absensiPerKelas,
  kelasSudahAbsenIds,
  expandedKelas,
  toggleExpand,
  loadingTanggal,
}) {
  // Count status distribution
  const statusCounts = {
    semua: kelasList.length,
    sudah: kelasList.filter((k) => kelasSudahAbsenIds.has(k.id)).length,
    belum: kelasList.filter((k) => !kelasSudahAbsenIds.has(k.id)).length,
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-neutral-800">Absensi</h2>
          <p className="text-xs text-neutral-400">
            {formatTanggalID(selectedDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={searchSiswa}
              onChange={(e) => setSearchSiswa(e.target.value)}
              placeholder="Cari kelas / siswa"
              className="rounded-full border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Status filter pills */}
          <div className="flex gap-1 rounded-full bg-neutral-100 p-1">
            <FilterPill
              active={filterStatus === "semua"}
              onClick={() => setFilterStatus("semua")}
            >
              Semua ({statusCounts.semua})
            </FilterPill>
            <FilterPill
              active={filterStatus === "sudah"}
              onClick={() => setFilterStatus("sudah")}
            >
              Sudah ({statusCounts.sudah})
            </FilterPill>
            <FilterPill
              active={filterStatus === "belum"}
              onClick={() => setFilterStatus("belum")}
            >
              Belum ({statusCounts.belum})
            </FilterPill>
          </div>

          <select
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="semua">Semua kelas</option>
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama_kelas}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {loadingTanggal ? (
        <LoadingState label="Memuat absensi..." />
      ) : kelasUntukDitampilkan.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-neutral-400">
            Tidak ada kelas yang cocok.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {kelasUntukDitampilkan.map((k) => (
            <KelasAbsensiCard
              key={k.id}
              kelas={k}
              siswaKelas={siswaPerKelas.get(k.id) || []}
              records={absensiPerKelas.get(k.id) || []}
              sudahAbsen={kelasSudahAbsenIds.has(k.id)}
              expanded={expandedKelas.has(k.id)}
              onToggle={() => toggleExpand(k.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

function KelasAbsensiCard({
  kelas,
  siswaKelas,
  records,
  sudahAbsen,
  expanded,
  onToggle,
}) {
  const counts = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
  const statusBySiswaId = new Map();
  for (const r of records) {
    const sid = firstOf(r.siswa_id);
    if (r.status in counts) counts[r.status] += 1;
    if (sid) statusBySiswaId.set(sid, r.status);
  }
  const belumTercatat = siswaKelas.length - records.length;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm transition-all hover:shadow-md">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-neutral-50"
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold ${
              sudahAbsen
                ? "bg-blue-50 text-blue-600"
                : "bg-rose-50 text-rose-500"
            }`}
          >
            {kelas.nama_kelas?.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-800">
              {kelas.nama_kelas}
            </p>
            <p className="text-xs text-neutral-400">
              {siswaKelas.length} siswa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden gap-1.5 sm:flex">
            {STATUS_ORDER.map((s) =>
              counts[s] > 0 ? (
                <span
                  key={s}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} ring-1 ${STATUS_CONFIG[s].ring}`}
                >
                  {STATUS_CONFIG[s].label} {counts[s]}
                </span>
              ) : null,
            )}
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              sudahAbsen
                ? "bg-blue-50 text-blue-700"
                : "bg-rose-50 text-rose-600"
            }`}
          >
            {sudahAbsen ? "Sudah absen" : "Belum absen"}
          </span>
          <svg
            className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 px-5 py-4 bg-neutral-50/50">
          {siswaKelas.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">
              Belum ada data siswa di kelas ini.
            </p>
          ) : (
            <>
              {belumTercatat > 0 && (
                <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {belumTercatat} siswa belum tercatat pada tanggal ini.
                </div>
              )}
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-400">
                      <th className="px-4 py-2.5 font-medium">Nama siswa</th>
                      <th className="px-4 py-2.5 font-medium">NIS</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {[...siswaKelas]
                      .sort((a, b) => a.nama_siswa.localeCompare(b.nama_siswa))
                      .map((s) => {
                        const status = statusBySiswaId.get(s.id);
                        const cfg = status ? STATUS_CONFIG[status] : null;
                        return (
                          <tr key={s.id} className="hover:bg-neutral-50">
                            <td className="px-4 py-2.5 font-medium text-neutral-800">
                              {s.nama_siswa}
                            </td>
                            <td className="px-4 py-2.5 text-neutral-500">
                              {s.nis}
                            </td>
                            <td className="px-4 py-2.5">
                              {cfg ? (
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text} ring-1 ${cfg.ring}`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}
                                  />
                                  {cfg.label}
                                </span>
                              ) : (
                                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-400">
                                  Belum tercatat
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
