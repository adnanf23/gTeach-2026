import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Akses data murni halaman ICT > Rapor > Pengaturan Rapor.
// Fungsi di sini hanya membungkus query PocketBase dan melempar error apa
// adanya; penentuan tahun ajaran terpilih serta penyusunan filter turunan
// ditangani di layer services.

// Seluruh tahun ajaran (terbaru lebih dulu) untuk pemilih tahun ajaran.
export async function findTahunAjaran() {
  const pb = await getServerPb();
  return pb.collection("tahun_ajaran").getFullList({
    sort: "-tahun,-semester",
    requestKey: null,
  });
}

// Daftar ujian (pengaturan_ujian) milik satu tahun ajaran.
export async function findPengaturanUjianByTahunAjaran(tahunAjaranId) {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    filter: `tahun_ajaran_id = "${tahunAjaranId}"`,
    sort: "jenis_ujian,nama_ujian",
    requestKey: null,
  });
}

// Pengaturan rapor untuk sekumpulan id ujian.
export async function findPengaturanRaporByUjianIds(ujianIds) {
  const pb = await getServerPb();
  const filter = ujianIds.map((id) => `ujian_id = "${id}"`).join(" || ");
  return pb.collection("pengaturan_rapor").getFullList({
    filter,
    requestKey: null,
  });
}
