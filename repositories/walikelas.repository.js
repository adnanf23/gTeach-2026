import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Kelas
// ---------------------------------------------------------------------------
export async function findKelasByWaliOrPendamping(userId) {
  const pb = await getServerPb();
  return pb
    .collection("kelas")
    .getFirstListItem(
      `walikelas_id="${userId}" || pendamping_id="${userId}"`,
      { requestKey: null },
    );
}

export async function findKelasRingkas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    fields: "id,nama_kelas,tingkat",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Hari libur
// ---------------------------------------------------------------------------
export async function findHariLibur() {
  const pb = await getServerPb();
  return pb.collection("hari_libur").getFullList({ requestKey: null });
}

// ---------------------------------------------------------------------------
// Siswa
// ---------------------------------------------------------------------------
export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id="${kelasId}"`,
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

// ---------------------------------------------------------------------------
// Absensi & agenda
// ---------------------------------------------------------------------------
export async function findAbsensiByFilter({ filter, fields }) {
  const pb = await getServerPb();
  return pb.collection("absensi").getFullList({
    filter,
    ...(fields ? { fields } : {}),
    requestKey: null,
  });
}

export async function findAgendaByFilter({ filter }) {
  const pb = await getServerPb();
  return pb.collection("agenda_mengajar").getFullList({
    filter,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Tahun ajaran
// ---------------------------------------------------------------------------
export async function findTahunAjaranById(id) {
  const pb = await getServerPb();
  return pb.collection("tahun_ajaran").getOne(id, { requestKey: null });
}

export async function findTahunAjaranAktif() {
  const pb = await getServerPb();
  return pb.collection("tahun_ajaran").getFullList({
    filter: `is_aktif = true`,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Mata pelajaran & penilaian (untuk agregasi leger)
// ---------------------------------------------------------------------------
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
    filter: `target_tingkat ~ "${tingkat}"`,
    requestKey: null,
  });
}

export async function findPresentasePenilaian() {
  const pb = await getServerPb();
  return pb.collection("presentase_penilaian").getFullList({
    requestKey: null,
  });
}

export async function findPengaturanUjianBuka(kelasId, tingkat) {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    filter: `status_akses = "buka" && (target_kelas_id ~ "${kelasId}" || target_tingkat ~ "${tingkat}")`,
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

export async function findNilaiUjianByFilter(filter) {
  const pb = await getServerPb();
  return pb.collection("nilai_ujian").getFullList({
    filter,
    requestKey: null,
  });
}

export async function findTujuanPembelajaranByFilter(filter) {
  const pb = await getServerPb();
  return pb.collection("tujuan_pembelajaran").getFullList({
    filter,
    requestKey: null,
  });
}

export async function findLingkupMateriByFilter(filter) {
  const pb = await getServerPb();
  return pb.collection("lingkup_materi").getFullList({
    filter,
    requestKey: null,
  });
}
