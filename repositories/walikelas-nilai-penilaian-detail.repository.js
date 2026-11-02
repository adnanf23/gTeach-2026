import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Satu-satunya lapisan yang menyentuh PocketBase untuk fitur penilaian detail
// (per mapel) walikelas.

export async function findKelasByWalikelas(userId) {
  const pb = await getServerPb();
  return pb
    .collection("kelas")
    .getFirstListItem(
      `walikelas_id = "${userId}" || pendamping_id = "${userId}"`,
      { requestKey: null },
    );
}

export async function findMapelById(mapelId) {
  const pb = await getServerPb();
  return pb
    .collection("mata_pelajaran")
    .getOne(mapelId, { requestKey: null });
}

export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

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

export async function findAbsensiByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("absensi").getFullList({
    filter: `kelas_id ~ "${kelasId}"`,
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

// `tahunAjaranId` = filter semester (tahun ajaran). Bila kosong, filter tidak
// ditambahkan sehingga perilaku lama tetap sama.
export async function findNilaiFormatifByTpIds(kelasId, tpIds, tahunAjaranId) {
  const pb = await getServerPb();
  const tpFilter = tpIds.map((id) => `tp_id ~ "${id}"`).join(" || ");
  const semesterFilter = tahunAjaranId
    ? ` && tahun_ajaran_id = "${tahunAjaranId}"`
    : "";
  return pb.collection("nilai_formatif").getFullList({
    filter: `kelas_id ~ "${kelasId}" && (${tpFilter})${semesterFilter}`,
    requestKey: null,
  });
}

export async function findNilaiSumatifByLmIds(kelasId, lmIds, tahunAjaranId) {
  const pb = await getServerPb();
  const lpFilter = lmIds.map((id) => `lm_id ~ "${id}"`).join(" || ");
  const semesterFilter = tahunAjaranId
    ? ` && tahun_ajaran_id = "${tahunAjaranId}"`
    : "";
  return pb.collection("nilai_sumatif").getFullList({
    filter: `kelas_id ~ "${kelasId}" && (${lpFilter})${semesterFilter}`,
    requestKey: null,
  });
}

export async function findNilaiUjianByMapelSiswa(
  mapelId,
  ujianIds,
  siswaIds,
  tahunAjaranId,
) {
  const pb = await getServerPb();
  const ujianFilter = ujianIds
    .map((id) => `pengaturan_ujian_id = "${id}"`)
    .join(" || ");
  const siswaFilter = siswaIds.length
    ? siswaIds.map((id) => `siswa_id = "${id}"`).join(" || ")
    : `id = ""`;
  const semesterFilter = tahunAjaranId
    ? ` && tahun_ajaran_id = "${tahunAjaranId}"`
    : "";
  return pb.collection("nilai_ujian").getFullList({
    filter: `mapel_id = "${mapelId}" && (${ujianFilter}) && (${siswaFilter})${semesterFilter}`,
    requestKey: null,
  });
}
