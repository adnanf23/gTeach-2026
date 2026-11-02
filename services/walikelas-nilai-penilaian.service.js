import { describeError } from "@/lib/app-error";
import * as penilaianRepository from "@/repositories/walikelas-nilai-penilaian.repository";

// ================================================================
// LOAD DATA PENILAIAN (daftar mapel + ujian aktif)
// Memanggil repository (data) lalu melakukan filter/mapping/sorting murni.
// ================================================================
export async function getPenilaianData({ userId, tahunAjaranId }) {
  try {
    // 1. Ambil data kelas
    const kelas = await penilaianRepository.findKelasByWalikelas(userId);

    let mapel = [];
    let ujianAktif = [];

    if (kelas) {
      // 2. Fetch Mapel Khusus & Tingkat
      // 3. Fetch Ploting Guru dengan expand guru_id
      // 4. Fetch ujian aktif untuk kelas
      const [mapelKhusus, mapelTingkat, plotingData, ujianData] =
        await Promise.all([
          penilaianRepository.findMapelSpesifikKelas(kelas.id),
          penilaianRepository.findMapelByTingkat(kelas.tingkat),
          penilaianRepository.findPlotingGuruByKelas(kelas.id),
          penilaianRepository.findUjianAktifByKelas(
            kelas.id,
            kelas.tingkat,
            tahunAjaranId,
          ),
        ]);

      ujianAktif = ujianData;

      // 5. Gabungkan & filter mapel
      const combinedMapel = [...mapelKhusus, ...mapelTingkat];
      const uniqueMapelRaw = Array.from(
        new Map(combinedMapel.map((item) => [item.id, item])).values(),
      );

      const uniqueMapel = uniqueMapelRaw.filter((m) => {
        const spesifik = m.spesifik_kelas_id;
        const punyaRestriksi =
          Array.isArray(spesifik) && spesifik.length > 0;
        if (!punyaRestriksi) return true;
        return spesifik.includes(kelas.id);
      });

      // 6. Buat Mapping Guru
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

      mapel = mapelWithGuru;
    }

    // Sort ujian: UTS dulu, UAS, lalu lain-lain; jika jenis sama urut nama
    const rank = (u) => {
      if (u.jenis_ujian === "ahb") return 0;
      if (u.jenis_ujian === "asas") return 1;
      if (u.jenis_ujian === "asat") return 2;
      return 3;
    };
    const ujianSorted = [...ujianAktif].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return String(a.nama_ujian || "").localeCompare(
        String(b.nama_ujian || ""),
        "id",
      );
    });

    return {
      currentKelas: kelas,
      mapel,
      ujianAktif,
      ujianSorted,
      error: null,
    };
  } catch (error) {
    console.error("Error fetching data:", error);
    return { error: describeError(error) };
  }
}
