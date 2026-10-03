"use client";

import { createSystemLog } from "@/lib/logger";
import { pb } from "@/lib/pocketbase";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

// ---------- SVG Icons ----------
const EyeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const AlertIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const FITUR = [
  "Kelola nilai & rapor murid",
  "Rekap absensi tiap kelas",
  "Pantau log aktivitas sistem",
];

const BAR_HEIGHTS = [40, 65, 50, 85, 60, 95, 55, 75];

const inputClass =
  "w-full rounded-xl bg-[#f5f7fd] border border-gray-200 px-4 py-3 text-[14px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-[#3b6ef5] focus:ring-4 focus:ring-[#3b6ef5]/10 disabled:opacity-50 disabled:cursor-not-allowed transition";

// Cuplikan dashboard (hanya ilustrasi bentuk, tanpa data)
const DashboardPreview = () => (
  <div
    aria-hidden="true"
    className="ml-auto w-[92%] h-[300px] overflow-hidden rounded-tl-3xl bg-[#eef1fc] p-3 pb-0 shadow-[0_-10px_60px_rgba(0,0,0,0.35)]"
  >
    <div className="flex gap-3 h-full">
      {/* Sidebar mini */}
      <div className="w-[104px] flex-shrink-0 rounded-2xl rounded-b-none bg-white p-3">
        <div className="flex items-center gap-1.5 mb-4">
          <div className="w-5 h-5 rounded-md bg-[#3b6ef5]" />
          <div className="h-2 w-12 rounded bg-gray-200" />
        </div>
        <div className="space-y-1.5">
          <div className="h-7 rounded-lg bg-[#3b6ef5] flex items-center gap-1.5 px-2">
            <div className="w-2.5 h-2.5 rounded bg-white/80" />
            <div className="h-1.5 w-9 rounded bg-white/70" />
          </div>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-7 rounded-lg flex items-center gap-1.5 px-2"
            >
              <div className="w-2.5 h-2.5 rounded bg-gray-200" />
              <div className="h-1.5 w-9 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>

      {/* Konten mini */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="h-3 w-24 rounded bg-gray-800/80" />
            <div className="h-1.5 w-16 rounded bg-gray-300 mt-1.5" />
          </div>
          <div className="flex gap-1.5">
            <div className="w-6 h-6 rounded-full bg-white" />
            <div className="w-6 h-6 rounded-full bg-[#7aa5ff]" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl bg-white p-3">
              <div className="h-1.5 w-10 rounded bg-gray-200" />
              <div className="h-3.5 w-14 rounded bg-gray-800/80 mt-2" />
              <div className="h-1.5 w-8 rounded bg-[#3b6ef5]/40 mt-2" />
            </div>
          ))}
        </div>

        <div className="mt-2.5 rounded-xl bg-white p-3 h-[140px]">
          <div className="h-1.5 w-20 rounded bg-gray-300" />
          <div className="mt-3 flex items-end gap-2 h-[84px]">
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-md ${
                  i % 2 === 1 ? "bg-[#3b6ef5]" : "bg-[#dbe3fb]"
                }`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const LoginPage = () => {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    try {
      // Authenticate menggunakan username
      const authData = await pb
        .collection("users")
        .authWithPassword(username, password);
      const userRecord = authData.record;

      // Validasi status aktif user
      if (!userRecord.is_aktif) {
        pb.authStore.clear();
        setErrorMsg("Akun telah dinonaktifkan. Silakan hubungi admin.");
        setIsLoading(false);

        await createSystemLog({
          type: "warning",
          msg: `Percobaan login ditolak: Akun '${userRecord.nama_lengkap}' statusnya dinonaktifkan`,
          endpoint: "/login",
          statusCode: 403,
          payload: {
            username: userRecord.username,
            status: "nonaktif",
            role: userRecord.role,
          },
        });
        return;
      }

      // Pasang Cookie untuk session tracking
      document.cookie = `pb_auth=${encodeURIComponent(
        JSON.stringify({
          token: pb.authStore.token,
          model: pb.authStore.record,
        }),
      )}; path=/; max-age=604800; sameSite=strict`;

      // Log berhasil login
      await createSystemLog({
        type: "succes",
        msg: `User '${userRecord.nama_lengkap} (${userRecord.role})' berhasil login ke sistem.`,
        endpoint: `/login`,
        statusCode: 200,
        payload: {
          username: userRecord.username,
          role: userRecord.role,
          nama: userRecord.nama_lengkap,
        },
      });

      // Pengalihan Halaman berdasarkan Role
      const userRole = userRecord.role;

      if (userRole === "admin") {
        router.push("/admin");
      } else if (userRole === "ict") {
        router.push("/ict");
      } else if (
        userRole === "guru walikelas" ||
        userRole === "guru pendamping"
      ) {
        router.push("/walikelas");
      } else if (userRole === "guru mapel") {
        router.push("/guru-mapel");
      } else {
        pb.authStore.clear();
        setErrorMsg("Role pengguna tidak valid. Silakan hubungi admin.");
        setIsLoading(false);

        await createSystemLog({
          type: "warning",
          msg: `Login gagal: Role '${userRole}' tidak dikenal untuk user '${userRecord.nama_lengkap}'`,
          endpoint: "/login",
          statusCode: 400,
          payload: {
            username: userRecord.username,
            role: userRole,
          },
        });
      }
    } catch (error) {
      setErrorMsg("Username atau password salah. Silakan coba lagi.");
      console.error("Login error:", error);

      // Log gagal login
      await createSystemLog({
        type: "warning",
        msg: `Gagal login: Percobaan masuk menggunakan username '${username}' ditolak`,
        endpoint: "/login",
        statusCode: error.status || 401,
        payload: {
          username: username,
          error_message: error.message,
        },
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white font-sans text-gray-800 grid lg:grid-cols-[minmax(0,500px)_1fr]">
      {/* ── KIRI: form, layar penuh, tanpa kartu ── */}
      <main className="flex flex-col px-6 sm:px-12 py-8 lg:min-h-screen">
        {/* Logo (desktop; di mobile logo ada di panel atas) */}
        <div className="hidden lg:flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#3b6ef5] text-white flex items-center justify-center text-[17px] font-bold shadow-[0_8px_18px_rgba(59,110,245,0.35)]">
            g
          </div>
          <p className="text-[16px] font-bold text-gray-900 leading-tight">
            gTech Academic
          </p>
        </div>

        {/* Form */}
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-sm mx-auto py-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold bg-[#eef1fc] text-[#3b6ef5] mb-4 tracking-[0.16em] uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3b6ef5]" />
              Portal Internal Guru
            </span>

            <h1 className="text-[30px] font-bold text-gray-900 tracking-tight leading-tight">
              Masuk
            </h1>
            <p className="mt-1.5 text-[13.5px] text-gray-500">
              Silakan login untuk melanjutkan ke Dashboard.
            </p>

            {errorMsg && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600"
              >
                <span className="mt-0.5 flex-shrink-0">
                  <AlertIcon />
                </span>
                <span>{errorMsg}</span>
              </div>
            )}

            <form className="mt-7 space-y-5" onSubmit={handleLogin}>
              <div>
                <label
                  htmlFor="username"
                  className="block text-[12px] font-medium text-gray-600 mb-1.5"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="Masukkan username Anda"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-[12px] font-medium text-gray-600 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#3b6ef5] cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b6ef5] transition-colors"
                    aria-label={
                      showPassword
                        ? "Sembunyikan password"
                        : "Tampilkan password"
                    }
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* Tombol navy — penanda login internal */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-[#1c2033] text-white text-[14px] font-semibold shadow-[0_8px_18px_rgba(28,32,51,0.28)] hover:bg-[#2a3050] active:scale-[0.98] transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b6ef5] disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  "Masuk ke Dashboard"
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-[12px] text-gray-400 text-center lg:text-left">
          Lupa akses? Hubungi admin atau tim ICT.
        </p>
      </main>

      {/* ── PANEL NAVY: di mobile tampil di atas form (tagline), di desktop di kanan ── */}
      <aside className="relative order-first lg:order-none flex flex-col justify-between m-3 rounded-[28px] overflow-hidden bg-gradient-to-br from-[#2a3050] to-[#141829] text-white p-7 lg:pt-14 lg:pl-14 lg:pr-0 lg:pb-0">
        {/* Glow biru */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-20 h-[380px] w-[380px] rounded-full bg-[#3b6ef5]/35 blur-[100px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-10 -left-24 h-[280px] w-[280px] rounded-full bg-[#7aa5ff]/15 blur-[90px]"
        />

        <div className="relative z-10 lg:pr-14">
          {/* Logo (mobile saja) */}
          <div className="flex items-center gap-2.5 mb-6 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-[#3b6ef5] text-white flex items-center justify-center text-[17px] font-bold shadow-[0_8px_18px_rgba(59,110,245,0.45)]">
              g
            </div>
            <p className="text-[16px] font-bold leading-tight">
              gTech Academic
            </p>
          </div>

          <h2 className="text-[26px] sm:text-[32px] lg:text-[38px] xl:text-[44px] font-bold leading-[1.12] tracking-tight max-w-lg">
            Kelola data akademik guru dalam satu dashboard.
          </h2>

          <ul className="hidden sm:block mt-6 lg:mt-7 space-y-3">
            {FITUR.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#3b6ef5] text-white">
                  <CheckIcon />
                </span>
                <span className="text-[14px] text-white/85">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Cuplikan dashboard (desktop saja) */}
        <div className="relative z-10 mt-10 hidden lg:block">
          <DashboardPreview />
        </div>
      </aside>
    </div>
  );
};

export default LoginPage;
