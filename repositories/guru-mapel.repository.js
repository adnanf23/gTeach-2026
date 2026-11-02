import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Ploting guru
// ---------------------------------------------------------------------------
export async function findPlotingByGuruId(guruId) {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    filter: `guru_id="${guruId}"`,
    expand: "mapel_id,kelas_id",
    requestKey: null,
  });
}

export async function findAllPloting() {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({ requestKey: null });
}

// ---------------------------------------------------------------------------
// Hari libur
// ---------------------------------------------------------------------------
export async function findHariLibur() {
  const pb = await getServerPb();
  return pb.collection("hari_libur").getFullList({ requestKey: null });
}

// ---------------------------------------------------------------------------
// Jadwal pelajaran
// ---------------------------------------------------------------------------
export async function findJadwalByGuruDanHari({ guruId, hari }) {
  const pb = await getServerPb();
  return pb.collection("jadwal_pelajaran").getFullList({
    filter: `guru_id="${guruId}" && hari="${hari}"`,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Agenda mengajar
// ---------------------------------------------------------------------------
export async function findAgendaByFilter({ filter }) {
  const pb = await getServerPb();
  return pb.collection("agenda_mengajar").getFullList({
    filter,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Siswa
// ---------------------------------------------------------------------------
export async function findSiswaByKelasIds(kelasIds) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: kelasIds.map((id) => `kelas_id="${id}"`).join(" || "),
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Tujuan pembelajaran & lingkup materi
// ---------------------------------------------------------------------------
export async function findTujuanPembelajaranByFilter({ filter }) {
  const pb = await getServerPb();
  return pb.collection("tujuan_pembelajaran").getFullList({
    filter,
    requestKey: null,
  });
}

export async function findLingkupMateriByFilter({ filter }) {
  const pb = await getServerPb();
  return pb.collection("lingkup_materi").getFullList({
    filter,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Nilai (formatif, sumatif, ujian)
// ---------------------------------------------------------------------------
export async function findNilaiFormatifByFilter({ filter }) {
  const pb = await getServerPb();
  return pb.collection("nilai_formatif").getFullList({
    filter,
    requestKey: null,
  });
}

export async function findNilaiSumatifByFilter({ filter }) {
  const pb = await getServerPb();
  return pb.collection("nilai_sumatif").getFullList({
    filter,
    requestKey: null,
  });
}

export async function findNilaiUjianByFilter({ filter }) {
  const pb = await getServerPb();
  return pb.collection("nilai_ujian").getFullList({
    filter,
    requestKey: null,
  });
}
