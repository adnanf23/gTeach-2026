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
  absensi: "M2 3h12v10H2V3zM2 7h12M6 3V1M10 3V1",
  nilai: "M2 12h2V8H2v4zM7 12h2V5H7v7zM12 12h2V2h-2v10z",
  pengajaran: "M2 2h12v3H2zM4 5v9M8 5v9M12 5v9",
  profile: "M8 2a3 3 0 100 6 3 3 0 000-6zM2 14c0-3 2.7-5 6-5s6 2 6 5",
  logout: "M10 8H2M7 5l-3 3 3 3M12 2h2v12h-2",
  menu: "M2 4h12M2 8h12M2 12h12",
  close: "M3 3l10 10M13 3L3 13",
  bell: "M8 2a4 4 0 00-4 4c0 4-2 5-2 5h12s-2-1-2-5a4 4 0 00-4-4zM6.5 14a1.5 1.5 0 003 0",
  shield:
    "M8 1.5l5 2v4c0 3-2 5.5-5 7-3-1.5-5-4-5-7v-4l5-2zM6 8l1.5 1.5L10.5 6.5",
  chevron: "M6 4l4 4-4 4",
};

// ── Struktur navigasi: array of groups ──
const NAV_GROUPS = [
  {
    key: "overview",
    label: "Overview",
    href: "/guru-mapel",
    icon: "overview",
    standalone: true,
  },
  {
    key: "harian",
    label: "Harian",
    icon: "absensi",
    children: [
      {
        key: "absensi",
        label: "Absensi Kelas",
        href: "/guru-mapel/harian/absensi",
        icon: "absensi",
      },
      {
        key: "nilai",
        label: "Penilaian",
        href: "/guru-mapel/harian/penilaian",
        icon: "nilai",
      },
      {
        key: "agenda",
        label: "Agenda Mengajar",
        href: "/guru-mapel/harian/agenda",
        icon: "pengajaran",
      },
    ],
  },
  {
    key: "kelas",
    label: "Daftar Kelas",
    href: "/guru-mapel/daftar-kelas",
    icon: "kelas",
    standalone: true,
  },
];

