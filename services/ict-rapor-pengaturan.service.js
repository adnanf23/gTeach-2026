import * as ictRaporPengaturanRepository from "@/repositories/ict-rapor-pengaturan.repository";

// Baca data awal halaman ICT > Rapor > Pengaturan Rapor: seluruh tahun ajaran
// + tahun ajaran terpilih (yang berstatus aktif, atau yang pertama bila tidak
// ada yang aktif).
export async function getPengaturanRaporInit() {
  try {
    const tahunAjaranList =
      await ictRaporPengaturanRepository.findTahunAjaran();

    const aktif = tahunAjaranList.find((t) => t.is_aktif);
    const selectedTahunAjaranId = (aktif || tahunAjaranList[0])?.id || null;

    return { tahunAjaranList, selectedTahunAjaranId, error: null };
  } catch (err) {
    console.error("Error fetching tahun_ajaran:", err);
    return {
      tahunAjaranList: [],
      selectedTahunAjaranId: null,
      error: "Gagal memuat data tahun ajaran.",
    };
  }
}

// Baca daftar ujian pada tahun ajaran terpilih beserta pengaturan rapornya.
// Filter pengaturan_rapor disusun dari id ujian yang berhasil dibaca lebih dulu.
export async function getPengaturanRaporData(tahunAjaranId) {
  try {
    const ujianList =
      await ictRaporPengaturanRepository.findPengaturanUjianByTahunAjaran(
        tahunAjaranId,
      );

    if (ujianList.length === 0) {
      return { ujianList: [], raporList: [], error: null };
    }

    const raporList =
      await ictRaporPengaturanRepository.findPengaturanRaporByUjianIds(
        ujianList.map((u) => u.id),
      );

    return { ujianList, raporList, error: null };
  } catch (err) {
    console.error("Error fetching pengaturan_rapor:", err);
    return {
      ujianList: [],
      raporList: [],
      error: "Gagal memuat data pengaturan rapor.",
    };
  }
}
