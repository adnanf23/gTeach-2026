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

// Siswa pada kelas guru (dengan expand kelas).
export async function findSiswa(filter) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter,
    sort: "nama_siswa",
    expand: "kelas_id",
    requestKey: null,
  });
}

// Catatan siswa sesuai filter siswa + kelas.
export async function findCatatanKokurikuler(filter) {
  const pb = await getServerPb();
  return pb.collection("catatan_kokurikuler").getFullList({
    filter,
    sort: "-created",
    expand: "siswa_id,kelas_id",
    requestKey: null,
  });
}
