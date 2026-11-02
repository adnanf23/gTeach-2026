import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

/* ───────────── tahun ajaran, kelas & ujian ───────────── */

export async function findTahunAjaranAll() {
  const pb = await getServerPb();
  return pb.collection("tahun_ajaran").getFullList({
    batch: 500,
    sort: "-tahun,-semester",
  });
}

export async function findKelasByTahunAjaran(tahunId) {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    batch: 500,
    filter: `tahun_ajaran_id = "${tahunId}"`,
    expand: "walikelas_id,pendamping_id,tahun_ajaran_id",
  });
}

export async function findKelasByWaliOrPendamping(userId) {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    batch: 500,
    filter: `walikelas_id = "${userId}" || pendamping_id = "${userId}"`,
    expand: "walikelas_id,pendamping_id,tahun_ajaran_id",
  });
}

export async function findUjianByTahunAjaran(tahunId) {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    batch: 500,
    filter: `tahun_ajaran_id = "${tahunId}"`,
  });
}

/* ───────────── data penilaian per kelas ───────────── */

export async function findPenilaianBase(kelasId) {
  const pb = await getServerPb();
  const bySiswa = `siswa_id.kelas_id = "${kelasId}"`;
  const byKelas = `kelas_id ~ "${kelasId}"`;

  const [siswa, ploting, tp, lm, formatif, sumatif, capaian, catatan, mapelAll] =
    await Promise.all([
      pb.collection("siswa").getFullList({
        batch: 500,
        filter: `kelas_id = "${kelasId}"`,
        sort: "nama_siswa",
        fields: "id,nama_siswa,kelas_id",
      }),
      pb.collection("ploting_guru").getFullList({
        batch: 500,
        filter: byKelas,
        expand: "guru_id,mapel_id",
      }),
      pb.collection("tujuan_pembelajaran").getFullList({
        batch: 500,
        filter: byKelas,
        fields: "id,no_tp,mapel_id,kelas_id",
      }),
      pb.collection("lingkup_materi").getFullList({
        batch: 500,
        filter: byKelas,
        fields: "id,nama,mapel_id,kelas_id",
      }),
      pb.collection("nilai_formatif").getFullList({
        batch: 500,
        filter: bySiswa,
        fields: "id,tp_id,siswa_id,k1,k2,k3,k4",
      }),
      pb.collection("nilai_sumatif").getFullList({
        batch: 500,
        filter: bySiswa,
        fields: "id,lm_id,siswa_id,nilai",
      }),
      pb.collection("capaian_kompetensi").getFullList({
        batch: 500,
        filter: byKelas,
        fields: "id,mapel_id,kelas_id,capaian_tinggi,capaian_rendah",
      }),
      pb.collection("catatan_siswa").getFullList({
        batch: 500,
        filter: bySiswa,
        fields: "id,siswa_id,kelas_id,catatan",
      }),
      pb.collection("mata_pelajaran").getFullList({
        batch: 500,
        sort: "nama_mapel",
        fields:
          "id,nama_mapel,Label,kategori,target_tingkat,spesifik_kelas_id",
      }),
    ]);

  return { siswa, ploting, tp, lm, formatif, sumatif, capaian, catatan, mapelAll };
}

/* ───────────── nilai ujian per kelas & periode ───────────── */

export async function findNilaiUjianKelas({ ujianId, kelasId }) {
  const pb = await getServerPb();
  return pb.collection("nilai_ujian").getFullList({
    batch: 500,
    filter: `pengaturan_ujian_id ~ "${ujianId}" && siswa_id.kelas_id = "${kelasId}"`,
    fields: "id,siswa_id,ploting_guru_id,mapel_id,nilai",
  });
}
