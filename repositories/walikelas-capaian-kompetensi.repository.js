import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Kelas tempat user menjadi walikelas / pendamping.
export async function findKelasGuru(filter) {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    filter,
    sort: "tingkat,nama_kelas",
    requestKey: null,
  });
}

// Mata pelajaran yang cocok dengan filter kelas/tingkat.
export async function findMapel(filter) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    filter,
    sort: "nama_mapel",
    requestKey: null,
  });
}

// Capaian kompetensi sesuai filter kelas + mapel.
export async function findCapaianKompetensi(filter) {
  const pb = await getServerPb();
  return pb.collection("capaian_kompetensi").getFullList({
    filter,
    sort: "-created",
    expand: "mapel_id,kelas_id",
    requestKey: null,
  });
}
