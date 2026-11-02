import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Kelas milik wali kelas / pendamping (dengan expand relasi).
export async function findKelasByWaliOrPendampingDetailed(userId) {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    filter: `walikelas_id = "${userId}" || pendamping_id = "${userId}"`,
    sort: "tingkat,nama_kelas",
    expand: "tahun_ajaran_id,walikelas_id,pendamping_id",
    requestKey: null,
  });
}

export async function findSiswaByFilter(filter) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter,
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function findMapelByFilter(filter) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    filter,
    requestKey: null,
  });
}

export async function findWaliMuridByFilter(filter) {
  const pb = await getServerPb();
  return pb.collection("wali_murid").getFullList({
    filter,
    fields: "id,username,siswa_id,verified",
    requestKey: null,
  });
}
