import { describeError } from "@/lib/app-error";
import * as ictDataKelasDetailRepository from "@/repositories/ict-data-kelas-detail.repository";

// Baca detail satu kelas + seluruh perhitungan turunannya.
// Setiap fungsi mengembalikan objek polos { ..., error } (error: null bila sukses).

// Detail satu kelas (expand wali/pendamping/tahun ajaran).
export async function getKelasDetail(id) {
  try {
    const kelas = await ictDataKelasDetailRepository.findKelasById(id);
    return { kelas, error: null };
  } catch (error) {
    console.error(error);
    return { kelas: null, error: describeError(error) };
  }
}

// Daftar siswa pada satu kelas.
export async function getSiswaKelas(id) {
  try {
    const siswa = await ictDataKelasDetailRepository.findSiswaByKelas(id);
    return { siswa, error: null };
  } catch (error) {
    console.error(error);
    return { siswa: [], error: describeError(error) };
  }
}

// Daftar mata pelajaran kelas + perhitungan turunannya:
// mapel spesifik kelas digabung dengan mapel umum tingkat, lalu dedupe per id
// (mapel spesifik menang dan diproses lebih dulu).
export async function getMapelKelas(id, tingkat) {
  try {
    const [spesifik, kandidatUmum] = await Promise.all([
      ictDataKelasDetailRepository.findMapelSpesifikKelas(id),
      ictDataKelasDetailRepository.findMapelByTingkat(tingkat),
    ]);

    const umum = kandidatUmum.filter((m) => {
      const spesifikIds = Array.isArray(m.spesifik_kelas_id)
        ? m.spesifik_kelas_id
        : m.spesifik_kelas_id
          ? [m.spesifik_kelas_id]
          : [];
      return spesifikIds.length === 0;
    });

    const map = {};
    [...spesifik, ...umum].forEach((m) => {
      map[m.id] = m;
    });

    return { mapel: Object.values(map), error: null };
  } catch (error) {
    console.error("[fetchMapel] ERROR:", error?.data || error);
    return { mapel: [], error: describeError(error) };
  }
}
