import { describeError } from "@/lib/app-error";
import * as guruMapelDaftarKelasDetailRepository from "@/repositories/guru-mapel-daftar-kelas-detail.repository";

// Helper lokal (dipindah apa adanya dari halaman detail daftar kelas).
function toArray(val) {
  return Array.isArray(val) ? val : [val];
}

// Baca detail satu kelas + turunannya: data kelas (expand wali kelas /
// pendamping / tahun ajaran), daftar siswa kelas, dan ploting guru yang
// benar-benar memuat kelas ini.
// Mengembalikan objek polos { kelas, siswaList, plotingList, notFound, error }.
export async function getKelasDetailData(id) {
  try {
    const [kelas, siswaList, plotingByFilter] = await Promise.all([
      guruMapelDaftarKelasDetailRepository.findKelasById(id),
      guruMapelDaftarKelasDetailRepository.findSiswaByKelasId(id),
      guruMapelDaftarKelasDetailRepository.findPlotingByKelasId(id),
    ]);

    // Filter `kelas_id~"${id}"` bisa mengembalikan ploting kelas lain, jadi
    // hasilnya disaring ulang agar hanya ploting untuk kelas ini.
    const plotingList = plotingByFilter.filter((p) =>
      toArray(p.kelas_id).includes(id),
    );

    return { kelas, siswaList, plotingList, notFound: false, error: null };
  } catch (error) {
    console.error("Gagal memuat data kelas:", error);
    return {
      kelas: null,
      siswaList: [],
      plotingList: [],
      notFound: error?.status === 404,
      error: describeError(error),
    };
  }
}
