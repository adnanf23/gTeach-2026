import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Guru (users dengan role guru) — filter sama persis dengan halaman data-guru
// ---------------------------------------------------------------------------
export async function findGuru() {
  const pb = await getServerPb();
  return pb.collection("users").getFullList({
    filter: `role = "guru walikelas" || role = "guru pendamping" || role = "guru mapel"`,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Kelas + expand wali/pendamping (dipakai kolom "Kelas Diampu")
// ---------------------------------------------------------------------------
export async function findKelasDenganPengampu() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    expand: "walikelas_id,pendamping_id",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Semua user tanpa filter (dipakai saat import untuk cek duplikat nama/email)
// ---------------------------------------------------------------------------
export async function findSemuaUser() {
  const pb = await getServerPb();
  return pb.collection("users").getFullList({
    requestKey: null,
  });
}
