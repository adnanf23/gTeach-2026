import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Satu-satunya lapisan yang menyentuh PocketBase untuk fitur pemilihan mapel
// penilaian walikelas.

export async function findKelasByWalikelas(userId) {
  const pb = await getServerPb();
  return pb
    .collection("kelas")
    .getFirstListItem(
      `walikelas_id = "${userId}" || pendamping_id = "${userId}"`,
      { requestKey: null },
    );
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
export async function findUjianAktifByKelas(kelasId, tingkat, tahunAjaranId) {
  const pb = await getServerPb();
  const semesterFilter = tahunAjaranId
    ? ` && tahun_ajaran_id = "${tahunAjaranId}"`
    : "";
  return pb.collection("pengaturan_ujian").getFullList({
    filter: `status_akses = "buka" && (target_kelas_id ~ "${kelasId}" || target_tingkat ~ "${String(tingkat)}")${semesterFilter}`,
    requestKey: null,
  });
}
