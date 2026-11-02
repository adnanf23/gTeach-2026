import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Satu-satunya lapisan yang menyentuh PocketBase untuk fitur rekap nilai ICT.
// Fungsi di sini HANYA mengakses data (query), tanpa logika bisnis.

export async function findAllKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "tingkat,nama_kelas",
    requestKey: null,
  });
}

export async function findAllSiswaKelasIds() {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    fields: "id,kelas_id",
    requestKey: null,
  });
}

export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function findMapelSpesifikKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    filter: `spesifik_kelas_id ~ "${kelasId}"`,
    requestKey: null,
  });
}

export async function findMapelByTingkat(tingkat) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    filter: `target_tingkat ~ "${String(tingkat)}"`,
    requestKey: null,
  });
}

export async function findPlotingGuruByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    filter: `kelas_id ~ "${kelasId}"`,
    expand: "guru_id",
    requestKey: null,
  });
}

export async function findUjianAktifByKelas(kelasId, tingkat) {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    filter: `status_akses = "buka" && (target_kelas_id ~ "${kelasId}" || target_tingkat ~ "${String(tingkat)}")`,
    requestKey: null,
  });
}

export async function findNilaiUjianByUjianIds(ujianIds) {
  const pb = await getServerPb();
  const filter = ujianIds
    .map((id) => `pengaturan_ujian_id = "${id}"`)
    .join(" || ");
  return pb.collection("nilai_ujian").getFullList({
    filter,
    requestKey: null,
  });
}

export async function findTpByMapelIds(mapelIds, kelasId) {
  const pb = await getServerPb();
  const filter = mapelIds.map((id) => `mapel_id ~ "${id}"`).join(" || ");
  return pb.collection("tujuan_pembelajaran").getFullList({
    filter: `(${filter}) && kelas_id ~ "${kelasId}"`,
    requestKey: null,
  });
}

export async function findLmByMapelIds(mapelIds, kelasId) {
  const pb = await getServerPb();
  const filter = mapelIds.map((id) => `mapel_id ~ "${id}"`).join(" || ");
  return pb.collection("lingkup_materi").getFullList({
    filter: `(${filter}) && kelas_id ~ "${kelasId}"`,
    requestKey: null,
  });
}

export async function findNilaiFormatifByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("nilai_formatif").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    requestKey: null,
  });
}

export async function findNilaiSumatifByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("nilai_sumatif").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    requestKey: null,
  });
}

// ================= EXPORT NILAI MENTAH (SEMUA KELAS) =================
export async function findAllSiswa() {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function findAllMapel() {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    requestKey: null,
  });
}

export async function findAllTp() {
  const pb = await getServerPb();
  return pb.collection("tujuan_pembelajaran").getFullList({
    requestKey: null,
  });
}

export async function findAllLm() {
  const pb = await getServerPb();
  return pb.collection("lingkup_materi").getFullList({
    sort: "created",
    requestKey: null,
  });
}

export async function findAllNilaiFormatif() {
  const pb = await getServerPb();
  return pb.collection("nilai_formatif").getFullList({
    requestKey: null,
  });
}

export async function findAllNilaiSumatif() {
  const pb = await getServerPb();
  return pb.collection("nilai_sumatif").getFullList({
    requestKey: null,
  });
}
