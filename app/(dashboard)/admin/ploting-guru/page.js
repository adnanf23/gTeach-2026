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
function eligibleKelasForMapel(mapel, kelasList) {
  if (!mapel) return [];
  const targetTingkat = (mapel.target_tingkat || []).map((t) => Number(t));
  const specificIds = mapel.spesifik_kelas_id || [];
  return kelasList.filter(
    (k) => targetTingkat.includes(k.tingkat) || specificIds.includes(k.id),
  );
}

function mapelSubtitle(mapel) {
  if (!mapel) return "";
  const parts = [];
  if (mapel.target_tingkat && mapel.target_tingkat.length > 0) {
    parts.push(`Tingkat ${mapel.target_tingkat.join(", ")}`);
  }
  if (mapel.spesifik_kelas_id && mapel.spesifik_kelas_id.length > 0) {
    parts.push(`${mapel.spesifik_kelas_id.length} kelas spesifik`);
  }
  return parts.join(" · ");
}

function groupKey(guruId, mapelId) {
  return `${guruId}__${mapelId}`;
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

  // ---------------- Kelompokkan per guru + mapel ----------------
  // Data di database tetap 1 baris per kelas (sesuai skema ploting_guru),
  // tapi di UI kita tampilkan sebagai satu grup "guru X mengajar mapel Y"
  // beserta daftar kelas yang otomatis tercakup.
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of plotingList) {
      const key = groupKey(r.guru_id, r.mapel_id);
      if (!map.has(key)) {
        map.set(key, {
          key,
          guruId: r.guru_id,
          mapelId: r.mapel_id,
          records: [],
        });
      }
      map.get(key).records.push(r);
    }
    return Array.from(map.values()).sort((a, b) => {
      const na = guruById[a.guruId]?.nama_lengkap || "";
      const nb = guruById[b.guruId]?.nama_lengkap || "";
      return na.localeCompare(nb);
    });
  }, [plotingList, guruById]);

  // ---------------- Pencarian ----------------
  const [search, setSearch] = useState("");
  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => {
      const guruName = guruById[g.guruId]?.nama_lengkap || "";
      const mapelName = mapelById[g.mapelId]?.nama_mapel || "";
      const kelasNames = g.records
        .map((r) => kelasById[r.kelas_id]?.nama_kelas || "")
        .join(" ");
      return (
        guruName.toLowerCase().includes(term) ||
        mapelName.toLowerCase().includes(term) ||
        kelasNames.toLowerCase().includes(term)
      );
    });
  }, [groups, search, guruById, mapelById, kelasById]);

  // ---------------- Form modal (create / edit) ----------------
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null); // grup asal saat mode edit
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const selectedMapel = mapelById[form.mapelId] || null;
  const eligibleKelas = useMemo(
    () => eligibleKelasForMapel(selectedMapel, kelasList),
    [selectedMapel, kelasList],
  );

  // Kelas yang sudah tercatat untuk kombinasi guru+mapel yang sedang dipilih di form
  // (di luar grup yang sedang diedit) -- dipakai untuk preview "sudah ada" vs "baru".
  const alreadyAssignedKelasIds = useMemo(() => {
    if (!form.guruId || !form.mapelId) return new Set();
    return new Set(
      plotingList
        .filter(
          (r) =>
            r.guru_id === form.guruId &&
            r.mapel_id === form.mapelId &&
            !(
              editingGroup && editingGroup.records.some((er) => er.id === r.id)
            ),
        )
        .map((r) => r.kelas_id),
    );
  }, [plotingList, form.guruId, form.mapelId, editingGroup]);

  function openCreateModal() {
    setEditingGroup(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(group) {
    setEditingGroup(group);
    setForm({ guruId: group.guruId, mapelId: group.mapelId });
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

    const toCreate = eligible.filter((k) => !alreadyAssignedKelasIds.has(k.id));

    if (toCreate.length === 0 && !editingGroup) {
      setFormError(
        "Guru ini sudah diploting untuk semua kelas pada mapel ini.",
      );
      return;
    }

    setSaving(true);
    try {
      // Mode edit: hapus dulu seluruh assignment lama grup ini, lalu buat ulang
      // sesuai kelas yang berhak untuk guru + mapel yang (mungkin) baru.
      // Ini sekaligus berfungsi sebagai "sinkronisasi" kalau target_tingkat /
      // spesifik_kelas_id di mapel berubah setelah ploting pertama kali dibuat.
      if (editingGroup) {
        await Promise.all(
          editingGroup.records.map((r) =>
            pb.collection("ploting_guru").delete(r.id, { requestKey: null }),
          ),
        );
      }

      await Promise.all(
        toCreate.map((k) =>
          pb
            .collection("ploting_guru")
            .create(
              { guru_id: form.guruId, mapel_id: form.mapelId, kelas_id: k.id },
              { requestKey: null },
            ),
        ),
      );

      setMessage({
        type: "success",
        text: editingGroup
          ? `Ploting diperbarui — tertaut ke ${toCreate.length} kelas.`
          : `Ploting ditambahkan untuk ${toCreate.length} kelas otomatis.`,
      });
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      setFormError("Gagal menyimpan data. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------- Hapus grup ----------------
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteGroup(group) {
    setDeleting(true);
    try {
      await Promise.all(
        group.records.map((r) =>
          pb.collection("ploting_guru").delete(r.id, { requestKey: null }),
        ),
      );
      setMessage({ type: "success", text: "Ploting berhasil dihapus." });
      await loadAll();
    } catch (e) {
      setMessage({
        type: "error",
        text: "Gagal menghapus data. Silakan coba lagi.",
      });
    } finally {
      setDeleting(false);
      setConfirmDeleteKey(null);
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

        {/* Daftar ploting (dikelompokkan per guru + mapel) */}
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
          ) : filteredGroups.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {search
                ? "Tidak ada data yang cocok."
                : "Belum ada data ploting guru."}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredGroups.map((g) => {
                const guru = guruById[g.guruId];
                const mapel = mapelById[g.mapelId];
                const isConfirming = confirmDeleteKey === g.key;

                return (
                  <div key={g.key} className="flex flex-col gap-3 p-4">
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
                          {g.records.length} kelas otomatis tertaut
                        </p>
                      </div>

                      {canManage && (
                        <div className="flex flex-shrink-0 items-center gap-2">
                          {isConfirming ? (
                            <>
                              <span className="text-xs text-slate-500">
                                Yakin hapus?
                              </span>
                              <button
                                onClick={() => handleDeleteGroup(g)}
                                disabled={deleting}
                                className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                              >
                                {deleting ? "..." : "Ya, hapus"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteKey(null)}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                              >
                                Batal
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => openEditModal(g)}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setConfirmDeleteKey(g.key)}
                                className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                Hapus
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Chip daftar kelas yang otomatis tercakup */}
                    <div className="flex flex-wrap gap-1.5">
                      {g.records.map((r) => (
                        <span
                          key={r.id}
                          className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        >
                          {kelasById[r.kelas_id]?.nama_kelas ||
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
              {editingGroup ? "Edit Ploting Guru" : "Tambah Ploting Guru"}
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
                        const already = alreadyAssignedKelasIds.has(k.id);
                        return (
                          <span
                            key={k.id}
                            title={
                              already
                                ? "Sudah tertaut sebelumnya"
                                : "Akan ditambahkan"
                            }
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              already
                                ? "bg-slate-200 text-slate-500"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {k.nama_kelas}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {eligibleKelas.length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      Abu-abu = sudah tertaut sebelumnya, hijau = akan
                      ditambahkan.
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
                    : editingGroup
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
