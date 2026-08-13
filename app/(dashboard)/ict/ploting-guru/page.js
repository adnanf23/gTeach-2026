"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
// Sesuaikan path import berikut dengan lokasi file pocketbase client di project-mu
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// Role user yang dianggap "guru" dan bisa diploting mengajar mapel/kelas.
// Admin & ICT sengaja tidak dimasukkan karena mereka bukan pengajar.
const GURU_ROLES = ["guru walikelas", "guru pendamping", "guru mapel"];

// =========================================================
// Helper
// =========================================================
// Kelas mana saja yang "berhak" untuk sebuah mapel: kelas dengan tingkat
// yang ada di mapel.target_tingkat, ATAU kelas yang ditandai secara spesifik
// di mapel.spesifik_kelas_id. Inilah sumber kebenaran, bukan input manual.
// Aturan: kalau spesifik_kelas_id TERISI, target_tingkat diabaikan sepenuhnya
// (mapel hanya berlaku utk kelas yg tercantum). Kalau KOSONG, berlaku untuk
// semua kelas yang tingkatnya cocok target_tingkat.
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

// =========================================================
// Popup notifikasi (toast)
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
      <style>{`
        @keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
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

const emptyForm = { guruId: "", mapelId: "" };

export default function PlotingGuruPage() {
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

  const canManage = user && (user.role === "admin" || user.role === "ict");

  // ---------------- Data master ----------------
  const [guruList, setGuruList] = useState([]);
  const [mapelList, setMapelList] = useState([]);
  const [kelasList, setKelasList] = useState([]);
  const [plotingList, setPlotingList] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState(null);

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

  // Lookup cepat by id
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

  // ---------------- Sorted list ----------------
  // Satu baris ploting_guru = satu kombinasi guru + mapel, dengan kelas_id
  // berupa array (multi-select). Tidak perlu lagi dikelompokkan manual.
  const sortedPloting = useMemo(() => {
    return [...plotingList].sort((a, b) => {
      const na = guruById[a.guru_id]?.nama_lengkap || "";
      const nb = guruById[b.guru_id]?.nama_lengkap || "";
      return na.localeCompare(nb);
    });
  }, [plotingList, guruById]);

  // ---------------- Pencarian ----------------
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

  // ---------------- Form modal (create / edit) ----------------
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null); // record ploting_guru asal saat mode edit
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

  // Kelas yang sudah tersimpan di record yang sedang diedit (buat preview
  // "tetap" vs "baru ditambah" vs "akan dilepas" ketika mapel/guru berubah).
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

    // Cegah duplikat: satu guru + satu mapel cuma boleh punya 1 record ploting.
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
        // Kalau guru atau mapel diganti (bukan sekadar sinkron ulang kelas),
        // cek dulu apakah ploting lama ini sudah punya Lingkup Materi / Nilai
        // Ujian. Kalau ada, JANGAN diubah diam-diam -- academic data bisa jadi
        // tidak nyambung lagi. Arahkan user hapus dulu lewat tombol "Hapus".
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
              `Tidak bisa mengganti guru/mapel di sini karena masih ada ${lingkup.length} lingkup materi dan ${nilaiUjian.length} nilai ujian terkait ploting ini. Hapus dulu ploting ini lewat tombol "Hapus" di daftar (akan menampilkan ringkasan data yang ikut terhapus), lalu buat ploting baru.`,
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

  // ---------------- Hapus record ----------------
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Ringkasan data terkait (lingkup materi / nilai) yang akan ikut terhapus
  const [deleteImpact, setDeleteImpact] = useState(null); // { id, loading, error, lingkupIds, nilaiUjianIds, nilaiHarianCount, lingkupCount, nilaiUjianCount }

  // Sebelum menghapus, cek dulu apakah ploting ini masih dipakai oleh Lingkup
  // Materi / Nilai Ujian / Nilai Harian. PocketBase menolak (400) menghapus
  // record yang masih direferensikan oleh relasi WAJIB di collection lain,
  // jadi kita perlu bersihkan turunannya dulu sebelum menghapus ploting_guru-nya.
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
        // Urutan hapus wajib dari yang paling "bawah" dulu:
        // nilai harian -> lingkup materi -> nilai ujian -> ploting guru.
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

  // ---------------- Sinkron cepat (tanpa ganti guru/mapel) ----------------
  // Kalau target_tingkat / spesifik_kelas_id di mapel berubah setelah ploting
  // dibuat, tombol ini menyamakan ulang kelas_id tanpa perlu buka modal edit.
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

  // =========================================================
  // Render
  // =========================================================
  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Memuat...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <Toast toast={message} onClose={() => setMessage(null)} />

      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <h1 className="text-xl font-semibold text-slate-900">Ploting Guru</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hubungkan guru dengan mata pelajaran — kelasnya otomatis mengikuti
            tingkat / kelas spesifik pada mapel tersebut.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:justify-between">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari guru, mapel, atau kelas..."
            className="w-full min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:max-w-xs"
          />
          {canManage && (
            <button
              onClick={openCreateModal}
              className="flex-shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Tambah Ploting
            </button>
          )}
        </div>

        {/* Daftar ploting -- satu baris = satu record (guru + mapel + array kelas) */}
        <div className="rounded-xl border border-slate-200 bg-white">
          {loadingData ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-slate-100"
                />
              ))}
            </div>
          ) : filteredPloting.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {search
                ? "Tidak ada data yang cocok."
                : "Belum ada data ploting guru."}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredPloting.map((r) => {
                const guru = guruById[r.guru_id];
                const mapel = mapelById[r.mapel_id];
                const isConfirming = confirmDeleteId === r.id;
                const kelasIds = r.kelas_id || [];

                // Bandingkan kelas tersimpan vs kelas yang seharusnya berlaku
                // sekarang (kalau mapel berubah setelah ploting dibuat).
                const currentEligibleIds = eligibleKelasForMapel(
                  mapel,
                  kelasList,
                ).map((k) => k.id);
                const outOfSync =
                  kelasIds.length !== currentEligibleIds.length ||
                  kelasIds.some((kid) => !currentEligibleIds.includes(kid));

                return (
                  <div key={r.id} className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span className="font-medium text-slate-900">
                            {guru?.nama_lengkap || "(guru tidak ditemukan)"}
                          </span>
                          {guru && guru.is_aktif === false && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              Nonaktif
                            </span>
                          )}
                          <span className="text-slate-400">mengajar</span>
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            {mapel?.nama_mapel || "(mapel tidak ditemukan)"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {kelasIds.length} kelas tertaut
                          {outOfSync && (
                            <span className="ml-1.5 font-medium text-amber-600">
                              · perlu disinkron ulang
                            </span>
                          )}
                        </p>
                      </div>

                      {canManage && (
                        <div className="flex flex-shrink-0 items-center gap-2">
                          {isConfirming ? (
                            <>
                              <button
                                onClick={() => handleDeleteRecord(r)}
                                disabled={deleting || deleteImpact?.loading}
                                className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                              >
                                {deleting ? "..." : "Ya, hapus"}
                              </button>
                              <button
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  setDeleteImpact(null);
                                }}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                              >
                                Batal
                              </button>
                            </>
                          ) : (
                            <>
                              {outOfSync && (
                                <button
                                  onClick={() => handleSyncKelas(r)}
                                  disabled={syncingId === r.id}
                                  className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                                >
                                  {syncingId === r.id
                                    ? "Menyinkron..."
                                    : "Sinkron kelas"}
                                </button>
                              )}
                              <button
                                onClick={() => openEditModal(r)}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => prepareDeleteRecord(r)}
                                className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                Hapus
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ringkasan dampak hapus (lingkup materi / nilai terkait) */}
                    {isConfirming && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {deleteImpact?.loading ? (
                          "Mengecek data terkait..."
                        ) : deleteImpact?.error ? (
                          "Gagal mengecek data terkait, tapi Anda tetap bisa mencoba hapus."
                        ) : deleteImpact &&
                          (deleteImpact.lingkupCount > 0 ||
                            deleteImpact.nilaiUjianCount > 0 ||
                            deleteImpact.nilaiHarianCount > 0) ? (
                          <>
                            Menghapus ploting ini akan ikut menghapus{" "}
                            <span className="font-semibold">
                              {deleteImpact.lingkupCount} lingkup materi
                            </span>
                            ,{" "}
                            <span className="font-semibold">
                              {deleteImpact.nilaiHarianCount} nilai harian
                            </span>
                            , dan{" "}
                            <span className="font-semibold">
                              {deleteImpact.nilaiUjianCount} nilai ujian
                            </span>{" "}
                            yang terkait. Yakin lanjutkan?
                          </>
                        ) : (
                          "Tidak ada data nilai/lingkup materi terkait. Aman untuk dihapus."
                        )}
                      </div>
                    )}

                    {/* Chip daftar kelas yang tertaut */}
                    <div className="flex flex-wrap gap-1.5">
                      {kelasIds.map((kid) => (
                        <span
                          key={kid}
                          className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        >
                          {kelasById[kid]?.nama_kelas ||
                            "(kelas tidak ditemukan)"}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal form tambah/edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">
              {editingRecord ? "Edit Ploting Guru" : "Tambah Ploting Guru"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Cukup pilih guru & mata pelajaran — kelas otomatis ditentukan dari
              data mapel.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Pilih guru */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Guru
                </label>
                <select
                  value={form.guruId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, guruId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">-- Pilih guru --</option>
                  {guruList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nama_lengkap} ({g.role})
                      {g.is_aktif === false ? " · nonaktif" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pilih mapel */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Mata Pelajaran
                </label>
                <select
                  value={form.mapelId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, mapelId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">-- Pilih mata pelajaran --</option>
                  {mapelList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama_mapel} ({m.kode_mapel})
                    </option>
                  ))}
                </select>
                {selectedMapel && mapelSubtitle(selectedMapel) && (
                  <p className="mt-1 text-xs text-slate-400">
                    {mapelSubtitle(selectedMapel)}
                  </p>
                )}
              </div>

              {/* Preview kelas otomatis -- tidak ada input manual di sini */}
              {form.mapelId && (
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-700">
                    Kelas (otomatis)
                  </p>
                  {eligibleKelas.length === 0 ? (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Mapel ini belum punya target tingkat / kelas spesifik.
                      Atur dulu di data mata pelajaran.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
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
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              sudahAda
                                ? "bg-slate-200 text-slate-500"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {k.nama_kelas}
                          </span>
                        );
                      })}
                      {kelasAkanDilepas.map((k) => (
                        <span
                          key={`remove-${k.id}`}
                          title="Sudah tidak eligible, akan dilepas dari ploting ini"
                          className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600 line-through"
                        >
                          {k.nama_kelas}
                        </span>
                      ))}
                    </div>
                  )}
                  {(eligibleKelas.length > 0 ||
                    kelasAkanDilepas.length > 0) && (
                    <p className="mt-1 text-xs text-slate-400">
                      Abu-abu = sudah tertaut, hijau = baru ditambahkan
                      {kelasAkanDilepas.length > 0 &&
                        ", merah coret = akan dilepas"}
                      .
                    </p>
                  )}
                </div>
              )}

              {formError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving
                    ? "Menyimpan..."
                    : editingRecord
                      ? "Simpan Perubahan"
                      : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
