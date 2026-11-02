import { describeError } from "@/lib/app-error";
import * as ictDataKelasRepository from "@/repositories/ict-data-kelas.repository";

// Baca data halaman ICT > Data Utama > Data Kelas:
// daftar kelas (expand wali/pendamping) + daftar guru wali/pendamping.
export async function getIctDataKelas() {
  try {
    const [kelasList, guruPaged] = await Promise.all([
      ictDataKelasRepository.findKelasDenganWaliPendamping(),
      ictDataKelasRepository.findGuruWaliPendamping(),
    ]);

    return {
      kelasList,
      guruList: guruPaged.items,
      error: null,
    };
  } catch (error) {
    console.error("Gagal mengambil data kelas & guru:", error);
    return {
      kelasList: [],
      guruList: [],
      error: describeError(error),
    };
  }
}

// Jumlah siswa satu kelas (untuk badge "Total Siswa" pada kartu kelas).
export async function countSiswaKelas(kelasId) {
  try {
    const result = await ictDataKelasRepository.countSiswaByKelas(kelasId);
    return { totalItems: result.totalItems, error: null };
  } catch (error) {
    console.error("Gagal menghitung jumlah siswa kelas:", error);
    return { totalItems: 0, error: describeError(error) };
  }
}

// Semua user (untuk memetakan nama guru -> id saat import).
export async function getSemuaUser() {
  try {
    const users = await ictDataKelasRepository.findSemuaUser();
    return { users, error: null };
  } catch (error) {
    console.error("Gagal mengambil semua user:", error);
    return { users: [], error: describeError(error) };
  }
}
