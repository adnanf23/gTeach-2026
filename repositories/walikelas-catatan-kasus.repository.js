import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Kelas milik wali kelas / pendamping yang login.
export async function findKelasByWaliOrPendamping(userId) {
  const pb = await getServerPb();
  return pb
    .collection("kelas")
    .getFirstListItem(
      `walikelas_id="${userId}" || pendamping_id="${userId}"`,
      { requestKey: null },
    );
}

// Tahun ajaran aktif.
export async function findTahunAjaranAktif() {
  const pb = await getServerPb();
  return pb
    .collection("tahun_ajaran")
    .getFirstListItem(`is_aktif=true`, { requestKey: null });
}

// Siswa pada suatu kelas.
export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id="${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

// Catatan kasus untuk satu kelas (dengan expand siswa).
export async function findCatatanKasusByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("catatan_kasus").getFullList({
    filter: `kelas_id="${kelasId}"`,
    expand: "siswa_id",
    sort: "-date",
    requestKey: null,
  });
}

// Catatan kasus dengan filter bebas (mis. riwayat per siswa).
export async function findCatatanKasusByFilter(filter) {
  const pb = await getServerPb();
  return pb.collection("catatan_kasus").getFullList({
    filter,
    sort: "-date",
    requestKey: null,
  });
}
