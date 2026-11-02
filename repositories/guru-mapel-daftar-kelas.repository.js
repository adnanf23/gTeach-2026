import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Seluruh baris ploting_guru milik guru yang login (dengan expand kelas & mapel).
export async function findPlotingGuruByGuruId(guruId) {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    filter: `guru_id = "${guruId}"`,
    expand: "kelas_id,mapel_id",
    requestKey: null,
  });
}

// Satu baris siswa per kelas; dipakai untuk membaca `totalItems` (jumlah siswa).
export async function countSiswaByKelasId(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getList(1, 1, {
    filter: `kelas_id = "${kelasId}"`,
    requestKey: null,
    fields: "id",
  });
}
