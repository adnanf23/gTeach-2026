import { describeError } from "@/lib/app-error";
import * as ictCatatanKasusRepository from "@/repositories/ict-catatan-kasus.repository";

// Helper murni (disalin apa adanya dari halaman catatan-kasus ICT).
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

// ---------------------------------------------------------------------------
// Overview "semua kelas": daftar kelas + jumlah siswa per kelas + ringkasan
// seluruh catatan kasus (dipakai untuk statistik & tren di halaman).
// ---------------------------------------------------------------------------
export async function getCatatanKasusOverview() {
  try {
    const [kelasData, siswaData, catatanData] = await Promise.all([
      ictCatatanKasusRepository.findKelasRingkas(),
      ictCatatanKasusRepository.findSiswaRingkas(),
      ictCatatanKasusRepository.findAllCatatanKasusRingkas(),
    ]);

    const siswaCountMap = {};
    siswaData.forEach((s) => {
      const kid = firstOf(s.kelas_id);
      if (kid) siswaCountMap[kid] = (siswaCountMap[kid] || 0) + 1;
    });

    return {
      kelasList: kelasData,
      siswaCountMap,
      allCatatan: catatanData,
      error: null,
    };
  } catch (error) {
    return {
      kelasList: [],
      siswaCountMap: {},
      allCatatan: [],
      error: describeError(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Catatan kasus + daftar siswa untuk satu kelas terpilih.
// ---------------------------------------------------------------------------
export async function getCatatanKasusByKelas(kelasId) {
  try {
    const [catatanList, siswaList] = await Promise.all([
      ictCatatanKasusRepository.findCatatanKasusByKelas(kelasId),
      ictCatatanKasusRepository.findSiswaByKelas(kelasId),
    ]);

    return { catatanList, siswaList, error: null };
  } catch (error) {
    return { catatanList: [], siswaList: [], error: describeError(error) };
  }
}
