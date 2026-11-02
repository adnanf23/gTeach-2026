import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Tahun ajaran — halaman ICT > Ujian > Manajemen Ujian
// ---------------------------------------------------------------------------
export async function findTahunAjaran() {
  const pb = await getServerPb();
  return pb.collection("tahun_ajaran").getFullList({
    sort: "-tahun,-semester",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Kelas (untuk pemilihan kelas spesifik pada form ujian)
// ---------------------------------------------------------------------------
export async function findKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "tingkat,nama_kelas",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Pengaturan ujian milik satu tahun ajaran (di-expand ke kelas sasaran)
// ---------------------------------------------------------------------------
export async function findPengaturanUjianByTahunAjaran(tahunAjaranId) {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    filter: `tahun_ajaran_id = "${tahunAjaranId}"`,
    sort: "jenis_ujian,nama_ujian",
    expand: "target_kelas_id",
    requestKey: null,
  });
}
