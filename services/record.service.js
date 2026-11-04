import { describeError } from "@/lib/app-error";
import * as recordRepository from "@/repositories/record.repository";
import { findAllTahunAjaran } from "@/repositories/tahun-ajaran.repository";

// Koleksi yang menyimpan tahun_ajaran_id (sesuai skema PocketBase).
const TAHUN_AJARAN_COLLECTIONS = new Set([
  "nilai_formatif",
  "nilai_sumatif",
  "nilai_ujian",
  "tujuan_pembelajaran",
  "lingkup_materi",
  "pengaturan_ujian",
  "catatan_kasus",
]);

let activeTaCache = { id: "", at: 0 };

async function getActiveTahunAjaranId() {
  const now = Date.now();
  if (activeTaCache.id && now - activeTaCache.at < 60_000) {
    return activeTaCache.id;
  }
  try {
    const list = await findAllTahunAjaran();
    const id = list.find((t) => t.is_aktif)?.id || "";
    activeTaCache = { id, at: now };
    return id;
  } catch {
    return "";
  }
}

// Isi otomatis tahun_ajaran_id dengan semester yang sedang aktif bila belum diisi.
async function withActiveTahunAjaran(collection, data) {
  if (!TAHUN_AJARAN_COLLECTIONS.has(collection)) return data;
  if (!data || typeof data !== "object") return data;
  if (typeof FormData !== "undefined" && data instanceof FormData) return data;
  if (data.tahun_ajaran_id) return data;
  const id = await getActiveTahunAjaranId();
  if (!id) return data;
  return { ...data, tahun_ajaran_id: id };
}

// Service generik: membungkus tiap operasi agar mengembalikan { data, error }
// (objek polos), sehingga action cukup meneruskan hasilnya.
async function run(operation) {
  try {
    return { data: await operation(), error: null };
  } catch (error) {
    return { data: null, error: describeError(error) };
  }
}

export async function getFullList(collection, options) {
  return run(() => recordRepository.findFullList(collection, options));
}

export async function getList(collection, page, perPage, options) {
  return run(() =>
    recordRepository.findList(collection, page, perPage, options),
  );
}

export async function getOne(collection, id, options) {
  return run(() => recordRepository.findOne(collection, id, options));
}

export async function getFirstListItem(collection, filter, options) {
  return run(() => recordRepository.findFirst(collection, filter, options));
}

export async function create(collection, data, options) {
  return run(async () => {
    const payload = await withActiveTahunAjaran(collection, data);
    return recordRepository.insert(collection, payload, options);
  });
}

export async function update(collection, id, data, options) {
  return run(() => recordRepository.modify(collection, id, data, options));
}

export async function remove(collection, id) {
  return run(() => recordRepository.remove(collection, id));
}
