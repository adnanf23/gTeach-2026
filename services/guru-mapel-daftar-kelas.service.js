import * as daftarKelasRepository from "@/repositories/guru-mapel-daftar-kelas.repository";

// Helper murni: relasi PocketBase bisa berupa array maupun objek tunggal.
function toArray(val) {
  if (Array.isArray(val)) return val;
  return val ? [val] : [];
}

// Susun kartu kelas (kelas + daftar mapel unik + jumlah siswa) untuk guru mapel.
// Seluruh flatten, dedup, dan sorting dilakukan di sini.
export async function getDaftarKelasGuruMapel(userId) {
  try {
    const plotingRecords =
      await daftarKelasRepository.findPlotingGuruByGuruId(userId);

    const kelasMap = {};
    for (const p of plotingRecords) {
      const kelasArr = toArray(p.expand?.kelas_id);
      const mapel = p.expand?.mapel_id;

      for (const k of kelasArr) {
        if (!kelasMap[k.id]) {
          kelasMap[k.id] = { kelas: k, mapelList: [] };
        }
        if (mapel && !kelasMap[k.id].mapelList.some((m) => m.id === mapel.id)) {
          kelasMap[k.id].mapelList.push(mapel);
        }
      }
    }

    const kelasIds = Object.keys(kelasMap);

    const counts = await Promise.all(
      kelasIds.map((kid) =>
        daftarKelasRepository
          .countSiswaByKelasId(kid)
          .then((r) => r.totalItems)
          .catch(() => 0),
      ),
    );

    const cards = kelasIds.map((kid, idx) => ({
      kelas: kelasMap[kid].kelas,
      mapelList: kelasMap[kid].mapelList.sort((a, b) =>
        (a.nama_mapel || "").localeCompare(b.nama_mapel || ""),
      ),
      siswaCount: counts[idx],
    }));

    cards.sort((a, b) => {
      const t = (Number(a.kelas.tingkat) || 0) - (Number(b.kelas.tingkat) || 0);
      if (t !== 0) return t;
      return (a.kelas.nama_kelas || "").localeCompare(
        b.kelas.nama_kelas || "",
      );
    });

    return { kelasCards: cards, error: null };
  } catch (err) {
    console.error("Error fetching data kelas guru mapel:", err);
    return { kelasCards: [], error: "Gagal memuat daftar kelas Anda." };
  }
}
