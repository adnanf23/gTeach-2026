import { describeError } from "@/lib/app-error";
import * as nilaiSiswaRepository from "@/repositories/ict-nilai-siswa.repository";

// ================================================================
// KONFIGURASI
// ================================================================
const JENIS_UTS = "ahb";
const JENIS_UAS = "asas";

const URUTAN_MAPEL = ["matematika", "mtk", "inggris"];

// ================================================================
// UTIL (pure helper)
// ================================================================
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function average(arr) {
  const nums = arr.filter(
    (v) => typeof v === "number" && !isNaN(v) && v !== -1,
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function numOrNull(v) {
  return typeof v === "number" && !isNaN(v) && v !== -1 ? v : null;
}

function groupBy(arr, keyFn) {
  const m = new Map();
  arr.forEach((x) => {
    const k = keyFn(x);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  });
  return m;
}

// ================================================================
// LOAD DAFTAR KELAS + JUMLAH SISWA
// ================================================================
export async function getKelasDanSiswaCount() {
  try {
    const [kelasData, siswaData] = await Promise.all([
      nilaiSiswaRepository.findAllKelas(),
      nilaiSiswaRepository.findAllSiswaKelasIds(),
    ]);

    const countMap = {};
    siswaData.forEach((s) => {
      const kid = firstOf(s.kelas_id);
      if (kid) countMap[kid] = (countMap[kid] || 0) + 1;
    });

    return { kelasList: kelasData, siswaCountMap: countMap, error: null };
  } catch (error) {
    console.error("Gagal memuat kelas:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// LOAD DATA + AGREGASI LEGER SATU KELAS
// Memanggil repository (data) lalu melakukan seluruh perhitungan murni.
// ================================================================
export async function getLegerKelasData({ kelasId, tingkat }) {
  try {
    const [siswaData, mapelKhusus, mapelTingkat, plotingData, ujianData] =
      await Promise.all([
        nilaiSiswaRepository.findSiswaByKelas(kelasId),
        nilaiSiswaRepository.findMapelSpesifikKelas(kelasId),
        nilaiSiswaRepository.findMapelByTingkat(tingkat),
        nilaiSiswaRepository.findPlotingGuruByKelas(kelasId),
        nilaiSiswaRepository.findUjianAktifByKelas(kelasId, tingkat),
      ]);

    // ========== GABUNG & FILTER MAPEL ==========
    const combined = [...mapelKhusus, ...mapelTingkat];
    const uniqueMapelRaw = Array.from(
      new Map(combined.map((m) => [m.id, m])).values(),
    );

    const uniqueMapel = uniqueMapelRaw.filter((m) => {
      if ((m.kategori || "").toLowerCase() !== "umum") return false;
      const spesifik = m.spesifik_kelas_id;
      const punyaRestriksi = Array.isArray(spesifik) && spesifik.length > 0;
      if (!punyaRestriksi) return true;
      return spesifik.includes(kelasId);
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
        if (!existingGuru && newGuru) mapelByName.set(key, m);
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

    // ========== UTS / UAS ==========
    const utsIds = ujianData
      .filter((u) => u.jenis_ujian === JENIS_UTS)
      .map((u) => u.id);
    const uasIds = ujianData
      .filter((u) => u.jenis_ujian === JENIS_UAS)
      .map((u) => u.id);

    let nilaiUjianData = [];
    if (ujianData.length > 0) {
      nilaiUjianData = await nilaiSiswaRepository.findNilaiUjianByUjianIds(
        ujianData.map((u) => u.id),
      );
    }

    const ujianMap = {};
    nilaiUjianData.forEach((n) => {
      if (!ujianMap[n.pengaturan_ujian_id])
        ujianMap[n.pengaturan_ujian_id] = {};
      ujianMap[n.pengaturan_ujian_id][n.siswa_id] = n.nilai;
    });

    function avgUjian(ids, siswaId) {
      const vals = ids
        .map((uid) => ujianMap[uid]?.[siswaId])
        .filter((v) => typeof v === "number" && !isNaN(v) && v !== -1);
      return average(vals);
    }
    const utsAvgMap = {};
    const uasAvgMap = {};
    siswaData.forEach((s) => {
      utsAvgMap[s.id] = avgUjian(utsIds, s.id);
      uasAvgMap[s.id] = avgUjian(uasIds, s.id);
    });

    // ========== TP / LM ==========
    let tpAll = [];
    let lpAll = [];
    if (sortedMapel.length > 0) {
      const mapelIds = sortedMapel.map((m) => m.id);
      [tpAll, lpAll] = await Promise.all([
        nilaiSiswaRepository.findTpByMapelIds(mapelIds, kelasId),
        nilaiSiswaRepository.findLmByMapelIds(mapelIds, kelasId),
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
      nilaiSiswaRepository.findNilaiFormatifByKelas(kelasId),
      nilaiSiswaRepository.findNilaiSumatifByKelas(kelasId),
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
      if (typeof n.nilai === "number" && !isNaN(n.nilai) && n.nilai !== -1) {
        sumatifValues[mapelId][n.siswa_id].push(n.nilai);
      }
    });

    // ========== NILAI AKHIR ==========
    const nilaiAkhir = {};
    sortedMapel.forEach((m) => {
      nilaiAkhir[m.id] = {};
      siswaData.forEach((s) => {
        const formatifAvg = average(formatifValues[m.id]?.[s.id] || []);
        const sumatifAvg = average(sumatifValues[m.id]?.[s.id] || []);
        const utsVal = utsAvgMap[s.id];
        const uasVal = uasAvgMap[s.id];

        const komponen = [formatifAvg, sumatifAvg, utsVal, uasVal].filter(
          (v) => v !== null && v !== undefined && !isNaN(v) && v !== -1,
        );

        if (komponen.length === 0) {
          nilaiAkhir[m.id][s.id] = null;
          return;
        }
        nilaiAkhir[m.id][s.id] =
          komponen.reduce((a, b) => a + b, 0) / komponen.length;
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

// ================================================================
// LOAD + AGREGASI DATA MENTAH UNTUK EXPORT SEMUA KELAS
// Mengembalikan struktur polos per kelas agar halaman cukup menyusun file.
// ================================================================
export async function getNilaiMentahExportData({ kelasList }) {
  try {
    const [siswaAll, mapelAll, tpAll, lmAll, nfAll, nsAll] = await Promise.all([
      nilaiSiswaRepository.findAllSiswa(),
      nilaiSiswaRepository.findAllMapel(),
      nilaiSiswaRepository.findAllTp(),
      nilaiSiswaRepository.findAllLm(),
      nilaiSiswaRepository.findAllNilaiFormatif(),
      nilaiSiswaRepository.findAllNilaiSumatif(),
    ]);

    const mapelById = new Map(mapelAll.map((m) => [m.id, m]));
    const tpById = new Map(tpAll.map((t) => [t.id, t]));
    const lmById = new Map(lmAll.map((l) => [l.id, l]));
    const lmOrder = new Map(lmAll.map((l, i) => [l.id, i]));

    const siswaByKelas = groupBy(siswaAll, (s) => firstOf(s.kelas_id));
    const nfByKelas = groupBy(nfAll, (n) => firstOf(n.kelas_id));
    const nsByKelas = groupBy(nsAll, (n) => firstOf(n.kelas_id));

    const masterIdx = new Map();
    mapelAll.forEach((m, i) => {
      const nm = (m.nama_mapel || m.nama || "").trim();
      if (!masterIdx.has(nm)) masterIdx.set(nm, i);
    });
    const rankMapel = (nm) => {
      const low = nm.toLowerCase();
      const idx = URUTAN_MAPEL.findIndex((k) => low.includes(k));
      return idx === -1 ? 1000 : idx;
    };

    const collator = new Intl.Collator("id", { numeric: true });

    const perKelas = (kelasList || []).map((kelas) => {
      const siswaKelas = siswaByKelas.get(kelas.id) || [];
      const nfKelas = nfByKelas.get(kelas.id) || [];
      const nsKelas = nsByKelas.get(kelas.id) || [];

      const data = {};
      let maxTp = 1;
      nfKelas.forEach((n) => {
        const tp = tpById.get(firstOf(n.tp_id));
        if (!tp) return;
        const mapel = mapelById.get(firstOf(tp.mapel_id));
        if (!mapel) return;
        const noTp = parseInt(String(tp.no_tp || "").replace(/\D/g, ""), 10);
        if (!noTp) return;

        const namaMapel = (mapel.nama_mapel || mapel.nama || "-").trim();
        const ks = [n.k1, n.k2, n.k3, n.k4].map(numOrNull);
        if (ks.every((v) => v === null)) return;

        if (!data[namaMapel]) data[namaMapel] = {};
        const perSiswa = data[namaMapel];
        const sid = firstOf(n.siswa_id);
        if (!perSiswa[sid]) perSiswa[sid] = {};
        perSiswa[sid][noTp] = ks;
        if (noTp > maxTp) maxTp = noTp;
      });

      const sData = {};
      const sOrder = {};
      nsKelas.forEach((n) => {
        const lm = lmById.get(firstOf(n.lm_id));
        if (!lm) return;
        const mapel = mapelById.get(firstOf(lm.mapel_id));
        if (!mapel) return;
        const nilai = numOrNull(n.nilai);
        if (nilai === null) return;

        const namaMapel = (mapel.nama_mapel || mapel.nama || "-").trim();
        const namaLm = (lm.nama || "-").trim();
        if (!sData[namaMapel]) {
          sData[namaMapel] = { perSiswa: {} };
          sOrder[namaMapel] = new Map();
        }
        const entry = sData[namaMapel];
        const ord = lmOrder.get(lm.id) ?? 0;
        const orderMap = sOrder[namaMapel];
        if (!orderMap.has(namaLm) || ord < orderMap.get(namaLm)) {
          orderMap.set(namaLm, ord);
        }
        const sid = firstOf(n.siswa_id);
        if (!entry.perSiswa[sid]) entry.perSiswa[sid] = {};
        entry.perSiswa[sid][namaLm] = nilai;
      });

      const lmNamesByMapel = {};
      let maxLm = 0;
      Object.keys(sData).forEach((nm) => {
        const names = Array.from(sOrder[nm].entries())
          .sort((a, b) => a[1] - b[1])
          .map((e) => e[0]);
        lmNamesByMapel[nm] = names;
        if (names.length > maxLm) maxLm = names.length;
      });

      const mapelNames = Array.from(
        new Set([...Object.keys(data), ...Object.keys(sData)]),
      ).sort(
        (a, b) =>
          rankMapel(a) - rankMapel(b) ||
          (masterIdx.get(a) ?? 0) - (masterIdx.get(b) ?? 0),
      );

      const siswaSorted = [...siswaKelas].sort((a, b) =>
        collator.compare(a.nama_siswa || "", b.nama_siswa || ""),
      );

      return {
        id: kelas.id,
        nama_kelas: kelas.nama_kelas,
        siswaSorted,
        data,
        sData,
        lmNamesByMapel,
        maxTp,
        maxLm,
        mapelNames,
      };
    });

    return { perKelas, error: null };
  } catch (error) {
    console.error("Gagal export nilai mentah:", error);
    return { error: describeError(error) };
  }
}
