import "server-only";

// Cache in-memory sederhana (TTL) untuk query berat seperti absensi.
// Hanya hidup di proses server; tidak dibagikan antar instance.
const store = new Map();

export async function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.exp > now) return hit.val;
  const val = await fn();
  store.set(key, { val, exp: now + ttlMs });
  return val;
}

export function invalidate(prefix) {
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

// ── Kebijakan absensi ─────────────────────────────────────────────
// Bulan ini & hari ini harus live (tidak di-cache). Yang boleh di-cache:
// data sampai bulan lalu ke belakang.

export function awalBulanIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// true kalau batas atas tanggal < awal bulan ini (bulan lalu ke belakang).
export function bolehCacheSampai(upperISO) {
  if (!upperISO) return false;
  return String(upperISO).slice(0, 10) < awalBulanIni();
}

// Ambil batas atas "tanggal <= ..." terbesar dari sebuah filter PocketBase.
export function upperTanggalDariFilter(filter) {
  const re = /tanggal\s*<=\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})/g;
  let m;
  let max = null;
  const str = String(filter || "");
  while ((m = re.exec(str))) if (!max || m[1] > max) max = m[1];
  return max;
}
