import { describeError } from "@/lib/app-error";
import * as fullDataRepository from "@/repositories/ict-full-data.repository";

// ================================================================
// UTIL (fungsi murni)
// ================================================================
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}
function normNis(v) {
  return String(v ?? "")
    .replace(/\D/g, "")
    .trim();
}
function normText(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// ================================================================
// LOAD DAFTAR KELAS
// ================================================================
export async function getKelasList() {
  try {
    const list = await fullDataRepository.findAllKelas();
    return { list, error: null };
  } catch (error) {
    console.error("Gagal load kelas:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// LOAD MAPEL + UJIAN AKTIF UNTUK SATU KELAS
// ================================================================
export async function getMapelData({ kelasId, tingkat }) {
  try {
    const [mapelKhusus, mapelTingkat, plotingData, ujianData] =
      await Promise.all([
        fullDataRepository.findMapelSpesifikKelas(kelasId),
        fullDataRepository.findMapelByTingkat(tingkat),
        fullDataRepository.findPlotingGuruByKelas(kelasId),
        fullDataRepository.findUjianAktifByKelas(kelasId, tingkat),
      ]);

    const combinedMapel = [...mapelKhusus, ...mapelTingkat];
    const uniqueMapelRaw = Array.from(
      new Map(combinedMapel.map((item) => [item.id, item])).values(),
    );

    const uniqueMapel = uniqueMapelRaw.filter((m) => {
      const spesifik = m.spesifik_kelas_id;
      const punyaRestriksi = Array.isArray(spesifik) && spesifik.length > 0;
      if (!punyaRestriksi) return true;
      return spesifik.includes(kelasId);
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
      String(a.nama_mapel || a.nama || "").localeCompare(
        String(b.nama_mapel || b.nama || ""),
        "id",
        { numeric: true, sensitivity: "base" },
      ),
    );

    return { mapel: mapelWithGuru, ujianAktif: ujianData, error: null };
  } catch (error) {
    console.error("Error fetching mapel:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// EXPORT: referensi seluruh mapel di satu kelas
// ================================================================
export async function getExportData({ kelasId, mapelIds }) {
  try {
    const [tpAll, lmAll, nfAll, nsAll, nuAll, siswaAll] = await Promise.all([
      fullDataRepository.findTpByMapelIdsKelas(mapelIds, kelasId),
      fullDataRepository.findLmByMapelIdsKelas(mapelIds, kelasId),
      fullDataRepository.findNilaiFormatifByKelas(kelasId),
      fullDataRepository.findNilaiSumatifByKelas(kelasId),
      fullDataRepository.findNilaiUjianByMapelIds(mapelIds),
      fullDataRepository.findSiswaByKelasSorted(kelasId),
    ]);

    const tpById = {};
    tpAll.forEach((t) => {
      tpById[t.id] = t;
    });
    const lmById = {};
    lmAll.forEach((l) => {
      lmById[l.id] = l;
    });
    const lmOrder = {};
    lmAll.forEach((l, i) => {
      lmOrder[l.id] = i;
    });

    const collator = new Intl.Collator("id", { numeric: true });
    const siswaSorted = [...siswaAll].sort((a, b) =>
      collator.compare(a.nama_siswa || "", b.nama_siswa || ""),
    );

    return {
      tpAll,
      lmAll,
      nfAll,
      nsAll,
      nuAll,
      siswaSorted,
      tpById,
      lmById,
      lmOrder,
      error: null,
    };
  } catch (error) {
    console.error("Gagal export:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// IMPORT: lookup siswa (NIS & nama) untuk satu kelas
// ================================================================
export async function getImportSiswaData({ kelasId }) {
  try {
    const siswaAll = await fullDataRepository.findSiswaByKelas(kelasId);

    const siswaByNis = {};
    const siswaByNama = {};
    siswaAll.forEach((s) => {
      const nis = normNis(s.nis);
      if (nis && !(nis in siswaByNis)) siswaByNis[nis] = s;
      const nm = normText(s.nama_siswa);
      if (nm && !(nm in siswaByNama)) siswaByNama[nm] = s;
    });

    return { siswaByNis, siswaByNama, error: null };
  } catch (error) {
    console.error("Gagal import:", error);
    return { error: describeError(error) };
  }
}

// ================================================================
// IMPORT: referensi + nilai existing untuk satu mapel
// ================================================================
export async function getMapelSheetData({ mapelId, kelasId }) {
  try {
    const [tpList, lmList, nfAll, nsAll, nuAll] = await Promise.all([
      fullDataRepository.findTpByMapelKelas(mapelId, kelasId),
      fullDataRepository.findLmByMapelKelas(mapelId, kelasId),
      fullDataRepository.findNilaiFormatifByKelas(kelasId),
      fullDataRepository.findNilaiSumatifByKelas(kelasId),
      fullDataRepository.findNilaiUjianByMapelId(mapelId),
    ]);

    const tpByNo = {};
    tpList.forEach((t) => {
      const no = String(t.no_tp || "")
        .trim()
        .toUpperCase();
      if (no) tpByNo[no] = t;
    });

    const lmByName = {};
    lmList.forEach((l) => {
      lmByName[normText(l.nama)] = l;
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

    return { tpByNo, lmByName, nfMap, nsMap, nuMap, error: null };
  } catch (error) {
    console.error("Gagal memproses sheet:", error);
    return { error: describeError(error) };
  }
}
