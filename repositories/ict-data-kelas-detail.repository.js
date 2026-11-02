import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Satu-satunya lapisan yang menyentuh PocketBase untuk fitur
// ICT > Data Utama > Data Kelas (halaman detail per kelas).

// Detail satu kelas (dengan expand relasi wali/pendamping/tahun ajaran).
export async function findKelasById(id) {
  const pb = await getServerPb();
  return pb.collection("kelas").getOne(id, {
    expand: "walikelas_id,pendamping_id,tahun_ajaran_id",
    requestKey: null,
  });
}

// Siswa yang terdaftar pada satu kelas.
export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

// Mata pelajaran yang di-assign khusus ke kelas ini.
export async function findMapelSpesifikKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    filter: `spesifik_kelas_id ~ "${kelasId}"`,
    requestKey: null,
  });
}

// Kandidat mata pelajaran umum berdasarkan tingkat.
export async function findMapelByTingkat(tingkat) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    filter: `target_tingkat ~ "${String(tingkat)}"`,
    requestKey: null,
  });
}
