import { describeError } from "@/lib/app-error";
import * as legerRepository from "@/repositories/walikelas-nilai-leger.repository";

// ================================================================
// KONFIGURASI
// ================================================================
const JENIS_UTS = "ahb";
const JENIS_UAS = "asas";

// ✅ FIX: kategori mapel yang ditampilkan di leger
const KATEGORI_LEGER = ["umum", "koding"];

// ================================================================
// UTIL
// ================================================================
function average(arr) {
  const nums = arr.filter(
    (v) => typeof v === "number" && !isNaN(v) && v !== -1,
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ================================================================
// LOAD DATA + AGREGASI LEGER
// Memanggil repository (data) lalu melakukan seluruh perhitungan murni.
// ================================================================
export async function getLegerData({ userId }) {
  try {
    const kelasData = await legerRepository.findKelasByWalikelas(userId);

    // ========== AMBIL MAPEL + GURU PENGAMPU ==========
    const [siswaData, mapelKhusus, mapelTingkat, plotingData, ujianData] =
      await Promise.all([
        legerRepository.findSiswaByKelas(kelasData.id),
        legerRepository.findMapelSpesifikKelas(kelasData.id),
        legerRepository.findMapelByTingkat(kelasData.tingkat),
        legerRepository.findPlotingGuruByKelas(kelasData.id),
        legerRepository.findUjianAktifByKelas(
          kelasData.id,
          kelasData.tingkat,
        ),
      ]);

    // ========== GABUNG & FILTER MAPEL ==========
    const combined = [...mapelKhusus, ...mapelTingkat];
    const uniqueMapelRaw = Array.from(
      new Map(combined.map((m) => [m.id, m])).values(),
    );

    // ✅ FIX: izinkan kategori "umum" dan "koding" masuk ke leger
    const uniqueMapel = uniqueMapelRaw.filter((m) => {
      const kat = (m.kategori || "").toLowerCase();
      if (!KATEGORI_LEGER.includes(kat)) return false;

      const spesifik = m.spesifik_kelas_id;
      const punyaRestriksi = Array.isArray(spesifik) && spesifik.length > 0;
      if (!punyaRestriksi) return true;
      return spesifik.includes(kelasData.id);
    });

    // ========== BUILD GURU MAP ==========
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

    // ========== DEDUPLIKASI BERDASARKAN NAMA MAPEL ==========
    const mapelByName = new Map();
    uniqueMapel.forEach((m) => {
      const key = (m.nama_mapel || m.nama || "").trim();
      if (!mapelByName.has(key)) {
        mapelByName.set(key, m);
      } else {
        const existing = mapelByName.get(key);
        const existingGuru = guruMap.get(existing.id);
        const newGuru = guruMap.get(m.id);
        if (!existingGuru && newGuru) {
          mapelByName.set(key, m);
        }
      }
    });
    const deduplicatedMapel = Array.from(mapelByName.values());

    const sortedMapel = deduplicatedMapel
      .sort((a, b) =>
        (a.nama_mapel || a.nama || "").localeCompare(
          b.nama_mapel || b.nama || "",
        ),
      )
      .map((m) => ({
        ...m,
        guru_pengampu: guruMap.get(m.id) || "Walikelas",
      }));

    // ========== PERHITUNGAN NILAI ==========
    // UTS / UAS (PER MAPEL)
    const utsIds = ujianData
      .filter((u) => u.jenis_ujian === JENIS_UTS)
      .map((u) => u.id);
    const uasIds = ujianData
      .filter((u) => u.jenis_ujian === JENIS_UAS)
      .map((u) => u.id);

    let nilaiUjianData = [];
    if (ujianData.length > 0) {
      nilaiUjianData = await legerRepository.findNilaiUjianByUjianIds(
        ujianData.map((u) => u.id),
      );
    }

    // ✅ FIX: dikelompokkan per mapel -> per ujian -> per siswa
    // (sebelumnya tanpa mapel, sehingga nilai mapel terakhir menimpa
    // semua mapel dan UTS/UAS jadi sama di seluruh mapel)
    const ujianMap = {};
    nilaiUjianData.forEach((n) => {
      const mId = Array.isArray(n.mapel_id) ? n.mapel_id[0] : n.mapel_id;
      if (!mId) return;
      if (!ujianMap[mId]) ujianMap[mId] = {};
      if (!ujianMap[mId][n.pengaturan_ujian_id])
        ujianMap[mId][n.pengaturan_ujian_id] = {};
      ujianMap[mId][n.pengaturan_ujian_id][n.siswa_id] = n.nilai;
    });
    function avgUjian(ids, mapelId, siswaId) {
      const vals = ids
        .map((uid) => ujianMap[mapelId]?.[uid]?.[siswaId])
        .filter((v) => typeof v === "number" && !isNaN(v) && v !== -1);
      return average(vals);
    }

    // Formatif & Sumatif
    let tpAll = [];
    let lpAll = [];
    if (sortedMapel.length > 0) {
      const mapelIds = sortedMapel.map((m) => m.id);
      [tpAll, lpAll] = await Promise.all([
        legerRepository.findTpByMapelIds(mapelIds),
        legerRepository.findLmByMapelIds(mapelIds),
      ]);
    }
    const tpToMapel = {};
    tpAll.forEach((tp) => {
      tpToMapel[tp.id] = tp.mapel_id;
    });
    const lpToMapel = {};
    lpAll.forEach((lp) => {
      lpToMapel[lp.id] = lp.mapel_id;
    });

    const [nfData, nsData] = await Promise.all([
      legerRepository.findNilaiFormatifByKelas(kelasData.id),
      legerRepository.findNilaiSumatifByKelas(kelasData.id),
    ]);

    const formatifValues = {};
    nfData.forEach((n) => {
      const mapelId = tpToMapel[n.tp_id];
      if (!mapelId) return;
      if (!formatifValues[mapelId]) formatifValues[mapelId] = {};
      if (!formatifValues[mapelId][n.siswa_id])
        formatifValues[mapelId][n.siswa_id] = [];
      ["k1", "k2", "k3", "k4"].forEach((k) => {
        const val = n[k];
        if (typeof val === "number" && !isNaN(val) && val !== -1) {
          formatifValues[mapelId][n.siswa_id].push(val);
        }
      });
    });

    const sumatifValues = {};
    nsData.forEach((n) => {
      const mapelId = lpToMapel[n.lm_id];
      if (!mapelId) return;
      if (!sumatifValues[mapelId]) sumatifValues[mapelId] = {};
      if (!sumatifValues[mapelId][n.siswa_id])
        sumatifValues[mapelId][n.siswa_id] = [];
      if (
        typeof n.nilai === "number" &&
        !isNaN(n.nilai) &&
        n.nilai !== -1
      ) {
        sumatifValues[mapelId][n.siswa_id].push(n.nilai);
      }
    });

    // Nilai Akhir
    const nilaiAkhir = {};
    sortedMapel.forEach((m) => {
      nilaiAkhir[m.id] = {};
      siswaData.forEach((s) => {
        const formatifAvg = average(formatifValues[m.id]?.[s.id] || []);
        const sumatifAvg = average(sumatifValues[m.id]?.[s.id] || []);
        // ✅ FIX: UTS/UAS dihitung per mapel
        const utsVal = avgUjian(utsIds, m.id, s.id);
        const uasVal = avgUjian(uasIds, m.id, s.id);

        // Sama dengan tab "Nilai rapor": rata-rata komponen yang tersedia
        const komponen = [formatifAvg, sumatifAvg, utsVal, uasVal].filter(
          (v) => v !== null && v !== undefined && !isNaN(v) && v !== -1,
        );
        nilaiAkhir[m.id][s.id] =
          komponen.length === 0
            ? null
            : komponen.reduce((a, b) => a + b, 0) / komponen.length;
      });
    });

    // ================= JUMLAH, RATA-RATA, RANK =================
    const jumlah = {};
    const rata = {};
    siswaData.forEach((s) => {
      let sum = 0;
      let count = 0;
      sortedMapel.forEach((m) => {
        const v = nilaiAkhir[m.id]?.[s.id];
        if (typeof v === "number" && !isNaN(v)) {
          sum += v;
          count++;
        }
      });
      jumlah[s.id] = count > 0 ? sum : null;
      rata[s.id] = count > 0 ? sum / count : null;
    });

    const sorted = [...siswaData]
      .filter((s) => rata[s.id] !== null)
      .sort((a, b) => rata[b.id] - rata[a.id]);
    const rank = {};
    sorted.forEach((s, idx) => {
      rank[s.id] = idx + 1;
    });
    siswaData.forEach((s) => {
      if (rank[s.id] === undefined) rank[s.id] = sorted.length + 1;
    });

    // ================= STATISTIK PER MAPEL =================
    const stats = {};
    sortedMapel.forEach((m) => {
      const vals = siswaData
        .map((s) => nilaiAkhir[m.id]?.[s.id])
        .filter((v) => typeof v === "number" && !isNaN(v));
      stats[m.id] = {
        rata: vals.length
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : null,
        tertinggi: vals.length ? Math.max(...vals) : null,
        terendah: vals.length ? Math.min(...vals) : null,
      };
    });

    return {
      kelas: kelasData,
      siswaList: siswaData,
      mapelList: sortedMapel,
      nilaiAkhirMap: nilaiAkhir,
      jumlahMap: jumlah,
      rataRataMap: rata,
      rankMap: rank,
      mapelStats: stats,
      error: null,
    };
  } catch (error) {
    console.error("Gagal memuat data leger:", error);
    return { error: describeError(error) };
  }
}
