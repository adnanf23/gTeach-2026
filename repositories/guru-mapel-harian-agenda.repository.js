import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Akses data murni untuk fitur agenda harian guru mapel.
// Fungsi-fungsi ini hanya membungkus query PocketBase dan melempar error apa
// adanya; seluruh logika bisnis/agregasi ditangani di layer services.

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

// ---------------------------------------------------------------------------
// Siswa
// ---------------------------------------------------------------------------
export async function countSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  const result = await pb.collection("siswa").getList(1, 1, {
    filter: `kelas_id="${kelasId}"`,
    requestKey: null,
    fields: "id",
  });
  return result.totalItems;
}

// ---------------------------------------------------------------------------
// Agenda mengajar
// ---------------------------------------------------------------------------
export async function findAgendaByBulan({
  kelasId,
  mapelId,
  startStr,
  endStr,
  semesterMulai,
  semesterAkhir,
}) {
  const pb = await getServerPb();
  // Filter semester (opsional) memakai rentang field `date`, karena agenda
  // tidak menyimpan tahun_ajaran_id.
  const semesterFilter =
    semesterMulai && semesterAkhir
      ? ` && date >= "${semesterMulai}" && date <= "${semesterAkhir}"`
      : "";
  return pb.collection("agenda_mengajar").getFullList({
    filter: `kelas_id="${kelasId}" && mapel_id="${mapelId}" && date >= "${startStr}" && date <= "${endStr}"${semesterFilter}`,
    sort: "date,jam_mapel",
    expand: "mapel_id,kelas_id",
    requestKey: null,
  });
}

export async function findAgendaById(id) {
  const pb = await getServerPb();
  return pb.collection("agenda_mengajar").getOne(id, {
    expand: "mapel_id,kelas_id",
    requestKey: null,
  });
}

export async function findAgendaByMapelSlot({
  kelasId,
  mapelId,
  date,
  jamMapel,
  excludeId,
}) {
  const pb = await getServerPb();
  const exclude = excludeId ? ` && id != "${excludeId}"` : "";
  return pb.collection("agenda_mengajar").getFullList({
    filter: `kelas_id="${kelasId}" && mapel_id="${mapelId}" && date="${date}" && jam_mapel="${jamMapel}"${exclude}`,
    requestKey: null,
  });
}

export async function findAgendaByJamSlot({
  kelasId,
  date,
  jamMapel,
  excludeId,
}) {
  const pb = await getServerPb();
  const exclude = excludeId ? ` && id != "${excludeId}"` : "";
  return pb.collection("agenda_mengajar").getFullList({
    filter: `kelas_id="${kelasId}" && date="${date}" && jam_mapel="${jamMapel}"${exclude}`,
    requestKey: null,
  });
}
