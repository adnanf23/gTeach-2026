"use client";

import { createSystemLog } from "@/lib/logger";
import { pb } from "@/lib/pocketbase";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

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
      // Authenticate menggunakan username/email
      const authData = await pb
        .collection("users")
        .authWithPassword(username, password);
      const userRecord = authData.record;

      // Validasi status aktif user
      if (!userRecord.is_aktif) {
        pb.authStore.clear();
        setErrorMsg("Akun telah dinonaktifkan.");
        setIsLoading(false);

        // 💡 CATAT LOG: Akun Nonaktif mencoba login
        createSystemLog({
          type: "warning",
          msg: `Percobaan login ditolak: Akun '${nama_lengkap}' statusnya dinonaktifkan`,
          endpoint: "/login",
          statusCode: 403,
          payload: { username, status: "nonaktif" },
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

      // 💡 CATAT LOG: Berhasil Login (Payload dibersihkan dari token sensitif)
      // Di dalam try block handleLogin (setelah cookies terpasang):

      await createSystemLog({
        type: "succes", // Menyiasati typo 'succes' di skema DB Anda
        msg: `User '${userRecord.nama_lengkap} ( ${userRecord.role} ) | ' berhasil login ke sistem.`,
        endpoint: `/login`,
        statusCode: 200,
        payload: {
          username: userRecord.username,
          role: userRecord.role,
        }, // Kirim data text/string biasa yang aman masuk ke field JSON
      });

      // Pengalihan Halaman Otomatis (Role-Based Routing)
      const userRole = userRecord.role;

      if (userRole === "admin") {
        router.push("/admin");
      } else if (userRole === "ict") {
        router.push("/ict");
      } else if (
        userRole === "guru walikelas" 
      ) {
        router.push("/walikelas");
      } else if (
        userRole === "guru mapel" 
      ) {
        router.push("/guru-mapel");
      } else {
        pb.authStore.clear();
        setErrorMsg("Role pengguna tidak valid.");
      }
    } catch (error) {
      setErrorMsg("Username atau password salah. Silakan coba lagi.");
      console.error("Login error:", error);

      // 💡 CATAT LOG: Gagal Login (Potensi Brute Force Attack)
      createSystemLog({
        type: "warning",
        msg: `Gagal login: Percobaan masuk menggunakan nama akun '${username}' ditolak`,
        endpoint: "/login",
        statusCode: error.status || 401,
        payload: { error_message: error.message },
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white text-slate-900 font-sans flex flex-col justify-center items-center">
      {/* BACKGROUND SVG GRID */}
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="white-fade-gradient"
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="40%" stopColor="white" stopOpacity="0.3" />
            <stop offset="80%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          <mask id="white-grid-mask">
            <rect width="100%" height="100%" fill="url(#white-fade-gradient)" />
          </mask>

          <pattern
            id="black-grid-pattern"
            width="44"
            height="44"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 44 0 L 0 0 0 44"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-slate-900/15"
            />
          </pattern>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill="url(#black-grid-pattern)"
          mask="url(#white-grid-mask)"
        />
      </svg>

      {/* LOGIN CARD */}
      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo & Branding */}
        <div className="text-center mb-10">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold bg-slate-950 text-white mb-4 tracking-[0.2em] uppercase">
            Internal
          </span>
          <h1 className="text-4xl font-extrabold tracking-tighter text-slate-950 mb-2">
            gTeach <span className="text-blue-600">Space</span>
          </h1>
          <p className="text-slate-500 font-medium">
            Silakan login untuk melanjutkan ke Dashboard!
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600 border border-red-200 animate-fade-in">
            {errorMsg}
          </div>
        )}

        {/* Form Container */}
        <div className="bg-white/50 backdrop-blur-sm border border-slate-200 p-8 rounded-3xl shadow-xl shadow-slate-200/50">
          <form className="space-y-5" onSubmit={handleLogin}>
            {/* Username Field */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2 ml-1">
                Username
              </label>
              <input
                type="text"
                placeholder="Masukkan username Anda"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                className="w-full px-5 py-3 rounded-2xl border border-slate-200 disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
              />
            </div>

            {/* Password Field */}
            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-2 ml-1">
                Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full px-5 py-3 rounded-2xl border disabled:bg-slate-100 border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-[42px] text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-slate-950 text-white rounded-2xl font-bold tracking-tight shadow-lg shadow-slate-950/20 hover:bg-slate-800 transition-all active:scale-[0.98] cursor-pointer disabled:bg-slate-400"
            >
              {isLoading ? "Menghubungkan..." : "Masuk ke Dashboard"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
