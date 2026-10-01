"use client";

import Cookies from "js-cookie";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { createSystemLog } from "@/lib/logger";
import "@/app/globals.css";

const Icon = ({ d, size = 14, strokeWidth = 1.4 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
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
  profile: "M8 2a3 3 0 100 6 3 3 0 000-6zM2 14c0-3 2.7-5 6-5s6 2 6 5",
  leger: "M2 4h12v10H2V4z M4 8h8 M4 12h6",
  catatan: "M3 2h7l3 3v9H3V2z M10 2v3h3 M5 8h6 M5 11h4",
  bell: "M8 2a4 4 0 00-4 4c0 4-2 5-2 5h12s-2-1-2-5a4 4 0 00-4-4zM6.5 14a1.5 1.5 0 003 0",
  shield:
    "M8 1.5l5 2v4c0 3-2 5.5-5 7-3-1.5-5-4-5-7v-4l5-2zM6 8l1.5 1.5L10.5 6.5",
};

// Portal Wali Murid — hanya Overview, Absensi, dan Rapor
const NAV = [
  {
    key: "overview",
    label: "Overview",
    href: "/wali-murid/",
    icon: "overview",
  },
  {
    key: "absensi",
    label: "Absensi",
    href: "/wali-murid/absensi",
    icon: "absensi",
  },
  { key: "rapor", label: "Rapor", href: "/wali-murid/rapor", icon: "nilai" },
];

const ICT_NAV = [
  {
    key: "system_logs",
    label: "System Logs",
    href: "/walikelas/system-logs",
    icon: "log",
  },
];

const PROFILE_NAV = [
  {
    key: "profile",
    label: "Profil Saya",
    href: "/walikelas/profile",
    icon: "profile",
  },
];

const shortenName = (full) => {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
};

const navClass = (isActive) =>
  `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-[13px] transition-all ${
    isActive
      ? "bg-[#3b6ef5] text-white font-medium shadow-[0_8px_18px_rgba(59,110,245,0.35)]"
      : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
  }`;

const navIconClass = (isActive) =>
  `flex-shrink-0 ${isActive ? "text-white" : "text-gray-400"}`;

const SectionLabel = ({ children }) => (
  <p className="px-3.5 pt-4 pb-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
    {children}
  </p>
);

// Konten sidebar — dipakai bersama oleh desktop & drawer mobile
const SidebarContent = ({
  user,
  currentNavList,
  activeKey,
  isProfileActive,
  pathname,
  onNavigate,
  onLogout,
}) => (
  <>
    {/* Logo */}
    <div className="flex items-center gap-2.5 px-5 pt-5 pb-2">
      <div className="min-w-0">
        <h1 className="text-[16px] font-bold text-gray-800 leading-tight truncate">
          gTech Academic
        </h1>
        <p className="text-[10.5px] text-gray-400 capitalize">
          {user?.role ?? ""}
        </p>
      </div>
    </div>

    {/* Menu */}
    <nav className="px-3 flex-1">
      <SectionLabel>Menu</SectionLabel>
      <div className="flex flex-col gap-1">
        {currentNavList.map(({ key, label, icon, href }) => {
          const isActive = activeKey === key && !isProfileActive;
          return (
            <button
              key={key}
              onClick={() => onNavigate(href)}
              className={navClass(isActive)}
            >
              <span className={navIconClass(isActive)}>
                <Icon d={icons[icon]} size={16} />
              </span>
              <span className="flex-1">{label}</span>
            </button>
          );
        })}
      </div>

      <SectionLabel>Akun</SectionLabel>
      <div className="flex flex-col gap-1">
        {PROFILE_NAV.map(({ key, label, icon, href }) => {
          const isActive = pathname === href;
          return (
            <button
              key={key}
              onClick={() => onNavigate(href)}
              className={navClass(isActive)}
            >
              <span className={navIconClass(isActive)}>
                <Icon d={icons[icon]} size={16} />
              </span>
              <span className="flex-1">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>

    {/* Kartu bawah */}
    <div className="p-3">
      <div className="rounded-2xl bg-[#1c2033] text-white p-4">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
          <Icon d={icons.shield} size={16} strokeWidth={1.5} />
        </div>
        <p className="text-[13px] font-semibold mt-3">Portal Wali Murid</p>
        <p className="text-[11px] text-white/60 mt-1 leading-snug">
          Pantau absensi dan rapor anak Anda dengan mudah.
        </p>
        <button
          onClick={onLogout}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-[#4d8bff] hover:bg-[#3b6ef5] py-2 text-[12px] font-medium transition-colors"
        >
          <Icon d={icons.logout} size={13} strokeWidth={1.6} />
          Keluar
        </button>
      </div>
    </div>
  </>
);

export default function WaliMuridLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  // Gesture swipe untuk drawer mobile
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    // abaikan kalau gerakannya lebih vertikal (biar scroll tetap jalan)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0 && touchStartX.current < 60 && !navOpen) {
        setNavOpen(true);
      } else if (dx < 0 && navOpen) {
        setNavOpen(false);
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Tutup drawer setiap pindah halaman
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Lock scroll body saat drawer mobile terbuka
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (navOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [navOpen]);

  useEffect(() => {
    if (!pb.authStore.isValid) {
      router.replace("/login");
      return;
    }

    const currentUser = pb.authStore.model;

    const allowedRoles = ["wali murid"];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      router.replace("/login");
      return;
    }

    setUser(currentUser);
    setChecked(true);
  }, [router]);

  const handleLogout = async () => {
    try {
      const currentEndpoint =
        typeof window !== "undefined" ? window.location.pathname : "-";

      const targetUser = user || pb.authStore.model;

      createSystemLog({
        type: "succes",
        msg: `User '${targetUser?.nama_lengkap || "User"} ( ${targetUser?.role ?? "-"} )' berhasil logout dari sistem.`,
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
        window.location.replace("/login-wali-murid");
      }
    }
  };

  const handleNavigate = (href) => {
    router.push(href);
    setNavOpen(false);
  };

  const currentNavList = user?.role === "ict" ? [...NAV, ...ICT_NAV] : NAV;

  const activeKey =
    currentNavList.find((n) => pathname === n.href)?.key ||
    currentNavList.find(
      (n) => n.href !== "/admin" && pathname.startsWith(n.href),
    )?.key ||
    "overview";

  const activeNav =
    currentNavList.find((n) => n.key === activeKey) || currentNavList[0];

  const isProfileActive =
    pathname === "/walikelas/profile" || pathname === "/walikelas/settings";
  const activeProfileNav = PROFILE_NAV.find((n) => pathname === n.href);

  const pageTitle =
    isProfileActive && activeProfileNav
      ? activeProfileNav.label
      : (activeNav?.label ?? "");

  const fullName = user?.nama_lengkap || user?.name || user?.username || "";
  const shortName = shortenName(fullName) || "Wali Murid";
  const avatarLetter = (fullName || "W")[0].toUpperCase();

  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-400 text-[13px]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          <span>Memuat…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen min-h-[600px] bg-gray-50 text-[13px] font-sans overflow-hidden text-black"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── SIDEBAR DESKTOP (kartu melayang) ── */}
      <aside className="hidden lg:flex relative flex-col w-[240px] min-w-[240px] bg-white overflow-y-auto no-scrollbar my-4 ml-4 rounded-3xl shadow-[0_8px_30px_rgba(99,120,200,0.10)]">
        <SidebarContent
          user={user}
          currentNavList={currentNavList}
          activeKey={activeKey}
          isProfileActive={isProfileActive}
          pathname={pathname}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── DRAWER MOBILE (geser dari kiri, bentuk sama seperti desktop) ── */}
      <div
        className={`lg:hidden fixed inset-0 z-50 ${
          navOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!navOpen}
      >
        {/* Overlay */}
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
            navOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setNavOpen(false)}
        />

        {/* Panel drawer */}
        <aside
          className={`absolute left-0 top-0 h-full w-[260px] max-w-[82vw] bg-white rounded-r-3xl flex flex-col overflow-y-auto no-scrollbar shadow-[0_10px_40px_rgba(99,120,200,0.25)] transition-transform duration-300 ease-out ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <SidebarContent
            user={user}
            currentNavList={currentNavList}
            activeKey={activeKey}
            isProfileActive={isProfileActive}
            pathname={pathname}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        </aside>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar DESKTOP */}
        <header className="no-print hidden lg:flex items-center gap-4 px-6 pt-5 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold text-gray-900 leading-tight truncate">
              {pageTitle}
            </h2>
            <p className="text-[12px] text-gray-400 mt-0.5">{today}</p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              aria-label="Notifikasi"
              className="relative w-10 h-10 rounded-full bg-white text-gray-500 hover:text-gray-700 flex items-center justify-center shadow-[0_4px_14px_rgba(99,120,200,0.12)] transition-colors"
            >
              <Icon d={icons.bell} size={16} strokeWidth={1.5} />
              <span className="absolute top-2.5 right-3 w-2 h-2 rounded-full bg-red-400 ring-2 ring-white" />
            </button>

            <button
              onClick={() => router.push("/walikelas/profile")}
              className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full bg-white shadow-[0_4px_14px_rgba(99,120,200,0.12)] hover:shadow-[0_6px_18px_rgba(99,120,200,0.2)] transition-shadow text-left"
            >
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7aa5ff] to-[#3b6ef5] text-white flex items-center justify-center text-[12px] font-bold flex-shrink-0">
                {avatarLetter}
              </span>
              <span className="min-w-0 max-w-[140px]">
                <span className="block text-[12px] font-semibold text-gray-800 truncate leading-tight">
                  {shortName}
                </span>
                <span className="block text-[10.5px] text-gray-400 capitalize leading-tight">
                  {user?.role ?? ""}
                </span>
              </span>
            </button>
          </div>
        </header>

        {/* Topbar MOBILE — hamburger + judul + avatar. Sidebar buka dari kiri. */}
        <header className="no-print lg:hidden sticky top-0 z-30 bg-[#eef1fc] flex-shrink-0 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-3 px-4 pt-3 pb-3">
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Buka menu"
              className="w-10 h-10 rounded-xl bg-white text-slate-700 flex items-center justify-center shadow-[0_4px_14px_rgba(99,120,200,0.12)] active:scale-95 transition-transform flex-shrink-0"
            >
              <Icon d={icons.menu} size={18} strokeWidth={1.8} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-400 truncate">
                Halo, {shortName}
              </p>
              <h2 className="text-[18px] font-bold text-slate-800 leading-tight truncate">
                {pageTitle}
              </h2>
            </div>

            <button
              aria-label="Profil saya"
              onClick={() => router.push("/walikelas/profile")}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7aa5ff] to-[#4d8bff] text-white flex items-center justify-center text-[13px] font-bold ring-2 ring-white shadow-[0_4px_14px_rgba(77,139,255,0.3)] active:scale-95 transition-transform flex-shrink-0"
            >
              {avatarLetter}
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 no-scrollbar overflow-y-auto p-4 sm:p-5 lg:px-6 lg:pt-2 lg:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
