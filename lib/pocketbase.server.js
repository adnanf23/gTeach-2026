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
  "catatan_kokurikuler",
  "catatan_kasus",
  "system_log",
]);

export function assertAllowedCollection(collection) {
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw new Error(`Koleksi tidak diizinkan: ${collection}`);
  }
}

// ---------- Ketahanan jaringan ----------
// Host PocketBase bisa mengalami packet loss / connect timeout sesaat
// (mis. UND_ERR_CONNECT_TIMEOUT). Alih-alih langsung gagal, kita coba ulang
// beberapa kali dengan timeout per-percobaan yang lebih pendek.
const MAX_ATTEMPTS = 5;
const PER_ATTEMPT_TIMEOUT_MS = 6000;

const RETRIABLE_CODES = [
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
];

function isRetriableError(err) {
  if (!err) return false;
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  const code = err?.cause?.code || err?.code || "";
  if (RETRIABLE_CODES.includes(code)) return true;
  // AggregateError (DNS multi-address) menyimpan kode di tiap sub-error.
  const sub = err?.cause?.errors;
  if (Array.isArray(sub) && sub.some((e) => RETRIABLE_CODES.includes(e?.code))) {
    return true;
  }
  // undici membungkus kegagalan transport sebagai TypeError("fetch failed")
  return err instanceof TypeError || err?.name === "AggregateError";
}

async function fetchWithRetry(url, options = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
      });
    } catch (err) {
      lastErr = err;
      if (!isRetriableError(err) || attempt === MAX_ATTEMPTS) break;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2000, 300 * 2 ** (attempt - 1))),
      );
    }
  }
  throw lastErr;
}

// Pasang fetch tahan-gangguan ke instance PocketBase (dipakai SDK lewat beforeSend).
function withRetry(pb) {
  pb.beforeSend = (url, options) => ({
    url,
    options: { ...options, fetch: fetchWithRetry },
  });
  return pb;
}

// Instance PocketBase yang terautentikasi sebagai user pemanggil
// (token diambil dari cookie pb_auth), sehingga aturan (rules) koleksi
// PocketBase tetap berlaku sama seperti akses dari browser sebelumnya.
export async function getServerPb() {
  const pb = withRetry(new PocketBase(BASE_URL));
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

// Ambil record user yang sedang login dari cookie pb_auth (server-side).
export async function getCurrentUserServer() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("pb_auth")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return parsed?.record || parsed?.model || null;
  } catch {
    return null;
  }
}

// Instance PocketBase dengan hak superuser, hanya untuk operasi istimewa
// yang memang butuh bypass rules (mis. update profil user oleh dirinya sendiri).
export async function getAdminPb() {
  const pb = withRetry(new PocketBase(BASE_URL));
  pb.autoCancellation(false);
  await pb
    .collection("_superusers")
    .authWithPassword(
      process.env.POCKETBASE_ADMIN_EMAIL,
      process.env.POCKETBASE_ADMIN_PASSWORD,
    );
  return pb;
}
