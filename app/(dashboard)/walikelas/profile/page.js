"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

export default function EditProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    nama_lengkap: "",
    username: "",
    email: "",
    no_whatsapp: "",
    role: "",
    is_aktif: false,
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // 1. Cek auth & ambil data user
  useEffect(() => {
    const currentUser = getCurrentUser();

    if (!isAuthenticated() || !currentUser) {
      router.push("/login");
      return;
    }

    setUser(currentUser);
    setFormData({
      nama_lengkap: currentUser.nama_lengkap || "",
      username: currentUser.username || "",
      email: currentUser.email || "",
      no_whatsapp: currentUser.no_whatsapp || "",
      role: currentUser.role || "",
      is_aktif: currentUser.is_aktif || false,
    });
    setAuthChecked(true);
    setLoading(false);
  }, [router]);

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Handle password input changes
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Submit profile update
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Validasi
      if (!formData.nama_lengkap.trim()) {
        throw new Error("Nama lengkap wajib diisi");
      }
      if (!formData.username.trim()) {
        throw new Error("Username wajib diisi");
      }

      // Data yang akan diupdate
      const updateData = {
        nama_lengkap: formData.nama_lengkap.trim(),
        username: formData.username.trim(),
        no_whatsapp: formData.no_whatsapp || "",
      };

      // Hanya update email jika diisi dan berbeda
      if (formData.email && formData.email !== user.email) {
        updateData.email = formData.email;
      }

      // Update profile
      const updated = await pb.collection("users").update(user.id, updateData);

      // Update local user data
      const currentUser = getCurrentUser();
      if (currentUser) {
        const mergedUser = { ...currentUser, ...updated };
        localStorage.setItem("pb_user", JSON.stringify(mergedUser));
        setUser(mergedUser);
      }

      setSuccess("Profil berhasil diperbarui!");

      // Refresh halaman setelah 2 detik
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error("Error updating profile:", err);
      setError(err.message || "Gagal memperbarui profil. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  // Submit password change
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Validasi
      if (!passwordData.oldPassword) {
        throw new Error("Password lama wajib diisi");
      }
      if (!passwordData.newPassword) {
        throw new Error("Password baru wajib diisi");
      }
      if (passwordData.newPassword.length < 8) {
        throw new Error("Password baru minimal 8 karakter");
      }
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        throw new Error("Konfirmasi password tidak sesuai");
      }

      // Update password
      await pb.collection("users").update(user.id, {
        oldPassword: passwordData.oldPassword,
        password: passwordData.newPassword,
        passwordConfirm: passwordData.confirmPassword,
      });

      setSuccess("Password berhasil diperbarui!");
      setPasswordData({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordForm(false);

      // Refresh setelah 2 detik
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error("Error updating password:", err);
      setError(
        err.message ||
          "Gagal memperbarui password. Pastikan password lama benar.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Render loading
  if (loading || !authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-3 text-sm text-slate-500">Memuat profil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Edit Profil</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kelola informasi akun Anda
        </p>
      </div>

      {/* Alert */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600">
          {success}
        </div>
      )}

      {/* Profile Info Card */}
      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">
              Informasi Akun
            </h2>
            <p className="text-xs text-slate-400">
              Perbarui informasi profil Anda
            </p>
          </div>
          <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
            {formData.role || "User"}
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Nama Lengkap */}
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Nama Lengkap <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="nama_lengkap"
                value={formData.nama_lengkap}
                onChange={handleChange}
                placeholder="Masukkan nama lengkap"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            {/* Username */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Masukkan username"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Username digunakan untuk login
              </p>
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Masukkan email"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Kosongkan jika tidak ingin mengubah
              </p>
            </div>

            {/* No WhatsApp */}
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                No WhatsApp
              </label>
              <input
                type="text"
                name="no_whatsapp"
                value={formData.no_whatsapp}
                onChange={handleChange}
                placeholder="Contoh: 081234567890"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Nomor WhatsApp untuk komunikasi
              </p>
            </div>

            {/* Role (Read Only) */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Role
              </label>
              <input
                type="text"
                value={formData.role}
                disabled
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
              />
            </div>

            {/* Status (Read Only) */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Status
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    formData.is_aktif ? "bg-emerald-500" : "bg-red-500"
                  }`}
                ></span>
                <span className="text-sm text-slate-500">
                  {formData.is_aktif ? "Aktif" : "Tidak Aktif"}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex gap-3 border-t border-slate-100 pt-6">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  Menyimpan...
                </span>
              ) : (
                "Simpan Perubahan"
              )}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      </form>

      {/* Change Password Section */}
      <div className="mt-8">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">
                Ubah Password
              </h2>
              <p className="text-xs text-slate-400">Ganti password akun Anda</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
            >
              {showPasswordForm ? "Tutup" : "Ubah Password"}
            </button>
          </div>

          {showPasswordForm && (
            <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Password Lama <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  name="oldPassword"
                  value={passwordData.oldPassword}
                  onChange={handlePasswordChange}
                  placeholder="Masukkan password lama"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Password Baru <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  placeholder="Masukkan password baru (min. 8 karakter)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Konfirmasi Password Baru{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  placeholder="Konfirmasi password baru"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                      Memproses...
                    </span>
                  ) : (
                    "Perbarui Password"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPasswordData({
                      oldPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                  }}
                  className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Batal
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Informasi</p>
            <p className="mt-0.5">
              Perubahan pada email akan memerlukan verifikasi ulang. Pastikan
              email yang dimasukkan aktif dan dapat diakses.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
