import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Mata pelajaran (di-expand ke kelas spesifik) — halaman ICT > Mapel
// ---------------------------------------------------------------------------
export async function findMapel() {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    sort: "nama_mapel",
    expand: "spesifik_kelas_id",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Satu mata pelajaran (di-expand ke kelas spesifik) — dipakai setelah
// create/update supaya record yang masuk state sama bentuknya dengan daftar.
// ---------------------------------------------------------------------------
export async function findMapelById(id) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getOne(id, {
    expand: "spesifik_kelas_id",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Kelas (untuk pemilihan kelas spesifik mapel)
// ---------------------------------------------------------------------------
export async function findKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "tingkat,nama_kelas",
    requestKey: null,
  });
}
