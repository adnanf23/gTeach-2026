"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

function waLink(nomor, pesanAwal = null) {
  if (!nomor) return null;
  const digits = nomor.replace(/[^0-9]/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  let url = `https://wa.me/${normalized}`;
  if (pesanAwal) {
    url += `?text=${encodeURIComponent(pesanAwal)}`;
  }
  return url;
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

// Palet warna
const PALETTES = [
  {
    avatar: "bg-indigo-100 text-indigo-700",
    chip: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100",
  },
  {
    avatar: "bg-emerald-100 text-emerald-700",
    chip: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100",
  },
  {
    avatar: "bg-amber-100 text-amber-700",
    chip: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100",
  },
  {
    avatar: "bg-sky-100 text-sky-700",
    chip: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100",
  },
  {
    avatar: "bg-rose-100 text-rose-700",
    chip: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100",
  },
  {
    avatar: "bg-violet-100 text-violet-700",
    chip: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-100",
  },
];

function paletteForKey(key) {
  const str = key || "";
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.4 1.26 4.83L2 22l5.35-1.28a9.9 9.9 0 0 0 4.69 1.18h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.83 14.16c-.25.7-1.23 1.28-2.02 1.44-.55.11-1.26.2-3.67-.79-3.08-1.27-5.06-4.4-5.21-4.6-.15-.2-1.25-1.66-1.25-3.17 0-1.5.79-2.24 1.07-2.54.28-.3.6-.37.8-.37.2 0 .4 0 .58.01.19.01.44-.07.68.53.25.6.85 2.08.92 2.23.07.15.12.33.02.53-.1.2-.15.33-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.61.17.3.76 1.26 1.63 2.04 1.12 1 2.06 1.32 2.36 1.47.3.15.48.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.68-.15.28.1 1.76.83 2.06.98.3.15.5.23.58.35.07.13.07.7-.18 1.4Z" />
    </svg>
  );
}

export default function GuruPengajarPage() {
  const router = useRouter();

  // ---------------- Auth ----------------
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getCurrentUser());
    setCheckingAuth(false);
  }, [router]);

  // ---------------- Resolusi kelas ----------------
  const [kelas, setKelas] = useState(null);
  const [kelasOptions, setKelasOptions] = useState([]);
  const [needsKelasPicker, setNeedsKelasPicker] = useState(false);
  const [noKelasAssigned, setNoKelasAssigned] = useState(false);
  const [notAllowedRole, setNotAllowedRole] = useState(false);
  const [resolvingKelas, setResolvingKelas] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function resolve() {
      setResolvingKelas(true);
      setNoKelasAssigned(false);
      setNotAllowedRole(false);
      const role = user.role;

      if (role === "guru walikelas" || role === "guru pendamping") {
        try {
          const rec = await pb
            .collection("kelas")
            .getFirstListItem(
              `walikelas_id="${user.id}" || pendamping_id="${user.id}"`,
              { requestKey: null },
            );
          if (!cancelled) {
            setKelas(rec);
            setNeedsKelasPicker(false);
          }
        } catch (e) {
          if (!cancelled) setNoKelasAssigned(true);
        }
      } else if (role === "admin" || role === "ict") {
        try {
          const list = await pb.collection("kelas").getFullList({
            sort: "nama_kelas",
            requestKey: null,
          });
          if (!cancelled) {
            setKelasOptions(list);
            setNeedsKelasPicker(true);
          }
        } catch (e) {
          if (!cancelled) setErrorMsg("Gagal memuat daftar kelas.");
        }
      } else {
        if (!cancelled) setNotAllowedRole(true);
      }

      if (!cancelled) setResolvingKelas(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---------------- Data guru pengajar ----------------
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);

  const loadPengajar = useCallback(async () => {
    if (!kelas) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    setErrorMsg(null);
    try {
      // Karena kelas_id sekarang multi-select, kita perlu filter yang berbeda
      // Filter: cari ploting_guru yang memiliki kelas_id mengandung ID kelas yang dipilih
      const records = await pb.collection("ploting_guru").getFullList({
        filter: `kelas_id ~ "${kelas.id}"`,
        expand: "guru_id,mapel_id",
        requestKey: null,
      });

      // Filter manual untuk memastikan kelas_id benar-benar mengandung ID kelas
      const filteredRecords = records.filter((r) => {
        const kelasIds = Array.isArray(r.kelas_id) ? r.kelas_id : [r.kelas_id];
        return kelasIds.includes(kelas.id);
      });

      const list = filteredRecords.map((r) => ({
        id: r.id,
        guru: r.expand?.guru_id || null,
        mapel: r.expand?.mapel_id || null,
        kelasIds: r.kelas_id || [],
      }));

      list.sort((a, b) =>
        (a.mapel?.nama_mapel || "").localeCompare(b.mapel?.nama_mapel || ""),
      );
      setRows(list);
    } catch (e) {
      console.error("Error loading pengajar:", e);
      setErrorMsg("Gagal memuat daftar guru pengajar.");
    } finally {
      setLoadingRows(false);
    }
  }, [kelas]);

  useEffect(() => {
    loadPengajar();
  }, [loadPengajar]);

  const totalMapel = useMemo(
    () => new Set(rows.map((r) => r.mapel?.id).filter(Boolean)).size,
    [rows],
  );
  const totalGuru = useMemo(
    () => new Set(rows.map((r) => r.guru?.id).filter(Boolean)).size,
    [rows],
  );

  // Fungsi untuk handle klik WhatsApp
  const handleWhatsAppClick = (guru, mapel) => {
    const nomor = guru?.no_whatsapp;
    if (!nomor) {
      alert("Nomor WhatsApp tidak tersedia untuk guru ini.");
      return;
    }

    const namaGuru = guru.nama_lengkap || "Guru";
    const namaMapel = mapel?.nama_mapel || "mata pelajaran";
    const namaKelas = kelas?.nama_kelas || "";

    const pesanAwal = `Halo ${namaGuru}, saya ingin berkonsultasi mengenai ${namaMapel}${namaKelas ? ` untuk kelas ${namaKelas}` : ""}.`;

    const url = waLink(nomor, pesanAwal);
    if (url) {
      window.open(url, "_blank");
    }
  };

  // =========================================================
  // Render
  // =========================================================
  if (checkingAuth || resolvingKelas) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto"></div>
          <p className="mt-3 text-sm text-slate-500">Memuat...</p>
        </div>
      </div>
    );
  }

  if (notAllowedRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-medium text-slate-700">
            Halaman ini khusus untuk wali kelas atau guru pendamping.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Silakan hubungi admin jika Anda merasa seharusnya memiliki akses.
          </p>
        </div>
      </div>
    );
  }

  if (noKelasAssigned) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="font-medium text-rose-700">
            Anda belum ditugaskan ke kelas manapun.
          </p>
          <p className="mt-1 text-sm text-rose-600">
            Hubungi admin atau ICT untuk mengatur kelas sebagai wali kelas /
            guru pendamping.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Hero */}
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-sm shadow-indigo-200">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="M4 6.5C4 5.67 4.67 5 5.5 5H12v14H5.5A1.5 1.5 0 0 1 4 17.5v-11Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M20 6.5c0-.83-.67-1.5-1.5-1.5H12v14h6.5a1.5 1.5 0 0 0 1.5-1.5v-11Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Guru Pengajar
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {kelas ? (
              <>
                Daftar guru mapel yang mengajar di kelas{" "}
                <span className="font-medium text-slate-700">
                  {kelas.nama_kelas}
                </span>
              </>
            ) : (
              "Pilih kelas untuk melihat daftar guru pengajar"
            )}
          </p>
        </div>
      </div>

      {/* Pemilih kelas (admin / ict) */}
      {needsKelasPicker && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Pilih Kelas
          </label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={kelas?.id || ""}
            onChange={(e) => {
              const found = kelasOptions.find((k) => k.id === e.target.value);
              setKelas(found || null);
            }}
          >
            <option value="" disabled>
              -- Pilih kelas --
            </option>
            {kelasOptions.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama_kelas}
              </option>
            ))}
          </select>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      {kelas && (
        <>
          {/* Kartu statistik ringkas */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-xs">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-2xl font-semibold text-slate-900">
                {totalMapel}
              </p>
              <p className="text-xs text-slate-500">Mata Pelajaran</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-2xl font-semibold text-slate-900">
                {totalGuru}
              </p>
              <p className="text-xs text-slate-500">Guru Pengajar</p>
            </div>
          </div>

          {loadingRows ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl bg-slate-100"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center">
              <p className="text-sm text-slate-400">
                Belum ada guru yang diploting untuk kelas ini.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((r) => {
                const hasWhatsApp = !!r.guru?.no_whatsapp;
                const palette = paletteForKey(
                  r.mapel?.id || r.mapel?.nama_mapel || "",
                );
                const initials = getInitials(r.guru?.nama_lengkap);

                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.avatar}`}
                        >
                          {initials}
                        </div>
                        <div>
                          <p className="text-sm font-semibold leading-tight text-slate-900">
                            {r.guru?.nama_lengkap || "(guru tidak ditemukan)"}
                          </p>
                          {r.guru && r.guru.is_aktif === false ? (
                            <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              Nonaktif
                            </span>
                          ) : (
                            <p className="mt-0.5 text-xs text-slate-400">
                              {r.mapel?.nama_mapel || "(mapel tidak ditemukan)"}
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${palette.chip}`}
                      >
                        {r.mapel?.nama_mapel || "(mapel tidak ditemukan)"}
                      </span>
                    </div>

                    {/* Tombol WhatsApp */}
                    {hasWhatsApp && r.guru.is_aktif !== false ? (
                      <button
                        onClick={() => handleWhatsAppClick(r.guru, r.mapel)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                      >
                        <WhatsAppIcon />
                        Chat via WhatsApp
                      </button>
                    ) : (
                      <div className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400">
                        {!hasWhatsApp
                          ? "Nomor WA tidak tersedia"
                          : "Guru tidak aktif"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
