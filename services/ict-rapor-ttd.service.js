import { describeError } from "@/lib/app-error";
import * as ttdRepository from "@/repositories/ict-rapor-ttd.repository";

// Baca daftar user (beserta field `ttd`) untuk halaman ICT > Rapor > Tanda
// Tangan: dipakai untuk pencocokan username saat upload dan untuk galeri.
export async function getUsersTtd() {
  try {
    const users = await ttdRepository.findSemuaUser();
    return { users, error: null };
  } catch (error) {
    console.error("Gagal memuat data pengguna:", error);
    return { users: [], error: describeError(error) };
  }
}
