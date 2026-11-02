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

// Seluruh kelas (untuk pemilih kelas admin / ict).
export async function findAllKelasSorted() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "nama_kelas",
    requestKey: null,
  });
}

// Baris ploting guru untuk satu kelas.
export async function findPlotingGuruByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    filter: `kelas_id ~ "${kelasId}"`,
    expand: "guru_id,mapel_id",
    requestKey: null,
  });
}
