"use client";

// app/walikelas/kehadiran/page.js
// Kelola ketidakhadiran manual (kehadiran_manual) per siswa di kelas walikelas.
// - Field di UI:  Sakit | Izin | Alpha (Tanpa Keterangan)
// - Field di DB:  sakit | izin | hadir    ← `hadir` dipetakan ke Alpha di UI
// - Hanya baris yang berubah yang disimpan (batch create/update).

import { useEffect, useMemo, useState } from "react";
import { getCurrentUser, pb } from "@/lib/pocketbase";

const CARD_SHADOW = "shadow-[0_4px_14px_rgba(99,120,200,0.12)]";

export default function KehadiranManualPage() {
  const user = getCurrentUser();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kelas, setKelas] = useState(null);
  const [siswaList, setSiswaList] = useState([]);
  const [values, setValues] = useState({}); // siswaId -> {sakit, izin, alpha}
  const [saved, setSaved] = useState({}); // snapshot terakhir yang tersimpan
  const [recordIds, setRecordIds] = useState({}); // siswaId -> recordId (jika sudah ada)
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [q, setQ] = useState("");

  /* ───── load data ───── */
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError("");

        const kelasData = await pb
          .collection("kelas")
          .getFirstListItem(
            `walikelas_id = "${userId}" || pendamping_id = "${userId}"`,
            { requestKey: null },
          );
        setKelas(kelasData);

        const [siswaData, kehadiranData] = await Promise.all([
          pb.collection("siswa").getFullList({
            filter: `kelas_id = "${kelasData.id}"`,
            sort: "nama_siswa",
            requestKey: null,
          }),
          pb
            .collection("kehadiran_manual")
            .getFullList({
              filter: `kelas_id = "${kelasData.id}"`,
              requestKey: null,
            })
            .catch((err) => {
              console.warn("kehadiran_manual tidak bisa dibaca:", err?.status);
              return [];
            }),
        ]);

        setSiswaList(siswaData);

        const initValues = {};
        const initIds = {};

        siswaData.forEach((s) => {
          const rec = kehadiranData.find((k) => k.siswa_id === s.id);
          // Mapping UI ↔ DB:
          //   UI alpha  ↔  DB `hadir`
          initValues[s.id] = {
            sakit: Number(rec?.sakit ?? 0),
            izin: Number(rec?.izin ?? 0),
            alpha: Number(rec?.hadir ?? 0),
          };
          if (rec) initIds[s.id] = rec.id;
        });

        setValues(initValues);
        setSaved(JSON.parse(JSON.stringify(initValues)));
        setRecordIds(initIds);
      } catch (e) {
        if (e?.status !== 404 && !e?.isAbort) {
          console.error(e);
          setError("Gagal memuat data kelas / kehadiran.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  /* ───── update value ───── */
  const updateField = (siswaId, field, raw) => {
    const num = Math.max(0, Math.floor(Number(raw) || 0));
    setValues((prev) => ({
      ...prev,
      [siswaId]: { ...prev[siswaId], [field]: num },
    }));
  };

  const isDirty = (siswaId) => {
    const a = values[siswaId];
    const b = saved[siswaId];
    if (!a || !b) return false;
    return a.sakit !== b.sakit || a.izin !== b.izin || a.alpha !== b.alpha;
  };

  const anyDirty = useMemo(
    () => siswaList.some((s) => isDirty(s.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siswaList, values, saved],
  );

  const filteredSiswa = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return siswaList;
    return siswaList.filter((x) =>
      `${x.nama_siswa} ${x.nis || ""} ${x.nisn || ""}`
        .toLowerCase()
        .includes(s),
    );
  }, [siswaList, q]);

  /* ───── simpan semua perubahan ───── */
  async function saveAll() {
    if (!kelas || saving) return;
    const tasksWithSiswaId = [];

    for (const s of siswaList) {
      if (!isDirty(s.id)) continue;
      const v = values[s.id];
      const payload = {
        siswa_id: s.id,
        kelas_id: kelas.id,
        // UI: sakit / izin / alpha
        // DB: sakit / izin / hadir   ← alpha masuk ke `hadir`
        sakit: v.sakit,
        izin: v.izin,
        hadir: v.alpha,
      };

      const rid = recordIds[s.id];
      if (rid) {
        tasksWithSiswaId.push({
          siswaId: s.id,
          promise: pb
            .collection("kehadiran_manual")
            .update(rid, payload, { requestKey: null }),
        });
      } else {
        tasksWithSiswaId.push({
          siswaId: s.id,
          promise: pb
            .collection("kehadiran_manual")
            .create(payload, { requestKey: null }),
        });
      }
    }

    if (tasksWithSiswaId.length === 0) {
      setMessage("Tidak ada perubahan untuk disimpan.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const results = await Promise.all(tasksWithSiswaId.map((t) => t.promise));

      setRecordIds((prev) => {
        const next = { ...prev };
        tasksWithSiswaId.forEach((t, i) => {
          next[t.siswaId] = results[i].id;
        });
        return next;
      });
      setSaved(JSON.parse(JSON.stringify(values)));
      setMessage(`Berhasil menyimpan ${tasksWithSiswaId.length} data siswa.`);
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      console.error(e);
      setError(
        "Gagal menyimpan. Periksa koneksi atau aturan akses `kehadiran_manual`.",
      );
    } finally {
      setSaving(false);
    }
  }

  /* ───── reset perubahan ───── */
  function resetAll() {
    setValues(JSON.parse(JSON.stringify(saved)));
    setMessage("Perubahan dibatalkan.");
    setTimeout(() => setMessage(""), 2000);
  }

  /* ───── render ───── */
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div
          className={`flex items-center justify-center gap-2 rounded-2xl bg-white py-12 text-[13px] text-gray-400 ${CARD_SHADOW}`}
        >
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
          Memuat data kelas…
        </div>
      </div>
    );
  }

  if (!kelas) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-2xl bg-white p-6 text-center shadow-md">
          <h1 className="text-[16px] font-semibold text-gray-900">
            Kelas tidak ditemukan
          </h1>
          <p className="mt-1 text-[13px] text-gray-500">
            Akun Anda belum terdaftar sebagai wali kelas atau pendamping kelas
            mana pun.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-gray-900">
          Ketidakhadiran Manual
        </h1>
        <p className="mt-0.5 text-[13px] text-gray-500">
          {kelas.nama_kelas} · {siswaList.length} siswa. Isi jumlah hari untuk
          tiap jenis ketidakhadiran, lalu klik <b>Simpan</b>.
        </p>
      </div>

      {/* Info mapping */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-[12.5px] leading-relaxed text-blue-900">
        <b>Catatan:</b> kolom <b>Alpha (Tanpa Keterangan)</b> di halaman ini
        disimpan ke field <code className="rounded bg-white px-1">hadir</code>{" "}
        di collection{" "}
        <code className="rounded bg-white px-1">kehadiran_manual</code>. Kolom{" "}
        <b>Sakit</b> dan <b>Izin</b> disimpan sesuai nama field-nya.
      </div>

      {/* Toolbar */}
      <div
        className={`flex flex-col gap-3 rounded-2xl bg-white p-3 sm:flex-row sm:items-center sm:justify-between ${CARD_SHADOW}`}
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama / NIS / NISN…"
          className="h-10 w-full rounded-xl bg-gray-50 px-3 text-[14px] text-gray-800 ring-1 ring-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3b6ef5]/60 sm:max-w-xs"
        />
        <div className="flex items-center gap-2">
          {anyDirty && (
            <button
              type="button"
              onClick={resetAll}
              disabled={saving}
              className="h-10 rounded-xl bg-gray-100 px-4 text-[13px] font-medium text-gray-700 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50"
            >
              Batalkan
            </button>
          )}
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || !anyDirty}
            className="h-10 rounded-xl bg-[#3b6ef5] px-5 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(59,110,245,0.30)] transition hover:bg-[#2f5ee0] active:bg-[#2f5ee0] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {saving ? "Menyimpan…" : "Simpan Perubahan"}
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800 ring-1 ring-emerald-100">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-800 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {/* Tabel */}
      <div className={`overflow-hidden rounded-2xl bg-white ${CARD_SHADOW}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11.5px] uppercase tracking-wider text-gray-500">
                <th className="w-12 px-3 py-3 text-center font-semibold">No</th>
                <th className="min-w-[200px] px-3 py-3 font-semibold">
                  Nama Siswa
                </th>
                <th className="w-24 px-3 py-3 text-center font-semibold">
                  Sakit
                </th>
                <th className="w-24 px-3 py-3 text-center font-semibold">
                  Izin
                </th>
                <th className="w-32 px-3 py-3 text-center font-semibold">
                  Alpha
                  <div className="text-[10px] font-normal normal-case text-gray-400">
                    tanpa keterangan
                  </div>
                </th>
                <th className="w-28 px-3 py-3 text-center font-semibold">
                  Total
                </th>
                <th className="w-24 px-3 py-3 text-center font-semibold">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSiswa.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-10 text-center text-[13px] text-gray-400"
                  >
                    Tidak ada siswa yang cocok.
                  </td>
                </tr>
              )}
              {filteredSiswa.map((s) => {
                const idx = siswaList.findIndex((x) => x.id === s.id);
                const v = values[s.id] || { sakit: 0, izin: 0, alpha: 0 };
                const dirty = isDirty(s.id);
                const total = (v.sakit || 0) + (v.izin || 0) + (v.alpha || 0);

                const inputCls =
                  "h-9 w-16 rounded-lg border-0 bg-gray-50 text-center text-[14px] font-medium text-gray-800 ring-1 ring-gray-200 " +
                  "focus:outline-none focus:ring-2 focus:ring-[#3b6ef5]/60 " +
                  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

                return (
                  <tr
                    key={s.id}
                    className={`border-b border-gray-50 ${
                      dirty ? "bg-amber-50/40" : "hover:bg-gray-50/60"
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center text-gray-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">
                        {s.nama_siswa}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {s.nis ? `NIS ${s.nis}` : ""}
                        {s.nis && s.nisn ? " · " : ""}
                        {s.nisn ? `NISN ${s.nisn}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={v.sakit}
                        onChange={(e) =>
                          updateField(s.id, "sakit", e.target.value)
                        }
                        className={inputCls}
                        aria-label={`Sakit ${s.nama_siswa}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={v.izin}
                        onChange={(e) =>
                          updateField(s.id, "izin", e.target.value)
                        }
                        className={inputCls}
                        aria-label={`Izin ${s.nama_siswa}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={v.alpha}
                        onChange={(e) =>
                          updateField(s.id, "alpha", e.target.value)
                        }
                        className={inputCls}
                        aria-label={`Alpha ${s.nama_siswa}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono font-semibold text-gray-700">
                      {total}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {dirty ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
                          Belum disimpan
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-700">
                          Tersimpan
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer ringkasan */}
      {siswaList.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-gray-500">
          <span>
            Menampilkan <b>{filteredSiswa.length}</b> dari{" "}
            <b>{siswaList.length}</b> siswa.
          </span>
          {anyDirty && (
            <span className="font-medium text-amber-700">
              Ada perubahan belum disimpan.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
