"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";
import { uploadTtdAction, updateProfileAction } from "./actions";

export default function EditProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    nama_lengkap: "",
    username: "",
    email: "",
    no_whatsapp: "",
    role: "",
    is_aktif: false,
  });

  const [passwordData, setPasswordData] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [ttdFile, setTtdFile] = useState(null);
  const [ttdPreview, setTtdPreview] = useState("");
  const [existingTtd, setExistingTtd] = useState("");
  const [uploadingTtd, setUploadingTtd] = useState(false);

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

    if (currentUser.ttd) {
      const url = pb.files.getUrl(currentUser, currentUser.ttd);
      setExistingTtd(url);
    }

    setAuthChecked(true);
    setLoading(false);
  }, [router]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTtdChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar (PNG, JPG, WEBP).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Ukuran file maksimal 2MB.");
      return;
    }

    setError("");
    setTtdFile(file);
    setTtdPreview(URL.createObjectURL(file));
  };

  // ===== UPLOAD TTD via Server Action =====
  const handleUploadTtd = async () => {
    if (!ttdFile) {
      setError("Pilih file TTD terlebih dahulu.");
      return;
    }

    setUploadingTtd(true);
    setError("");
    setSuccess("");

    try {
      const formDataTtd = new FormData();
      formDataTtd.append("ttd", ttdFile);

      const result = await uploadTtdAction(user.id, formDataTtd);
      if (!result.success) throw new Error(result.error);

      const newUrl = pb.files.getUrl(result.record, result.record.ttd);
      setExistingTtd(newUrl);

      const updatedUser = { ...user, ttd: result.record.ttd };
      localStorage.setItem("pb_user", JSON.stringify(updatedUser));
      setUser(updatedUser);

      setTtdFile(null);
      setTtdPreview("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      setSuccess("Tanda tangan berhasil diunggah!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error upload TTD:", err);
      setError(err.message || "Gagal mengunggah TTD.");
    } finally {
      setUploadingTtd(false);
    }
  };

  // ===== UPDATE PROFILE via Server Action =====
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (!formData.nama_lengkap.trim())
        throw new Error("Nama lengkap wajib diisi");
      if (!formData.username.trim()) throw new Error("Username wajib diisi");

      const updateData = {
        nama_lengkap: formData.nama_lengkap.trim(),
        username: formData.username.trim(),
        no_whatsapp: formData.no_whatsapp || "",
      };
      if (formData.email) updateData.email = formData.email.trim();

      const result = await updateProfileAction(user.id, updateData);
      if (!result.success) throw new Error(result.error);

      const mergedUser = { ...user, ...result.record };
      localStorage.setItem("pb_user", JSON.stringify(mergedUser));
      setUser(mergedUser);

      setSuccess("Profil dan Email berhasil diperbarui!");
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      console.error("Error updating profile:", err);
      setError(err.message || "Gagal memperbarui profil.");
    } finally {
      setSaving(false);
    }
  };

  // Password change (session user, tidak butuh admin)
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (!passwordData.oldPassword)
        throw new Error("Password lama wajib diisi");
      if (!passwordData.newPassword)
        throw new Error("Password baru wajib diisi");
      if (passwordData.newPassword.length < 8)
        throw new Error("Password baru minimal 8 karakter");
      if (passwordData.newPassword !== passwordData.confirmPassword)
        throw new Error("Konfirmasi password tidak sesuai");

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
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      console.error("Error updating password:", err);
      setError(err.message || "Gagal memperbarui password.");
    } finally {
      setSaving(false);
    }
  };

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Edit Profil</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kelola informasi akun Anda
        </p>
      </div>

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

      {/* SECTION TTD */}
      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-700">
            Tanda Tangan Digital
          </h2>
          <p className="text-xs text-slate-400">
            Upload gambar tanda tangan Anda (PNG/JPG/WEBP, maks 2MB)
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">
              TTD Saat Ini
            </p>
            <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4">
              {existingTtd ? (
                <img
                  src={existingTtd}
                  alt="Tanda tangan"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <p className="text-xs text-slate-400">Belum ada TTD</p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">
              {ttdPreview ? "Preview TTD Baru" : "Pilih File Baru"}
            </p>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex h-40 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-4 transition hover:border-blue-400 hover:bg-blue-50"
            >
              {ttdPreview ? (
                <img
                  src={ttdPreview}
                  alt="Preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="text-center">
                  <svg
                    className="mx-auto h-8 w-8 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="mt-2 text-xs font-medium text-blue-600">
                    Klik untuk pilih file
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    PNG, JPG, WEBP (maks 2MB)
                  </p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/jpg, image/webp"
              onChange={handleTtdChange}
              className="hidden"
            />
          </div>
        </div>

        {ttdFile && (
          <div className="mt-4 flex gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleUploadTtd}
              disabled={uploadingTtd}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {uploadingTtd ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  Mengunggah...
                </span>
              ) : (
                "Upload TTD"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setTtdFile(null);
                setTtdPreview("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        )}
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Nama Lengkap <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="nama_lengkap"
                value={formData.nama_lengkap}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className="w-full rounded-lg border bg-slate-50 border-slate-200 px-3 py-2 text-sm outline-none"
                required
                disabled
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Username digunakan untuk login
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Kosongkan jika tidak ingin mengubah
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                No WhatsApp
              </label>
              <input
                type="text"
                name="no_whatsapp"
                value={formData.no_whatsapp}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

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

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Status
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${formData.is_aktif ? "bg-emerald-500" : "bg-red-500"}`}
                ></span>
                <span className="text-sm text-slate-500">
                  {formData.is_aktif ? "Aktif" : "Tidak Aktif"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3 border-t border-slate-100 pt-6">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
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

      {/* Change Password */}
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
                  {saving ? "Memproses..." : "Perbarui Password"}
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
    </div>
  );
}
