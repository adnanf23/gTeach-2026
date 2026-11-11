"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTahfizhData,
  addTahfizhKomponen,
  removeTahfizhKomponen,
  setTahfizhPredikat,
} from "@/actions/tahfizh.action";

const KATEGORI = [
  { key: "hafalan", label: "Hafalan Al-Qur'an", item: "Surat" },
  { key: "jaritmatika", label: "Jaritmatika Al-Qur'an", item: "Surat" },
  { key: "gesture", label: "Gesture", item: "Surat" },
  { key: "hadits", label: "Hadits", item: "Hadits" },
  { key: "doa", label: "Doa", item: "Niat & Doa" },
  { key: "wudhu", label: "Doa Berwudhu", item: "Doa" },
];

const PREDIKAT = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "*", label: "*" },
];

const TH =
  "sticky top-0 z-20 bg-slate-50 border-b border-slate-200 px-2 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500";
const TD = "border-b border-slate-100 px-1 py-1";

export default function TahfizhPanel({
  kelasId,
  tahunAjaranId,
  mapelId,
  mapelNama,
  siswaList = [],
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [komponen, setKomponen] = useState([]);
  const [predikat, setPredikat] = useState({});
  const [activeKategori, setActiveKategori] = useState("hafalan");
  const [form, setForm] = useState({ komponen: "", kategori: "hafalan" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!kelasId || !tahunAjaranId || !mapelId) return;
    setLoading(true);
    setError("");
    try {
      const res = await getTahfizhData({ kelasId, tahunAjaranId, mapelId });
      if (res.error) {
        setError(res.error);
        return;
      }
      setKomponen(res.komponen || []);
      setPredikat(res.predikat || {});
    } catch (e) {
      setError(e?.message || "Gagal memuat data tahfizh.");
    } finally {
      setLoading(false);
    }
  }, [kelasId, tahunAjaranId, mapelId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const komponenKategori = useMemo(
    () => komponen.filter((k) => (k.kategori || "") === activeKategori),
    [komponen, activeKategori],
  );
  const kategoriInfo = KATEGORI.find((k) => k.key === activeKategori);

  async function handleAddKomponen(e) {
    e.preventDefault();
    if (!form.komponen.trim()) return;
    setBusy(true);
    try {
      const res = await addTahfizhKomponen({
        kelasId,
        tahunAjaranId,
        mapelId,
        komponen: form.komponen,
        kategori: form.kategori,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setForm({ ...form, komponen: "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteKomponen(id) {
    if (!window.confirm("Hapus komponen ini?")) return;
    setBusy(true);
    try {
      const res = await removeTahfizhKomponen(id);
      if (res.error) setError(res.error);
      else await load();
    } finally {
      setBusy(false);
    }
  }

  async function handlePredikatChange(komponenId, siswaId, value) {
    const current = predikat[activeKategori]?.[komponenId]?.[siswaId];
    setBusy(true);
    try {
      const res = await setTahfizhPredikat({
        kategori: activeKategori,
        siswaId,
        komponenId,
        tahunAjaranId,
        predikat: value,
        existingId: current?.id,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setPredikat((prev) => {
        const next = { ...prev };
        if (!next[activeKategori]) next[activeKategori] = {};
        if (!next[activeKategori][komponenId]) next[activeKategori][komponenId] = {};
        next[activeKategori][komponenId][siswaId] = {
          id: res.record.id,
          predikat: value,
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">
          Penilaian Tahfizh · {mapelNama}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Tambahkan komponen lalu isi predikat pada tabel. Tahsin diisi oleh guru
          mapel TAHSIN.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Tambah komponen */}
      <form
        onSubmit={handleAddKomponen}
        className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end"
      >
        <label className="flex-1">
          <span className="mb-1 block text-[11px] font-medium text-slate-500">
            Nama komponen ({kategoriInfo?.item})
          </span>
          <input
            value={form.komponen}
            onChange={(e) => setForm({ ...form, komponen: e.target.value })}
            placeholder="mis. Al-Faatihaah"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-400/40"
          />
        </label>
        <label className="sm:w-52">
          <span className="mb-1 block text-[11px] font-medium text-slate-500">
            Kategori
          </span>
          <select
            value={form.kategori}
            onChange={(e) => {
              setForm({ ...form, kategori: e.target.value });
              setActiveKategori(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-400/40"
          >
            {KATEGORI.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          Tambah
        </button>
      </form>

      {/* Kategori tabs */}
      <div className="flex flex-wrap gap-2">
        {KATEGORI.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setActiveKategori(k.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              activeKategori === k.key
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* Tabel: baris = siswa, kolom = komponen */}
      <div className="max-h-[72vh] overflow-auto overscroll-contain rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={`${TH} sticky left-0 z-30 w-12 min-w-[48px] border-r`}>
                No
              </th>
              <th
                className={`${TH} sticky left-12 z-30 min-w-[160px] border-r px-3 text-left sm:min-w-[220px]`}
              >
                Nama Siswa
              </th>
              {komponenKategori.map((k) => (
                <th key={k.id} className={`${TH} min-w-[90px] text-center`}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="max-w-[110px] truncate normal-case text-slate-600">
                      {k.komponen}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteKomponen(k.id)}
                      title="Hapus komponen"
                      className="rounded p-0.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={2 + komponenKategori.length} className="px-4 py-10 text-center text-slate-400">
                  Memuat...
                </td>
              </tr>
            ) : komponenKategori.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-10 text-center text-sm text-slate-400">
                  Belum ada komponen untuk kategori ini. Tambahkan dulu di atas.
                </td>
              </tr>
            ) : (
              siswaList.map((s, i) => (
                <tr key={s.id} className="group">
                  <td className={`${TD} sticky left-0 z-10 w-12 min-w-[48px] border-r bg-white text-center text-xs tabular-nums text-slate-400`}>
                    {i + 1}
                  </td>
                  <td className={`${TD} sticky left-12 z-10 min-w-[160px] border-r bg-white px-3 py-1.5 text-[13px] font-medium text-slate-800 sm:min-w-[220px]`}>
                    {s.nama_siswa}
                  </td>
                  {komponenKategori.map((k) => {
                    const value =
                      predikat[activeKategori]?.[k.id]?.[s.id]?.predikat || "";
                    return (
                      <td key={k.id} className={`${TD} px-1 py-1 text-center`}>
                        <select
                          value={value}
                          onChange={(e) =>
                            handlePredikatChange(k.id, s.id, e.target.value)
                          }
                          disabled={busy}
                          className="h-8 w-[64px] rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-semibold tabular-nums outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-400/40 disabled:bg-slate-100"
                        >
                          <option value="">-</option>
                          {PREDIKAT.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400">
        Keterangan: A = Hafal · B = Hafal dengan sedikit bantuan · C = Hafal
        dengan banyak bantuan · * = Belum Hafal.
      </p>
    </div>
  );
}
