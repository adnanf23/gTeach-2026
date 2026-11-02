import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Satu-satunya lapisan yang menyentuh PocketBase untuk fitur penilaian
// harian guru mapel (formatif, sumatif, ujian, export & import nilai).
// Hanya operasi BACA: mutasi (create/update/remove) tetap di halaman.

function mapelIdsFilter(mapelIds) {
  return mapelIds.map((id) => `mapel_id ~ "${id}"`).join(" || ");
}

function kelasIdsFilter(kelasIds) {
  return kelasIds.map((id) => `kelas_id = "${id}"`).join(" || ");
}

// Filter semester (tahun ajaran) untuk query nilai.
// Hanya ditambahkan bila id semester tersedia, agar perilaku lama tetap utuh.
function withTahunAjaran(filter, tahunAjaranId) {
  if (!tahunAjaranId) return filter;
  return `${filter} && tahun_ajaran_id = "${tahunAjaranId}"`;
}

// ================================================================
// PLOTING GURU (mapel + kelas yang diampu)
// ================================================================
export async function findPlotingGuruByGuru(guruId) {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    filter: `guru_id = "${guruId}"`,
    expand: "mapel_id,kelas_id",
    requestKey: null,
  });
}

// ================================================================
// SISWA
// ================================================================
export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function countSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getList(1, 1, {
    filter: `kelas_id = "${kelasId}"`,
    requestKey: null,
    fields: "id",
  });
}

export async function findSiswaByKelasIds(kelasIds) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: kelasIdsFilter(kelasIds),
    requestKey: null,
  });
}

// ================================================================
// TUJUAN PEMBELAJARAN (TP) & LINGKUP MATERI (LM)
// ================================================================
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

export async function findLmByMapelKelasSorted(mapelId, kelasId) {
  const pb = await getServerPb();
  return pb.collection("lingkup_materi").getFullList({
    filter: `mapel_id ~ "${mapelId}" && kelas_id ~ "${kelasId}"`,
    sort: "created",
    requestKey: null,
  });
}

export async function findTpByMapelIds(mapelIds) {
  const pb = await getServerPb();
  return pb.collection("tujuan_pembelajaran").getFullList({
    filter: mapelIdsFilter(mapelIds),
    requestKey: null,
  });
}

export async function findLmByMapelIds(mapelIds) {
  const pb = await getServerPb();
  return pb.collection("lingkup_materi").getFullList({
    filter: mapelIdsFilter(mapelIds),
    sort: "created",
    requestKey: null,
  });
}

// ================================================================
// MATA PELAJARAN
// ================================================================
export async function findMapelByIds(mapelIds) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    filter: mapelIds.map((id) => `id = "${id}"`).join(" || "),
    requestKey: null,
  });
}

// ================================================================
// NILAI FORMATIF
// ================================================================
export async function findNilaiFormatifByKelasTpIds(
  kelasId,
  tpIds,
  tahunAjaranId,
) {
  const pb = await getServerPb();
  const tpFilter = tpIds.map((id) => `tp_id ~ "${id}"`).join(" || ");
  return pb.collection("nilai_formatif").getFullList({
    filter: withTahunAjaran(
      `kelas_id ~ "${kelasId}" && (${tpFilter})`,
      tahunAjaranId,
    ),
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

export async function findNilaiFormatifByTp(tpId) {
  const pb = await getServerPb();
  return pb.collection("nilai_formatif").getFullList({
    filter: `tp_id ~ "${tpId}"`,
    requestKey: null,
  });
}

export async function findAllNilaiFormatif() {
  const pb = await getServerPb();
  return pb.collection("nilai_formatif").getFullList({
    requestKey: null,
  });
}

// ================================================================
// NILAI SUMATIF
// ================================================================
export async function findNilaiSumatifByKelasLmIds(
  kelasId,
  lmIds,
  tahunAjaranId,
) {
  const pb = await getServerPb();
  const lmFilter = lmIds.map((id) => `lm_id ~ "${id}"`).join(" || ");
  return pb.collection("nilai_sumatif").getFullList({
    filter: withTahunAjaran(
      `kelas_id ~ "${kelasId}" && (${lmFilter})`,
      tahunAjaranId,
    ),
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

export async function findNilaiSumatifByLm(lmId) {
  const pb = await getServerPb();
  return pb.collection("nilai_sumatif").getFullList({
    filter: `lm_id ~ "${lmId}"`,
    requestKey: null,
  });
}

export async function findAllNilaiSumatif() {
  const pb = await getServerPb();
  return pb.collection("nilai_sumatif").getFullList({
    requestKey: null,
  });
}

// ================================================================
// NILAI UJIAN
// ================================================================
export async function findNilaiUjianByMapelUjianIds(
  mapelId,
  ujianIds,
  tahunAjaranId,
) {
  const pb = await getServerPb();
  const ujianFilter = ujianIds
    .map((id) => `pengaturan_ujian_id ~ "${id}"`)
    .join(" || ");
  return pb.collection("nilai_ujian").getFullList({
    filter: withTahunAjaran(
      `mapel_id ~ "${mapelId}" && (${ujianFilter})`,
      tahunAjaranId,
    ),
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

export async function findNilaiUjianByMapelIds(mapelIds) {
  const pb = await getServerPb();
  return pb.collection("nilai_ujian").getFullList({
    filter: mapelIdsFilter(mapelIds),
    requestKey: null,
  });
}

// ================================================================
// PENGATURAN UJIAN
// ================================================================
export async function findPengaturanUjianBuka() {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    filter: `status_akses = "buka"`,
    requestKey: null,
  });
}
