import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Akses data murni untuk halaman ICT > Rapor > Monitoring Kesiapan.
// Fungsi-fungsi ini hanya membungkus query PocketBase dan melempar error apa
// adanya; seluruh agregasi/kelengkapan ditangani di layer services.

/* ───────────── tahun ajaran, kelas & ujian ───────────── */

export async function findTahunAjaranAll() {
  const pb = await getServerPb();
  return pb.collection("tahun_ajaran").getFullList({
    batch: 500,
    sort: "-tahun,-semester",
    requestKey: null,
  });
}

export async function findKelasAll() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    batch: 500,
    expand: "walikelas_id,pendamping_id,tahun_ajaran_id",
    sort: "nama_kelas",
    requestKey: null,
  });
}

export async function findUjianAll() {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    batch: 500,
    requestKey: null,
  });
}

/* ───────────── data penilaian semua kelas terpilih ───────────── */

export async function findPenilaianBase(kelasIds) {
  const pb = await getServerPb();

  // Filter gabungan untuk semua kelas terpilih (perilaku sama dengan `anyOf`
  // di halaman). Daftar kelas kosong tidak diambil di sini.
  const anyOf = (field, op) =>
    kelasIds.map((id) => `${field} ${op} "${id}"`).join(" || ");
  const bySiswa = anyOf("siswa_id.kelas_id", "=");
  const byKelas = anyOf("kelas_id", "~");

  const [siswa, ploting, tp, lm, formatif, sumatif, capaian, catatan, mapelAll] =
    await Promise.all([
      pb.collection("siswa").getFullList({
        batch: 500,
        filter: anyOf("kelas_id", "="),
        sort: "nama_siswa",
        fields: "id,nama_siswa,kelas_id",
        requestKey: null,
      }),
      pb.collection("ploting_guru").getFullList({
        batch: 500,
        filter: byKelas,
        expand: "guru_id,mapel_id",
        requestKey: null,
      }),
      pb.collection("tujuan_pembelajaran").getFullList({
        batch: 500,
        filter: byKelas,
        fields: "id,no_tp,mapel_id,kelas_id",
        requestKey: null,
      }),
      pb.collection("lingkup_materi").getFullList({
        batch: 500,
        filter: byKelas,
        fields: "id,nama,mapel_id,kelas_id",
        requestKey: null,
      }),
      pb.collection("nilai_formatif").getFullList({
        batch: 500,
        filter: bySiswa,
        fields: "id,tp_id,siswa_id,k1,k2,k3,k4",
        requestKey: null,
      }),
      pb.collection("nilai_sumatif").getFullList({
        batch: 500,
        filter: bySiswa,
        fields: "id,lm_id,siswa_id,nilai",
        requestKey: null,
      }),
      pb.collection("capaian_kompetensi").getFullList({
        batch: 500,
        filter: byKelas,
        fields: "id,mapel_id,kelas_id,capaian_tinggi,capaian_rendah",
        requestKey: null,
      }),
      pb.collection("catatan_siswa").getFullList({
        batch: 500,
        filter: bySiswa,
        fields: "id,siswa_id,kelas_id,catatan",
        requestKey: null,
      }),
      pb.collection("mata_pelajaran").getFullList({
        batch: 500,
        sort: "nama_mapel",
        fields:
          "id,nama_mapel,Label,kategori,target_tingkat,spesifik_kelas_id",
        requestKey: null,
      }),
    ]);

  return {
    siswa,
    ploting,
    tp,
    lm,
    formatif,
    sumatif,
    capaian,
    catatan,
    mapelAll,
  };
}

/* ───────────── nilai ujian periode terpilih ───────────── */

export async function findNilaiUjianByUjian(ujianId) {
  const pb = await getServerPb();
  return pb.collection("nilai_ujian").getFullList({
    batch: 500,
    filter: `pengaturan_ujian_id ~ "${ujianId}"`,
    fields: "id,siswa_id,ploting_guru_id,mapel_id,nilai",
    requestKey: null,
  });
}
