import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Akses data murni untuk fitur agenda harian wali kelas.
// Fungsi-fungsi ini hanya membungkus query PocketBase dan melempar error
// apa adanya; seluruh logika bisnis ditangani di layer services.

export async function findKelasByWalikelas(userId) {
  const pb = await getServerPb();
  return pb
    .collection("kelas")
    .getFirstListItem(
      `walikelas_id = "${userId}" || pendamping_id = "${userId}"`,
      { requestKey: null },
    );
}

export async function findAllKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "nama_kelas",
    requestKey: null,
  });
}

export async function findAgendaByBulan({
  kelasId,
  startStr,
  endStr,
  mulai,
  akhir,
}) {
  const pb = await getServerPb();
  const semesterFilter =
    mulai && akhir ? ` && date >= "${mulai}" && date <= "${akhir}"` : "";
  return pb.collection("agenda_mengajar").getFullList({
    filter: `kelas_id="${kelasId}" && date >= "${startStr}" && date <= "${endStr}"${semesterFilter}`,
    sort: "date,jam_mapel",
    expand: "mapel_id,kelas_id",
    requestKey: null,
  });
}

export async function findAgendaById(id) {
  const pb = await getServerPb();
  return pb
    .collection("agenda_mengajar")
    .getOne(id, { expand: "mapel_id,kelas_id", requestKey: null });
}

export async function findMapelKhususKelas(kelasId) {
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

export async function findAgendaByRange({ startDate, endDate, kelasId }) {
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