const PROFILE_NAV = [
  {
    key: "profile",
    label: "Profil Saya",
    href: "/guru-mapel/profile",
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

// ── Konten sidebar: dipakai bersama desktop & drawer mobile ──
const SidebarContent = ({
  user,
  navGroups,
  activeKey,
  activeGroupKey,
  isProfileActive,
  pathname,
  onNavigate,
  onLogout,
}) => {
  const [openGroups, setOpenGroups] = useState(() =>
    activeGroupKey ? { [activeGroupKey]: true } : {},
  );

  useEffect(() => {
    if (activeGroupKey) {
      setOpenGroups((prev) => ({ ...prev, [activeGroupKey]: true }));
    }
  }, [activeGroupKey]);

  const toggleGroup = (key) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
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
          {navGroups.map((group) => {
            // ── Item standalone (Overview / Daftar Kelas) ──
            if (group.standalone) {
              const isActive = activeKey === group.key && !isProfileActive;
              return (
                <button
                  key={group.key}
                  onClick={() => onNavigate(group.href)}
                  className={navClass(isActive)}
                >
                  <span className={navIconClass(isActive)}>
                    <Icon d={icons[group.icon]} size={16} />
                  </span>
                  <span className="flex-1">{group.label}</span>
                </button>
              );
            }

            // ── Group dengan children (dropdown) ──
            const isOpen = !!openGroups[group.key];
            const hasActiveChild = group.children.some(
              (c) => c.key === activeKey && !isProfileActive,
            );

            return (
              <div key={group.key}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-[13px] transition-all ${
                    hasActiveChild
                      ? "text-[#3b6ef5] font-semibold"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                  }`}
                >
                  <span
                    className={`flex-shrink-0 ${
                      hasActiveChild ? "text-[#3b6ef5]" : "text-gray-400"
                    }`}
                  >
                    <Icon d={icons[group.icon]} size={16} />
                  </span>
                  <span className="flex-1">{group.label}</span>
                  <span
                    className={`flex-shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-90" : ""
                    } ${hasActiveChild ? "text-[#3b6ef5]" : "text-gray-400"}`}
                  >
                    <Icon d={icons.chevron} size={12} strokeWidth={1.8} />
                  </span>
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="flex flex-col gap-0.5 mt-0.5 ml-3 pl-3 border-l border-gray-100">
                    {group.children.map(({ key, label, icon, href }) => {
                      const isActive = activeKey === key && !isProfileActive;
                      return (
                        <button
                          key={key}
                          onClick={() => onNavigate(href)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[12.5px] transition-all ${
                            isActive
                              ? "bg-[#eef3ff] text-[#3b6ef5] font-medium"
                              : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                          }`}
                        >
                          <span
                            className={`flex-shrink-0 ${
                              isActive ? "text-[#3b6ef5]" : "text-gray-400"
                            }`}
                          >
                            <Icon d={icons[icon]} size={14} />
                          </span>
                          <span className="flex-1">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
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
          <p className="text-[13px] font-semibold mt-3">Portal Guru Mapel</p>
          <p className="text-[11px] text-white/60 mt-1 leading-snug">
            Kelola absensi, penilaian, dan agenda mengajar Anda.
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
};

export default function GuruMapelLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  // Gesture swipe drawer mobile
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

  // Auth + role guard
  useEffect(() => {
    if (!pb.authStore.isValid) {
      router.replace("/login");
      return;
    }

    const currentUser = pb.authStore.model;

    const allowedRoles = ["guru mapel", "guru pendamping", "ict"];
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
        window.location.replace("/login");
      }
    }
  };

  const handleNavigate = (href) => {
    router.push(href);
    setNavOpen(false);
  };

  const navGroups = NAV_GROUPS;

  // ── Flatten semua item untuk lookup ──
  const allNavItems = navGroups.flatMap((g) =>
    g.standalone ? [g] : g.children,
  );

  // ── Cari item aktif ──
  const activeItem =
    allNavItems.find((n) => pathname === n.href) ||
    allNavItems.find(
      (n) =>
        n.href !== "/guru-mapel" &&
        n.href !== "/guru-mapel/" &&
        pathname.startsWith(n.href),
    );

  const activeKey = activeItem?.key ?? "overview";

  // ── Cari group yang berisi item aktif (untuk auto-expand) ──
  const activeGroupKey = navGroups.find((g) =>
    g.standalone
      ? g.key === activeKey
      : g.children?.some((c) => c.key === activeKey),
  )?.key;

  const isProfileActive = pathname === "/guru-mapel/profile";
  const activeProfileNav = PROFILE_NAV.find((n) => pathname === n.href);

  const pageTitle =
    isProfileActive && activeProfileNav
      ? activeProfileNav.label
      : (activeItem?.label ?? "Overview");

  const fullName = user?.nama_lengkap || user?.name || user?.username || "";
  const shortName = shortenName(fullName) || "Guru Mapel";
  const avatarLetter = (fullName || "G")[0].toUpperCase();

  const roleLabel =
    user?.role === "guru mapel"
      ? "Guru Mapel"
      : user?.role === "guru pendamping"
        ? "Pendamping"
        : user?.role?.toUpperCase() || "USER";

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
      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="hidden lg:flex relative flex-col w-[240px] min-w-[240px] bg-white overflow-y-auto no-scrollbar my-4 ml-4 rounded-3xl shadow-[0_8px_30px_rgba(99,120,200,0.10)]">
        <SidebarContent
          user={user}
          navGroups={navGroups}
          activeKey={activeKey}
          activeGroupKey={activeGroupKey}
          isProfileActive={isProfileActive}
          pathname={pathname}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── DRAWER MOBILE ── */}
      <div
        className={`lg:hidden fixed inset-0 z-50 ${
          navOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!navOpen}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
            navOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setNavOpen(false)}
        />

        <aside
          className={`absolute left-0 top-0 h-full w-[260px] max-w-[82vw] bg-white rounded-r-3xl flex flex-col overflow-y-auto no-scrollbar shadow-[0_10px_40px_rgba(99,120,200,0.25)] transition-transform duration-300 ease-out ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <SidebarContent
            user={user}
            navGroups={navGroups}
            activeKey={activeKey}
            activeGroupKey={activeGroupKey}
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
              onClick={() => router.push("/guru-mapel/profile")}
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
                  {roleLabel}
                </span>
              </span>
            </button>
          </div>
        </header>

        {/* Topbar MOBILE */}
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
              onClick={() => router.push("/guru-mapel/profile")}
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
