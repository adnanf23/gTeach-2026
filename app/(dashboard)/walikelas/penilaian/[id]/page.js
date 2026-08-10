"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function DetailPenilaianPage() {
  const { id: mapelId } = useParams(); // id mata_pelajaran
  const router = useRouter();
  const user = getCurrentUser();

  const [loading, setLoading] = useState(true);
  const [kelas, setKelas] = useState(null);
  const [mapel, setMapel] = useState(null);
  const [ploting, setPloting] = useState(null); // record ploting_guru utk mapel+kelas ini
  const [siswaList, setSiswaList] = useState([]);
  const [lingkupList, setLingkupList] = useState([]);

  // nilaiHarian[siswaId][lingkupMateriId] = { recordId, nilai }
  const [nilaiHarian, setNilaiHarian] = useState({});

  const [activeTab, setActiveTab] = useState("harian"); // "harian" | "ujian"

  // Tab ujian
  const [ujianAktif, setUjianAktif] = useState([]);
  const [selectedUjianId, setSelectedUjianId] = useState(null);
  // nilaiUjian[siswaId] = { recordId, nilai }
  const [nilaiUjian, setNilaiUjian] = useState({});
  const [loadingUjianNilai, setLoadingUjianNilai] = useState(false);

  // Form tambah lingkup materi
  const [showAddLM, setShowAddLM] = useState(false);
  const [savingLM, setSavingLM] = useState(false);
  const [formLM, setFormLM] = useState({
    nama_lingkup: "",
    capaian_kompetensi: "",
  });

  // status simpan per-cell: { [key]: "saving" | "saved" | "error" }
  const [cellStatus, setCellStatus] = useState({});

  const canManageLingkup = !!ploting; // wajib ada ploting_guru_id agar lolos API Rule

  // ================= LOAD DATA AWAL =================
  useEffect(() => {
    async function loadData() {
      if (!user || !mapelId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);

        const kelasData = await pb
          .collection("kelas")
          .getFirstListItem(
            `walikelas_id = "${user.id}" || pendamping_id = "${user.id}"`,
            { requestKey: null },
          );
        setKelas(kelasData);

        const mapelData = await pb
          .collection("mata_pelajaran")
          .getOne(mapelId, { requestKey: null });
        setMapel(mapelData);

        // Cari ploting_guru untuk mapel + kelas ini (mungkin tidak ada)
        let plotingData = null;
        try {
          plotingData = await pb
            .collection("ploting_guru")
            .getFirstListItem(
              `mapel_id = "${mapelId}" && kelas_id ~ "${kelasData.id}"`,
              { requestKey: null },
            );
        } catch (e) {
          if (!e?.isAbort && e?.status !== 404) console.error(e);
        }
        setPloting(plotingData);

        const [siswaData, lingkupData] = await Promise.all([
          pb.collection("siswa").getFullList({
            filter: `kelas_id = "${kelasData.id}"`,
            sort: "nama_siswa",
            requestKey: null,
          }),
          pb.collection("lingkup_materi").getFullList({
            filter: `mapel_id ~ "${mapelId}" && kelas_id ~ "${kelasData.id}"`,
            requestKey: null,
          }),
        ]);
        setSiswaList(siswaData);
        setLingkupList(lingkupData);

        // Ambil semua nilai_harian utk mapel+kelas ini sekaligus
        if (lingkupData.length > 0) {
          const nilaiData = await pb.collection("nilai_harian").getFullList({
            filter: `kelas_id ~ "${kelasData.id}" && mapel_id ~ "${mapelId}"`,
            requestKey: null,
          });

          const map = {};
          nilaiData.forEach((n) => {
            if (!map[n.siswa_id]) map[n.siswa_id] = {};
            map[n.siswa_id][n.lingkup_materi_id] = {
              recordId: n.id,
              nilai: n.nilai,
            };
          });
          setNilaiHarian(map);
        }

        // Ambil ujian yang aktif (status_akses = "buka") untuk kelas/tingkat ini
        const ujianData = await pb.collection("pengaturan_ujian").getFullList({
          filter: `status_akses = "buka" && (target_kelas_id ~ "${kelasData.id}" || target_tingkat ~ "${String(kelasData.tingkat)}")`,
          requestKey: null,
        });
        setUjianAktif(ujianData);
      } catch (error) {
        if (!error?.isAbort) console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [mapelId]);

  // ================= LOAD NILAI UJIAN SAAT UJIAN DIPILIH =================
  useEffect(() => {
    async function loadNilaiUjian() {
      if (!selectedUjianId || !ploting || siswaList.length === 0) {
        setNilaiUjian({});
        return;
      }
      try {
        setLoadingUjianNilai(true);
        const siswaIds = siswaList.map((s) => s.id);
        const filterSiswa = siswaIds
          .map((sid) => `siswa_id = "${sid}"`)
          .join(" || ");

        const data = await pb.collection("nilai_ujian").getFullList({
          filter: `pengaturan_ujian_id = "${selectedUjianId}" && ploting_guru_id = "${ploting.id}" && (${filterSiswa})`,
          requestKey: null,
        });

        const map = {};
        data.forEach((n) => {
          map[n.siswa_id] = { recordId: n.id, nilai: n.nilai };
        });
        setNilaiUjian(map);
      } catch (error) {
        if (!error?.isAbort) console.error("Error loading nilai ujian:", error);
      } finally {
        setLoadingUjianNilai(false);
      }
    }

    loadNilaiUjian();
  }, [selectedUjianId, ploting, siswaList]);

  // ================= NILAI AKHIR REALTIME =================
  const nilaiAkhirMap = useMemo(() => {
    const result = {};
    siswaList.forEach((s) => {
      const nilaiSiswa = nilaiHarian[s.id] || {};
      const nilaiTerisi = lingkupList
        .map((lm) => nilaiSiswa[lm.id]?.nilai)
        .filter((v) => typeof v === "number");

      result[s.id] =
        nilaiTerisi.length > 0
          ? nilaiTerisi.reduce((a, b) => a + b, 0) / nilaiTerisi.length
          : null;
    });
    return result;
  }, [nilaiHarian, lingkupList, siswaList]);

  // ================= SIMPAN NILAI HARIAN (auto-save on blur) =================
  async function handleSaveNilaiHarian(siswaId, lingkupMateriId, rawValue) {
    const cellKey = `${siswaId}-${lingkupMateriId}`;

    const existing = nilaiHarian[siswaId]?.[lingkupMateriId];
    const nilaiValue = rawValue === "" ? null : Number(rawValue);

    if (
      nilaiValue !== null &&
      (Number.isNaN(nilaiValue) || nilaiValue < 0 || nilaiValue > 100)
    ) {
      setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      return;
    }
    if (nilaiValue === null) return; // jangan simpan kosong
    if (existing?.nilai === nilaiValue) return; // tidak berubah

    setCellStatus((prev) => ({ ...prev, [cellKey]: "saving" }));

    try {
      const guruIdRecord = ploting?.guru_id || user.id;
      let saved;
      if (existing?.recordId) {
        saved = await pb.collection("nilai_harian").update(
          existing.recordId,
          {
            nilai: nilaiValue,
          },
          { requestKey: null },
        );
      } else {
        saved = await pb.collection("nilai_harian").create(
          {
            siswa_id: siswaId,
            lingkup_materi_id: lingkupMateriId,
            nilai: nilaiValue,
            guru_id: guruIdRecord,
            kelas_id: kelas.id,
            mapel_id: mapelId,
          },
          { requestKey: null },
        );
      }

      setNilaiHarian((prev) => ({
        ...prev,
        [siswaId]: {
          ...prev[siswaId],
          [lingkupMateriId]: { recordId: saved.id, nilai: nilaiValue },
        },
      }));

      setCellStatus((prev) => ({ ...prev, [cellKey]: "saved" }));
      setTimeout(() => {
        setCellStatus((prev) => ({ ...prev, [cellKey]: undefined }));
      }, 1500);
    } catch (error) {
      if (!error?.isAbort) {
        console.error("Gagal menyimpan nilai:", {
          status: error?.status,
          message: error?.message,
          data: error?.response?.data,
          response: error?.response,
        });
        setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      }
    }
  }

  // ================= SIMPAN NILAI UJIAN (auto-save on blur) =================
  async function handleSaveNilaiUjian(siswaId, rawValue) {
    if (!selectedUjianId || !ploting) return;
    const cellKey = `ujian-${siswaId}`;

    const existing = nilaiUjian[siswaId];
    const nilaiValue = rawValue === "" ? null : Number(rawValue);

    if (
      nilaiValue !== null &&
      (Number.isNaN(nilaiValue) || nilaiValue < 0 || nilaiValue > 100)
    ) {
      setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      return;
    }
    if (nilaiValue === null) return;
    if (existing?.nilai === nilaiValue) return;

    setCellStatus((prev) => ({ ...prev, [cellKey]: "saving" }));

    try {
      let saved;
      if (existing?.recordId) {
        saved = await pb.collection("nilai_ujian").update(
          existing.recordId,
          {
            nilai: nilaiValue,
          },
          { requestKey: null },
        );
      } else {
        saved = await pb.collection("nilai_ujian").create(
          {
            siswa_id: siswaId,
            ploting_guru_id: ploting.id,
            pengaturan_ujian_id: selectedUjianId,
            nilai: nilaiValue,
          },
          { requestKey: null },
        );
      }

      setNilaiUjian((prev) => ({
        ...prev,
        [siswaId]: { recordId: saved.id, nilai: nilaiValue },
      }));

      setCellStatus((prev) => ({ ...prev, [cellKey]: "saved" }));
      setTimeout(() => {
        setCellStatus((prev) => ({ ...prev, [cellKey]: undefined }));
      }, 1500);
    } catch (error) {
      if (!error?.isAbort) {
        console.error("Gagal menyimpan nilai ujian:", {
          status: error?.status,
          message: error?.message,
          data: error?.response?.data,
          response: error?.response,
        });
        setCellStatus((prev) => ({ ...prev, [cellKey]: "error" }));
      }
    }
  }

  // ================= TAMBAH LINGKUP MATERI =================
  async function handleAddLingkupMateri(e) {
    e.preventDefault();
    if (!formLM.nama_lingkup.trim() || !ploting) return;

    try {
      setSavingLM(true);
      const created = await pb.collection("lingkup_materi").create(
        {
          ploting_guru_id: ploting.id,
          nama_lingkup: formLM.nama_lingkup.trim(),
          capaian_kompetensi: formLM.capaian_kompetensi.trim(),
          guru_id: ploting.guru_id || user.id,
          mapel_id: mapelId,
          kelas_id: kelas.id,
        },
        { requestKey: null },
      );

      setLingkupList((prev) => [...prev, created]);
      setFormLM({ nama_lingkup: "", capaian_kompetensi: "" });
      setShowAddLM(false);
    } catch (error) {
      if (!error?.isAbort)
        console.error(
          "Gagal menambah lingkup materi:",
          error?.response?.data || error,
        );
    } finally {
      setSavingLM(false);
    }
  }

  // ================= RENDER =================
  if (loading) {
    return (
      <div className="p-10 text-center font-semibold text-gray-500">
        Memuat data penilaian...
      </div>
    );
  }

  if (!kelas || !mapel) {
    return (
      <div className="p-10 text-center font-semibold text-red-500">
        Data kelas atau mata pelajaran tidak ditemukan.
      </div>
    );
  }

  return (
    <section className="py-10 lg:p-10 space-y-6">
      {/* Header */}
      <div className="w-full">
        <button
          onClick={() => router.back()}
          className="text-md font-semibold text-black  mb-2 inline-flex items-center gap-1"
        >
          ← Kembali
        </button>
        <br />
        <br />
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white rounded-3xl p-6 md:p-8 shadow-lg">
          <div className="absolute right-0 bottom-0 w-80 h-80 bg-white/5 rounded-full translate-x-10 translate-y-20 pointer-events-none" />
          <div className="relative z-10 flex-col lg:flex-row flex items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-widest text-blue-200 font-semibold block">
                {kelas.nama_kelas} · Tingkat {kelas.tingkat}
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide uppercase">
                {mapel.nama_mapel}
              </h1>
            </div>
            {ploting?.guru_id && (
              <span className="bg-white/15 text-white text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap">
                Diampu Guru Mapel
              </span>
            )}
          </div>
        </div>
      </div>

      {!ploting && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-xl p-4">
          Belum ada Ploting Guru untuk mapel ini di kelas Anda. Hubungi
          Admin/ICT untuk menambahkan ploting guru sebelum Lingkup Materi &amp;
          nilai bisa diinput.
        </div>
      )}

      {/* Lingkup Materi */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex flex-col lg:flex-row items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700">
            Lingkup Materi
          </h2>
          {canManageLingkup && (
            <button
              onClick={() => setShowAddLM((v) => !v)}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 rounded-full px-3 py-1.5"
            >
              {showAddLM ? "Batal" : "+ Tambah Lingkup Materi"}
            </button>
          )}
        </div>

        {showAddLM && (
          <form
            onSubmit={handleAddLingkupMateri}
            className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3"
          >
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Nama Lingkup Materi
              </label>
              <input
                type="text"
                value={formLM.nama_lingkup}
                onChange={(e) =>
                  setFormLM((f) => ({ ...f, nama_lingkup: e.target.value }))
                }
                placeholder="Contoh: Bilangan Bulat"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Capaian Kompetensi
              </label>
              <textarea
                value={formLM.capaian_kompetensi}
                onChange={(e) =>
                  setFormLM((f) => ({
                    ...f,
                    capaian_kompetensi: e.target.value,
                  }))
                }
                placeholder="Deskripsi capaian kompetensi..."
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <button
              type="submit"
              disabled={savingLM}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg"
            >
              {savingLM ? "Menyimpan..." : "Simpan Lingkup Materi"}
            </button>
          </form>
        )}

        {lingkupList.length === 0 ? (
          <p className="text-sm text-gray-400 font-medium">
            Belum ada lingkup materi untuk mapel ini.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {lingkupList.map((lm) => (
              <span
                key={lm.id}
                title={lm.capaian_kompetensi}
                className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full border border-blue-100"
              >
                {lm.nama_lingkup}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-100">
        <button
          onClick={() => setActiveTab("harian")}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "harian"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Nilai Harian
        </button>
        <button
          onClick={() => setActiveTab("ujian")}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "ujian"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Ujian {ujianAktif.length > 0 && `(${ujianAktif.length})`}
        </button>
      </div>

      {/* Tab: Nilai Harian */}
      {activeTab === "harian" && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
          {lingkupList.length === 0 ? (
            <div className="p-8 text-center text-gray-400 font-medium text-sm">
              Buat Lingkup Materi terlebih dahulu untuk mulai menginput nilai.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-bold sticky left-0 z-20 bg-gray-50 min-w-[140px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
                    Siswa
                  </th>
                  {lingkupList.map((lm) => (
                    <th
                      key={lm.id}
                      className="text-center px-3 py-3 font-bold min-w-[110px]"
                    >
                      {lm.nama_lingkup}
                    </th>
                  ))}
                  <th className="text-center px-4 py-3 font-bold min-w-[110px] bg-blue-50 text-blue-700">
                    Nilai Akhir
                  </th>
                </tr>
              </thead>
              <tbody>
                {siswaList.map((siswa, idx) => {
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                  return (
                    <tr key={siswa.id} className={rowBg}>
                      <td
                        className={`px-4 py-2.5 font-semibold text-gray-800 sticky left-0 z-10 min-w-[140px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${rowBg}`}
                      >
                        {siswa.nama_siswa}
                      </td>
                      {lingkupList.map((lm) => {
                        const cellKey = `${siswa.id}-${lm.id}`;
                        const status = cellStatus[cellKey];
                        const currentValue =
                          nilaiHarian[siswa.id]?.[lm.id]?.nilai;
                        return (
                          <td key={lm.id} className="px-3 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              disabled={!ploting}
                              defaultValue={currentValue ?? ""}
                              key={`${cellKey}-${currentValue ?? ""}`}
                              onBlur={(e) =>
                                handleSaveNilaiHarian(
                                  siswa.id,
                                  lm.id,
                                  e.target.value,
                                )
                              }
                              className={`w-20 text-center rounded-lg border px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-400 ${
                                status === "error"
                                  ? "border-red-400 bg-red-50"
                                  : status === "saved"
                                    ? "border-green-400 bg-green-50"
                                    : "border-gray-200"
                              }`}
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-center font-extrabold text-blue-700 bg-blue-50/50">
                        {nilaiAkhirMap[siswa.id] !== null
                          ? nilaiAkhirMap[siswa.id].toFixed(1)
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Ujian */}
      {activeTab === "ujian" && (
        <div className="space-y-4">
          {ujianAktif.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 text-center text-gray-400 font-medium text-sm">
              Belum ada ujian yang diaktifkan oleh Admin untuk kelas ini.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {ujianAktif.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUjianId(u.id)}
                    className={`text-xs font-bold px-4 py-2 rounded-full border transition-colors ${
                      selectedUjianId === u.id
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
                    }`}
                  >
                    {u.nama_ujian}
                  </button>
                ))}
              </div>

              {!selectedUjianId ? (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 text-center text-gray-400 font-medium text-sm">
                  Pilih ujian di atas untuk mulai input nilai.
                </div>
              ) : !ploting ? (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-xl p-4">
                  Tidak bisa menginput nilai ujian karena belum ada ploting guru
                  untuk mapel ini.
                </div>
              ) : loadingUjianNilai ? (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 text-center text-gray-400 font-medium text-sm">
                  Memuat nilai ujian...
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-bold min-w-[180px]">
                          Siswa
                        </th>
                        <th className="text-center px-4 py-3 font-bold min-w-[110px]">
                          Nilai Ujian
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {siswaList.map((siswa, idx) => {
                        const cellKey = `ujian-${siswa.id}`;
                        const status = cellStatus[cellKey];
                        const currentValue = nilaiUjian[siswa.id]?.nilai;
                        return (
                          <tr
                            key={siswa.id}
                            className={
                              idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                            }
                          >
                            <td className="px-4 py-2.5 font-semibold text-gray-800">
                              {siswa.nama_siswa}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.1"
                                defaultValue={currentValue ?? ""}
                                key={`${cellKey}-${currentValue ?? ""}`}
                                onBlur={(e) =>
                                  handleSaveNilaiUjian(siswa.id, e.target.value)
                                }
                                className={`w-24 text-center rounded-lg border px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                  status === "error"
                                    ? "border-red-400 bg-red-50"
                                    : status === "saved"
                                      ? "border-green-400 bg-green-50"
                                      : "border-gray-200"
                                }`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
