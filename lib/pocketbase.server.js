import "server-only";
import PocketBase from "pocketbase";
import { cookies } from "next/headers";

const BASE_URL =
  process.env.POCKETBASE_URL ||
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  "http://127.0.0.1:8090";

// Koleksi yang boleh diakses dari server action (client -> server).
// `_superusers` sengaja tidak ada di sini.
const ALLOWED_COLLECTIONS = new Set([
  "users",
  "wali_murid",
  "siswa",
  "kelas",
  "mata_pelajaran",
  "ploting_guru",
  "tahun_ajaran",
  "jadwal_pelajaran",
  "hari_libur",
  "agenda_mengajar",
  "absensi",
  "kehadiran_manual",
  "presentase_penilaian",
  "pengaturan_ujian",
  "pengaturan_rapor",
  "tujuan_pembelajaran",
  "lingkup_materi",
  "nilai_formatif",
  "nilai_sumatif",
  "nilai_ujian",
  "nilai_harian",
  "nilai_ekskul",
  "capaian_kompetensi",
  "catatan_siswa",
  "catatan_kasus",
  "system_log",
]);

export function assertAllowedCollection(collection) {
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw new Error(`Koleksi tidak diizinkan: ${collection}`);
  }
}

// Instance PocketBase yang terautentikasi sebagai user pemanggil
// (token diambil dari cookie pb_auth), sehingga aturan (rules) koleksi
// PocketBase tetap berlaku sama seperti akses dari browser sebelumnya.
export async function getServerPb() {
  const pb = new PocketBase(BASE_URL);
  pb.autoCancellation(false);

  const cookieStore = await cookies();
  const raw = cookieStore.get("pb_auth")?.value;

  if (raw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw));
      const token = parsed?.token;
      const record = parsed?.record || parsed?.model || null;
      if (token) pb.authStore.save(token, record);
    } catch {
      // cookie rusak -> biarkan tidak terautentikasi
    }
  }

  return pb;
}

// Instance PocketBase dengan hak superuser, hanya untuk operasi istimewa
// yang memang butuh bypass rules (mis. update profil user oleh dirinya sendiri).
export async function getAdminPb() {
  const pb = new PocketBase(BASE_URL);
  pb.autoCancellation(false);
  await pb
    .collection("_superusers")
    .authWithPassword(
      process.env.POCKETBASE_ADMIN_EMAIL,
      process.env.POCKETBASE_ADMIN_PASSWORD,
    );
  return pb;
}
