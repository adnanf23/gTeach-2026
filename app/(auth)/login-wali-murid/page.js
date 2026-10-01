"use client";

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
    width="14"
    height="14"
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

const FITUR = [
  "Nilai harian dan ujian anak",
  "Rekap kehadiran per bulan",
  "Agenda belajar di kelas",
];

const inputClass =
  "w-full rounded-xl bg-[#f5f7fd] border border-gray-200 px-4 py-3 text-[14px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-[#3b6ef5] focus:ring-4 focus:ring-[#3b6ef5]/10 disabled:opacity-50 disabled:cursor-not-allowed transition";

const LoginWaliMuridPage = () => {
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
      const authData = await pb
        .collection("wali_murid")
        .authWithPassword(username, password);
      const userRecord = authData.record;
      const namaWali =
        userRecord.nama_lengkap || userRecord.nama || userRecord.username;

      // Validasi status aktif (kalau field ada)
      if (userRecord.is_aktif === false) {
        pb.authStore.clear();
        setErrorMsg("Akun belum aktif. Silakan hubungi pihak sekolah.");
        return;
      }

      // Cookie session tracking
      document.cookie = `pb_auth=${encodeURIComponent(
        JSON.stringify({
          token: pb.authStore.token,
          model: pb.authStore.record,
        }),
      )}; path=/; max-age=604800; sameSite=strict`;

      router.push("/wali-murid");
    } catch (error) {
      console.error("Login error:", error);
      setErrorMsg("Username atau password salah. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#eef1fc] flex items-center justify-center p-4 sm:p-6 font-sans text-gray-800">
      {/* Kartu putih melayang, sama seperti sidebar di dashboard */}
      <div className="w-full max-w-[960px] bg-white rounded-[28px] shadow-[0_20px_60px_rgba(99,120,200,0.18)] p-3 grid lg:grid-cols-[1.05fr_1fr]">
        {/* PANEL KIRI */}
        <aside className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7aa5ff] to-[#3b6ef5] text-white p-7 lg:p-10 flex flex-col justify-between min-h-[190px] lg:min-h-[560px]">
          {/* Dekorasi lingkaran lembut */}
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10"
          />
          <div
            aria-hidden="true"
            className="absolute -left-10 -bottom-20 h-64 w-64 rounded-full bg-white/10"
          />
          <div
            aria-hidden="true"
            className="absolute right-10 bottom-24 h-20 w-20 rounded-full bg-white/10 hidden lg:block"
          />

          {/* Logo */}
          <div className="relative flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white text-[#3b6ef5] flex items-center justify-center text-[17px] font-bold">
              g
            </div>
            <div>
              <p className="text-[16px] font-bold leading-tight">
                gTech Academic
              </p>
              <p className="text-[11px] text-white/75">Portal Wali Murid</p>
            </div>
          </div>

          {/* Judul + fitur */}
          <div className="relative mt-8 lg:mt-0">
            <h1 className="text-[26px] lg:text-[38px] font-bold leading-[1.15] tracking-tight max-w-sm">
              Pantau statistik absensi dan nilai rapor murid!
            </h1>

            <ul className="mt-7 hidden lg:block rounded-2xl bg-white/15 backdrop-blur-sm p-4 space-y-3 max-w-sm">
              {FITUR.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#3b6ef5]">
                    <CheckIcon />
                  </span>
                  <span className="text-[13px] text-white/95">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-[12px] text-white/70 hidden lg:block">
            Lupa username atau password? Hubungi wali kelas.
          </p>
        </aside>

        {/* PANEL KANAN */}
        <main className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-sm">
            <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">
              Masuk
            </h2>
            <p className="mt-1.5 text-[13.5px] text-gray-500">
              Gunakan akun yang diberikan sekolah.
            </p>

            {errorMsg && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600"
              >
                {errorMsg}
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
                  placeholder="Masukkan username"
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

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-[#3b6ef5] text-white text-[14px] font-semibold shadow-[0_8px_18px_rgba(59,110,245,0.35)] hover:bg-[#2f5fe0] active:scale-[0.98] transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b6ef5] disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100"
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
                  "Masuk"
                )}
              </button>
            </form>

            <p className="mt-7 text-[12px] text-gray-400 lg:hidden">
              Lupa username atau password? Hubungi wali kelas.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LoginWaliMuridPage;
