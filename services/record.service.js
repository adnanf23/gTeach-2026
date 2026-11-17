import { describeError } from "@/lib/app-error";
import { semesterAktif, semesterUntukTanggal } from "@/lib/semester";
import * as recordRepository from "@/repositories/record.repository";
import { findAllTahunAjaran } from "@/repositories/tahun-ajaran.repository";
import { writeLog } from "@/services/systemLog.service";

// Koleksi yang menyimpan tahun_ajaran_id (sesuai skema PocketBase).
const TAHUN_AJARAN_COLLECTIONS = new Set([
  "nilai_formatif",
  "nilai_sumatif",
  "nilai_ujian",
  "tujuan_pembelajaran",
  "lingkup_materi",
  "pengaturan_ujian",
  "catatan_kasus",
  "agenda_mengajar",
  "absensi",
]);

// Koleksi yang semesternya ditentukan tanggal record itu sendiri, bukan
// semester yang sedang aktif. Guru bisa mengisi agenda/absensi untuk tanggal
// lampau (mis. mengisi susulan), dan record itu harus masuk semester tanggalnya.
const KEPEMILIKAN_PER_TANGGAL = {
  agenda_mengajar: "date",
  absensi: "tanggal",
};

let taCache = { list: null, at: 0 };

async function getTahunAjaranList() {
  const now = Date.now();
  if (taCache.list && now - taCache.at < 60_000) return taCache.list;
  try {
    const list = await findAllTahunAjaran();
    taCache = { list, at: now };
    return list;
  } catch {
    return [];
  }
}

// Isi otomatis tahun_ajaran_id bila belum diisi.
async function withActiveTahunAjaran(collection, data) {
  if (!TAHUN_AJARAN_COLLECTIONS.has(collection)) return data;
  if (!data || typeof data !== "object") return data;
  if (typeof FormData !== "undefined" && data instanceof FormData) return data;
  if (data.tahun_ajaran_id) return data;

  const list = await getTahunAjaranList();
  if (list.length === 0) return data;

  const fieldTanggal = KEPEMILIKAN_PER_TANGGAL[collection];
  const ta = fieldTanggal
    ? semesterUntukTanggal(data[fieldTanggal], list)
    : semesterAktif(list);

  if (!ta?.id) return data;
  return { ...data, tahun_ajaran_id: ta.id };
}

// Saat tanggal record dipindah, semesternya harus ikut pindah. Hanya
// menyentuh record yang tanggalnya benar-benar berubah; kalau tanggal tidak
// dikirim, `tahun_ajaran_id` yang sudah ada dibiarkan.
async function withTahunAjaranSaatPindahTanggal(collection, data) {
  const fieldTanggal = KEPEMILIKAN_PER_TANGGAL[collection];
  if (!fieldTanggal) return data;
  if (!data || typeof data !== "object") return data;
  if (typeof FormData !== "undefined" && data instanceof FormData) return data;
  if (!data[fieldTanggal]) return data;

  const list = await getTahunAjaranList();
  if (list.length === 0) return data;

  const ta = semesterUntukTanggal(data[fieldTanggal], list);
  if (!ta?.id) return data;
  return { ...data, tahun_ajaran_id: ta.id };
}

// Catat aksi CRUD ke system_log. Kegagalan logging tidak boleh menggagalkan
// operasi utama, dan menulis ke system_log sendiri tidak perlu dicatat lagi.
async function logCrud(verb, collection, id) {
  if (collection === "system_log") return;
  try {
    await writeLog({
      type: verb === "menghapus" ? "warning" : "info",
      msg: `${verb} data '${collection}'${id ? ` [${id}]` : ""}.`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: verb, collection, recordId: id || null },
    });
  } catch {
    /* abaikan error logging */
  }
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
    const result = await recordRepository.insert(collection, payload, options);
    await logCrud("menambah", collection, result?.id);
    return result;
  });
}

export async function update(collection, id, data, options) {
  return run(async () => {
    const payload = await withTahunAjaranSaatPindahTanggal(
      collection,
      data,
      options,
    );
    const result = await recordRepository.modify(
      collection,
      id,
      payload,
      options,
    );
    await logCrud("memperbarui", collection, id);
    return result;
  });
}

export async function remove(collection, id) {
  return run(async () => {
    const result = await recordRepository.remove(collection, id);
    await logCrud("menghapus", collection, id);
    return result;
  });
}
