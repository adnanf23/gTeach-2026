"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { pb, getCurrentUser } from "@/lib/pocketbase";

/* =========================================================
   Helper
   ========================================================= */
function pbBase() {
  return String(pb.baseURL || pb.baseUrl || "").replace(/\/$/, "");
}

function ttdUrl(u) {
  if (!u?.ttd) return null;
  return `${pbBase()}/api/files/${u.collectionId || "users"}/${u.id}/${u.ttd}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Upload via XHR supaya progres byte bisa dipantau (fetch tidak mendukung)
function uploadTtd({ userId, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", `${pbBase()}/api/collections/users/records/${userId}`);
    if (pb.authStore.token) {
      xhr.setRequestHeader("Authorization", pb.authStore.token);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };

    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
      } else {
        reject(
          new Error(
            body?.data?.ttd?.message ||
              body?.message ||
              `Gagal upload (${xhr.status})`,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error("Koneksi ke server gagal"));
    xhr.onabort = () => reject(new Error("Upload dibatalkan"));

    const formData = new FormData();
    formData.append("ttd", file);
    xhr.send(formData);
  });
}

/* =========================================================
   Komponen kecil
   ========================================================= */
function Icon({ name, className = "w-5 h-5" }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m21 16-5-5-8 8" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
        </svg>
      );
    default:
      return null;
  }
}

function Spinner({ className = "w-4 h-4" }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Thumb({ file, className = "" }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!url) return <div className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={file.name} className={className} />;
}

function StatusBadge({ status, progress }) {
  const map = {
    ready: "bg-zinc-100 text-zinc-700",
    nomatch: "bg-amber-50 text-amber-700",
    uploading: "bg-black text-white",
    success: "bg-emerald-50 text-emerald-700",
    error: "bg-red-50 text-red-700",
  };
  const label = {
    ready: "Siap diunggah",
    nomatch: "Tidak cocok",
    uploading: `${progress}%`,
    success: "Berhasil",
    error: "Gagal",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${map[status]}`}
    >
      {status === "uploading" && <Spinner className="w-3 h-3" />}
      {label[status]}
    </span>
  );
}

/* =========================================================
   Halaman
   ========================================================= */
