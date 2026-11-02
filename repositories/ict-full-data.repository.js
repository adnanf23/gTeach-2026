import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Satu-satunya lapisan yang menyentuh PocketBase untuk fitur
// ICT Full Data (nilai mentah semua kelas).
// Fungsi di sini HANYA membaca data (query), tanpa logika bisnis.

export async function findAllKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "tingkat,nama_kelas",
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

// ---------- Export: referensi seluruh mapel di satu kelas ----------

export async function findTpByMapelIdsKelas(mapelIds, kelasId) {
  const pb = await getServerPb();
  const mapelFilter = mapelIds.map((id) => `mapel_id ~ "${id}"`).join(" || ");
  return pb.collection("tujuan_pembelajaran").getFullList({
    filter: `(${mapelFilter}) && kelas_id ~ "${kelasId}"`,
    requestKey: null,
  });
}

export async function findLmByMapelIdsKelas(mapelIds, kelasId) {
  const pb = await getServerPb();
  const mapelFilter = mapelIds.map((id) => `mapel_id ~ "${id}"`).join(" || ");
  return pb.collection("lingkup_materi").getFullList({
    filter: `(${mapelFilter}) && kelas_id ~ "${kelasId}"`,
    sort: "created",
    requestKey: null,
  });
}

export async function findNilaiUjianByMapelIds(mapelIds) {
  const pb = await getServerPb();
  const mapelFilter = mapelIds.map((id) => `mapel_id ~ "${id}"`).join(" || ");
  return pb.collection("nilai_ujian").getFullList({
    filter: `(${mapelFilter})`,
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

export async function findSiswaByKelasSorted(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    requestKey: null,
  });
}

// ---------- Import: referensi per satu mapel ----------

export async function findTpByMapelKelas(mapelId, kelasId) {
  const pb = await getServerPb();
  return pb.collection("tujuan_pembelajaran").getFullList({
    filter: `mapel_id ~ "${mapelId}" && kelas_id ~ "${kelasId}"`,
    requestKey: null,
  });
}

export async function findLmByMapelKelas(mapelId, kelasId) {
  const pb = await getServerPb();
  return pb.collection("lingkup_materi").getFullList({
    filter: `mapel_id ~ "${mapelId}" && kelas_id ~ "${kelasId}"`,
    sort: "created",
    requestKey: null,
  });
}

export async function findNilaiUjianByMapelId(mapelId) {
  const pb = await getServerPb();
  return pb.collection("nilai_ujian").getFullList({
    filter: `mapel_id ~ "${mapelId}"`,
    requestKey: null,
  });
}
