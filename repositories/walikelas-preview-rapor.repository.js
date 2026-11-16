import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

/* ───────────── kelas, siswa & periode rapor ───────────── */

// Kelas yang diasuh user (walikelas / pendamping), sekaligus expand walikelas.
export async function findKelasByWaliOrPendamping(userId) {
  const pb = await getServerPb();
  return pb
    .collection("kelas")
    .getFirstListItem(
      `walikelas_id = "${userId}" || pendamping_id = "${userId}"`,
      { expand: "walikelas_id", requestKey: null },
    );
}

export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id = "${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function findUjianAksesRapor() {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    filter: `akses_guru_rapor = true`,
    expand: "tahun_ajaran_id",
    requestKey: null,
  });
}

export async function findCapaianByKelas(kelasId, ujianId) {
  const pb = await getServerPb();
  return pb.collection("capaian_kompetensi").getFullList({
    filter:
      `kelas_id = "${kelasId}"` + (ujianId ? ` && ujian_id = "${ujianId}"` : ""),
    requestKey: null,
  });
}

export async function findPengaturanRaporByUjian(ujianId) {
  const pb = await getServerPb();
  return pb
    .collection("pengaturan_rapor")
    .getFirstListItem(`ujian_id ~ "${ujianId}"`, { requestKey: null });
}

/* ───────────── sumber nilai akhir per mapel ───────────── */

export async function findMapelSpesifikKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    filter: `spesifik_kelas_id ~ "${kelasId}"`,
    requestKey: null,
  });
}

export async function findMapelTargetTingkat(tingkat) {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    filter: `target_tingkat ~ "${tingkat}"`,
    requestKey: null,
  });
}

export async function findPlotingByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    filter: `kelas_id ~ "${kelasId}"`,
    requestKey: null,
  });
}

export async function findUjianBukaByKelasOrTingkat({ kelasId, tingkat }) {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    filter: `status_akses = "buka" && (target_kelas_id ~ "${kelasId}" || target_tingkat ~ "${tingkat}")`,
    requestKey: null,
  });
}

// Batas tanggal: hanya nilai yang dibuat sampai tanggal rapor yang dihitung.
// Filter `created` didukung PocketBase, jadi disaring di server (bukan di kode)
// supaya record di luar rentang tidak perlu diunduh sama sekali.
const batasCreated = (createdMax) => (createdMax ? `created <= "${createdMax}"` : "");

export async function findNilaiUjianByPengaturanIds(
  ujianIds,
  createdMax,
  kelasId,
) {
  const pb = await getServerPb();
  const filter = [
    `(${ujianIds.map((id) => `pengaturan_ujian_id = "${id}"`).join(" || ")})`,
    kelasId ? `siswa_id.kelas_id = "${kelasId}"` : "",
    batasCreated(createdMax),
  ]
    .filter(Boolean)
    .join(" && ");
  return pb.collection("nilai_ujian").getFullList({ filter, requestKey: null });
}

export async function findTpByMapelIds(mapelIds) {
  const pb = await getServerPb();
  return pb.collection("tujuan_pembelajaran").getFullList({
    filter: mapelIds.map((id) => `mapel_id ~ "${id}"`).join(" || "),
    requestKey: null,
  });
}

export async function findLmByMapelIds(mapelIds) {
  const pb = await getServerPb();
  return pb.collection("lingkup_materi").getFullList({
    filter: mapelIds.map((id) => `mapel_id ~ "${id}"`).join(" || "),
    requestKey: null,
  });
}

export async function findNilaiFormatifByKelas(kelasId, createdMax) {
  const pb = await getServerPb();
  const filter = [`kelas_id = "${kelasId}"`, batasCreated(createdMax)]
    .filter(Boolean)
    .join(" && ");
  return pb.collection("nilai_formatif").getFullList({ filter, requestKey: null });
}

export async function findNilaiSumatifByKelas(kelasId, createdMax) {
  const pb = await getServerPb();
  const filter = [`kelas_id = "${kelasId}"`, batasCreated(createdMax)]
    .filter(Boolean)
    .join(" && ");
  return pb.collection("nilai_sumatif").getFullList({ filter, requestKey: null });
}

/* ───────────── lampiran rapor per siswa ───────────── */

export async function findAbsensiBySiswaRange({ siswaId, mulai, akhir }) {
  const pb = await getServerPb();
  return pb.collection("absensi").getFullList({
    filter: `siswa_id = "${siswaId}" && tanggal >= "${mulai}" && tanggal <= "${akhir}"`,
    requestKey: null,
  });
}

// Catatan: koleksi nilai_ekskul tidak punya field `created`, jadi tidak bisa
// dibatasi tanggal rapor di server (filter `created` akan ditolak 400).
export async function findNilaiEkskulBySiswa(siswaId) {
  const pb = await getServerPb();
  return pb.collection("nilai_ekskul").getFullList({
    filter: `siswa_id = "${siswaId}"`,
    requestKey: null,
  });
}

export async function findCatatanBySiswaKelas({ siswaId, kelasId, ujianId }) {
  const pb = await getServerPb();
  return pb.collection("catatan_siswa").getFullList({
    filter:
      `siswa_id = "${siswaId}" && kelas_id = "${kelasId}"` +
      (ujianId ? ` && ujian_id = "${ujianId}"` : ""),
    sort: "-created",
    requestKey: null,
  });
}

export async function findKokurikulerBySiswaKelas({ siswaId, kelasId, ujianId }) {
  const pb = await getServerPb();
  return pb.collection("catatan_kokurikuler").getFullList({
    filter:
      `siswa_id = "${siswaId}" && kelas_id = "${kelasId}"` +
      (ujianId ? ` && ujian_id = "${ujianId}"` : ""),
    sort: "-created",
    requestKey: null,
  });
}

export async function findKehadiranManualBySiswaKelas({ siswaId, kelasId }) {
  const pb = await getServerPb();
  return pb.collection("kehadiran_manual").getFullList({
    filter: `siswa_id = "${siswaId}" && kelas_id = "${kelasId}"`,
    requestKey: null,
  });
}

// URL file publik (mis. tanda tangan wali kelas) dari sebuah record.
export async function getRecordFileUrl(record, filename) {
  const pb = await getServerPb();
  return pb.files.getURL(record, filename);
}
