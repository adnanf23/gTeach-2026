import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Kelas utama tempat user menjadi walikelas / pendamping.
export async function findKelasGuru(filter) {
  const pb = await getServerPb();
  return pb.collection("kelas").getFirstListItem(filter, { requestKey: null });
}

// Siswa pada sebuah kelas.
export async function findSiswaByKelas(filter) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter,
    sort: "nama_siswa",
    requestKey: null,
  });
}

// Kehadiran manual pada sebuah kelas.
export async function findKehadiranByKelas(filter) {
  const pb = await getServerPb();
  return pb.collection("kehadiran_manual").getFullList({
    filter,
    requestKey: null,
  });
}
