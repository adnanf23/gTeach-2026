"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

/* ═══════════════════════════════════════════════════════════════
   KONSTANTA & HELPER
   ═══════════════════════════════════════════════════════════════ */

const GURU_ROLES = ["guru walikelas", "guru pendamping", "guru mapel"];

function eligibleKelasForMapel(mapel, kelasList) {
  if (!mapel) return [];
  const specificIds = mapel.spesifik_kelas_id || [];
  if (specificIds.length > 0) {
    return kelasList.filter((k) => specificIds.includes(k.id));
  }
  const targetTingkat = (mapel.target_tingkat || []).map((t) => String(t));
  return kelasList.filter((k) => targetTingkat.includes(String(k.tingkat)));
}

function mapelSubtitle(mapel) {
  if (!mapel) return "";
  const specificIds = mapel.spesifik_kelas_id || [];
  if (specificIds.length > 0) {
    return `Khusus ${specificIds.length} kelas`;
  }
  if (mapel.target_tingkat && mapel.target_tingkat.length > 0) {
    return `Tingkat ${mapel.target_tingkat.join(", ")} (semua kelas)`;
  }
  return "";
}

function avatarStyle() {
  return "bg-gray-900 text-white";
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const fieldClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm transition focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10";

/* ═══════════════════════════════════════════════════════════════
   IKON
   ═══════════════════════════════════════════════════════════════ */

const ICON_PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  alert: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
};

