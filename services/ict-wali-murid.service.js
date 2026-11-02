import { describeError } from "@/lib/app-error";
import * as ictWaliMuridRepository from "@/repositories/ict-wali-murid.repository";

/* ═══════════════════════════════════════════════════════════════
   Helper murni (disalin apa adanya dari halaman wali-murid)
   ═══════════════════════════════════════════════════════════════ */

function toArray(val) {
  if (Array.isArray(val)) return val;
  return val ? [val] : [];
}

// Daftar id siswa yang sudah punya akun wali murid — dipakai untuk
// menonaktifkan opsi pada dropdown "Siswa". Sama dengan Set yang dulu dibentuk
// halaman dari dataWali (siswa_id bisa single atau multiple).
function buildSiswaSudahPunyaAkunIds(dataWali) {
  const ids = new Set();
  for (const item of dataWali) {
    for (const siswaId of toArray(item.siswa_id)) ids.add(siswaId);
  }
  return [...ids];
}

// Baca data halaman ICT > Data Utama > Wali Murid:
// daftar akun wali murid (expand siswa + kelas) + daftar id siswa yang sudah
// punya akun.
export async function getIctWaliMurid() {
  try {
    const dataWali = await ictWaliMuridRepository.findWaliMuridDetailed();

    return {
      dataWali,
      siswaSudahPunyaAkunIds: buildSiswaSudahPunyaAkunIds(dataWali),
      error: null,
    };
  } catch (error) {
    console.error("[wali_murid] gagal fetch:", error);
    return {
      dataWali: [],
      siswaSudahPunyaAkunIds: [],
      error: describeError(error),
    };
  }
}

// Daftar siswa (expand kelas) untuk dropdown "Siswa" pada modal tambah akun.
export async function getIctSiswaOptions() {
  try {
    const siswaList = await ictWaliMuridRepository.findSiswaWithKelas();
    return { siswaList, error: null };
  } catch (error) {
    console.error("[siswa] gagal fetch:", error);
    return { siswaList: [], error: describeError(error) };
  }
}
