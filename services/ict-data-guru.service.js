import { describeError } from "@/lib/app-error";
import * as ictDataGuruRepository from "@/repositories/ict-data-guru.repository";

/* ═══════════════════════════════════════════════════════════════
   Helper murni (disalin apa adanya dari halaman data-guru)
   ═══════════════════════════════════════════════════════════════ */

// Peta guruId -> kelas yang diampu (wali ATAU pendamping). Sama seperti
// kelasList.find(k => k.walikelas_id === guruId || k.pendamping_id === guruId):
// kelas pertama yang cocok menang.
function buildKelasByGuru(kelasList) {
  const kelasByGuru = {};
  for (const k of kelasList) {
    if (k.walikelas_id && !(k.walikelas_id in kelasByGuru)) {
      kelasByGuru[k.walikelas_id] = k;
    }
    if (k.pendamping_id && !(k.pendamping_id in kelasByGuru)) {
      kelasByGuru[k.pendamping_id] = k;
    }
  }
  return kelasByGuru;
}

// Daftar tingkat unik dari kelasList, untuk opsi filter.
function buildDaftarTingkat(kelasList) {
  return [
    ...new Set(kelasList.map((k) => String(k.tingkat || "")).filter(Boolean)),
  ].sort();
}

// Baca data halaman ICT > Data Utama > Data Guru:
// daftar guru (users role guru) + daftar kelas (expand wali/pendamping),
// beserta seluruh perhitungan turunannya.
export async function getIctDataGuru() {
  try {
    const [dataGuru, kelasList] = await Promise.all([
      ictDataGuruRepository.findGuru(),
      ictDataGuruRepository.findKelasDenganPengampu(),
    ]);

    return {
      dataGuru,
      kelasList,
      kelasByGuru: buildKelasByGuru(kelasList),
      daftarTingkat: buildDaftarTingkat(kelasList),
      error: null,
    };
  } catch (error) {
    console.error("Gagal mengambil data guru & kelas:", error);
    return {
      dataGuru: [],
      kelasList: [],
      kelasByGuru: {},
      daftarTingkat: [],
      error: describeError(error),
    };
  }
}

// Semua user (untuk cek duplikat nama/email saat import guru).
export async function getSemuaUser() {
  try {
    const users = await ictDataGuruRepository.findSemuaUser();
    return { users, error: null };
  } catch (error) {
    console.error("Gagal mengambil semua user:", error);
    return { users: [], error: describeError(error) };
  }
}
