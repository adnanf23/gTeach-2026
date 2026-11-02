import { describeError } from "@/lib/app-error";
import * as ictMapelRepository from "@/repositories/ict-mapel.repository";

// Baca data halaman ICT > Manajemen Utama > Mata Pelajaran:
// daftar mata pelajaran (expand spesifik_kelas_id) + daftar kelas.
export async function getIctMapel() {
  try {
    const [mapelList, kelasList] = await Promise.all([
      ictMapelRepository.findMapel(),
      ictMapelRepository.findKelas(),
    ]);

    return { mapelList, kelasList, error: null };
  } catch (error) {
    console.error(error);
    return { mapelList: [], kelasList: [], error: describeError(error) };
  }
}

// Baca satu mata pelajaran (di-expand ke kelas spesifik). Dipakai halaman
// setelah create/update untuk menyegarkan satu baris di state.
export async function getIctMapelItem(id) {
  try {
    const item = await ictMapelRepository.findMapelById(id);
    return { item, error: null };
  } catch (error) {
    console.error(error);
    return { item: null, error: describeError(error) };
  }
}
