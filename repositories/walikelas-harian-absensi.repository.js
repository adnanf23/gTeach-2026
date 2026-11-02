import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Akses data murni untuk fitur absensi harian wali kelas.
// Fungsi-fungsi ini hanya membungkus query PocketBase dan melempar error
// apa adanya; seluruh logika bisnis ditangani di layer services.

export async function findHariLibur() {
  const pb = await getServerPb();
  return pb.collection("hari_libur").getFullList({ requestKey: null });
}

export async function findKelasByWalikelas(userId) {
  const pb = await getServerPb();
  return pb
    .collection("kelas")
    .getFirstListItem(`walikelas_id="${userId}" || pendamping_id="${userId}"`, {
      requestKey: null,
    });
}

export async function findAllKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "nama_kelas",
    requestKey: null,
  });
}

export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id="${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function findAbsensiByRange({ kelasId, startStr, endStr }) {
  const pb = await getServerPb();
  return pb.collection("absensi").getFullList({
    filter: `kelas_id="${kelasId}" && tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
    requestKey: null,
  });
}
