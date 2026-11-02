import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Akses data murni untuk fitur ICT > Monitoring Harian > Agenda Mengajar.
// Fungsi di sini hanya membungkus query PocketBase dan melempar error apa
// adanya; seluruh logika bisnis/agregasi ditangani di layer services.

// ---------------------------------------------------------------------------
// Data dasar (kelas, siswa, hari libur)
// ---------------------------------------------------------------------------
export async function findKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "tingkat,nama_kelas",
    expand: "walikelas_id,pendamping_id",
    requestKey: null,
  });
}

export async function findSiswa() {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function findHariLibur() {
  const pb = await getServerPb();
  return pb.collection("hari_libur").getFullList({ requestKey: null });
}

// ---------------------------------------------------------------------------
// Ploting guru + guru (users) + mata pelajaran
// ---------------------------------------------------------------------------
export async function findPlotingGuru() {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    expand: "guru_id,mapel_id,kelas_id",
    requestKey: null,
  });
}

export async function findGuruUsers() {
  const pb = await getServerPb();
  return pb.collection("users").getFullList({
    filter:
      'role ?= "guru mapel" || role ?= "guru walikelas" || role ?= "guru pendamping"',
    requestKey: null,
  });
}

export async function findMapel() {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({ requestKey: null });
}

// ---------------------------------------------------------------------------
// Agenda mengajar
// ---------------------------------------------------------------------------
// Rentang 30 hari terakhir (sort menurun) untuk ranking aktivitas kelas.
export async function findAgendaTerbaru({ startStr, endStr }) {
  const pb = await getServerPb();
  return pb.collection("agenda_mengajar").getFullList({
    filter: `date >= "${startStr}" && date <= "${endStr}"`,
    sort: "-date",
    requestKey: null,
  });
}

// Agenda satu tanggal (expand kelas + mapel).
export async function findAgendaByTanggal({ dateStr }) {
  const pb = await getServerPb();
  return pb.collection("agenda_mengajar").getFullList({
    filter: `date >= "${dateStr} 00:00:00" && date <= "${dateStr} 23:59:59"`,
    expand: "kelas_id,mapel_id",
    requestKey: null,
  });
}

// Agenda untuk rentang tanggal (opsional difilter per kelas) untuk export Excel.
export async function findAgendaExport({ kelasId, startDate, endDate }) {
  const pb = await getServerPb();
  const isSpecificClass = kelasId !== "semua";
  const kelasFilter = isSpecificClass ? ` && kelas_id = "${kelasId}"` : "";
  const filter = `date >= "${startDate} 00:00:00" && date <= "${endDate} 23:59:59"${kelasFilter}`;

  return pb.collection("agenda_mengajar").getFullList({
    filter,
    expand: "kelas_id,mapel_id",
    sort: "date,jam_mapel",
    requestKey: null,
  });
}
