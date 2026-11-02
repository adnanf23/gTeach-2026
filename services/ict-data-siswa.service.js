import { describeError } from "@/lib/app-error";
import * as ictDataSiswaRepository from "@/repositories/ict-data-siswa.repository";

/* ═══════════════════════════════════════════════════════════════
   Helper murni (disalin apa adanya dari halaman data-siswa)
   ═══════════════════════════════════════════════════════════════ */

// Ubah kode jenis kelamin "l"/"p" menjadi label lengkap.
function formatJenisKelamin(siswa) {
  let jkFull = siswa.jenis_kelamin;
  if (siswa.jenis_kelamin) {
    const jkLower = siswa.jenis_kelamin.toLowerCase();
    if (jkLower === "l") jkFull = "Laki-Laki";
    if (jkLower === "p") jkFull = "Perempuan";
  }
  return { ...siswa, jenis_kelamin: jkFull };
}

// Baca daftar siswa (+ expand kelas) beserta formatting turunannya.
export async function getIctDataSiswa() {
  try {
    const data = await ictDataSiswaRepository.findSiswaDetail();
    return { dataSiswa: data.map(formatJenisKelamin), error: null };
  } catch (error) {
    console.error("Data gagal diambil:", error);
    return { dataSiswa: [], error: describeError(error) };
  }
}

// Baca daftar kelas (filter, form, dan pencocokan kelas saat import).
export async function getIctKelasList() {
  try {
    const kelasList = await ictDataSiswaRepository.findKelas();
    return { kelasList, error: null };
  } catch (error) {
    console.error(error);
    return { kelasList: [], error: describeError(error) };
  }
}
