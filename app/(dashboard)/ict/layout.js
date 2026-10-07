"use client";

import Cookies from "js-cookie";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { createSystemLog } from "@/lib/logger";
import "@/app/globals.css";

const Icon = ({ d, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const icons = {
  overview: "M2 2h5v5H2V2zM9 2h5v5H9V2zM2 9h5v5H2V9zM9 9h5v5H9V9z",
  kelas: "M2 3h12v10H2V3zM6 3v10M2 7h4",
  guru: "M8 2a3 3 0 100 6 3 3 0 000-6zM2 14c0-3 2.7-5 6-5s6 2 6 5",
  siswa:
    "M5 2a3 3 0 100 6 3 3 0 000-6zM1 14c0-2.5 1.8-4 4-4M11 8a2 2 0 100-4 2 2 0 000 4M14 14c0-2-1.3-3-3-3",
  pengajaran: "M2 2h12v3H2zM4 5v9M8 5v9M12 5v9",
  pembelajaran:
    "M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm0 3h10M6 8h4M6 11h4",
  nilai: "M2 12h2V8H2v4zM7 12h2V5H7v7zM12 12h2V2h-2v10z",
  absensi: "M2 3h12v10H2V3zM2 7h12M6 3V1M10 3V1",
  settings: "M8 5a3 3 0 100 6 3 3 0 000-6zM8 1v2M8 13v2M1 8h2M13 8h2",
  logout: "M10 8H2M7 5l-3 3 3 3M12 2h2v12h-2",
  menu: "M2 4h12M2 8h12M2 12h12",
  close: "M3 3l10 10M13 3L3 13",
  mapel:
    "M2 4.5A2.5 2.5 0 014.5 2H14v10.5a1 1 0 01-1 1H4.5A2.5 2.5 0 012 11V4.5z M2 11h12 M6 2v10",
  pengaturan: "M8 5a3 3 0 100 6 3 3 0 000-6zM8 1v2M8 13v2M1 8h2M13 8h2",
  log: "M2 2h12v12H2V2zM5 6h6M5 9h6M5 12h3",
  bell: "M4 11V7a4 4 0 118 0v4l1 2H3l1-2zM6.5 14.5a1.5 1.5 0 003 0",
  chevron: "M4 6l4 4 4-4",
  print: "M4 6V2h8v4M4 11H2V6h12v5h-2M4 9h8v5H4V9z",
  agenda:
    "M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zM3 6h10M6 2v2M10 2v2",
  kasus: "M8 2l6 12H2L8 2zM8 7v3M8 12h.01",
  rapor:
    "M4 2h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zM10 2v3h3M6 9h5M6 12h3",
  monitoring: "M2 12l3-4 3 2 3-5 3 3",
  server: "M2 3h12v3H2V3zM2 10h12v3H2v-3zM4 4.5h.01M4 11.5h.01",
  resource:
    "M4 4h8v8H4V4zM6 1v3M10 1v3M6 12v3M10 12v3M1 6h3M1 10h3M12 6h3M12 10h3",
  summary: "M2 12h2V8H2v4zM7 12h2V4H7v8zM12 12h2V6h-2v6z",
};

const NAV_SECTIONS = [
  {
    items: [
      {
        type: "item",
        key: "overview",
        label: "Overview",
        href: "/ict",
        icon: "overview",
      },
      {
        type: "group",
        key: "data-utama",
        label: "Data Utama",
        icon: "siswa",
        children: [
          {
            key: "guru",
            label: "Data Guru",
            href: "/ict/data-utama/data-guru",
            icon: "guru",
          },
          {
            key: "kelas",
            label: "Data Kelas",
            href: "/ict/data-utama/data-kelas",
            icon: "kelas",
          },
          {
            key: "siswa",
            label: "Data Siswa",
            href: "/ict/data-utama/data-siswa",
            icon: "siswa",
          },
          {
            key: "wali-murid",
            label: "Akun Siswa",
            href: "/ict/data-utama/wali-murid",
            icon: "siswa",
          },
        ],
      },
      {
        type: "group",
        key: "manajemen-utama",
        label: "Manajemen Utama",
        icon: "pengajaran",
        children: [
          {
            key: "mapel",
            label: "Mata Pelajaran",
            href: "/ict/manajemen-utama/mapel",
            icon: "mapel",
          },
          {
            key: "ploting-guru",
            label: "Ploting Guru",
            href: "/ict/manajemen-utama/ploting-guru",
            icon: "pengajaran",
          },
        ],
      },
      {
        type: "group",
        key: "nilai-siswa",
        label: "Nilai Siswa",
        icon: "nilai",
        children: [
          {
            key: "nilai",
            label: "Rekap Nilai",
            href: "/ict/nilai-siswa/nilai",
            icon: "nilai",
          },
          {
            key: "presentase",
            label: "Presentase",
            href: "/ict/presentase",
            icon: "nilai",
          },
        ],
      },
      {
        type: "group",
        key: "monitoring-harian",
        label: "Monitoring Harian",
        icon: "absensi",
        children: [
          {
            key: "absensi",
            label: "Absensi",
            href: "/ict/monitoring-harian/absensi",
            icon: "absensi",
          },
          {
            key: "agenda-mengajar",
            label: "Agenda Mengajar",
            href: "/ict/monitoring-harian/agenda-mengajar",
            icon: "agenda",
          },
        ],
      },
      {
        type: "group",
        key: "ujian",
        label: "Ujian",
        icon: "pembelajaran",
        children: [
          {
            key: "manajemen-ujian",
            label: "Manajemen Ujian",
            href: "/ict/ujian/manajemen-ujian",
            icon: "pembelajaran",
          },
        ],
      },
      {
        type: "group",
        key: "rapor",
        label: "Rapor",
        icon: "rapor",
        children: [
          {
            key: "pengaturan-rapor",
            label: "Pengaturan Rapor",
            href: "/ict/rapor/pengaturan",
            icon: "pengaturan",
          },
          {
            key: "monitoring-rapor",
            label: "Monitoring Kesiapan Rapor",
            href: "/ict/rapor/monitoring-kesiapan",
            icon: "monitoring",
          },
          {
            key: "print-rapor",
            label: "Print Rapor",
            href: "/ict/rapor/print",
            icon: "print",
          },
        ],
      },
      {
        type: "item",
        key: "catatan-kasus",
        label: "Catatan Kasus",
        href: "/ict/catatan-kasus",
        icon: "kasus",
      },
    ],
  },
  {
    title: "System Dashboard",
    ictOnly: true,
    items: [
      {
        type: "item",
        key: "system_logs",
        label: "System Log",
        href: "/ict/system-logs",
        icon: "log",
      },
      {
        type: "group",
        key: "server-monitoring",
        label: "Server Monitoring",
        icon: "server",
        children: [
          {
            key: "sumber-daya",
            label: "Sumber Daya",
            href: "/ict/server-monitoring/sumber-daya",
            icon: "resource",
          },
          {
            key: "log-server",
            label: "Log Server",
            href: "/ict/server-monitoring/log-server",
            icon: "log",
          },
          {
            key: "summary",
            label: "Summary",
            href: "/ict/server-monitoring/summary",
            icon: "summary",
          },
        ],
      },
    ],
  },
];

function normalizePath(p = "") {
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/** Sapaan berdasarkan jam lokal perangkat */
function getGreeting() {
  const hour = new Date().getHours();

  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Ambil nama depan, abaikan gelar pendek seperti "M." */
function getFirstName(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Pengguna";
  return parts.find((w) => !/^[A-Za-z]\.$/.test(w)) || parts[0];
}

/* ───────────────────────── Nav components ───────────────────────── */

function NavLeaf({ item, isActive, onNavigate, indent = false }) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={`flex w-full items-center gap-3 rounded-xl text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30 ${
          indent ? "px-3 py-2 text-[12.5px]" : "px-3.5 py-2.5"
        } ${
          isActive
            ? "bg-gray-900 font-medium text-white shadow-sm"
            : "text-gray-500 hover:bg-white hover:text-gray-900"
        }`}
      >
        <span className={`flex-shrink-0 ${isActive ? "" : "opacity-60"}`}>
          <Icon d={icons[item.icon]} size={indent ? 14 : 16} />
        </span>
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
    </li>
  );
}

function NavGroup({ group, activeKey, open, onToggle, onNavigate }) {
  const isActive = group.children.some((c) => c.key === activeKey);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30 ${
          isActive
            ? "font-medium text-gray-900"
            : "text-gray-500 hover:bg-white hover:text-gray-900"
        }`}
      >
        <span className={`flex-shrink-0 ${isActive ? "" : "opacity-60"}`}>
          <Icon d={icons[group.icon]} />
        </span>
        <span className="flex-1 truncate text-left">{group.label}</span>
        <span
          className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <Icon d={icons.chevron} size={14} />
        </span>
      </button>

      {open && (
        <ul className="mt-1 ml-[18px] space-y-0.5 border-l border-gray-200 pl-2">
          {group.children.map((child) => (
            <NavLeaf
              key={child.key}
              item={child}
              isActive={child.key === activeKey}
              onNavigate={onNavigate}
              indent
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ───────────────────────── Layout ───────────────────────── */

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Status buka/tutup tiap group dropdown (key → boolean)
  const [openGroups, setOpenGroups] = useState({});

  /* ── Auth guard ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!pb.authStore.isValid) {
      router.replace("/login");
      return;
    }

    const currentUser = pb.authStore.model;

    if (currentUser?.role !== "ict" && currentUser?.role !== "admin") {
      router.replace("/login");
      return;
    }

    setUser(currentUser);
    setChecked(true);
  }, [router]);

  /* ── Klik luar / Escape untuk dropdown profil ───────────────── */
  useEffect(() => {
    if (!profileOpen) return;
    function onDown(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  /* ── Filter section sesuai role ─────────────────────────────── */
  const sections = useMemo(() => {
    return NAV_SECTIONS.filter((s) => !s.ictOnly || user?.role === "ict");
  }, [user]);

  /* ── Flatten untuk deteksi menu aktif ───────────────────────── */
  const flatNav = useMemo(() => {
    const out = [];
    sections.forEach((section) =>
      section.items.forEach((item) => {
        if (item.type === "group") {
          item.children.forEach((c) =>
            out.push({ ...c, groupLabel: item.label }),
          );
        } else {
          out.push(item);
        }
      }),
    );
    return out;
  }, [sections]);

  /* ── Menu aktif (cocokkan href terpanjang dulu) ─────────────── */
  const path = normalizePath(pathname || "");
  const activeItem =
    [...flatNav]
      .filter((n) => n.key !== "overview")
      .sort((a, b) => b.href.length - a.href.length)
      .find((n) => path === n.href || path.startsWith(n.href + "/")) ||
    flatNav[0];
  const activeKey = activeItem?.key;
  const isOverview = activeKey === "overview";

  /* ── Auto-buka group yang memuat menu aktif ─────────────────── */
  useEffect(() => {
    if (!activeKey) return;
    const parent = sections
      .flatMap((s) => s.items)
      .find(
        (it) =>
          it.type === "group" && it.children.some((c) => c.key === activeKey),
      );
    if (parent) {
      setOpenGroups((prev) =>
        prev[parent.key] ? prev : { ...prev, [parent.key]: true },
      );
    }
  }, [activeKey, sections]);

  const toggleGroup = (key) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  /* ── Logout ─────────────────────────────────────────────────── */
  const handleLogout = async () => {
    try {
      const currentEndpoint =
        typeof window !== "undefined" ? window.location.pathname : "-";
      const targetUser = user || pb.authStore.model;

      createSystemLog({
        type: "succes",
        msg: `User '${targetUser?.nama_lengkap || "User"}( ${targetUser?.role ?? "-"} )' berhasil logout dari sistem.`,
        endpoint: currentEndpoint,
        statusCode: 200,
        payload: {
          username: targetUser?.username,
          role: targetUser?.role,
        },
      }).catch((err) => console.error("Gagal mencatat log logout:", err));

      pb.authStore.clear();
      Cookies.remove("pb_auth", { path: "/" });
      setUser(null);
    } catch (logError) {
      console.error("Gagal proses logout:", logError);
    } finally {
      if (typeof window !== "undefined") {
        window.location.replace("/login");
      }
    }
  };

  const displayName =
    user?.nama_lengkap || user?.name || user?.username || "Pengguna";
  const firstName = getFirstName(displayName);
  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AD";
  const roleLabel = user?.role === "ict" ? "ICT" : "Admin";

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-gray-400 text-[13px]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          <span>Memuat…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-slate-50 text-[13px] font-sans overflow-hidden text-black">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-[2px] z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        className={`no-print fixed lg:relative inset-y-0 left-0 z-30 w-[248px] min-w-[248px] bg-white lg:bg-transparent shadow-xl lg:shadow-none flex flex-col transition-transform duration-200 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-semibold leading-tight tracking-tight text-gray-900">
              gTeach Academic
            </h1>
            <p className="text-[11px] text-gray-400">{roleLabel}</p>
          </div>
          <button
            className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup menu"
          >
            <Icon d={icons.close} />
          </button>
        </div>

        {/* Navigasi */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pt-1 pb-8">
          {sections.map((section, si) => (
            <div
              key={section.title || `section-${si}`}
              className={si > 0 ? "mt-5" : ""}
            >
              {section.title && (
                <p className="px-3.5 pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.title}
                </p>
              )}
              <ul className="space-y-1">
                {section.items.map((item) =>
                  item.type === "group" ? (
                    <NavGroup
                      key={item.key}
                      group={item}
                      activeKey={activeKey}
                      open={!!openGroups[item.key]}
                      onToggle={() => toggleGroup(item.key)}
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  ) : (
                    <NavLeaf
                      key={item.key}
                      item={item}
                      isActive={activeKey === item.key}
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  ),
                )}
              </ul>
            </div>
          ))}

          {/* Spacer tambahan agar menu terbawah tidak menempel ke dasar sidebar */}
          <div className="h-10" aria-hidden="true" />
        </nav>

        {/* Kartu gelap: pintasan Cetak Rapor */}
        <div className="flex-shrink-0 p-3 [@media(max-height:720px)]:hidden">
          <div className="rounded-2xl bg-gray-900 p-4 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-900">
              <Icon d={icons.print} />
            </span>
            <p className="mt-3 text-[15px] font-semibold leading-tight">
              Cetak Rapor
            </p>
            <p className="mt-1 text-[11px] leading-snug text-gray-400">
              Siapkan dan cetak rapor siswa per kelas.
            </p>
            <Link
              href="/ict/rapor/print"
              onClick={() => setSidebarOpen(false)}
              className="mt-3 flex h-9 w-full items-center justify-center rounded-xl bg-white/10 text-[12px] font-medium text-white transition-colors hover:bg-white/20"
            >
              Buka halaman
            </Link>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      {/* PERBAIKAN: Tambahkan min-h-0 di sini agar flexbox tidak memaksa tinggi ke bawah */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden min-h-0">
        {/* Topbar */}
        <header className="no-print flex h-16 flex-shrink-0 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-gray-600 shadow-sm ring-1 ring-gray-100 hover:text-gray-900 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
          >
            <Icon d={icons.menu} />
          </button>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Notifikasi -> System Logs (khusus ICT) */}
            {user?.role === "ict" && (
              <Link
                href="/ict/system-logs"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm ring-1 ring-gray-100 transition-colors hover:text-gray-900"
                aria-label="Buka System Logs"
                title="System Logs"
              >
                <Icon d={icons.bell} />
              </Link>
            )}

            {/* Profil */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                className="flex items-center gap-2.5 rounded-xl p-1 pr-2 transition-colors hover:bg-white sm:pr-3"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white">
                  {initials}
                </span>
                <span className="hidden min-w-0 text-left leading-tight sm:block">
                  <span className="block max-w-[140px] truncate text-[13px] font-semibold text-gray-900">
                    {displayName}
                  </span>
                  <span className="block max-w-[140px] truncate text-[11px] text-gray-400">
                    {user?.email || roleLabel}
                  </span>
                </span>
                <span
                  className={`hidden text-gray-400 transition-transform sm:block ${
                    profileOpen ? "rotate-180" : ""
                  }`}
                >
                  <Icon d={icons.chevron} size={14} />
                </span>
              </button>

              {profileOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-2xl border border-gray-100 bg-white p-1.5 shadow-xl"
                >
                  <div className="px-3 py-2.5">
                    <p className="truncate text-[13px] font-semibold text-gray-900">
                      {displayName}
                    </p>
                    <p className="truncate text-[11px] text-gray-400">
                      {user?.email || "-"}
                    </p>
                    <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      {roleLabel}
                    </span>
                  </div>
                  <div className="my-1 h-px bg-gray-100" />
                  <Link
                    href="/ict/rapor/pengaturan"
                    role="menuitem"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <span className="opacity-60">
                      <Icon d={icons.settings} />
                    </span>
                    Pengaturan
                  </Link>
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] text-red-500 hover:bg-red-50"
                  >
                    <Icon d={icons.logout} />
                    Keluar
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        {/* PERBAIKAN: Tambahkan min-h-0 di sini juga agar scroll berjalan di dalam main */}
        <main className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6 pt-2 sm:px-6 lg:px-8 min-h-0">
          <div className="no-print mb-5">
            <h1 className="text-[22px] font-semibold tracking-tight text-gray-900 sm:text-[26px]">
              {isOverview ? (
                <>
                  {getGreeting()},<br /> {displayName} 👋
                </>
              ) : (
                (activeItem?.label ?? "")
              )}
            </h1>
            {isOverview && (
              <p className="mt-1 text-[12.5px] text-gray-500">
                Berikut ringkasan sistem sekolah hari ini.
              </p>
            )}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
