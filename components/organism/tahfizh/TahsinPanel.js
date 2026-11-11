"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getTahsinData,
  setNilaiTahsin,
  setCatatanTahsin,
} from "@/actions/tahfizh.action";

const TH =
  "sticky top-0 z-20 bg-slate-50 border-b border-slate-200 px-2 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500";
const TD = "border-b border-slate-100";

function firstOf(v) {
  return Array.isArray(v) ? v[0] : v;
}

export default function TahsinPanel({
  kelasId,
  tahunAjaranId,
  siswaList = [],
  activeTab,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapel, setMapel] = useState(null);
  const [nilaiMap, setNilaiMap] = useState({});
  const [catatanMap, setCatatanMap] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!kelasId || !tahunAjaranId) return;
    setLoading(true);
    setError("");
    try {
      const res = await getTahsinData({ kelasId, tahunAjaranId });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMapel(res.mapel);
      const nMap = {};
      (res.nilai || []).forEach((r) => {
        nMap[firstOf(r.siswa_id)] = { id: r.id, nilai: r.nilai };
      });
      setNilaiMap(nMap);
      const cMap = {};
      (res.catatan || []).forEach((r) => {
        cMap[firstOf(r.siswa_id)] = { id: r.id, catatan: r.catatan };
      });
      setCatatanMap(cMap);
    } catch (e) {
      setError(e?.message || "Gagal memuat data tahsin.");
    } finally {
      setLoading(false);
    }
  }, [kelasId, tahunAjaranId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCatatan = activeTab === "tahsin_catatan";

  async function saveNilai(siswaId, raw) {
    if (!mapel?.id) return;
    setBusy(true);
    try {
      const res = await setNilaiTahsin({
        siswaId,
        kelasId,
        tahunAjaranId,
        mapelId: mapel.id,
        nilai: raw,
        existingId: nilaiMap[siswaId]?.id,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setNilaiMap((prev) => ({
        ...prev,
        [siswaId]: { id: res.record.id, nilai: res.record.nilai },
      }));
    } finally {
      setBusy(false);
    }
  }

  async function saveCatatan(siswaId, text) {
    setBusy(true);
    try {
      const res = await setCatatanTahsin({
        siswaId,
        kelasId,
        tahunAjaranId,
        catatan: text,
        existingId: catatanMap[siswaId]?.id,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setCatatanMap((prev) => ({
        ...prev,
        [siswaId]: { id: res.record.id, catatan: res.record.catatan },
      }));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-400">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  if (!mapel) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-700">
        Mapel <b>TAHSIN</b> belum di-ploting untuk kelas ini. Hubungi admin/ICT
        untuk memetakan mapel TAHSIN.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">
          {isCatatan ? "Catatan Tahsin" : "Penilaian Tahsin"} · {mapel.nama_mapel}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {isCatatan
            ? "Catatan per siswa akan muncul di rapor tahfizh bagian Tahsin."
            : "Isi nilai tahsin per siswa (0–100). Nilai tersimpan otomatis."}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="max-h-[72vh] overflow-auto overscroll-contain rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={`${TH} sticky left-0 z-30 w-12 min-w-[48px] border-r`}>
                No
              </th>
              <th
                className={`${TH} sticky left-12 z-30 min-w-[180px] border-r px-3 text-left sm:min-w-[240px]`}
              >
                Nama Siswa
              </th>
              <th className={`${TH} text-center ${isCatatan ? "min-w-[420px]" : "w-[110px]"}`}>
                {isCatatan ? "Catatan" : "Nilai"}
              </th>
            </tr>
          </thead>
          <tbody>
            {siswaList.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-400">
                  Belum ada siswa terdaftar di kelas ini.
                </td>
              </tr>
            ) : (
              siswaList.map((s, i) => (
                <tr key={s.id} className="group">
                  <td
                    className={`${TD} sticky left-0 z-10 w-12 min-w-[48px] border-r bg-white text-center text-xs tabular-nums text-slate-400`}
                  >
                    {i + 1}
                  </td>
                  <td
                    className={`${TD} sticky left-12 z-10 min-w-[180px] border-r bg-white px-3 py-1.5 text-[13px] font-medium text-slate-800 sm:min-w-[240px]`}
                  >
                    {s.nama_siswa}
                  </td>
                  <td className={`${TD} px-2 py-1 text-center`}>
                    {isCatatan ? (
                      <textarea
                        value={catatanMap[s.id]?.catatan ?? ""}
                        onChange={(e) =>
                          setCatatanMap((prev) => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], catatan: e.target.value },
                          }))
                        }
                        onBlur={(e) => saveCatatan(s.id, e.target.value)}
                        disabled={busy}
                        rows={2}
                        placeholder="Catatan tahsin..."
                        className="w-full min-w-[380px] resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-[13px] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-400/40 disabled:bg-slate-100"
                      />
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={nilaiMap[s.id]?.nilai ?? ""}
                        onChange={(e) =>
                          setNilaiMap((prev) => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], nilai: e.target.value },
                          }))
                        }
                        onBlur={(e) => saveNilai(s.id, e.target.value)}
                        disabled={busy}
                        placeholder="-"
                        className="h-8 w-[80px] rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-semibold tabular-nums outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-400/40 disabled:bg-slate-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
