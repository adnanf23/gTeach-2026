import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Akses data murni untuk halaman ICT > Monitoring Harian > Absensi.
// Fungsi-fungsi ini hanya membungkus query PocketBase dan melempar error apa
// adanya; seluruh agregasi/rekap ditangani di layer services.

export async function findKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "tingkat,nama_kelas",
    expand: "walikelas_id,pendamping_id",
    requestKey: null,
  });
}

export async function findSiswa() {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function findHariLibur() {
  const pb = await getServerPb();
  return pb.collection("hari_libur").getFullList({ requestKey: null });
}

// Rentang tanggal untuk mode monitoring (30 hari, sort -tanggal) dan export.
// `kelasId` opsional ("semua" ditangani pemanggil dengan mengirim null).
export async function findAbsensiByRange({ kelasId, startStr, endStr, sort }) {
  const pb = await getServerPb();

  let filter = `tanggal >= "${startStr}" && tanggal <= "${endStr}"`;
  if (kelasId) filter += ` && kelas_id = "${kelasId}"`;

  const options = { filter, requestKey: null };
  if (sort) options.sort = sort;

  return pb.collection("absensi").getFullList(options);
}

// Absensi satu hari (di-expand ke siswa_id & kelas_id).
export async function findAbsensiByDate({ dateStr }) {
  const pb = await getServerPb();
  return pb.collection("absensi").getFullList({
    filter: `tanggal >= "${dateStr} 00:00:00" && tanggal <= "${dateStr} 23:59:59"`,
    expand: "siswa_id,kelas_id",
    requestKey: null,
  });
}
