import * as ictManajemenUjianRepository from "@/repositories/ict-manajemen-ujian.repository";

// Baca data awal halaman ICT > Ujian > Manajemen Ujian: daftar tahun ajaran +
// daftar kelas, sekaligus menentukan tahun ajaran terpilih awal (yang berstatus
// aktif, atau yang pertama bila tidak ada yang aktif).
export async function getManajemenUjianInit() {
  try {
    const [tahunAjaranList, kelasList] = await Promise.all([
      ictManajemenUjianRepository.findTahunAjaran(),
      ictManajemenUjianRepository.findKelas(),
    ]);

    const aktif = tahunAjaranList.find((t) => t.is_aktif);
    const selectedTahunAjaranId = (aktif || tahunAjaranList[0])?.id || null;

    return {
      tahunAjaranList,
      kelasList,
      selectedTahunAjaranId,
      error: null,
    };
  } catch (err) {
    console.error("Error fetching init data:", err);
    return {
      tahunAjaranList: [],
      kelasList: [],
      selectedTahunAjaranId: null,
      error: "Gagal memuat data tahun ajaran / kelas.",
    };
  }
}

// Baca daftar pengaturan_ujian (di-expand ke kelas sasaran) untuk satu tahun
// ajaran terpilih.
export async function getManajemenUjianList(tahunAjaranId) {
  try {
    const ujianList =
      await ictManajemenUjianRepository.findPengaturanUjianByTahunAjaran(
        tahunAjaranId,
      );

    return { ujianList, error: null };
  } catch (err) {
    console.error("Error fetching pengaturan_ujian:", err);
    return { ujianList: [], error: "Gagal memuat data ujian." };
  }
}
