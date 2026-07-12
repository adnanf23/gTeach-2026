"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

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
  const date = new Date(d);
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulan = [
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
  return `${hari[date.getDay()]}, ${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
}

const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
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
// Toast Notifikasi
// =========================================================
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  const isSuccess = toast.type === "success";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="alert"
        className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-[toast-in_0.2s_ease-out] ${
          isSuccess
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}
      >
        <span
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            isSuccess ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {isSuccess ? "✓" : "!"}
        </span>
        <p className="flex-1 text-sm font-medium">{toast.text}</p>
        <button
          onClick={onClose}
          className="text-lg leading-none text-current opacity-50 hover:opacity-100"
          aria-label="Tutup notifikasi"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// =========================================================
// Modal Form Agenda (hanya deskripsi)
// =========================================================
function AgendaModal({ isOpen, onClose, onSubmit, initialData, defaultDate }) {
  const [deskripsi, setDeskripsi] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialData) {
      setDeskripsi(initialData.deskripsi || "");
    } else {
      setDeskripsi("");
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!deskripsi.trim()) {
      return;
    }

    setLoading(true);
    try {
      const data = {
        deskripsi: deskripsi.trim(),
        date: initialData ? initialData.date : defaultDate,
      };

      if (initialData) {
        data.id = initialData.id;
      }

      await onSubmit(data);
      onClose();
    } catch (err) {
      console.error("Error submitting agenda:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            {initialData ? "Edit Agenda" : "Tambah Agenda Baru"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Deskripsi Kegiatan <span className="text-red-500">*</span>
            </label>
            <textarea
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              placeholder="Masukkan deskripsi kegiatan..."
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
              autoFocus
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Tanggal:{" "}
              {initialData
                ? formatLong(initialData.date)
                : formatLong(defaultDate)}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Menyimpan..." : initialData ? "Update" : "Simpan"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================
// Main Page
// =========================================================
export default function AgendaMengajarPage() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);

  // Auth
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);

  // Kelas
  const [kelas, setKelas] = useState(null);
  const [kelasOptions, setKelasOptions] = useState([]);
  const [needsKelasPicker, setNeedsKelasPicker] = useState(false);
  const [noKelasAssigned, setNoKelasAssigned] = useState(false);
  const [resolvingKelas, setResolvingKelas] = useState(true);

  // Kalender
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [monthAgenda, setMonthAgenda] = useState({});
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [message, setMessage] = useState(null);

  // Detail
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [modalDefaultDate, setModalDefaultDate] = useState(null);

  // =========================================================
  // Auth & Kelas Resolution
  // =========================================================
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getCurrentUser());
    setCheckingAuth(false);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function resolve() {
      setResolvingKelas(true);
      setNoKelasAssigned(false);
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
      } else {
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
          if (!cancelled)
            setMessage({ type: "error", text: "Gagal memuat daftar kelas." });
        }
      }
      if (!cancelled) setResolvingKelas(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // =========================================================
  // Load Month Agenda
  // =========================================================
  const loadMonth = useCallback(async () => {
    const activeKelas = needsKelasPicker ? kelas : kelas;
    if (!activeKelas) return;

    setLoadingCalendar(true);
    try {
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const startStr = `${toISODate(first)} 00:00:00`;
      const endStr = `${toISODate(last)} 23:59:59`;

      const records = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${activeKelas.id}" && date >= "${startStr}" && date <= "${endStr}"`,
        sort: "date",
        requestKey: null,
      });

      const grouped = {};
      for (const r of records) {
        const key = toISODate(new Date(r.date));
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      }
      setMonthAgenda(grouped);
    } catch (e) {
      setMessage({
        type: "error",
        text: "Gagal memuat data agenda bulan ini.",
      });
    } finally {
      setLoadingCalendar(false);
    }
  }, [kelas, viewDate, needsKelasPicker]);

  useEffect(() => {
    if (kelas) {
      loadMonth();
    }
  }, [loadMonth, kelas]);

  // =========================================================
  // Day Summary
  // =========================================================
  function daySummary(date) {
    const key = toISODate(date);
    const items = monthAgenda[key] || [];
    return items.length > 0 ? { total: items.length } : null;
  }

  // =========================================================
  // Open Detail
  // =========================================================
  const openDetail = useCallback(
    async (date) => {
      setSelectedDate(date);
      setMessage(null);
      const activeKelas = needsKelasPicker ? kelas : kelas;
      if (!activeKelas) {
        setDetailItems([]);
        return;
      }
      setLoadingDetail(true);
      try {
        const dateStr = toISODate(date);
        const items = monthAgenda[dateStr] || [];
        setDetailItems(items);
      } finally {
        setLoadingDetail(false);
      }
    },
    [kelas, monthAgenda, needsKelasPicker],
  );

  // =========================================================
  // CRUD Operations
  // =========================================================
  const handleCreate = async (data) => {
    try {
      const activeKelas = needsKelasPicker ? kelas : kelas;
      const created = await pb.collection("agenda_mengajar").create(
        {
          deskripsi: data.deskripsi,
          date: data.date,
          kelas_id: activeKelas.id,
        },
        {
          requestKey: null,
        },
      );
      setMessage({ type: "success", text: "Agenda berhasil ditambahkan!" });
      await loadMonth();
      if (selectedDate) {
        const dateStr = toISODate(selectedDate);
        const items = monthAgenda[dateStr] || [];
        setDetailItems([...items, created]);
      }
    } catch (err) {
      console.error("Error creating agenda:", err);
      setMessage({ type: "error", text: "Gagal menambahkan agenda." });
      throw err;
    } finally {
      location.reload();
    }
  };

  const handleUpdate = async (data) => {
    if (!editingItem) return;
    try {
      const updated = await pb.collection("agenda_mengajar").update(
        editingItem.id,
        {
          deskripsi: data.deskripsi,
        },
        { requestKey: null },
      );
      setMessage({ type: "success", text: "Agenda berhasil diperbarui!" });
      await loadMonth();
      if (selectedDate) {
        const dateStr = toISODate(selectedDate);
        const items = monthAgenda[dateStr] || [];
        setDetailItems(items);
      }
    } catch (err) {
      console.error("Error updating agenda:", err);
      setMessage({ type: "error", text: "Gagal memperbarui agenda." });
      throw err;
    } finally {
      location.reload();
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Yakin ingin menghapus agenda ini?")) return;

    try {
      await pb.collection("agenda_mengajar").delete(id, { requestKey: null });
      setMessage({ type: "success", text: "Agenda berhasil dihapus!" });
      await loadMonth();
      if (selectedDate) {
        const dateStr = toISODate(selectedDate);
        const items = monthAgenda[dateStr] || [];
        setDetailItems(items);
      }
      location.reload();
    } catch (err) {
      console.error("Error deleting agenda:", err);
      setMessage({ type: "error", text: "Gagal menghapus agenda." });
    }
  };

  // =========================================================
  // Navigation
  // =========================================================
  function goToMonth(offset) {
    setViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    openDetail(today);
  }

  // =========================================================
  // Open Modal with Default Values
  // =========================================================
  const openAddModal = (date) => {
    setEditingItem(null);
    setModalDefaultDate(date ? toISODate(date) : toISODate(new Date()));
    setIsModalOpen(true);
  };

  // =========================================================
  // Build Calendar Grid
  // =========================================================
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
  // Get Kelas Name
  // =========================================================
  const getKelasName = (kelasId) => {
    const found = kelasOptions.find((k) => k.id === kelasId);
    return found?.nama_kelas || "Kelas tidak ditemukan";
  };

  // =========================================================
  // Render
  // =========================================================
  if (checkingAuth || resolvingKelas) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Memuat...</p>
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

  const activeKelas = needsKelasPicker ? kelas : kelas;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Toast toast={message} onClose={() => setMessage(null)} />

      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Pemilih kelas (admin / ict) */}
        {needsKelasPicker && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Pilih Kelas
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={kelas?.id || ""}
              onChange={(e) => {
                const found = kelasOptions.find((k) => k.id === e.target.value);
                setKelas(found || null);
                setSelectedDate(null);
                setDetailItems([]);
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

        {activeKelas && (
          <>
            {/* Kartu kalender */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              {/* Header + Tombol Tambah */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-slate-900 sm:text-sm md:text-base">
                    {BULAN[viewDate.getMonth()]} {viewDate.getFullYear()}
                  </span>
                  <button
                    onClick={goToToday}
                    className="flex-shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    Hari ini
                  </button>
                  {!needsKelasPicker && (
                    <span className="ml-2 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                      {kelas?.nama_kelas}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openAddModal(selectedDate || today)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    + Tambah
                  </button>
                </div>
              </div>

              {/* Navigasi bulan */}
              <div className="mb-4 flex flex-wrap items-center justify-center gap-2 sm:justify-between">
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
                          ${
                            isFuture
                              ? "cursor-not-allowed border-transparent text-slate-300"
                              : "cursor-pointer border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40"
                          }
                          ${
                            isSelected
                              ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                              : ""
                          }
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

                        {/* Badge jumlah agenda */}
                        {summary && summary.total > 0 && (
                          <span className="mt-0.5 text-[8px] font-medium text-indigo-600 sm:text-[9px]">
                            {summary.total} agenda
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>

              {/* Legenda */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 sm:gap-3 sm:text-xs">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  Ada agenda
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full border border-slate-300" />
                  Tidak ada agenda
                </span>
              </div>
            </div>

            {/* Panel detail agenda per tanggal */}
            {selectedDate && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Agenda Mengajar
                    </h2>
                    <p className="text-sm text-slate-500">
                      {formatLong(selectedDate)}
                    </p>
                  </div>
                  {!loadingDetail && (
                    <button
                      onClick={() => openAddModal(selectedDate)}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      + Tambah Agenda
                    </button>
                  )}
                </div>

                {loadingDetail ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    Memuat agenda...
                  </p>
                ) : detailItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <p className="text-sm text-slate-400">
                      Belum ada agenda untuk tanggal ini
                    </p>
                    <button
                      onClick={() => openAddModal(selectedDate)}
                      className="mt-2 text-sm font-semibold text-indigo-600 hover:underline"
                    >
                      Tambah agenda sekarang
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 transition hover:border-slate-200 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800">
                            {item.deskripsi}
                          </p>
                          <p className="text-xs text-slate-400">
                            Kelas:{" "}
                            {needsKelasPicker
                              ? getKelasName(item.kelas_id)
                              : kelas?.nama_kelas}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setModalDefaultDate(null);
                              setIsModalOpen(true);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                            title="Edit"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Hapus"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!loadingDetail && detailItems.length > 0 && (
                  <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Tutup
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      <AgendaModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
          setModalDefaultDate(null);
        }}
        onSubmit={editingItem ? handleUpdate : handleCreate}
        initialData={editingItem}
        defaultDate={modalDefaultDate || toISODate(today)}
      />
    </div>
  );
}
