import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Akses data murni untuk halaman absensi harian guru mapel.
// Fungsi-fungsi ini hanya membungkus query PocketBase dan melempar error apa
// adanya; seluruh logika bisnis/agregasi ditangani di layer services.

// Ploting guru milik satu guru (beserta expand mapel & kelas).
export async function findPlotingGuruByGuru(guruId) {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    filter: `guru_id = "${guruId}"`,
    expand: "mapel_id,kelas_id",
    requestKey: null,
  });
}

// Jumlah siswa dalam satu kelas (dipakai untuk badge jumlah siswa per kelas).
export async function countSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  const result = await pb.collection("siswa").getList(1, 1, {
    filter: `kelas_id = "${kelasId}"`,
    requestKey: null,
    fields: "id",
  });
  return result.totalItems;
}

export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

// Absensi pada rentang tanggal tertentu.
export async function findAbsensiByRange({ kelasId, startStr, endStr }) {
  const pb = await getServerPb();
  return pb.collection("absensi").getFullList({
    filter: `kelas_id = "${kelasId}" && tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
    requestKey: null,
  });
}
