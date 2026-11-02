import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Akun wali murid (di-expand ke siswa + kelas siswa) — halaman ICT > Wali Murid
// ---------------------------------------------------------------------------
export async function findWaliMuridDetailed() {
  const pb = await getServerPb();
  return pb.collection("wali_murid").getFullList({
    expand: "siswa_id,siswa_id.kelas_id",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Siswa (di-expand ke kelas) untuk pilihan dropdown "Siswa" pada modal
// ---------------------------------------------------------------------------
export async function findSiswaWithKelas() {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    expand: "kelas_id",
    requestKey: null,
    sort: "nama_siswa",
  });
}
