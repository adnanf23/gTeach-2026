import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Ringkasan "semua kelas"
// ---------------------------------------------------------------------------
export async function findKelasRingkas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "tingkat,nama_kelas",
    requestKey: null,
  });
}

export async function findSiswaRingkas() {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    fields: "id,kelas_id",
    requestKey: null,
  });
}

export async function findAllCatatanKasusRingkas() {
  const pb = await getServerPb();
  return pb.collection("catatan_kasus").getFullList({
    fields: "id,kelas_id,jenis_kasus,sync_sias,date",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Detail satu kelas terpilih
// ---------------------------------------------------------------------------
export async function findCatatanKasusByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("catatan_kasus").getFullList({
    filter: `kelas_id="${kelasId}"`,
    expand: "siswa_id,tahun_ajaran_id",
    sort: "-date",
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
