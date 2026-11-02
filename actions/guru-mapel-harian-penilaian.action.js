"use server";

import * as penilaianService from "@/services/guru-mapel-harian-penilaian.service";

// ================================================================
// STEP 1 — PLOTING (MAPEL) GURU
// ================================================================
export async function getGuruMapelPloting({ userId }) {
  return penilaianService.getPlotingGuruMapel({ userId });
}

// ================================================================
// STEP 2 — OPSI KELAS DARI PLOTING TERPILIH
// ================================================================
export async function getGuruMapelKelasOptions({ ploting }) {
  return penilaianService.getKelasOptions({ ploting });
}

// ================================================================
// STEP 3 — DETAIL KELAS (SISWA + TP + LM + NILAI)
// ================================================================
export async function getGuruMapelDetailKelas({
  kelasId,
  mapelId,
  tahunAjaranId,
}) {
  return penilaianService.getDetailKelasMapel({
    kelasId,
    mapelId,
    tahunAjaranId,
  });
}

// ================================================================
// UJIAN AKTIF & NILAI UJIAN
// ================================================================
export async function getGuruMapelUjianAktif({ kelasId, tingkat, mapel }) {
  return penilaianService.getUjianAktifKelas({ kelasId, tingkat, mapel });
}

export async function getGuruMapelNilaiUjian({
  mapelId,
  ujianIds,
  siswaIds,
  tahunAjaranId,
}) {
  return penilaianService.getNilaiUjianSiswa({
    mapelId,
    ujianIds,
    siswaIds,
    tahunAjaranId,
  });
}

// ================================================================
// BACA RELASI SEBELUM HAPUS TP / LM
// ================================================================
export async function getGuruMapelNilaiFormatifByTp({ tpId }) {
  return penilaianService.getNilaiFormatifByTp({ tpId });
}

export async function getGuruMapelNilaiSumatifByLm({ lmId }) {
  return penilaianService.getNilaiSumatifByLm({ lmId });
}

// ================================================================
// EXPORT NILAI MENTAH PER KELAS
// ================================================================
export async function getGuruMapelExportPerKelas({ userId }) {
  return penilaianService.getExportPerKelasData({ userId });
}

export async function getGuruMapelSiswaKelasTerurut({ kelasId }) {
  return penilaianService.getSiswaKelasTerurut({ kelasId });
}

// ================================================================
// IMPORT PER KELAS
// ================================================================
export async function getGuruMapelSiswaByKelasIds({ kelasIds }) {
  return penilaianService.getSiswaByKelasIds({ kelasIds });
}

export async function getGuruMapelMateriNilaiKelasMapel({
  mapelId,
  kelasId,
  tingkat,
  mapel,
}) {
  return penilaianService.getMateriNilaiKelasMapel({
    mapelId,
    kelasId,
    tingkat,
    mapel,
  });
}
