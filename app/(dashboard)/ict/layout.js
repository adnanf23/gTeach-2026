"use client";

import Cookies from "js-cookie";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { createSystemLog } from "@/lib/logger";

const Icon = ({ d, size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
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
  // Tambahan ikon baru untuk System Logs ICT
  log: "M2 2h12v12H2V2zM5 6h6M5 9h6M5 12h3",
};

// Array NAV utama untuk Administrator Sekolah
const NAV = [
  { key: "overview", label: "Overview", href: "/ict/", icon: "overview" },
  { key: "guru", label: "Data Guru", href: "/ict/data-guru", icon: "guru" },
  { key: "kelas", label: "Data Kelas", href: "/ict/data-kelas", icon: "kelas" },
  { key: "siswa", label: "Data Siswa", href: "/ict/data-siswa", icon: "siswa" },
  {
    key: "Mata Pelajaran",
    label: "Mata Pelajaran",
    href: "/ict/mapel",
    icon: "mapel",
  },
  {
    key: "absensi",
    label: "Absensi Kelas",
    href: "/ict/absensi",
    icon: "absensi",
  },
  {
    key: "pengajaran",
    label: "Pengajaran",
    href: "/ict/pengajaran",
    icon: "pengajaran",
  },
  {
    key: "pembelajaran",
    label: "Pembelajaran",
    href: "/ict/pembelajaran",
    icon: "pembelajaran",
  },
  { key: "nilai", label: "Rekap Nilai", href: "/ict/nilai", icon: "nilai" },
  {
    key: "pengaturan ajaran",
    label: "Pengaturan",
    href: "/ict/pengaturan-ajaran",
    icon: "pengaturan",
  },
  {
    key: "cetak",
    label: "Cetak Rapor",
    href: "/ict/cetak-rapor",
    icon: "absensi",
  },
];

// Menu tambahan khusus jika yang login adalah akun dengan role 'ict'
const ICT_NAV = [
  {
    key: "system_logs",
    label: "System Logs",
    href: "/ict/system-logs",
    icon: "log",
  },
];

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (pb.authStore.isValid) {
      setUser(pb.authStore.model);
    } else {
      router.push("/login");
    }
  }, [router]);

  // 1. Tambahkan keyword 'async' di sini
  const handleLogout = async () => {
    try {
      const currentEndpoint =
        typeof window !== "undefined" ? window.location.pathname : "-";

      // 1. Ambil snapshot data user saat ini sebelum dihapus dari state
      const targetUser = user || pb.authStore.model;

      // 2. Tembak log ke backend TANPA await agar user tidak menunggu loading
      createSystemLog({
        type: "succes", // Menyiasati typo 'succes' di database
        msg: `User '${targetUser?.nama_lengkap || "User"}( ${targetUser?.role} )' berhasil logout dari sistem.`,
        endpoint: currentEndpoint,
        statusCode: 200,
        payload: {
          username: targetUser?.username,
          role: targetUser?.role,
        },
      }).catch((err) => console.error("Gagal mencatat log logout:", err));
      // .catch di atas menjaga jika server log error, aplikasi tidak crash

      // 3. Langsung eksekusi proses bersih-bersih auth (Instan bagi user)
      pb.authStore.clear();
      Cookies.remove("pb_auth", { path: "/" });
      setUser(null);
      router.replace("/login");
    } catch (logError) {
      // Fallback jika ada error fatal di block try
      console.error("Gagal proses logout:", logError);
      // Tetap paksa pindah halaman jika terjadi error terduga
      router.replace("/login");
    }
  };

  // Menggabungkan menu utama dengan menu ICT secara dinamis jika role sesuai
  const currentNavList = user?.role === "ict" ? [...NAV, ...ICT_NAV] : NAV;

  const activeKey =
    currentNavList.find((n) => pathname === n.href)?.key ||
    currentNavList.find(
      (n) => n.href !== "/admin" && pathname.startsWith(n.href),
    )?.key ||
    "overview";

  const activeNav =
    currentNavList.find((n) => n.key === activeKey) || currentNavList[0];

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user?.username?.slice(0, 2).toUpperCase() || "AD";

  return (
    <div className=" flex h-screen min-h-[600px] bg-gray-50 text-[13px] font-sans overflow-hidden text-black">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-30 w-[220px] min-w-[220px] bg-white border-r border-gray-100 flex flex-col overflow-y-auto transition-transform duration-200 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-gray-100">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-800 leading-tight truncate">
              gTeach Space
            </h1>
            {/* Teks sub-header berubah dinamis mengikuti role */}
            <p className="text-[10.5px] text-gray-400">
              {user?.role === "ict" ? "ICT Technical Server" : "Administrator"}
            </p>
          </div>
          <button
            className="ml-auto lg:hidden text-gray-400 hover:text-gray-600"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon d={icons.close} size={14} />
          </button>
        </div>

        {/* List Menu Navigasi */}
        <div className="pt-2 pb-2 flex-1">
          {/* Menggunakan list menu dinamis hasil filter role */}
          {currentNavList.map(({ key, label, icon, href }) => {
            const isActive = activeKey === key;
            return (
              <button
                key={key}
                onClick={() => {
                  router.push(href);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-[6px] rounded-lg text-left text-[12.5px] transition-colors mx-1 mb-0.5 ${isActive ? "bg-[#4d8bff] text-white font-medium" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}
                style={{ width: "calc(100% - 8px)" }}
              >
                <span
                  className={`flex-shrink-0 ${isActive ? "text-blue-200" : "opacity-50"}`}
                >
                  <Icon d={icons[icon]} />
                </span>
                <span className="flex-1">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-gray-100 p-3 flex flex-col gap-1">
          <button
            onClick={() => router.push("/admin/settings")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-gray-500 hover:bg-gray-50 transition-colors w-full"
          >
            <span className="opacity-50">
              <Icon d={icons.settings} />
            </span>
            Pengaturan
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-red-400 hover:bg-red-50 transition-colors w-full"
          >
            <span className="opacity-50 text-red-400">
              <Icon d={icons.logout} />
            </span>
            Keluar
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="no-print bg-white border-b border-gray-100 h-12 flex items-center px-4 sm:px-6 gap-3 flex-shrink-0">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-700 flex-shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Icon d={icons.menu} size={16} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[12px] text-gray-400 hidden sm:block">
              {user?.role === "ict" ? "ICT" : "Admin"}
            </span>
            <span className="text-gray-300 text-[11px] hidden sm:block">/</span>
            <span className="text-[12px] font-semibold text-gray-700 truncate">
              {activeNav.label}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              {user?.role?.toUpperCase() || "ADMIN"}
            </span>
            <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-5 lg:p-6">
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-gray-900 mb-5 no-print">
            {activeNav.label}
          </h1>
          {children}
        </div>
      </div>
    </div>
  );
}
