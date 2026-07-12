"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
// Sesuaikan path import berikut dengan lokasi file pocketbase client di project-mu
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// =========================================================
// Konfigurasi status absensi (warna & label) -- sama seperti halaman absensi utama
// =========================================================
const STATUS_CONFIG = {
  hadir: {
    label: "Hadir",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  izin: {
    label: "Izin",
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 border border-sky-200",
  },
  sakit: {
    label: "Sakit",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  alpha: {
    label: "Alpha",
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 border border-rose-200",
  },
};
const STATUS_ORDER = ["hadir", "izin", "sakit", "alpha"];

const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const HARI_PANJANG = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// =========================================================
// Helper tanggal
// =========================================================
function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isSameDate(a, b) {
  return a && b && toISODate(a) === toISODate(b);
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function formatLong(d) {
  return `${HARI_PANJANG[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export default function AbsensiGuruMapelPage() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);

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

  // ---------------- Resolusi kelas yang boleh dilihat ----------------
  // Logika: guru mapel hanya boleh melihat kelas yang dia ampu lewat ploting_guru
  // (guru_id = user.id). Admin/ICT boleh pilih kelas manapun untuk keperluan cek.
  // Wali kelas / guru pendamping diarahkan ke halaman Absensi Kelas (yang bisa edit).
  const [kelasAccessList, setKelasAccessList] = useState([]); // [{ id, nama_kelas, mapelNames: [] }]
  const [kelas, setKelas] = useState(null);
  const [notAllowedRole, setNotAllowedRole] = useState(false);
  const [noKelasAssigned, setNoKelasAssigned] = useState(false);
  const [resolving, setResolving] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function resolve() {
      setResolving(true);
      setNoKelasAssigned(false);
      setNotAllowedRole(false);
      const role = user.role;

      if (role === "guru mapel") {
        try {
          const ploting = await pb.collection("ploting_guru").getFullList({
            filter: `guru_id="${user.id}"`,
            expand: "kelas_id,mapel_id",
            requestKey: null,
          });
          if (ploting.length === 0) {
            if (!cancelled) setNoKelasAssigned(true);
          } else {
            const byKelas = new Map();
            for (const p of ploting) {
              const k = p.expand?.kelas_id;
              const m = p.expand?.mapel_id;
              if (!k) continue;
              if (!byKelas.has(k.id)) {
                byKelas.set(k.id, {
                  id: k.id,
                  nama_kelas: k.nama_kelas,
                  mapelNames: [],
                });
              }
              if (m) byKelas.get(k.id).mapelNames.push(m.nama_mapel);
            }
            const list = Array.from(byKelas.values()).sort((a, b) =>
              a.nama_kelas.localeCompare(b.nama_kelas),
            );
            if (!cancelled) {
              setKelasAccessList(list);
              setKelas(list[0] || null);
            }
          }
        } catch (e) {
          if (!cancelled) setErrorMsg("Gagal memuat kelas yang Anda ampu.");
        }
      } else if (role === "admin" || role === "ict") {
        try {
          const list = await pb
            .collection("kelas")
            .getFullList({ sort: "nama_kelas", requestKey: null });
          if (!cancelled) {
            setKelasAccessList(
              list.map((k) => ({
                id: k.id,
                nama_kelas: k.nama_kelas,
                mapelNames: [],
              })),
            );
            setKelas(list[0] || null);
          }
        } catch (e) {
          if (!cancelled) setErrorMsg("Gagal memuat daftar kelas.");
        }
      } else {
        if (!cancelled) setNotAllowedRole(true);
      }

      if (!cancelled) setResolving(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---------------- Daftar siswa di kelas terpilih ----------------
  const [siswaList, setSiswaList] = useState([]);
  const [loadingSiswa, setLoadingSiswa] = useState(false);

  useEffect(() => {
    if (!kelas) {
      setSiswaList([]);
      return;
    }
    let cancelled = false;

    async function load() {
      setLoadingSiswa(true);
      try {
        const list = await pb.collection("siswa").getFullList({
          filter: `kelas_id="${kelas.id}"`,
          sort: "nama_siswa",
          requestKey: null,
        });
        if (!cancelled) setSiswaList(list);
      } catch (e) {
        if (!cancelled) setErrorMsg("Gagal memuat daftar siswa.");
      } finally {
        if (!cancelled) setLoadingSiswa(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [kelas]);

  // ---------------- Kalender (read-only) ----------------
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [monthAbsensi, setMonthAbsensi] = useState({});
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  const loadMonth = useCallback(async () => {
    if (!kelas) return;
    setLoadingCalendar(true);
    try {
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const startStr = `${toISODate(first)} 00:00:00`;
      const endStr = `${toISODate(last)} 23:59:59`;

      const records = await pb.collection("absensi").getFullList({
        filter: `kelas_id="${kelas.id}" && tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
        requestKey: null,
      });

      const grouped = {};
      for (const r of records) {
        const key = toISODate(new Date(r.tanggal));
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      }
      setMonthAbsensi(grouped);
    } catch (e) {
      setErrorMsg("Gagal memuat data absensi bulan ini.");
    } finally {
      setLoadingCalendar(false);
    }
  }, [kelas, viewDate]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  function daySummary(date) {
    const key = toISODate(date);
    const records = monthAbsensi[key] || [];
    if (records.length === 0) return null;
    const counts = { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
    for (const r of records) {
      if (counts[r.status] !== undefined) counts[r.status]++;
    }
    return { total: records.length, counts };
  }

  // ---------------- Detail hari (view-only) ----------------
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailRows, setDetailRows] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openDetail = useCallback(
    (date) => {
      setSelectedDate(date);
      if (siswaList.length === 0) {
        setDetailRows([]);
        return;
      }
      setLoadingDetail(true);
      const dateStr = toISODate(date);
      const existing = monthAbsensi[dateStr] || [];
      const byStudent = {};
      for (const r of existing) byStudent[r.siswa_id] = r;

      const rows = siswaList.map((s) => ({
        siswaId: s.id,
        nama: s.nama_siswa,
        nis: s.nis,
        status: byStudent[s.id]?.status || null,
      }));
      setDetailRows(rows);
      setLoadingDetail(false);
    },
    [siswaList, monthAbsensi],
  );

  function goToMonth(offset) {
    setViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    openDetail(today);
  }

  // ---------------- Grid kalender ----------------
  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = (firstOfMonth.getDay() + 6) % 7;

    const arr = [];
    for (let i = 0; i < leading; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewDate]);

  // =========================================================
  // Render
  // =========================================================
  if (checkingAuth || resolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Memuat...</p>
      </div>
    );
  }

  if (notAllowedRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-medium text-slate-700">
            Halaman ini khusus untuk guru mapel.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Wali kelas / guru pendamping silakan gunakan halaman Absensi Kelas
            untuk mengisi absensi.
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
            Anda belum diploting mengajar di kelas manapun.
          </p>
          <p className="mt-1 text-sm text-rose-600">
            Hubungi admin atau ICT untuk diatur ploting mengajarnya.
          </p>
        </div>
      </div>
    );
  }

  const totalSiswa = siswaList.length;
  const currentEntry = kelasAccessList.find((k) => k.id === kelas?.id);

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Catatan read-only */}
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
            i
          </span>
          Halaman ini hanya untuk melihat absensi. Pengisian & perubahan absensi
          dilakukan oleh wali kelas / guru pendamping.
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}

        {/* Pemilih kelas kalau guru mengampu / boleh akses lebih dari 1 kelas */}
        {kelasAccessList.length > 1 && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Pilih Kelas
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={kelas?.id || ""}
              onChange={(e) => {
                const found = kelasAccessList.find(
                  (k) => k.id === e.target.value,
                );
                setKelas(
                  found ? { id: found.id, nama_kelas: found.nama_kelas } : null,
                );
                setSelectedDate(null);
                setDetailRows([]);
              }}
            >
              {kelasAccessList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama_kelas}
                  {k.mapelNames?.length > 0
                    ? ` (${k.mapelNames.join(", ")})`
                    : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {kelas && (
          <>
            {/* Kartu kalender */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              {/* Navigasi bulan */}
              <div className="mb-4 flex flex-wrap items-center justify-center gap-2 sm:justify-between">
                <div className="order-1 flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto">
                  <span className="text-base font-semibold text-slate-900 sm:text-sm md:text-base">
                    {BULAN[viewDate.getMonth()]} {viewDate.getFullYear()}
                  </span>
                  <button
                    onClick={goToToday}
                    className="flex-shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    Hari ini
                  </button>
                </div>
                <button
                  onClick={() => goToMonth(-1)}
                  className="order-2 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 sm:order-none sm:flex-none sm:px-3 sm:text-sm"
                >
                  <span aria-hidden>←</span>{" "}
                  <span className="hidden sm:inline">Sebelumnya</span>
                </button>
                <button
                  onClick={() => goToMonth(1)}
                  className="order-3 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 sm:order-none sm:flex-none sm:px-3 sm:text-sm"
                >
                  <span className="hidden sm:inline">Berikutnya</span>{" "}
                  <span aria-hidden>→</span>
                </button>
              </div>

              {/* Header hari */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-500 sm:gap-1.5 sm:text-xs">
                {HARI_PENDEK.map((h) => (
                  <div key={h} className="py-1">
                    {h}
                  </div>
                ))}
              </div>

              {/* Grid tanggal */}
              <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
                {loadingCalendar &&
                  Array.from({ length: 35 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square animate-pulse rounded-lg bg-slate-100"
                    />
                  ))}

                {!loadingCalendar &&
                  cells.map((date, i) => {
                    if (!date) return <div key={i} className="aspect-square" />;

                    const isFuture = date > today;
                    const isToday = isSameDate(date, today);
                    const isSelected =
                      selectedDate && isSameDate(date, selectedDate);
                    const summary = daySummary(date);

                    return (
                      <button
                        key={i}
                        disabled={isFuture}
                        onClick={() => openDetail(date)}
                        className={`relative flex aspect-square min-w-0 flex-col items-center justify-start overflow-hidden rounded-md border p-0.5 text-left transition sm:rounded-lg sm:p-1
                          ${isFuture ? "cursor-not-allowed border-transparent text-slate-300" : "cursor-pointer border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40"}
                          ${isSelected ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : ""}
                        `}
                      >
                        <span
                          className={`mt-0.5 text-[10px] font-medium sm:text-xs ${
                            isToday
                              ? "flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white sm:h-5 sm:w-5"
                              : "text-slate-700"
                          }`}
                        >
                          {date.getDate()}
                        </span>

                        {summary && (
                          <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 sm:mt-1">
                            {STATUS_ORDER.filter(
                              (s) => summary.counts[s] > 0,
                            ).map((s) => (
                              <span
                                key={s}
                                title={`${STATUS_CONFIG[s].label}: ${summary.counts[s]}`}
                                className={`h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5 ${STATUS_CONFIG[s].dot}`}
                              />
                            ))}
                          </div>
                        )}
                        {!summary && !isFuture && (
                          <span className="mt-0.5 h-1 w-1 rounded-full border border-slate-300 sm:mt-1 sm:h-1.5 sm:w-1.5" />
                        )}
                      </button>
                    );
                  })}
              </div>

              {/* Legenda */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 sm:gap-3 sm:text-xs">
                {STATUS_ORDER.map((s) => (
                  <span key={s} className="flex items-center gap-1">
                    <span
                      className={`h-2 w-2 rounded-full ${STATUS_CONFIG[s].dot}`}
                    />
                    {STATUS_CONFIG[s].label}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full border border-slate-300" />
                  Belum diabsen
                </span>
              </div>
            </div>

            {/* Panel detail (read-only) */}
            {selectedDate && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    Detail Absensi
                  </h2>
                  <p className="text-sm text-slate-500">
                    {formatLong(selectedDate)}
                  </p>
                </div>

                {loadingSiswa || loadingDetail ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    Memuat data siswa...
                  </p>
                ) : totalSiswa === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    Belum ada siswa terdaftar di kelas ini.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {detailRows.map((row) => (
                      <div
                        key={row.siswaId}
                        className="flex items-center justify-between py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {row.nama}
                          </p>
                          {row.nis && (
                            <p className="text-xs text-slate-400">
                              NIS: {row.nis}
                            </p>
                          )}
                        </div>
                        {row.status ? (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CONFIG[row.status].chip}`}
                          >
                            {STATUS_CONFIG[row.status].label}
                          </span>
                        ) : (
                          <span className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-400">
                            Belum diabsen
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
