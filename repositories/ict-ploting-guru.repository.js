import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Guru (users dengan role guru) untuk dropdown ploting
// ---------------------------------------------------------------------------
export async function findGuruByFilter(filter) {
  const pb = await getServerPb();
  return pb.collection("users").getFullList({
    filter,
    sort: "nama_lengkap",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Mata pelajaran
// ---------------------------------------------------------------------------
export async function findMapel() {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    sort: "nama_mapel",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Kelas
// ---------------------------------------------------------------------------
export async function findKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "nama_kelas",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Ploting guru (guru_id, mapel_id, kelas_id[])
// ---------------------------------------------------------------------------
export async function findPlotingGuru() {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Lingkup materi milik satu ploting guru (dipakai untuk cek keterkaitan).
// ---------------------------------------------------------------------------
export async function findLingkupMateriByPlotingId(plotingId) {
  const pb = await getServerPb();
  return pb.collection("lingkup_materi").getFullList({
    filter: `ploting_guru_id="${plotingId}"`,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Nilai ujian milik satu ploting guru (dipakai untuk cek keterkaitan).
// ---------------------------------------------------------------------------
export async function findNilaiUjianByPlotingId(plotingId) {
  const pb = await getServerPb();
  return pb.collection("nilai_ujian").getFullList({
    filter: `ploting_guru_id="${plotingId}"`,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Nilai harian milik sekumpulan lingkup materi (dipakai cascade delete).
// ---------------------------------------------------------------------------
export async function findNilaiHarianByLingkupIds(lingkupIds) {
  if (!Array.isArray(lingkupIds) || lingkupIds.length === 0) return [];
  const pb = await getServerPb();
  return pb.collection("nilai_harian").getFullList({
    filter: lingkupIds.map((id) => `lingkup_materi_id="${id}"`).join(" || "),
    requestKey: null,
  });
}
