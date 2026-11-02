import { describeError } from "@/lib/app-error";
import * as detailRepository from "@/repositories/ict-full-data-detail.repository";

// ================================================================
// UTIL
// ================================================================
function tpNumber(tp) {
  const m = String(tp.no_tp || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// ================================================================
// LOAD DATA FULL (per kelas & mapel)
// Memanggil repository (data) lalu menyusun objek polos untuk halaman.
// ================================================================
export async function getFullDataDetail({ kelasId, mapelId }) {
  try {
    const kelasData = await detailRepository.findKelasById(kelasId);

    const mapelData = await detailRepository.findMapelById(mapelId);

    const [siswaData, tpData, lpData, ujianData, absensiData] =
      await Promise.all([
        detailRepository.findSiswaByKelas(kelasData.id),
        detailRepository.findTpByMapelKelas(mapelId, kelasData.id),
        detailRepository.findLmByMapelKelas(mapelId, kelasData.id),
        detailRepository.findUjianAktifByKelas(
          kelasData.id,
          kelasData.tingkat,
        ),
        detailRepository.findAbsensiByKelas(kelasData.id),
      ]);

    // ================= DAFTAR MAPEL UNTUK PINDAH CEPAT =================
    let mapelList = [];
    try {
      const [mapelKhusus, mapelTingkat, plotingData] = await Promise.all([
        detailRepository.findMapelSpesifikKelas(kelasData.id),
        detailRepository.findMapelByTingkat(kelasData.tingkat),
        detailRepository.findPlotingGuruByKelas(kelasData.id),
      ]);

      const combinedMapel = [...mapelKhusus, ...mapelTingkat];
      const uniqueMapelRaw = Array.from(
        new Map(combinedMapel.map((item) => [item.id, item])).values(),
      );

      const uniqueMapel = uniqueMapelRaw.filter((m) => {
        const spesifik = m.spesifik_kelas_id;
        const punyaRestriksi =
          Array.isArray(spesifik) && spesifik.length > 0;
        if (!punyaRestriksi) return true;
        return spesifik.includes(kelasData.id);
      });

      const guruMap = new Map();
      plotingData.forEach((plot) => {
        if (plot.mapel_id && plot.expand?.guru_id) {
          const guruObj = Array.isArray(plot.expand.guru_id)
            ? plot.expand.guru_id[0]
            : plot.expand.guru_id;
          const namaGuru =
            guruObj?.nama_lengkap || guruObj?.name || guruObj?.username;
          if (namaGuru) {
            if (Array.isArray(plot.mapel_id)) {
              plot.mapel_id.forEach((mId) => guruMap.set(mId, namaGuru));
            } else {
              guruMap.set(plot.mapel_id, namaGuru);
            }
          }
        }
      });

      const mapelWithGuru = uniqueMapel.map((m) => ({
        ...m,
        guru_pengampu: guruMap.get(m.id) || "Walikelas",
      }));

      mapelWithGuru.sort((a, b) =>
        (a.nama_mapel || a.nama || "").localeCompare(
          b.nama_mapel || b.nama || "",
          "id",
          { numeric: true, sensitivity: "base" },
        ),
      );

      mapelList = mapelWithGuru;
    } catch (err) {
      console.error("Gagal fetch mapel list:", err);
    }

    // ================= FORMATIF =================
    const nilaiFormatif = {};
    if (tpData.length > 0) {
      const nfData = await detailRepository.findNilaiFormatifByTpIds(
        kelasData.id,
        tpData.map((tp) => tp.id),
      );
      nfData.forEach((n) => {
        if (!nilaiFormatif[n.siswa_id]) nilaiFormatif[n.siswa_id] = {};
        nilaiFormatif[n.siswa_id][n.tp_id] = {
          recordId: n.id,
          k1: n.k1 ?? -1,
          k2: n.k2 ?? -1,
          k3: n.k3 ?? -1,
          k4: n.k4 ?? -1,
        };
      });
    }

    // ================= SUMATIF =================
    const nilaiSumatif = {};
    if (lpData.length > 0) {
      const nsData = await detailRepository.findNilaiSumatifByLmIds(
        kelasData.id,
        lpData.map((lp) => lp.id),
      );
      nsData.forEach((n) => {
        if (!nilaiSumatif[n.siswa_id]) nilaiSumatif[n.siswa_id] = {};
        nilaiSumatif[n.siswa_id][n.lm_id] = { recordId: n.id, nilai: n.nilai };
      });
    }

    // ================= UJIAN =================
    const nilaiUjian = {};
    if (ujianData.length > 0) {
      const nuData = await detailRepository.findNilaiUjianByMapelSiswa(
        mapelId,
        ujianData.map((u) => u.id),
        siswaData.map((s) => s.id),
      );
      nuData.forEach((n) => {
        if (!nilaiUjian[n.pengaturan_ujian_id])
          nilaiUjian[n.pengaturan_ujian_id] = {};
        nilaiUjian[n.pengaturan_ujian_id][n.siswa_id] = {
          recordId: n.id,
          nilai: n.nilai,
        };
      });
    }

    return {
      kelas: kelasData,
      mapel: mapelData,
      siswaList: siswaData,
      tpList: tpData.sort((a, b) => tpNumber(a) - tpNumber(b)),
      lpList: lpData,
      ujianAktif: ujianData,
      absensiList: absensiData,
      mapelList,
      nilaiFormatif,
      nilaiSumatif,
      nilaiUjian,
      error: null,
    };
  } catch (error) {
    console.error("Error loading data:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// NILAI TERKAIT (untuk hapus TP / LP)
// ================================================================
export async function getNilaiFormatifByTp({ tpId }) {
  try {
    const items = await detailRepository.findNilaiFormatifByTpId(tpId);
    return { items, error: null };
  } catch (error) {
    console.error("Error loading nilai formatif:", error);
    return { error: describeError(error) };
  }
}

export async function getNilaiSumatifByLm({ lmId }) {
  try {
    const items = await detailRepository.findNilaiSumatifByLmId(lmId);
    return { items, error: null };
  } catch (error) {
    console.error("Error loading nilai sumatif:", error);
    return { error: describeError(error) };
  }
}