function Icon({ name, className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

function Spinner({ className = "h-4 w-4" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOAST — hitam monokrom
   ═══════════════════════════════════════════════════════════════ */

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-sm animate-[toast-in_0.25s_ease-out] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl shadow-slate-900/10 motion-reduce:animate-none"
      >
        <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-white">
          <Icon
            name={toast.type === "success" ? "check" : "alert"}
            className="h-3.5 w-3.5"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {toast.type === "success" ? "Berhasil" : "Terjadi masalah"}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">{toast.text}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Tutup notifikasi"
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}

const emptyForm = { guruId: "", mapelId: "" };

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function PlotingGuruPage() {
  const router = useRouter();

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

  const canManage = user && (user.role === "admin" || user.role === "ict");

  const [guruList, setGuruList] = useState([]);
  const [mapelList, setMapelList] = useState([]);
  const [kelasList, setKelasList] = useState([]);
  const [plotingList, setPlotingList] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState(null);
  const closeToast = useCallback(() => setMessage(null), []);

  const loadAll = useCallback(async () => {
    setLoadingData(true);
    try {
      const [guru, mapel, kelas, ploting] = await Promise.all([
        pb.collection("users").getFullList({
          filter: GURU_ROLES.map((r) => `role="${r}"`).join(" || "),
          sort: "nama_lengkap",
          requestKey: null,
        }),
        pb
          .collection("mata_pelajaran")
          .getFullList({ sort: "nama_mapel", requestKey: null }),
        pb
          .collection("kelas")
          .getFullList({ sort: "nama_kelas", requestKey: null }),
        pb.collection("ploting_guru").getFullList({ requestKey: null }),
      ]);
      setGuruList(guru);
      setMapelList(mapel);
      setKelasList(kelas);
      setPlotingList(ploting);
    } catch (e) {
      setMessage({
        type: "error",
        text: "Gagal memuat data. Silakan muat ulang halaman.",
      });
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadAll();
  }, [user, loadAll]);

  const guruById = useMemo(
    () => Object.fromEntries(guruList.map((g) => [g.id, g])),
    [guruList],
  );
  const mapelById = useMemo(
    () => Object.fromEntries(mapelList.map((m) => [m.id, m])),
    [mapelList],
  );
  const kelasById = useMemo(
    () => Object.fromEntries(kelasList.map((k) => [k.id, k])),
    [kelasList],
  );

  const sortedPloting = useMemo(() => {
    return [...plotingList].sort((a, b) => {
      const na = guruById[a.guru_id]?.nama_lengkap || "";
      const nb = guruById[b.guru_id]?.nama_lengkap || "";
      const byGuru = na.localeCompare(nb);
      if (byGuru !== 0) return byGuru;
      const ma = mapelById[a.mapel_id]?.nama_mapel || "";
      const mb = mapelById[b.mapel_id]?.nama_mapel || "";
      return ma.localeCompare(mb);
    });
  }, [plotingList, guruById, mapelById]);

  const outOfSyncIds = useMemo(() => {
    const set = new Set();
    for (const r of plotingList) {
      const current = eligibleKelasForMapel(
        mapelById[r.mapel_id],
        kelasList,
      ).map((k) => k.id);
      const saved = r.kelas_id || [];
      if (
        saved.length !== current.length ||
        saved.some((kid) => !current.includes(kid))
      ) {
        set.add(r.id);
      }
    }
    return set;
  }, [plotingList, mapelById, kelasList]);

  const guruTerplotingCount = useMemo(
    () => new Set(plotingList.map((r) => r.guru_id)).size,
    [plotingList],
  );

  const [search, setSearch] = useState("");
  const filteredPloting = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sortedPloting;
    return sortedPloting.filter((r) => {
      const guruName = guruById[r.guru_id]?.nama_lengkap || "";
      const mapelName = mapelById[r.mapel_id]?.nama_mapel || "";
      const kelasNames = (r.kelas_id || [])
        .map((kid) => kelasById[kid]?.nama_kelas || "")
        .join(" ");
      return (
        guruName.toLowerCase().includes(term) ||
        mapelName.toLowerCase().includes(term) ||
        kelasNames.toLowerCase().includes(term)
      );
    });
  }, [sortedPloting, search, guruById, mapelById, kelasById]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const r of filteredPloting) {
      const key = r.guru_id || "none";
      if (!map.has(key)) {
        map.set(key, { key, guru: guruById[r.guru_id], items: [] });
      }
      map.get(key).items.push(r);
    }
    return [...map.values()];
  }, [filteredPloting, guruById]);

  /* ── Form modal ─────────────────────────────────────────────── */

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const selectedMapel = mapelById[form.mapelId] || null;
  const eligibleKelas = useMemo(
    () => eligibleKelasForMapel(selectedMapel, kelasList),
    [selectedMapel, kelasList],
  );
  const eligibleKelasIds = useMemo(
    () => eligibleKelas.map((k) => k.id),
    [eligibleKelas],
  );

  const originalKelasIds = useMemo(
    () => new Set(editingRecord?.kelas_id || []),
    [editingRecord],
  );
  const kelasAkanDilepas = useMemo(() => {
    if (!editingRecord) return [];
    return (editingRecord.kelas_id || [])
      .filter((kid) => !eligibleKelasIds.includes(kid))
      .map((kid) => kelasById[kid])
      .filter(Boolean);
  }, [editingRecord, eligibleKelasIds, kelasById]);

  function openCreateModal() {
    setEditingRecord(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(record) {
    setEditingRecord(record);
    setForm({ guruId: record.guru_id, mapelId: record.mapel_id });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    if (!form.guruId || !form.mapelId) {
      setFormError("Guru dan mata pelajaran wajib dipilih.");
      return;
    }

    const mapel = mapelById[form.mapelId];
    const eligible = eligibleKelasForMapel(mapel, kelasList);

    if (eligible.length === 0) {
      setFormError(
        "Mapel ini belum memiliki target tingkat / kelas spesifik. Atur dulu di data mata pelajaran.",
      );
      return;
    }

    const duplikat = plotingList.find(
      (r) =>
        r.guru_id === form.guruId &&
        r.mapel_id === form.mapelId &&
        r.id !== editingRecord?.id,
    );
    if (duplikat) {
      setFormError(
        "Guru ini sudah diploting untuk mapel ini. Edit data yang sudah ada, jangan buat baru.",
      );
      return;
    }

    setSaving(true);
    try {
      const eligibleIds = eligible.map((k) => k.id);

      if (editingRecord) {
        const guruOrMapelBerubah =
          editingRecord.guru_id !== form.guruId ||
          editingRecord.mapel_id !== form.mapelId;

        if (guruOrMapelBerubah) {
          const plotingFilter = `ploting_guru_id="${editingRecord.id}"`;
          const [lingkup, nilaiUjian] = await Promise.all([
            pb
              .collection("lingkup_materi")
              .getFullList({ filter: plotingFilter, requestKey: null }),
            pb
              .collection("nilai_ujian")
              .getFullList({ filter: plotingFilter, requestKey: null }),
          ]);
          if (lingkup.length > 0 || nilaiUjian.length > 0) {
            setFormError(
              `Tidak bisa mengganti guru/mapel di sini karena masih ada ${lingkup.length} lingkup materi dan ${nilaiUjian.length} nilai ujian terkait ploting ini. Hapus dulu ploting ini lewat tombol "Hapus" di daftar, lalu buat ploting baru.`,
            );
            setSaving(false);
            return;
          }
        }

        await pb.collection("ploting_guru").update(
          editingRecord.id,
          {
            guru_id: form.guruId,
            mapel_id: form.mapelId,
            kelas_id: eligibleIds,
          },
          { requestKey: null },
        );

        setMessage({
          type: "success",
          text: `Ploting diperbarui — tertaut ke ${eligibleIds.length} kelas.`,
        });
      } else {
        await pb.collection("ploting_guru").create(
          {
            guru_id: form.guruId,
            mapel_id: form.mapelId,
            kelas_id: eligibleIds,
          },
          { requestKey: null },
        );

        setMessage({
          type: "success",
          text: `Ploting ditambahkan untuk ${eligibleIds.length} kelas otomatis.`,
        });
      }

      setModalOpen(false);
      await loadAll();
    } catch (err) {
      setFormError("Gagal menyimpan data. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  /* ── Hapus ──────────────────────────────────────────────────── */

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState(null);

  async function prepareDeleteRecord(record) {
    setConfirmDeleteId(record.id);
    setDeleteImpact({ id: record.id, loading: true });
    try {
      const plotingFilter = `ploting_guru_id="${record.id}"`;

      const [lingkup, nilaiUjian] = await Promise.all([
        pb
          .collection("lingkup_materi")
          .getFullList({ filter: plotingFilter, requestKey: null }),
        pb
          .collection("nilai_ujian")
          .getFullList({ filter: plotingFilter, requestKey: null }),
      ]);

      let nilaiHarianCount = 0;
      if (lingkup.length > 0) {
        const lingkupFilter = lingkup
          .map((l) => `lingkup_materi_id="${l.id}"`)
          .join(" || ");
        const nilaiHarian = await pb.collection("nilai_harian").getFullList({
          filter: lingkupFilter,
          requestKey: null,
        });
        nilaiHarianCount = nilaiHarian.length;
      }

      setDeleteImpact({
        id: record.id,
        loading: false,
        lingkupIds: lingkup.map((l) => l.id),
        nilaiUjianIds: nilaiUjian.map((n) => n.id),
        lingkupCount: lingkup.length,
        nilaiUjianCount: nilaiUjian.length,
        nilaiHarianCount,
      });
    } catch (e) {
      setDeleteImpact({ id: record.id, loading: false, error: true });
    }
  }

  async function handleDeleteRecord(record) {
    setDeleting(true);
    try {
      const impact =
        deleteImpact && deleteImpact.id === record.id ? deleteImpact : null;

      if (impact && !impact.error) {
        if (impact.lingkupIds.length > 0) {
          const lingkupFilter = impact.lingkupIds
            .map((id) => `lingkup_materi_id="${id}"`)
            .join(" || ");
          const nilaiHarian = await pb.collection("nilai_harian").getFullList({
            filter: lingkupFilter,
            requestKey: null,
          });
          await Promise.all(
            nilaiHarian.map((n) =>
              pb.collection("nilai_harian").delete(n.id, { requestKey: null }),
            ),
          );
          await Promise.all(
            impact.lingkupIds.map((id) =>
              pb.collection("lingkup_materi").delete(id, { requestKey: null }),
            ),
          );
        }
        if (impact.nilaiUjianIds.length > 0) {
          await Promise.all(
            impact.nilaiUjianIds.map((id) =>
              pb.collection("nilai_ujian").delete(id, { requestKey: null }),
            ),
          );
        }
      }

      await pb
        .collection("ploting_guru")
        .delete(record.id, { requestKey: null });
      setMessage({ type: "success", text: "Ploting berhasil dihapus." });
      await loadAll();
    } catch (e) {
      setMessage({
        type: "error",
        text: "Gagal menghapus data. Kemungkinan masih ada data nilai/lingkup materi terkait yang belum bisa dibersihkan otomatis.",
      });
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
      setDeleteImpact(null);
    }
  }

  /* ── Sinkron kelas ──────────────────────────────────────────── */

  const [syncingId, setSyncingId] = useState(null);
  async function handleSyncKelas(record) {
    const mapel = mapelById[record.mapel_id];
    const eligible = eligibleKelasForMapel(mapel, kelasList).map((k) => k.id);
    setSyncingId(record.id);
    try {
      await pb
        .collection("ploting_guru")
        .update(record.id, { kelas_id: eligible }, { requestKey: null });
      setMessage({
        type: "success",
        text: `Kelas disinkronkan ulang (${eligible.length} kelas).`,
      });
      await loadAll();
    } catch (e) {
      setMessage({ type: "error", text: "Gagal menyinkronkan kelas." });
    } finally {
      setSyncingId(null);
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Spinner className="h-5 w-5 text-gray-900" />
          Memuat...
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: "Total ploting",
      value: plotingList.length,
      tone: "text-slate-900",
    },
    {
      label: "Guru terploting",
      value: guruTerplotingCount,
      suffix: `dari ${guruList.length}`,
      tone: "text-slate-900",
    },
    {
      label: "Perlu sinkron",
      value: outOfSyncIds.size,
      tone: outOfSyncIds.size > 0 ? "text-slate-900" : "text-slate-900",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <style>{`
        @keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sheet-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <Toast toast={message} onClose={closeToast} />

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
        {/* Ringkasan */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {stats.map((s) => (
            <div key={s.label} className="px-4 py-3.5 sm:px-5">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p
                className={`mt-1 flex items-baseline gap-1.5 text-2xl font-semibold tabular-nums tracking-tight ${s.tone}`}
              >
                {loadingData ? (
                  <span className="inline-block h-7 w-10 animate-pulse rounded-md bg-slate-100" />
                ) : (
                  <>
                    {s.value}
                    {s.suffix && (
                      <span className="text-xs font-normal text-slate-400">
                        {s.suffix}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <Icon name="search" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari guru, mapel, atau kelas..."
              aria-label="Cari ploting"
              className={`${fieldClass} pl-9 ${search ? "pr-9" : ""}`}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-2 my-auto flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Hapus pencarian"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="ml-auto inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <Icon name="plus" />
              Tambah ploting
            </button>
          )}
        </div>

        {/* Daftar */}
        {loadingData ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-36 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
                <div className="space-y-2.5 px-4 py-4">
                  <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
                  <div className="flex gap-1.5">
                    <div className="h-5 w-14 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-5 w-14 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-5 w-14 animate-pulse rounded-full bg-slate-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Icon name={search ? "search" : "users"} className="h-6 w-6" />
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-800">
              {search ? "Tidak ada hasil yang cocok" : "Belum ada ploting guru"}
            </p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              {search
                ? "Coba kata kunci lain atau hapus pencarian."
                : "Tambahkan ploting pertama untuk menentukan siapa mengajar mapel apa."}
            </p>
            {!search && canManage && (
              <button
                onClick={openCreateModal}
                className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-black"
              >
                <Icon name="plus" />
                Tambah ploting
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const guru = group.guru;
              const guruName = guru?.nama_lengkap || "(guru tidak ditemukan)";

              return (
                <section
                  key={group.key}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <header className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      {initials(guru?.nama_lengkap)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <h3 className="truncate text-sm font-semibold text-slate-900">
                          {guruName}
                        </h3>
                        {guru && guru.is_aktif === false && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            Nonaktif
                          </span>
                        )}
                      </div>
                      {guru?.role && (
                        <p className="text-xs capitalize text-slate-500">
                          {guru.role}
                        </p>
                      )}
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                      {group.items.length} mapel
                    </span>
                  </header>

                  <div className="divide-y divide-slate-100">
                    {group.items.map((r) => {
                      const mapel = mapelById[r.mapel_id];
                      const isConfirming = confirmDeleteId === r.id;
                      const kelasIds = r.kelas_id || [];
                      const outOfSync = outOfSyncIds.has(r.id);
                      const impact =
                        deleteImpact && deleteImpact.id === r.id
                          ? deleteImpact
                          : null;
                      const hasImpact =
                        impact &&
                        !impact.loading &&
                        !impact.error &&
                        (impact.lingkupCount > 0 ||
                          impact.nilaiUjianCount > 0 ||
                          impact.nilaiHarianCount > 0);

                      return (
                        <div key={r.id} className="px-4 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-sm font-medium text-slate-800">
                                  {mapel?.nama_mapel ||
                                    "(mapel tidak ditemukan)"}
                                </span>
                                {mapel?.kode_mapel && (
                                  <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[11px] font-medium text-white">
                                    {mapel.kode_mapel}
                                  </span>
                                )}
                                {outOfSync && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200">
                                    <Icon name="alert" className="h-3 w-3" />
                                    Perlu sinkron
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {kelasIds.length} kelas tertaut
                              </p>
                            </div>

                            {canManage && !isConfirming && (
                              <div className="flex flex-shrink-0 items-center gap-1">
                                {outOfSync && (
                                  <button
                                    onClick={() => handleSyncKelas(r)}
                                    disabled={syncingId === r.id}
                                    className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 text-xs font-medium text-white transition hover:bg-black disabled:opacity-50"
                                  >
                                    {syncingId === r.id ? (
                                      <Spinner className="h-3.5 w-3.5" />
                                    ) : (
                                      <Icon
                                        name="refresh"
                                        className="h-3.5 w-3.5"
                                      />
                                    )}
                                    Sinkron
                                  </button>
                                )}
                                <button
                                  onClick={() => openEditModal(r)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-gray-900 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                                  aria-label={`Edit ploting ${mapel?.nama_mapel || ""}`}
                                  title="Edit"
                                >
                                  <Icon name="edit" />
                                </button>
                                <button
                                  onClick={() => prepareDeleteRecord(r)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-gray-900 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                                  aria-label={`Hapus ploting ${mapel?.nama_mapel || ""}`}
                                  title="Hapus"
                                >
                                  <Icon name="trash" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {kelasIds.length === 0 ? (
                              <span className="text-xs italic text-slate-400">
                                Belum ada kelas tertaut
                              </span>
                            ) : (
                              kelasIds.map((kid) => (
                                <span
                                  key={kid}
                                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                                >
                                  {kelasById[kid]?.nama_kelas ||
                                    "(kelas tidak ditemukan)"}
                                </span>
                              ))
                            )}
                          </div>

                          {isConfirming && (
                            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                              <p className="text-xs leading-relaxed text-zinc-700">
                                {impact?.loading ? (
                                  <span className="inline-flex items-center gap-2">
                                    <Spinner className="h-3.5 w-3.5" />
                                    Mengecek data terkait...
                                  </span>
                                ) : impact?.error ? (
                                  "Gagal mengecek data terkait, tapi Anda tetap bisa mencoba hapus."
                                ) : hasImpact ? (
                                  <>
                                    Menghapus ploting ini akan ikut menghapus{" "}
                                    <span className="font-semibold">
                                      {impact.lingkupCount} lingkup materi
                                    </span>
                                    ,{" "}
                                    <span className="font-semibold">
                                      {impact.nilaiHarianCount} nilai harian
                                    </span>
                                    , dan{" "}
                                    <span className="font-semibold">
                                      {impact.nilaiUjianCount} nilai ujian
                                    </span>{" "}
                                    yang terkait. Yakin lanjutkan?
                                  </>
                                ) : (
                                  "Tidak ada data nilai/lingkup materi terkait. Aman untuk dihapus."
                                )}
                              </p>
                              <div className="mt-2.5 flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    setDeleteImpact(null);
                                  }}
                                  disabled={deleting}
                                  className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Batal
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord(r)}
                                  disabled={deleting || impact?.loading}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition hover:bg-black disabled:opacity-50"
                                >
                                  {deleting && (
                                    <Spinner className="h-3.5 w-3.5" />
                                  )}
                                  Ya, hapus
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal form */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ploting-modal-title"
            className="max-h-[92vh] w-full animate-[sheet-in_0.2s_ease-out] overflow-y-auto rounded-t-3xl bg-white shadow-2xl motion-reduce:animate-none sm:max-w-md sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h2
                  id="ploting-modal-title"
                  className="text-base font-semibold text-slate-900"
                >
                  {editingRecord ? "Edit ploting guru" : "Tambah ploting guru"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Pilih guru dan mata pelajaran. Kelas ditentukan otomatis dari
                  data mapel.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="-mr-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Tutup"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
              <div>
                <label
                  htmlFor="ploting-guru"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Guru
                </label>
                <select
                  id="ploting-guru"
                  value={form.guruId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, guruId: e.target.value }))
                  }
                  className={fieldClass}
                >
                  <option value="">Pilih guru</option>
                  {guruList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nama_lengkap} ({g.role})
                      {g.is_aktif === false ? " · nonaktif" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="ploting-mapel"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Mata pelajaran
                </label>
                <select
                  id="ploting-mapel"
                  value={form.mapelId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, mapelId: e.target.value }))
                  }
                  className={fieldClass}
                >
                  <option value="">Pilih mata pelajaran</option>
                  {mapelList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama_mapel} ({m.kode_mapel})
                    </option>
                  ))}
                </select>
                {selectedMapel && mapelSubtitle(selectedMapel) && (
                  <p className="mt-1.5 text-xs text-slate-400">
                    {mapelSubtitle(selectedMapel)}
                  </p>
                )}
              </div>

              {form.mapelId && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">
                      Kelas tertaut
                    </p>
                    {eligibleKelas.length > 0 && (
                      <span className="text-xs text-slate-400">
                        {eligibleKelas.length} kelas
                      </span>
                    )}
                  </div>
                  {eligibleKelas.length === 0 ? (
                    <div className="flex items-start gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-xs text-zinc-700 ring-1 ring-zinc-200">
                      <Icon
                        name="alert"
                        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                      />
                      Mapel ini belum punya target tingkat / kelas spesifik.
                      Atur dulu di data mata pelajaran.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      {eligibleKelas.map((k) => {
                        const sudahAda = originalKelasIds.has(k.id);
                        return (
                          <span
                            key={k.id}
                            title={
                              sudahAda
                                ? "Sudah tertaut sebelumnya"
                                : "Akan ditambahkan"
                            }
                            className={
                              sudahAda
                                ? "rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                                : "rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-medium text-white"
                            }
                          >
                            {k.nama_kelas}
                          </span>
                        );
                      })}
                      {kelasAkanDilepas.map((k) => (
                        <span
                          key={`remove-${k.id}`}
                          title="Sudah tidak eligible, akan dilepas dari ploting ini"
                          className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-500 line-through"
                        >
                          {k.nama_kelas}
                        </span>
                      ))}
                    </div>
                  )}
                  {(eligibleKelas.length > 0 ||
                    kelasAkanDilepas.length > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-slate-300" />
                        Sudah tertaut
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-gray-900" />
                        Baru ditambahkan
                      </span>
                      {kelasAkanDilepas.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-zinc-400" />
                          Akan dilepas
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-sm text-zinc-800 ring-1 ring-zinc-200"
                >
                  <Icon name="alert" className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>{formError}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-black disabled:opacity-60"
                >
                  {saving && <Spinner />}
                  {saving
                    ? "Menyimpan..."
                    : editingRecord
                      ? "Simpan perubahan"
                      : "Tambah ploting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
