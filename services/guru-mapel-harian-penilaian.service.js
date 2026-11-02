import { describeError } from "@/lib/app-error";
import * as penilaianRepository from "@/repositories/guru-mapel-harian-penilaian.repository";

// ================================================================
// HELPER MURNI
// ================================================================
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function tpNumber(tp) {
  const m = String(tp.no_tp || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function normalizeArr(v) {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

// ================= FILTER KATEGORI UJIAN =================
// Ujian koding hanya boleh untuk mapel kategori "koding".
function isUjianKoding(ujian) {
  return (
    String(ujian?.kategori || "")
      .trim()
      .toLowerCase() === "koding"
  );
}

function isMapelKoding(mapel) {
  return (
    String(mapel?.kategori || "")
      .trim()
      .toLowerCase() === "koding"
  );
}

// Rule generic: ujian koding hanya untuk mapel koding.
function ujianBolehUntukMapel(ujian, mapel) {
  if (isUjianKoding(ujian)) return isMapelKoding(mapel);
  return true;
}

const JENIS_URUTAN = { ahb: 1, asas: 2, asat: 3, lainnya: 4 };

const collator = new Intl.Collator("id", { numeric: true });

// ================================================================
// STEP 1 — DAFTAR PLOTING (MAPEL) GURU
// ================================================================
export async function getPlotingGuruMapel({ userId }) {
  try {
    const records = await penilaianRepository.findPlotingGuruByGuru(userId);

    const plotingList = [...records].sort((a, b) =>
      (a.expand?.mapel_id?.nama_mapel || "").localeCompare(
        b.expand?.mapel_id?.nama_mapel || "",
      ),
    );

    return { plotingList, error: null };
  } catch (error) {
    console.error("Error fetching ploting_guru:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// STEP 2 — OPSI KELAS DARI PLOTING TERPILIH (+ JUMLAH SISWA)
// ================================================================
export async function getKelasOptions({ ploting }) {
  try {
    const kelasArr = Array.isArray(ploting?.expand?.kelas_id)
      ? ploting.expand.kelas_id
      : ploting?.expand?.kelas_id
        ? [ploting.expand.kelas_id]
        : [];

    const counts = await Promise.all(
      kelasArr.map((k) =>
        penilaianRepository
          .countSiswaByKelas(k.id)
          .then((r) => r.totalItems)
          .catch(() => 0),
      ),
    );

    const kelasOptions = kelasArr
      .map((k, idx) => ({ kelas: k, siswaCount: counts[idx] }))
      .sort((a, b) => {
        const t =
          (Number(a.kelas.tingkat) || 0) - (Number(b.kelas.tingkat) || 0);
        if (t !== 0) return t;
        return (a.kelas.nama_kelas || "").localeCompare(
          b.kelas.nama_kelas || "",
        );
      });

    return { kelasOptions, error: null };
  } catch (error) {
    console.error("Error building kelas options:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// STEP 3 — DETAIL KELAS: SISWA + TP + LM + NILAI FORMATIF/SUMATIF
// ================================================================
export async function getDetailKelasMapel({ kelasId, mapelId, tahunAjaranId }) {
  try {
    const [siswaRecords, tpRecords, lpRecords] = await Promise.all([
      penilaianRepository.findSiswaByKelas(kelasId),
      penilaianRepository.findTpByMapelKelas(mapelId, kelasId),
      penilaianRepository.findLmByMapelKelas(mapelId, kelasId),
    ]);

    const siswaList = siswaRecords;
    const tpList = [...tpRecords].sort((a, b) => tpNumber(a) - tpNumber(b));
    const lpList = lpRecords;

    const nilaiFormatif = {};
    if (tpList.length > 0) {
      const nfData = await penilaianRepository.findNilaiFormatifByKelasTpIds(
        kelasId,
        tpList.map((tp) => tp.id),
        tahunAjaranId,
      );
      nfData.forEach((n) => {
        const sid = firstOf(n.siswa_id);
        const tid = firstOf(n.tp_id);
        if (!nilaiFormatif[sid]) nilaiFormatif[sid] = {};
        nilaiFormatif[sid][tid] = {
          recordId: n.id,
          k1: n.k1 ?? -1,
          k2: n.k2 ?? -1,
          k3: n.k3 ?? -1,
          k4: n.k4 ?? -1,
        };
      });
    }

    const nilaiSumatif = {};
    if (lpList.length > 0) {
      const nsData = await penilaianRepository.findNilaiSumatifByKelasLmIds(
        kelasId,
        lpList.map((lp) => lp.id),
        tahunAjaranId,
      );
      nsData.forEach((n) => {
        const sid = firstOf(n.siswa_id);
        const lid = firstOf(n.lm_id);
        if (!nilaiSumatif[sid]) nilaiSumatif[sid] = {};
        nilaiSumatif[sid][lid] = { recordId: n.id, nilai: n.nilai };
      });
    }

    return {
      siswaList,
      tpList,
      lpList,
      nilaiFormatif,
      nilaiSumatif,
      error: null,
    };
  } catch (error) {
    console.error("Error fetching detail:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// UJIAN AKTIF UNTUK KELAS (+ FILTER KATEGORI MAPEL)
// ================================================================
export async function getUjianAktifKelas({ kelasId, tingkat, mapel }) {
  try {
    const ujianData = await penilaianRepository.findPengaturanUjianBuka();

    const kelasTingkat = String(tingkat ?? "").trim();

    const matched = ujianData.filter((u) => {
      const targetKelas = normalizeArr(u.target_kelas_id);
      const targetTingkat = normalizeArr(u.target_tingkat).map((t) =>
        String(t).trim(),
      );

      const matchKelas = targetKelas.includes(kelasId);
      const matchTingkat = targetTingkat.includes(kelasTingkat);
      if (!matchKelas && !matchTingkat) return false;

      // Filter kategori: ujian koding hanya untuk mapel koding
      if (!ujianBolehUntukMapel(u, mapel)) return false;

      return true;
    });

    matched.sort((a, b) => {
      const ja = JENIS_URUTAN[a.jenis_ujian] ?? 99;
      const jb = JENIS_URUTAN[b.jenis_ujian] ?? 99;
      if (ja !== jb) return ja - jb;
      return (a.nama_ujian || "").localeCompare(b.nama_ujian || "", "id");
    });

    return { ujianAktif: matched, error: null };
  } catch (error) {
    if (!error?.isAbort) console.error("Error fetching ujian aktif:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// NILAI UJIAN UNTUK SISWA DI KELAS
// ================================================================
export async function getNilaiUjianSiswa({
  mapelId,
  ujianIds,
  siswaIds,
  tahunAjaranId,
}) {
  try {
    if (!ujianIds?.length) return { nilaiUjian: {}, error: null };

    const data = await penilaianRepository.findNilaiUjianByMapelUjianIds(
      mapelId,
      ujianIds,
      tahunAjaranId,
    );

    const siswaSet = new Set(siswaIds || []);
    const nilaiUjian = {};
    data.forEach((n) => {
      const uid = firstOf(n.pengaturan_ujian_id);
      const sid = firstOf(n.siswa_id);
      if (!siswaSet.has(sid)) return;
      if (!nilaiUjian[uid]) nilaiUjian[uid] = {};
      nilaiUjian[uid][sid] = { recordId: n.id, nilai: n.nilai };
    });

    return { nilaiUjian, error: null };
  } catch (error) {
    if (!error?.isAbort) console.error("Error fetching nilai ujian:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// BACA RELASI SEBELUM HAPUS TP / LM (mutasi tetap di halaman)
// ================================================================
export async function getNilaiFormatifByTp({ tpId }) {
  try {
    const related = await penilaianRepository.findNilaiFormatifByTp(tpId);
    return { related, error: null };
  } catch (error) {
    console.error("Gagal hapus TP:", error);
    return { error: describeError(error) };
  }
}

export async function getNilaiSumatifByLm({ lmId }) {
  try {
    const related = await penilaianRepository.findNilaiSumatifByLm(lmId);
    return { related, error: null };
  } catch (error) {
    console.error("Gagal hapus LP:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// EXPORT NILAI MENTAH PER KELAS — DATA MENTAH SEMUA KELAS
// ================================================================
export async function getExportPerKelasData({ userId }) {
  try {
    const plotings = await penilaianRepository.findPlotingGuruByGuru(userId);

    const kelasMap = new Map();
    plotings.forEach((p) => {
      const mapelId = firstOf(p.mapel_id);
      if (!mapelId) return;
      const kelasArr = Array.isArray(p.expand?.kelas_id)
        ? p.expand.kelas_id
        : p.expand?.kelas_id
          ? [p.expand.kelas_id]
          : [];
      kelasArr.forEach((k) => {
        if (!k?.id) return;
        if (!kelasMap.has(k.id)) {
          kelasMap.set(k.id, { kelas: k, mapelIds: new Set() });
        }
        kelasMap.get(k.id).mapelIds.add(mapelId);
      });
    });

    const kelasList = Array.from(kelasMap.values())
      .sort((a, b) => {
        const t =
          (Number(a.kelas.tingkat) || 0) - (Number(b.kelas.tingkat) || 0);
        if (t !== 0) return t;
        return (a.kelas.nama_kelas || "").localeCompare(
          b.kelas.nama_kelas || "",
        );
      })
      .map((item) => ({
        kelas: item.kelas,
        mapelIds: Array.from(item.mapelIds),
      }));

    if (kelasList.length === 0) {
      return {
        kelasList,
        mapelAll: [],
        tpAll: [],
        lmAll: [],
        nfAll: [],
        nsAll: [],
        nuAll: [],
        ujianAll: [],
        error: null,
      };
    }

    const mapelIdsArr = Array.from(
      new Set(plotings.map((p) => firstOf(p.mapel_id)).filter(Boolean)),
    );

    const [mapelAll, tpAll, lmAll, nfAll, nsAll, nuAll, ujianAll] =
      await Promise.all([
        penilaianRepository.findMapelByIds(mapelIdsArr),
        penilaianRepository.findTpByMapelIds(mapelIdsArr),
        penilaianRepository.findLmByMapelIds(mapelIdsArr),
        penilaianRepository.findAllNilaiFormatif(),
        penilaianRepository.findAllNilaiSumatif(),
        penilaianRepository.findNilaiUjianByMapelIds(mapelIdsArr),
        penilaianRepository.findPengaturanUjianBuka(),
      ]);

    return {
      kelasList,
      mapelAll,
      tpAll,
      lmAll,
      nfAll,
      nsAll,
      nuAll,
      ujianAll,
      error: null,
    };
  } catch (error) {
    console.error("Gagal export nilai mentah per kelas:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// SISWA SATU KELAS — TERURUT UNTUK EXPORT
// ================================================================
export async function getSiswaKelasTerurut({ kelasId }) {
  try {
    const siswaKelas = await penilaianRepository.findSiswaByKelas(kelasId);
    const siswaSorted = [...siswaKelas].sort((a, b) =>
      collator.compare(a.nama_siswa || "", b.nama_siswa || ""),
    );
    return { siswaSorted, error: null };
  } catch (error) {
    console.error("Gagal export nilai mentah per kelas:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// SISWA BANYAK KELAS — UNTUK IMPORT PER KELAS
// ================================================================
export async function getSiswaByKelasIds({ kelasIds }) {
  try {
    if (!kelasIds?.length) return { siswaList: [], error: null };
    const siswaList = await penilaianRepository.findSiswaByKelasIds(kelasIds);
    return { siswaList, error: null };
  } catch (error) {
    console.error("Gagal import per kelas:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// DATA 1 SHEET IMPORT = 1 KELAS x 1 MAPEL
// (TP + LM + ujian aktif + peta nilai formatif/sumatif/ujian)
// ================================================================
export async function getMateriNilaiKelasMapel({
  mapelId,
  kelasId,
  tingkat,
  mapel,
}) {
  try {
    const [tpList, lmList, nfAll, nsAll, nuAll, ujianData] = await Promise.all(
      [
        penilaianRepository.findTpByMapelKelas(mapelId, kelasId),
        penilaianRepository.findLmByMapelKelasSorted(mapelId, kelasId),
        penilaianRepository.findNilaiFormatifByKelas(kelasId),
        penilaianRepository.findNilaiSumatifByKelas(kelasId),
        penilaianRepository.findNilaiUjianByMapelId(mapelId),
        penilaianRepository.findPengaturanUjianBuka(),
      ],
    );

    // Saring ujian yang berlaku untuk kelas ini DAN mapel ini
    const kelasTingkat = String(tingkat ?? "").trim();
    const ujianAktifKelas = ujianData.filter((u) => {
      const tk = normalizeArr(u.target_kelas_id);
      const tt = normalizeArr(u.target_tingkat).map((t) => String(t).trim());
      const match = tk.includes(kelasId) || tt.includes(kelasTingkat);
      if (!match) return false;
      // Ujian koding hanya untuk mapel koding
      if (!ujianBolehUntukMapel(u, mapel)) return false;
      return true;
    });

    const nfMap = {};
    nfAll.forEach((n) => {
      const tp = tpList.find((t) => t.id === firstOf(n.tp_id));
      if (!tp) return;
      const sid = firstOf(n.siswa_id);
      if (!nfMap[sid]) nfMap[sid] = {};
      nfMap[sid][tp.id] = {
        recordId: n.id,
        k1: n.k1 ?? -1,
        k2: n.k2 ?? -1,
        k3: n.k3 ?? -1,
        k4: n.k4 ?? -1,
      };
    });

    const nsMap = {};
    nsAll.forEach((n) => {
      const lm = lmList.find((l) => l.id === firstOf(n.lm_id));
      if (!lm) return;
      const sid = firstOf(n.siswa_id);
      if (!nsMap[sid]) nsMap[sid] = {};
      nsMap[sid][lm.id] = { recordId: n.id, nilai: n.nilai };
    });

    const nuMap = {};
    nuAll.forEach((n) => {
      const uid = firstOf(n.pengaturan_ujian_id);
      const sid = firstOf(n.siswa_id);
      if (!uid || !sid) return;
      if (!nuMap[uid]) nuMap[uid] = {};
      nuMap[uid][sid] = { recordId: n.id, nilai: n.nilai };
    });

    return {
      tpList,
      lmList,
      ujianAktifKelas,
      nfMap,
      nsMap,
      nuMap,
      error: null,
    };
  } catch (error) {
    console.error("Gagal import per kelas:", error);
    return { error: describeError(error) };
  }
}
