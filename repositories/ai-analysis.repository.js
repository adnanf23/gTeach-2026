import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";
import { cached, bolehCacheSampai } from "@/lib/cache";

// ---------------------------------------------------------------------------
// Repository khusus halaman AI Analisis (admin & ICT).
// Semua fungsi mengembalikan array/record polos dari PocketBase.
// ---------------------------------------------------------------------------

// Semua kelas beserta walikelas & pendamping (untuk mapping guru per kelas).
export async function findAllKelasLengkap() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    fields: "id,nama_kelas,tingkat,walikelas_id,pendamping_id,tahun_ajaran_id",
    sort: "tingkat,nama_kelas",
    requestKey: null,
  });
}

// Semua user guru (untuk resolve nama walikelas/pendamping).
export async function findAllGuru() {
  const pb = await getServerPb();
  return pb.collection("users").getFullList({
    filter: `role = "guru walikelas" || role = "guru pendamping" || role = "guru mapel"`,
    fields: "id,nama_lengkap,role,username",
    requestKey: null,
  });
}

// Semua siswa (ringkas) untuk mapping kelas_id dan tingkat.
export async function findAllSiswaRingkas() {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    fields: "id,nama_siswa,nis,kelas_id",
    sort: "nama_siswa",
    requestKey: null,
  });
}

// Hari libur (untuk menghitung hari efektif).
export async function findAllHariLibur() {
  const pb = await getServerPb();
  return pb.collection("hari_libur").getFullList({ requestKey: null });
}

// Tahun ajaran aktif.
export async function findTahunAjaranAktif() {
  const pb = await getServerPb();
  return pb.collection("tahun_ajaran").getFullList({
    filter: `is_aktif = true`,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Absensi: ambil semua record dalam rentang (periode tahun ajaran aktif).
// Dicache 10 menit untuk data bulan lalu ke belakang.
// ---------------------------------------------------------------------------
export async function findAllAbsensi({ startStr, endStr }) {
  const load = async () => {
    const pb = await getServerPb();
    // Ambil dalam batch untuk menghindari limit getFullList (default 500? sebenarnya getFullList ambil semua)
    // Tapi untuk data besar, pecah per bulan.
    return pb.collection("absensi").getFullList({
      filter: `tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
      fields: "id,kelas_id,siswa_id,status,tanggal",
      requestKey: null,
    });
  };
  if (!bolehCacheSampai(endStr)) return load();
  return cached(`ai-absensi:${startStr}|${endStr}`, 600000, load);
}

// ---------------------------------------------------------------------------
// Nilai: ambil semua nilai dari berbagai koleksi untuk perhitungan leger.
// ---------------------------------------------------------------------------
export async function findAllNilaiFormatif() {
  const pb = await getServerPb();
  return pb.collection("nilai_formatif").getFullList({
    fields: "id,tp_id,siswa_id,kelas_id,k1,k2,k3,k4",
    requestKey: null,
  });
}

export async function findAllNilaiSumatif() {
  const pb = await getServerPb();
  return pb.collection("nilai_sumatif").getFullList({
    fields: "id,lm_id,siswa_id,kelas_id,nilai",
    requestKey: null,
  });
}

export async function findAllNilaiUjian() {
  const pb = await getServerPb();
  return pb.collection("nilai_ujian").getFullList({
    fields: "id,siswa_id,pengaturan_ujian_id,nilai,mapel_id",
    requestKey: null,
  });
}

export async function findAllNilaiHarian() {
  const pb = await getServerPb();
  return pb.collection("nilai_harian").getFullList({
    fields: "id,siswa_id,kelas_id,mapel_id,nilai",
    requestKey: null,
  });
}

// Pengaturan ujian untuk klasifikasi UTS/UAS.
export async function findAllPengaturanUjian() {
  const pb = await getServerPb();
  return pb.collection("pengaturan_ujian").getFullList({
    fields: "id,jenis_ujian,status_akses,target_tingkat,target_kelas_id",
    requestKey: null,
  });
}

// Presentase penilaian (bobot).
export async function findAllPresentasePenilaian() {
  const pb = await getServerPb();
  return pb.collection("presentase_penilaian").getFullList({ requestKey: null });
}

// Mata pelajaran (untuk mapping mapel per tingkat/kelas).
export async function findAllMapel() {
  const pb = await getServerPb();
  return pb.collection("mata_pelajaran").getFullList({
    fields: "id,nama_mapel,kategori,target_tingkat,spesifik_kelas_id",
    requestKey: null,
  });
}

// TP & LM untuk mapping nilai ke mapel.
export async function findAllTP() {
  const pb = await getServerPb();
  return pb.collection("tujuan_pembelajaran").getFullList({
    fields: "id,mapel_id",
    requestKey: null,
  });
}

export async function findAllLM() {
  const pb = await getServerPb();
  return pb.collection("lingkup_materi").getFullList({
    fields: "id,mapel_id",
    requestKey: null,
  });
}
