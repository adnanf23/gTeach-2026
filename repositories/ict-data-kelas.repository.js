import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Kelas + expand wali/pendamping (isi grid kartu kelas)
// ---------------------------------------------------------------------------
export async function findKelasDenganWaliPendamping() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    expand: "walikelas_id,pendamping_id",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Guru (users role wali kelas / pendamping) — filter sama persis dengan
// halaman data-kelas (dipakai dropdown Wali Kelas & Guru Pendamping)
// ---------------------------------------------------------------------------
export async function findGuruWaliPendamping() {
  const pb = await getServerPb();
  return pb.collection("users").getList(1, 100, {
    filter: 'role = "guru walikelas" || role = "guru pendamping"',
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Hitung jumlah siswa satu kelas (hanya butuh totalItems)
// ---------------------------------------------------------------------------
export async function countSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getList(1, 1, {
    filter: `kelas_id = "${kelasId}"`,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Semua user tanpa filter (dipakai saat import untuk memetakan nama -> id)
// ---------------------------------------------------------------------------
export async function findSemuaUser() {
  const pb = await getServerPb();
  return pb.collection("users").getFullList({
    requestKey: null,
  });
}
