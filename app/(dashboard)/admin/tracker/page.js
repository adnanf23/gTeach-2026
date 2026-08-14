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

const METODE_CONFIG = {
  praktikum: {
    label: "Praktikum",
    text: "text-violet-700",
    bg: "bg-violet-50",
    ring: "ring-violet-200",
  },
  diskusi: {
    label: "Diskusi",
    text: "text-sky-700",
    bg: "bg-sky-50",
    ring: "ring-sky-200",
  },
  presentasi: {
    label: "Presentasi",
    text: "text-blue-700",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  "student centered": {
    label: "Student centered",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    ring: "ring-emerald-200",
  },
  "teacher centered": {
    label: "Teacher centered",
    text: "text-amber-700",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
  },
  assesmen: {
    label: "Asesmen",
    text: "text-rose-700",
    bg: "bg-rose-50",
    ring: "ring-rose-200",
  },
  refleksi: {
    label: "Refleksi",
    text: "text-indigo-700",
    bg: "bg-indigo-50",
    ring: "ring-indigo-200",
  },
  ceramah: {
    label: "Ceramah",
    text: "text-neutral-700",
    bg: "bg-neutral-100",
    ring: "ring-neutral-200",
  },
};
const JAM_SLOTS = ["1 dan 2", "3 dan 4", "5 dan 6", "7 dan 8"];

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
export default function AgendaAbsensiDashboardPage() {
  const [activeTab, setActiveTab] = useState("agenda"); // 'agenda' | 'absensi'

  const [kelasList, setKelasList] = useState([]);
  const [siswaList, setSiswaList] = useState([]);
  const [loadingBase, setLoadingBase] = useState(true);
  const [errorBase, setErrorBase] = useState("");

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [user, setUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const loadBaseData = useCallback(async () => {
    setLoadingBase(true);
    setErrorBase("");
    try {
      const [kelas, siswa] = await Promise.all([
        pb.collection("kelas").getFullList({
          sort: "tingkat,nama_kelas",
          expand: "walikelas_id,pendamping_id",
          requestKey: null,
        }),
        pb
          .collection("siswa")
          .getFullList({ sort: "nama_siswa", requestKey: null }),
      ]);
      setKelasList(kelas);
      setSiswaList(siswa);
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

  const totalSiswa = siswaList.length;

  return (
    <div className="min-h-screen text-neutral-900">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
        {/* Top bar: brand + tab pills + profile */}
        <div className="mb-6 md:mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-3 sm:px-5 py-3 shadow-sm">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="sm:hidden p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            <nav className="hidden sm:flex gap-1 rounded-full bg-neutral-100 p-1">
              <TabPill
                active={activeTab === "agenda"}
                onClick={() => setActiveTab("agenda")}
              >
                Agenda Mengajar
              </TabPill>
              <TabPill
                active={activeTab === "absensi"}
                onClick={() => setActiveTab("absensi")}
              >
                Absensi
              </TabPill>
            </nav>

            {isMobileMenuOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-lg border border-neutral-100 p-2 z-50 sm:hidden">
                <button
                  onClick={() => {
                    setActiveTab("agenda");
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                    activeTab === "agenda"
                      ? "bg-blue-600 text-white"
                      : "hover:bg-neutral-50 text-neutral-600"
                  }`}
                >
                  Agenda Mengajar
                </button>
                <button
                  onClick={() => {
                    setActiveTab("absensi");
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                    activeTab === "absensi"
                      ? "bg-blue-600 text-white"
                      : "hover:bg-neutral-50 text-neutral-600"
                  }`}
                >
                  Absensi
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 sm:flex-none rounded-full border border-neutral-200 bg-neutral-50 px-3 sm:px-4 py-1.5 text-xs sm:text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 min-w-[120px]"
            />
            <button
              onClick={loadBaseData}
              className="hidden md:flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
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
            <div className="flex items-center gap-2 rounded-full bg-neutral-50 py-1 pl-1 pr-2 sm:pr-3">
              <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-blue-600 text-[10px] sm:text-[11px] font-semibold text-white">
                {initials(user?.nama_lengkap || "G")}
              </div>
              <span className="max-w-[80px] sm:max-w-[110px] truncate text-[10px] sm:text-xs font-medium text-neutral-700">
                {user?.nama_lengkap || "Guru"}
              </span>
            </div>
          </div>
        </div>

        {errorBase && (
          <div className="mb-4 md:mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 sm:px-5 py-3 sm:py-4 text-xs sm:text-sm text-rose-700">
            {errorBase}
          </div>
        )}

        {loadingBase ? (
          <LoadingState label="Memuat data..." />
        ) : activeTab === "agenda" ? (
          <AgendaTab
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            kelasList={kelasList}
            siswaPerKelas={siswaPerKelas}
          />
        ) : (
          <AbsensiTabWrapper
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            kelasList={kelasList}
            siswaPerKelas={siswaPerKelas}
            totalSiswa={totalSiswa}
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
      className={`rounded-full px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium transition-all ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium transition-all ${
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
    <div className="flex flex-col items-center justify-center gap-3 py-20 sm:py-32 text-neutral-400">
      <div className="h-8 w-8 sm:h-9 sm:w-9 animate-spin rounded-full border-[3px] border-neutral-200 border-t-blue-600" />
      <p className="text-xs sm:text-sm">{label}</p>
    </div>
  );
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
      className={`relative overflow-hidden rounded-xl sm:rounded-2xl ${v.bg} p-3 sm:p-5 shadow-sm`}
    >
      <p
        className={`text-[10px] sm:text-xs font-medium uppercase tracking-wide ${v.sub}`}
      >
        {label}
      </p>
      <p
        className={`mt-1 sm:mt-2 text-xl sm:text-[26px] font-semibold leading-none ${v.text}`}
      >
        {value}
      </p>
      {sub && (
        <p className={`mt-1 sm:mt-2 text-[10px] sm:text-xs ${v.sub}`}>{sub}</p>
      )}
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-16 w-16 sm:h-24 sm:w-24 rounded-full ${v.accent}`}
      />
    </div>
  );
}

function StatusListCard({
  title,
  kelasArr,
  siswaPerKelas,
  onLihatSemua,
  onLihatDetail,
  emptyText,
  variant,
}) {
  const bgColor = variant === "blue" ? "bg-blue-50" : "bg-rose-50";
  const textColor = variant === "blue" ? "text-blue-600" : "text-rose-600";
  const hoverColor =
    variant === "blue" ? "hover:bg-blue-50" : "hover:bg-rose-50";

  return (
    <div className="rounded-xl sm:rounded-2xl bg-white p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${variant === "blue" ? "bg-blue-500" : "bg-rose-500"}`}
          />
          <h3 className="text-xs sm:text-sm font-semibold text-neutral-800">
            {title}
          </h3>
        </div>
        <button
          onClick={onLihatSemua}
          className="text-[10px] sm:text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          Lihat semua →
        </button>
      </div>

      {kelasArr.length === 0 ? (
        <div className={`rounded-xl ${bgColor} py-4 sm:py-6 text-center`}>
          <p className="text-xs sm:text-sm text-neutral-500">{emptyText}</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {kelasArr.slice(0, 4).map((k) => (
            <li
              key={k.id}
              className={`flex items-center justify-between rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm transition-colors ${hoverColor}`}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <span className="font-medium text-neutral-800 truncate">
                  {k.nama_kelas}
                </span>
                <span className="text-[10px] sm:text-xs text-neutral-400 flex-shrink-0">
                  {siswaPerKelas.get(k.id)?.length || 0} siswa
                </span>
              </div>
              <button
                onClick={() => onLihatDetail(k.id)}
                className={`text-[10px] sm:text-xs font-medium ${textColor} flex-shrink-0 ml-2`}
              >
                Detail →
              </button>
            </li>
          ))}
          {kelasArr.length > 4 && (
            <li className="px-2 sm:px-3 py-1.5 sm:py-2 text-center">
              <button
                onClick={onLihatSemua}
                className="text-[10px] sm:text-xs text-neutral-400 hover:text-neutral-600"
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

function RankingCard({ title, subtitle, data, variant, valueLabel }) {
  const barColor = variant === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  const textColor =
    variant === "emerald" ? "text-emerald-700" : "text-rose-700";

  return (
    <div className="rounded-xl sm:rounded-2xl bg-white p-4 sm:p-5 shadow-sm">
      <h3 className="text-xs sm:text-sm font-semibold text-neutral-800">
        {title}
      </h3>
      <p className="mb-3 sm:mb-4 text-[10px] sm:text-xs text-neutral-400">
        {subtitle}
      </p>
      {data.length === 0 ? (
        <div className="py-6 sm:py-8 text-center">
          <p className="text-xs sm:text-sm text-neutral-400">Belum ada data.</p>
        </div>
      ) : (
        <ul className="space-y-3 sm:space-y-3.5">
          {data.map(({ kelas, rate, display }, i) => (
            <li key={kelas.id}>
              <div className="mb-1 flex items-center justify-between text-[10px] sm:text-xs">
                <span className="flex items-center gap-1.5 sm:gap-2 font-medium text-neutral-700 min-w-0 flex-1">
                  <span
                    className={`inline-flex h-4 w-4 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-full ${
                      i < 3
                        ? "bg-amber-100 text-amber-700"
                        : "bg-neutral-100 text-neutral-600"
                    } text-[9px] sm:text-xs font-bold`}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate">{kelas.nama_kelas}</span>
                </span>
                <span
                  className={`font-semibold ${textColor} flex-shrink-0 ml-2`}
                >
                  {display ?? `${rate.toFixed(1)}%`}
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
      {valueLabel && (
        <p className="mt-2 sm:mt-3 text-[10px] sm:text-[11px] text-neutral-400">
          {valueLabel}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// TOOLBAR
// ------------------------------------------------------------------
function Toolbar({
  title,
  selectedDate,
  setSelectedDate,
  searchValue,
  setSearchValue,
  searchPlaceholder,
  filterStatus,
  setFilterStatus,
  statusCounts,
  filterKelas,
  setFilterKelas,
  kelasList,
}) {
  const [isKelasOpen, setIsKelasOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* Baris 1: Judul + Tanggal + Search */}
      <div className="flex flex-col sm:flex-row gap-3 rounded-xl sm:rounded-2xl bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <h2 className="text-xs sm:text-sm font-semibold text-neutral-800">
            {title}
          </h2>
          <p className="text-[10px] sm:text-xs text-neutral-400 hidden sm:inline">
            {formatTanggalID(selectedDate)}
          </p>
        </div>

        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 min-w-[100px]">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-full border border-neutral-200 bg-neutral-50 py-1.5 sm:py-2 pl-8 sm:pl-9 pr-3 text-xs sm:text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="sm:hidden rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 w-[130px]"
          />
        </div>
      </div>

      {/* Baris 2: Filter Status + Filter Kelas */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] sm:text-xs font-medium text-neutral-500 mr-1 hidden sm:inline">
            Status:
          </span>
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
        </div>

        <div className="hidden sm:block w-px h-6 bg-neutral-200 mx-1" />

        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-[10px] sm:text-xs font-medium text-neutral-500 mr-1 hidden sm:inline">
            Kelas:
          </span>
          <select
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className="hidden sm:block rounded-full border border-neutral-200 bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="semua">Semua kelas</option>
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama_kelas}
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsKelasOpen(!isKelasOpen)}
            className="sm:hidden flex-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 flex items-center justify-between"
          >
            <span>
              {filterKelas === "semua"
                ? "Semua kelas"
                : kelasList.find((k) => k.id === filterKelas)?.nama_kelas ||
                  "Pilih kelas"}
            </span>
            <svg
              className="w-3 h-3 ml-1"
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
          </button>

          {isKelasOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-neutral-200 p-2 z-50 sm:hidden max-h-[200px] overflow-y-auto">
              <button
                onClick={() => {
                  setFilterKelas("semua");
                  setIsKelasOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs ${
                  filterKelas === "semua"
                    ? "bg-blue-50 text-blue-600"
                    : "hover:bg-neutral-50"
                }`}
              >
                Semua kelas
              </button>
              {kelasList.map((k) => (
                <button
                  key={k.id}
                  onClick={() => {
                    setFilterKelas(k.id);
                    setIsKelasOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs ${
                    filterKelas === k.id
                      ? "bg-blue-50 text-blue-600"
                      : "hover:bg-neutral-50"
                  }`}
                >
                  {k.nama_kelas}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// TAB: AGENDA MENGAJAR
// ------------------------------------------------------------------
function AgendaTab({
  selectedDate,
  setSelectedDate,
  kelasList,
  siswaPerKelas,
}) {
  const [agendaRange, setAgendaRange] = useState([]);
  const [agendaTanggal, setAgendaTanggal] = useState([]);
  const [loadingRange, setLoadingRange] = useState(true);
  const [loadingTanggal, setLoadingTanggal] = useState(false);
  const [plotingGuruList, setPlotingGuruList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [mapelList, setMapelList] = useState([]);

  const [expandedKelas, setExpandedKelas] = useState(() => new Set());
  const [filterKelas, setFilterKelas] = useState("semua");
  const [filterStatus, setFilterStatus] = useState("semua");
  const [searchKelas, setSearchKelas] = useState("");

  // Load data ploting_guru untuk mengetahui guru pengajar mapel
  const loadPlotingGuru = useCallback(async () => {
    try {
      // Load ploting_guru with expand
      const records = await pb.collection("ploting_guru").getFullList({
        expand: "guru_id,mapel_id,kelas_id",
        requestKey: null,
      });
      setPlotingGuruList(records);

      // Also load users for teacher names and mapel for subject names
      const [users, mapels] = await Promise.all([
        pb.collection("users").getFullList({
          filter:
            'role ?= "guru mapel" || role ?= "guru walikelas" || role ?= "guru pendamping"',
          requestKey: null,
        }),
        pb.collection("mata_pelajaran").getFullList({
          requestKey: null,
        }),
      ]);
      setUsersList(users);
      setMapelList(mapels);
    } catch (err) {
      console.error("Gagal load ploting_guru:", err);
      setPlotingGuruList([]);
      setUsersList([]);
      setMapelList([]);
    }
  }, []);

  useEffect(() => {
    loadPlotingGuru();
  }, [loadPlotingGuru]);

  const loadRange = useCallback(async () => {
    setLoadingRange(true);
    try {
      const records = await pb.collection("agenda_mengajar").getFullList({
        filter: `date >= "${daysAgoStr(30)} 00:00:00" && date <= "${todayStr()} 23:59:59"`,
        sort: "-date",
        requestKey: null,
      });
      setAgendaRange(records);
    } catch (err) {
      console.error(err);
      setAgendaRange([]);
    } finally {
      setLoadingRange(false);
    }
  }, []);

  useEffect(() => {
    loadRange();
  }, [loadRange]);

  const loadTanggal = useCallback(async (dateStr) => {
    setLoadingTanggal(true);
    try {
      const records = await pb.collection("agenda_mengajar").getFullList({
        filter: `date >= "${dateStr} 00:00:00" && date <= "${dateStr} 23:59:59"`,
        expand: "kelas_id,mapel_id",
        requestKey: null,
      });
      setAgendaTanggal(records);
    } catch (err) {
      console.error(err);
      setAgendaTanggal([]);
    } finally {
      setLoadingTanggal(false);
    }
  }, []);

  useEffect(() => {
    loadTanggal(selectedDate);
  }, [selectedDate, loadTanggal]);

  // Build maps for quick lookups
  const userMap = useMemo(() => {
    const map = new Map();
    for (const u of usersList) {
      map.set(u.id, u);
    }
    return map;
  }, [usersList]);

  const mapelMap = useMemo(() => {
    const map = new Map();
    for (const m of mapelList) {
      map.set(m.id, m);
    }
    return map;
  }, [mapelList]);

  // Map untuk mendapatkan guru per mapel dari ploting_guru
  const guruPerMapel = useMemo(() => {
    const map = new Map();
    for (const pg of plotingGuruList) {
      const mapelId = firstOf(pg.mapel_id);
      const guruId = firstOf(pg.guru_id);
      if (mapelId && guruId) {
        const guru = userMap.get(guruId);
        if (guru) {
          if (!map.has(mapelId)) {
            map.set(mapelId, []);
          }
          map.get(mapelId).push(guru.nama_lengkap || "Guru");
        }
      }
    }
    return map;
  }, [plotingGuruList, userMap]);

  // Get all unique guru names from ploting_guru
  const semuaGuru = useMemo(() => {
    const names = new Set();
    for (const pg of plotingGuruList) {
      const guruId = firstOf(pg.guru_id);
      if (guruId) {
        const guru = userMap.get(guruId);
        if (guru) {
          names.add(guru.nama_lengkap || "Guru");
        }
      }
    }
    return Array.from(names);
  }, [plotingGuruList, userMap]);

  const agendaPerKelas = useMemo(() => {
    const map = new Map();
    for (const a of agendaTanggal) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      if (!map.has(kid)) map.set(kid, []);
      map.get(kid).push(a);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          JAM_SLOTS.indexOf(a.jam_mapel) - JAM_SLOTS.indexOf(b.jam_mapel),
      );
    }
    return map;
  }, [agendaTanggal]);

  // Get all mapel IDs that have agenda entries today
  const mapelWithAgendaToday = useMemo(() => {
    const set = new Set();
    for (const a of agendaTanggal) {
      const mapelId = firstOf(a.mapel_id);
      if (mapelId) set.add(mapelId);
    }
    return set;
  }, [agendaTanggal]);

  // Get all mapel IDs from ploting_guru
  const allMapelIds = useMemo(() => {
    const set = new Set();
    for (const pg of plotingGuruList) {
      const mapelId = firstOf(pg.mapel_id);
      if (mapelId) set.add(mapelId);
    }
    return set;
  }, [plotingGuruList]);

  // Teachers who have filled agenda today
  const guruSudahMengisi = useMemo(() => {
    const names = new Set();
    for (const a of agendaTanggal) {
      const mapelId = firstOf(a.mapel_id);
      if (mapelId && guruPerMapel.has(mapelId)) {
        for (const guru of guruPerMapel.get(mapelId)) {
          names.add(guru);
        }
      }
    }
    return Array.from(names);
  }, [agendaTanggal, guruPerMapel]);

  // Teachers who haven't filled agenda today
  const guruBelumMengisi = useMemo(() => {
    const sudah = new Set(guruSudahMengisi);
    return semuaGuru.filter((g) => !sudah.has(g));
  }, [semuaGuru, guruSudahMengisi]);

  const kelasSudahIds = useMemo(
    () => new Set(agendaPerKelas.keys()),
    [agendaPerKelas],
  );
  const kelasSudah = useMemo(
    () => kelasList.filter((k) => kelasSudahIds.has(k.id)),
    [kelasList, kelasSudahIds],
  );
  const kelasBelum = useMemo(
    () => kelasList.filter((k) => !kelasSudahIds.has(k.id)),
    [kelasList, kelasSudahIds],
  );

  // Get unique mapel names with agenda today
  const mapelSudah = useMemo(() => {
    const names = new Set();
    for (const a of agendaTanggal) {
      const mapelId = firstOf(a.mapel_id);
      if (mapelId) {
        const mapel = mapelMap.get(mapelId);
        if (mapel) {
          names.add(mapel.nama_mapel);
        }
      }
    }
    return Array.from(names);
  }, [agendaTanggal, mapelMap]);

  // Get mapel names without agenda today
  const mapelBelum = useMemo(() => {
    const semuaMapel = new Set();
    for (const pg of plotingGuruList) {
      const mapelId = firstOf(pg.mapel_id);
      if (mapelId) {
        const mapel = mapelMap.get(mapelId);
        if (mapel) {
          semuaMapel.add(mapel.nama_mapel);
        }
      }
    }
    const sudah = new Set(mapelSudah);
    return Array.from(semuaMapel).filter((m) => !sudah.has(m));
  }, [plotingGuruList, mapelMap, mapelSudah]);

  const rankingAktivitas = useMemo(() => {
    const map = new Map();
    for (const a of agendaRange) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      map.set(kid, (map.get(kid) || 0) + 1);
    }
    const result = [];
    for (const k of kelasList) {
      const count = map.get(k.id) || 0;
      if (count === 0) continue;
      result.push({ kelas: k, count });
    }
    result.sort((a, b) => b.count - a.count);
    const max = result.length ? result[0].count : 1;
    return result.map((r) => ({
      kelas: r.kelas,
      rate: (r.count / max) * 100,
      display: `${r.count}x`,
    }));
  }, [agendaRange, kelasList]);

  const teraktif = rankingAktivitas.slice(0, 5);
  const terpasif = useMemo(() => {
    const map = new Map();
    for (const a of agendaRange) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      map.set(kid, (map.get(kid) || 0) + 1);
    }
    const arr = kelasList.map((k) => ({ kelas: k, count: map.get(k.id) || 0 }));
    arr.sort((a, b) => a.count - b.count);
    const max = Math.max(1, ...arr.map((r) => r.count));
    return arr.slice(0, 5).map((r) => ({
      kelas: r.kelas,
      rate: max ? (r.count / max) * 100 : 0,
      display: `${r.count}x`,
    }));
  }, [agendaRange, kelasList]);

  const totalEntriHariIni = agendaTanggal.length;
  const persenSudah = kelasList.length
    ? Math.round((kelasSudah.length / kelasList.length) * 100)
    : 0;

  const filteredKelas = useMemo(() => {
    let list =
      filterKelas === "semua"
        ? kelasList
        : kelasList.filter((k) => k.id === filterKelas);
    if (filterStatus === "sudah")
      list = list.filter((k) => kelasSudahIds.has(k.id));
    else if (filterStatus === "belum")
      list = list.filter((k) => !kelasSudahIds.has(k.id));
    if (searchKelas.trim()) {
      const q = searchKelas.trim().toLowerCase();
      list = list.filter((k) => {
        if (k.nama_kelas.toLowerCase().includes(q)) return true;
        return (agendaPerKelas.get(k.id) || []).some(
          (a) =>
            a.topik?.toLowerCase().includes(q) ||
            a.expand?.mapel_id?.nama_mapel?.toLowerCase().includes(q),
        );
      });
    }
    return list;
  }, [
    kelasList,
    filterKelas,
    filterStatus,
    searchKelas,
    kelasSudahIds,
    agendaPerKelas,
  ]);

  const toggleExpand = (kelasId) => {
    setExpandedKelas((prev) => {
      const next = new Set(prev);
      next.has(kelasId) ? next.delete(kelasId) : next.add(kelasId);
      return next;
    });
  };

  const goToDetail = (kelasId, status) => {
    setFilterKelas(kelasId || "semua");
    setFilterStatus(status || "semua");
    setExpandedKelas(kelasId ? new Set([kelasId]) : new Set());
    document
      .getElementById("agenda-list-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const statusCounts = {
    semua: kelasList.length,
    sudah: kelasSudah.length,
    belum: kelasBelum.length,
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Kelas"
          value={kelasList.length}
          sub={`${kelasList.reduce((s, k) => s + (siswaPerKelas.get(k.id)?.length || 0), 0)} siswa`}
          variant="dark"
        />
        <StatCard
          label="Sudah Isi Agenda"
          value={loadingTanggal ? "…" : kelasSudah.length}
          sub={`${persenSudah}%`}
          variant="blue"
        />
        <StatCard
          label="Belum Isi Agenda"
          value={loadingTanggal ? "…" : kelasBelum.length}
          variant="light"
        />
        <StatCard
          label="Entri Hari Ini"
          value={loadingTanggal ? "…" : totalEntriHariIni}
          sub="semua jam pelajaran"
          variant="light"
        />
      </div>

      {/* Guru Status Cards */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <div className="rounded-xl sm:rounded-2xl bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <h3 className="text-xs sm:text-sm font-semibold text-neutral-800">
              Guru Sudah Mengisi Agenda ({guruSudahMengisi.length})
            </h3>
          </div>
          {guruSudahMengisi.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 py-4 sm:py-6 text-center">
              <p className="text-xs sm:text-sm text-neutral-500">
                Belum ada guru yang mengisi agenda hari ini
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {guruSudahMengisi.map((guru, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {guru}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl sm:rounded-2xl bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <h3 className="text-xs sm:text-sm font-semibold text-neutral-800">
              Guru Belum Mengisi Agenda ({guruBelumMengisi.length})
            </h3>
          </div>
          {guruBelumMengisi.length === 0 ? (
            <div className="rounded-xl bg-rose-50 py-4 sm:py-6 text-center">
              <p className="text-xs sm:text-sm text-neutral-500">
                Semua guru sudah mengisi agenda hari ini! 🎉
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {guruBelumMengisi.map((guru, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  {guru}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mapel Status Cards */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <div className="rounded-xl sm:rounded-2xl bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <h3 className="text-xs sm:text-sm font-semibold text-neutral-800">
              Mapel Sudah Diisi ({mapelSudah.length})
            </h3>
          </div>
          {mapelSudah.length === 0 ? (
            <div className="rounded-xl bg-blue-50 py-4 sm:py-6 text-center">
              <p className="text-xs sm:text-sm text-neutral-500">
                Belum ada mapel yang diisi
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {mapelSudah.map((mapel, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  {mapel}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl sm:rounded-2xl bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <h3 className="text-xs sm:text-sm font-semibold text-neutral-800">
              Mapel Belum Diisi ({mapelBelum.length})
            </h3>
          </div>
          {mapelBelum.length === 0 ? (
            <div className="rounded-xl bg-amber-50 py-4 sm:py-6 text-center">
              <p className="text-xs sm:text-sm text-neutral-500">
                Semua mapel sudah diisi! 🎉
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {mapelBelum.map((mapel, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {mapel}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status lists */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <StatusListCard
          title="Sudah Isi Agenda"
          kelasArr={kelasSudah}
          siswaPerKelas={siswaPerKelas}
          onLihatSemua={() => goToDetail(null, "sudah")}
          onLihatDetail={(id) => goToDetail(id, null)}
          emptyText="Belum ada kelas yang mengisi agenda"
          variant="blue"
        />
        <StatusListCard
          title="Belum Isi Agenda"
          kelasArr={kelasBelum}
          siswaPerKelas={siswaPerKelas}
          onLihatSemua={() => goToDetail(null, "belum")}
          onLihatDetail={(id) => goToDetail(id, null)}
          emptyText="Semua kelas sudah mengisi agenda"
          variant="rose"
        />
      </div>

      {/* Ranking */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <RankingCard
          title="Kelas Paling Aktif"
          subtitle="Jumlah entri agenda, 30 hari terakhir"
          data={teraktif}
          variant="emerald"
        />
        <RankingCard
          title="Kelas Paling Jarang Isi"
          subtitle="Jumlah entri agenda, 30 hari terakhir"
          data={terpasif}
          variant="rose"
        />
      </div>

      {/* Toolbar + list */}
      <div
        id="agenda-list-section"
        className="space-y-3 sm:space-y-4 scroll-mt-6"
      >
        <Toolbar
          title="Agenda Mengajar"
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          searchValue={searchKelas}
          setSearchValue={setSearchKelas}
          searchPlaceholder="Cari kelas / topik / mapel"
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          statusCounts={statusCounts}
          filterKelas={filterKelas}
          setFilterKelas={setFilterKelas}
          kelasList={kelasList}
        />

        {loadingTanggal ? (
          <LoadingState label="Memuat agenda..." />
        ) : filteredKelas.length === 0 ? (
          <div className="rounded-xl sm:rounded-2xl bg-white p-6 sm:p-10 text-center shadow-sm">
            <p className="text-xs sm:text-sm text-neutral-400">
              Tidak ada kelas yang cocok.
            </p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {filteredKelas.map((k) => (
              <KelasAgendaCard
                key={k.id}
                kelas={k}
                entries={agendaPerKelas.get(k.id) || []}
                sudahIsi={kelasSudahIds.has(k.id)}
                expanded={expandedKelas.has(k.id)}
                onToggle={() => toggleExpand(k.id)}
                guruPerMapel={guruPerMapel}
                mapelMap={mapelMap}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KelasAgendaCard({
  kelas,
  entries,
  sudahIsi,
  expanded,
  onToggle,
  guruPerMapel,
  mapelMap,
}) {
  const entryBySlot = new Map();
  for (const e of entries) {
    if (e.jam_mapel) entryBySlot.set(e.jam_mapel, e);
  }
  const jumlahTerisi = JAM_SLOTS.filter((slot) => entryBySlot.has(slot)).length;

  // Get unique guru for this class based on mapel entries
  const guruKelas = useMemo(() => {
    const names = new Set();
    for (const e of entries) {
      const mapelId = firstOf(e.mapel_id);
      if (mapelId && guruPerMapel.has(mapelId)) {
        for (const guru of guruPerMapel.get(mapelId)) {
          names.add(guru);
        }
      }
    }
    return Array.from(names);
  }, [entries, guruPerMapel]);

  return (
    <div className="overflow-hidden rounded-xl sm:rounded-2xl bg-white shadow-sm transition-all hover:shadow-md">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 text-left transition hover:bg-neutral-50"
      >
        <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 flex-1">
          <div
            className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-semibold ${
              sudahIsi ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-500"
            }`}
          >
            {kelas.nama_kelas?.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-semibold text-neutral-800 truncate">
              {kelas.nama_kelas}
            </p>
            <p className="text-[10px] sm:text-xs text-neutral-400">
              {jumlahTerisi}/{JAM_SLOTS.length} jam pelajaran terisi
              {guruKelas.length > 0 && (
                <span className="ml-2 text-emerald-600">
                  • {guruKelas.join(", ")}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <div className="hidden xs:flex gap-1 sm:gap-1.5">
            {JAM_SLOTS.map((slot) => (
              <span
                key={slot}
                className={`h-1.5 w-4 sm:h-2 sm:w-6 rounded-full ${entryBySlot.has(slot) ? "bg-blue-500" : "bg-neutral-200"}`}
                title={slot}
              />
            ))}
          </div>
          <span
            className={`rounded-full px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-xs font-medium whitespace-nowrap ${
              sudahIsi ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-600"
            }`}
          >
            {sudahIsi ? "Sudah" : "Belum"}
          </span>
          <svg
            className={`h-3 w-3 sm:h-4 sm:w-4 shrink-0 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
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
        <div className="border-t border-neutral-100 bg-neutral-50/50 px-3 sm:px-5 py-3 sm:py-4">
          <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
            {JAM_SLOTS.map((slot) => {
              const entry = entryBySlot.get(slot);
              return (
                <div
                  key={slot}
                  className={`rounded-lg sm:rounded-xl border px-3 sm:px-4 py-2.5 sm:py-3 ${
                    entry
                      ? "border-blue-100 bg-white"
                      : "border-dashed border-neutral-200 bg-white/60"
                  }`}
                >
                  <div className="mb-1 sm:mb-1.5 flex items-center justify-between gap-1">
                    <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      Jam ke {slot}
                    </span>
                    {entry?.metode && METODE_CONFIG[entry.metode] && (
                      <span
                        className={`rounded-full px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[11px] font-medium ${METODE_CONFIG[entry.metode].bg} ${METODE_CONFIG[entry.metode].text} ring-1 ${METODE_CONFIG[entry.metode].ring}`}
                      >
                        {METODE_CONFIG[entry.metode].label}
                      </span>
                    )}
                  </div>
                  {entry ? (
                    <>
                      <p className="text-xs sm:text-sm font-medium text-neutral-800 truncate">
                        {entry.expand?.mapel_id?.nama_mapel ||
                          mapelMap.get(firstOf(entry.mapel_id))?.nama_mapel ||
                          "Mapel tidak diketahui"}
                      </p>
                      {entry.topik && (
                        <p className="mt-0.5 text-[10px] sm:text-xs text-neutral-500 truncate">
                          Topik: {entry.topik}
                        </p>
                      )}
                      {entry.deskripsi && (
                        <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-neutral-500 line-clamp-2">
                          {entry.deskripsi}
                        </p>
                      )}
                      {entry.siswa_tidak_hadir && (
                        <p className="mt-1 text-[10px] sm:text-[11px] text-amber-700 truncate">
                          Tidak hadir: {entry.siswa_tidak_hadir}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs sm:text-sm text-neutral-400">
                      Belum diisi
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// TAB: ABSENSI (unchanged, same as before)
// ------------------------------------------------------------------
function AbsensiTabWrapper({
  selectedDate,
  setSelectedDate,
  kelasList,
  siswaPerKelas,
  totalSiswa,
}) {
  const [absensiRange, setAbsensiRange] = useState([]);
  const [absensiTanggal, setAbsensiTanggal] = useState([]);
  const [loadingRange, setLoadingRange] = useState(true);
  const [loadingTanggal, setLoadingTanggal] = useState(false);

  const [expandedKelas, setExpandedKelas] = useState(() => new Set());
  const [filterKelas, setFilterKelas] = useState("semua");
  const [filterStatus, setFilterStatus] = useState("semua");
  const [searchSiswa, setSearchSiswa] = useState("");

  const loadRange = useCallback(async () => {
    setLoadingRange(true);
    try {
      const records = await pb.collection("absensi").getFullList({
        filter: `tanggal >= "${daysAgoStr(30)} 00:00:00" && tanggal <= "${todayStr()} 23:59:59"`,
        sort: "-tanggal",
        requestKey: null,
      });
      setAbsensiRange(records);
    } catch (err) {
      console.error(err);
      setAbsensiRange([]);
    } finally {
      setLoadingRange(false);
    }
  }, []);

  useEffect(() => {
    loadRange();
  }, [loadRange]);

  const loadTanggal = useCallback(async (dateStr) => {
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
    loadTanggal(selectedDate);
  }, [selectedDate, loadTanggal]);

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
    if (filterStatus === "sudah")
      list = list.filter((k) => kelasSudahAbsenIds.has(k.id));
    else if (filterStatus === "belum")
      list = list.filter((k) => !kelasSudahAbsenIds.has(k.id));
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

  const goToDetail = (kelasId, status) => {
    setFilterKelas(kelasId || "semua");
    setFilterStatus(status || "semua");
    setExpandedKelas(kelasId ? new Set([kelasId]) : new Set());
    document
      .getElementById("absensi-list-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const persenSudah = kelasList.length
    ? Math.round((kelasSudah.length / kelasList.length) * 100)
    : 0;
  const statusCounts = {
    semua: kelasList.length,
    sudah: kelasSudah.length,
    belum: kelasBelum.length,
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Kelas"
          value={kelasList.length}
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

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <StatusListCard
          title="Sudah Absen"
          kelasArr={kelasSudah}
          siswaPerKelas={siswaPerKelas}
          onLihatSemua={() => goToDetail(null, "sudah")}
          onLihatDetail={(id) => goToDetail(id, null)}
          emptyText="Belum ada kelas yang absen"
          variant="blue"
        />
        <StatusListCard
          title="Belum Absen"
          kelasArr={kelasBelum}
          siswaPerKelas={siswaPerKelas}
          onLihatSemua={() => goToDetail(null, "belum")}
          onLihatDetail={(id) => goToDetail(id, null)}
          emptyText="Semua kelas sudah absen"
          variant="rose"
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
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

      <div
        id="absensi-list-section"
        className="space-y-3 sm:space-y-4 scroll-mt-6"
      >
        <Toolbar
          title="Absensi"
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          searchValue={searchSiswa}
          setSearchValue={setSearchSiswa}
          searchPlaceholder="Cari kelas / siswa"
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          statusCounts={statusCounts}
          filterKelas={filterKelas}
          setFilterKelas={setFilterKelas}
          kelasList={kelasList}
        />

        {loadingTanggal ? (
          <LoadingState label="Memuat absensi..." />
        ) : kelasUntukDitampilkan.length === 0 ? (
          <div className="rounded-xl sm:rounded-2xl bg-white p-6 sm:p-10 text-center shadow-sm">
            <p className="text-xs sm:text-sm text-neutral-400">
              Tidak ada kelas yang cocok.
            </p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
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
    <div className="overflow-hidden rounded-xl sm:rounded-2xl bg-white shadow-sm transition-all hover:shadow-md">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 text-left transition hover:bg-neutral-50"
      >
        <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 flex-1">
          <div
            className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-semibold ${
              sudahAbsen
                ? "bg-blue-50 text-blue-600"
                : "bg-rose-50 text-rose-500"
            }`}
          >
            {kelas.nama_kelas?.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-semibold text-neutral-800 truncate">
              {kelas.nama_kelas}
            </p>
            <p className="text-[10px] sm:text-xs text-neutral-400">
              {siswaKelas.length} siswa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <div className="hidden sm:flex gap-1.5">
            {STATUS_ORDER.map((s) =>
              counts[s] > 0 ? (
                <span
                  key={s}
                  className={`rounded-full px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-xs font-medium ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} ring-1 ${STATUS_CONFIG[s].ring}`}
                >
                  {STATUS_CONFIG[s].label} {counts[s]}
                </span>
              ) : null,
            )}
          </div>
          <span
            className={`rounded-full px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-xs font-medium whitespace-nowrap ${
              sudahAbsen
                ? "bg-blue-50 text-blue-700"
                : "bg-rose-50 text-rose-600"
            }`}
          >
            {sudahAbsen ? "Sudah" : "Belum"}
          </span>
          <svg
            className={`h-3 w-3 sm:h-4 sm:w-4 shrink-0 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
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
        <div className="border-t border-neutral-100 bg-neutral-50/50 px-3 sm:px-5 py-3 sm:py-4">
          {siswaKelas.length === 0 ? (
            <p className="py-3 sm:py-4 text-center text-xs sm:text-sm text-neutral-400">
              Belum ada data siswa di kelas ini.
            </p>
          ) : (
            <>
              {belumTercatat > 0 && (
                <div className="mb-2 sm:mb-3 rounded-lg sm:rounded-xl bg-amber-50 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-amber-700">
                  {belumTercatat} siswa belum tercatat pada tanggal ini.
                </div>
              )}
              <div className="overflow-x-auto rounded-lg sm:rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-left text-[10px] sm:text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-[8px] sm:text-xs uppercase tracking-wide text-neutral-400">
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-medium">
                        Nama siswa
                      </th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-medium">
                        NIS
                      </th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-medium">
                        Status
                      </th>
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
                            <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-medium text-neutral-800 truncate max-w-[80px] sm:max-w-none">
                              {s.nama_siswa}
                            </td>
                            <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-neutral-500">
                              {s.nis}
                            </td>
                            <td className="px-2 sm:px-4 py-1.5 sm:py-2.5">
                              {cfg ? (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-1.5 sm:px-2.5 py-0.5 text-[8px] sm:text-xs font-medium ${cfg.bg} ${cfg.text} ring-1 ${cfg.ring}`}
                                >
                                  <span
                                    className={`h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full ${cfg.dot}`}
                                  />
                                  {cfg.label}
                                </span>
                              ) : (
                                <span className="rounded-full bg-neutral-100 px-1.5 sm:px-2.5 py-0.5 text-[8px] sm:text-xs text-neutral-400">
                                  Belum
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