export default function UploadTtdPage() {
  const [tab, setTab] = useState("upload"); // "upload" | "galeri"

  // data users
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");

  // upload
  const [items, setItems] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  // galeri
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("semua"); // semua | ada | belum
  const [preview, setPreview] = useState(null);

  // hapus TTD
  const [toDelete, setToDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const user = getCurrentUser();
  const isAllowed = user?.role === "admin" || user?.role === "ict";

  /* ---------- Load users ---------- */
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const list = await pb.collection("users").getFullList({
        sort: "nama_lengkap",
        batch: 200,
        requestKey: null,
      });
      setUsers(list);
    } catch (err) {
      setUsersError(err?.message || "Gagal memuat data pengguna");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAllowed) loadUsers();
  }, [isAllowed, loadUsers]);

  // Tutup lightbox / konfirmasi dengan Esc
  useEffect(() => {
    if (!preview && !toDelete) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (toDelete) {
        if (!deleteBusy) setToDelete(null);
      } else {
        setPreview(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, toDelete, deleteBusy]);

  const userMap = useMemo(
    () =>
      new Map(users.map((u) => [String(u.username || "").toLowerCase(), u])),
    [users],
  );

  /* ---------- Item upload (dengan pencocokan username) ---------- */
  const view = useMemo(
    () =>
      items.map((it) => {
        const target = userMap.get(it.username.toLowerCase()) || null;
        const status = it.status === "ready" && !target ? "nomatch" : it.status;
        return { ...it, target, status };
      }),
    [items, userMap],
  );

  const count = useMemo(() => {
    const c = { success: 0, error: 0, nomatch: 0, ready: 0, uploading: 0 };
    view.forEach((i) => (c[i.status] += 1));
    return c;
  }, [view]);

  const eligible = view.filter((i) => i.status !== "nomatch");
  const percent = eligible.length
    ? Math.round(eligible.reduce((s, i) => s + i.progress, 0) / eligible.length)
    : 0;
  const uploadable = count.ready + count.error;

  function updateItem(id, patch) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!incoming.length) return;

    setItems((prev) => {
      const ids = new Set(prev.map((i) => i.id));
      const added = incoming
        .map((f) => ({
          id: `${f.name}-${f.size}-${f.lastModified}`,
          file: f,
          username: f.name.replace(/\.[^/.]+$/, "").trim(),
          status: "ready",
          progress: 0,
          message: "",
        }))
        .filter((i) => !ids.has(i.id));
      return [...prev, ...added];
    });
  }

  function handleInputChange(e) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (processing) return;
    addFiles(e.dataTransfer.files);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function clearDone() {
    setItems((prev) => prev.filter((i) => i.status !== "success"));
  }

  function handleReset() {
    setItems([]);
  }

  async function handleUpload() {
    const queue = view.filter(
      (i) => (i.status === "ready" || i.status === "error") && i.target,
    );
    if (!queue.length) return;

    setProcessing(true);

    for (const item of queue) {
      updateItem(item.id, { status: "uploading", progress: 0, message: "" });
      try {
        await uploadTtd({
          userId: item.target.id,
          file: item.file,
          onProgress: (loaded, total) =>
            updateItem(item.id, {
              progress: Math.min(99, Math.round((loaded / total) * 100)),
            }),
        });
        updateItem(item.id, {
          status: "success",
          progress: 100,
          message: `Tersimpan untuk ${item.target.nama_lengkap || item.target.username}`,
        });
      } catch (err) {
        updateItem(item.id, {
          status: "error",
          progress: 0,
          message: err?.message || "Gagal upload",
        });
      }
    }

    setProcessing(false);
    loadUsers(); // segarkan galeri
  }

  /* ---------- Galeri ---------- */
  const withTtd = users.filter((u) => u.ttd).length;

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "ada" && !u.ttd) return false;
      if (filter === "belum" && u.ttd) return false;
      if (!q) return true;
      return (
        (u.nama_lengkap || "").toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q)
      );
    });
  }, [users, search, filter]);

  /* ---------- Hapus TTD ---------- */
  function askDelete(u) {
    setDeleteError("");
    setToDelete(u);
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      // mengosongkan field file = menghapus file di PocketBase.
      // Pakai FormData (multipart) seperti saat upload, bukan JSON.
      const formData = new FormData();
      formData.append("ttd", "");
      await pb.collection("users").update(toDelete.id, formData);
      setUsers((prev) =>
        prev.map((u) => (u.id === toDelete.id ? { ...u, ttd: "" } : u)),
      );
      if (preview?.id === toDelete.id) setPreview(null);
      setToDelete(null);
    } catch (err) {
      setDeleteError(err?.message || "Gagal menghapus TTD");
    } finally {
      setDeleteBusy(false);
    }
  }

  /* ---------- Guard akses ---------- */
  if (!isAllowed) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Anda tidak memiliki akses ke halaman ini. Hanya <b>admin</b> atau{" "}
          <b>ict</b> yang diizinkan.
        </div>
      </div>
    );
  }

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <header>
          <div className="inline-flex rounded-full bg-white border border-zinc-200 p-1">
            {[
              { id: "upload", label: "Upload" },
              { id: "galeri", label: `Galeri (${withTtd}/${users.length})` },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
                  tab === t.id
                    ? "bg-black text-white"
                    : "text-zinc-600 hover:text-black"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {/* ================= TAB UPLOAD ================= */}
        {tab === "upload" && (
          <div className="space-y-5">
            {/* Dropzone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => !processing && inputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !processing) {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!processing) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`rounded-2xl border-2 border-dashed bg-white p-8 text-center transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
                dragging
                  ? "border-black bg-zinc-100"
                  : "border-zinc-300 hover:border-black"
              } ${processing ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleInputChange}
                disabled={processing}
                className="hidden"
              />
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black text-white">
                <Icon name="upload" />
              </div>
              <p className="mt-4 font-semibold text-zinc-900">
                Tarik file ke sini atau klik untuk memilih
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Nama file harus sama dengan <b>username</b> guru, contoh{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-800">
                  budi_santoso.png
                </code>
              </p>
            </div>

            {/* Panel progres (hitam) */}
            {items.length > 0 && (
              <div className="rounded-2xl bg-black p-5 text-white">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-zinc-400">Progres upload</p>
                    <p className="text-4xl font-bold tabular-nums">
                      {percent}%
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleReset}
                      disabled={processing}
                      className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleUpload}
                      disabled={processing || uploadable === 0}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    >
                      {processing ? (
                        <>
                          <Spinner /> Mengunggah...
                        </>
                      ) : (
                        <>Upload {uploadable} file</>
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <p className="mt-3 text-sm text-zinc-400">
                  {count.success} berhasil · {count.error} gagal ·{" "}
                  {count.nomatch} tidak cocok · {count.ready + count.uploading}{" "}
                  menunggu
                </p>
              </div>
            )}

            {/* Daftar file */}
            {items.length > 0 && (
              <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                  <p className="text-sm font-semibold text-zinc-900">
                    {items.length} file dipilih
                  </p>
                  {count.success > 0 && (
                    <button
                      onClick={clearDone}
                      disabled={processing}
                      className="text-sm text-zinc-500 hover:text-black disabled:opacity-40"
                    >
                      Bersihkan yang berhasil
                    </button>
                  )}
                </div>

                <ul className="divide-y divide-zinc-100">
                  {view.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <Thumb
                        file={it.file}
                        className="h-12 w-12 shrink-0 rounded-lg border border-zinc-200 bg-white object-contain"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {it.file.name}
                          <span className="ml-2 font-normal text-zinc-400">
                            {formatSize(it.file.size)}
                          </span>
                        </p>
                        <p
                          className={`truncate text-xs mt-0.5 ${
                            it.status === "error"
                              ? "text-red-600"
                              : it.status === "nomatch"
                                ? "text-amber-700"
                                : "text-zinc-500"
                          }`}
                        >
                          {it.message
                            ? it.message
                            : it.target
                              ? `${it.target.nama_lengkap || it.target.username} (${it.target.username})`
                              : usersLoading
                                ? "Memeriksa username..."
                                : `Username "${it.username}" tidak ditemukan`}
                        </p>

                        {(it.status === "uploading" ||
                          it.status === "success") && (
                          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                            <div
                              className={`h-full rounded-full transition-all duration-200 ${
                                it.status === "success"
                                  ? "bg-emerald-500"
                                  : "bg-black"
                              }`}
                              style={{ width: `${it.progress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <StatusBadge status={it.status} progress={it.progress} />

                      <button
                        onClick={() => removeItem(it.id)}
                        disabled={it.status === "uploading"}
                        aria-label={`Hapus ${it.file.name}`}
                        className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
                      >
                        <Icon name="x" className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB GALERI ================= */}
        {tab === "galeri" && (
          <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama atau username..."
                  className="w-full rounded-full border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="inline-flex rounded-full bg-white border border-zinc-200 p-1 self-start">
                {[
                  { id: "semua", label: `Semua (${users.length})` },
                  { id: "ada", label: `Sudah ada (${withTtd})` },
                  {
                    id: "belum",
                    label: `Belum ada (${users.length - withTtd})`,
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${
                      filter === f.id
                        ? "bg-black text-white"
                        : "text-zinc-600 hover:text-black"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                onClick={loadUsers}
                disabled={usersLoading}
                aria-label="Muat ulang"
                className="self-start rounded-full border border-zinc-200 bg-white p-2.5 text-zinc-600 hover:border-black hover:text-black disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
              >
                <Icon
                  name="refresh"
                  className={`h-4 w-4 ${usersLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            {usersError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {usersError}
              </div>
            )}

            {/* Grid */}
            {usersLoading && users.length === 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-56 animate-pulse rounded-2xl border border-zinc-200 bg-white"
                  />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
                Tidak ada pengguna yang cocok dengan pencarian.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {filteredUsers.map((u) => {
                  const url = ttdUrl(u);
                  return (
                    <div
                      key={u.id}
                      className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white"
                    >
                      <button
                        onClick={() => url && setPreview(u)}
                        disabled={!url}
                        aria-label={
                          url
                            ? `Lihat TTD ${u.nama_lengkap || u.username}`
                            : "Belum ada TTD"
                        }
                        className="flex aspect-[4/3] w-full items-center justify-center border-b border-zinc-100 bg-white p-4 enabled:cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={`TTD ${u.nama_lengkap || u.username}`}
                            loading="lazy"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-zinc-300">
                            <Icon name="image" className="h-8 w-8" />
                            <span className="text-xs text-zinc-400">
                              Belum ada TTD
                            </span>
                          </div>
                        )}
                      </button>

                      {url && (
                        <button
                          onClick={() => askDelete(u)}
                          aria-label={`Hapus TTD ${u.nama_lengkap || u.username}`}
                          className="absolute right-2 top-2 rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm hover:border-black hover:bg-black hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      )}

                      <div className="p-3">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {u.nama_lengkap || u.username}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          {u.username}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= KONFIRMASI HAPUS ================= */}
      {toDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => !deleteBusy && setToDelete(null)}
          role="alertdialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-white">
              <Icon name="trash" />
            </div>
            <p className="mt-4 font-semibold text-zinc-900">Hapus TTD ini?</p>
            <p className="mt-1 text-sm text-zinc-500">
              File TTD milik{" "}
              <b className="text-zinc-800">
                {toDelete.nama_lengkap || toDelete.username}
              </b>{" "}
              akan dihapus permanen dan tidak bisa dikembalikan.
            </p>

            {deleteError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setToDelete(null)}
                disabled={deleteBusy}
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-black disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteBusy}
                className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                {deleteBusy ? (
                  <>
                    <Spinner /> Menghapus...
                  </>
                ) : (
                  "Hapus"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= LIGHTBOX ================= */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-2xl rounded-2xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreview(null)}
              aria-label="Tutup"
              className="absolute right-3 top-3 rounded-full bg-black p-2 text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>

            <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-zinc-200 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ttdUrl(preview)}
                alt={`TTD ${preview.nama_lengkap || preview.username}`}
                className="max-h-[60vh] max-w-full object-contain"
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-zinc-900">
                  {preview.nama_lengkap || preview.username}
                </p>
                <p className="truncate text-sm text-zinc-500">
                  {preview.username}
                </p>
              </div>
              <button
                onClick={() => askDelete(preview)}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:border-black hover:bg-black hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                <Icon name="trash" className="h-4 w-4" />
                Hapus TTD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
