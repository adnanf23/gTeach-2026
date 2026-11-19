import { describeError } from "@/lib/app-error";
import { cached } from "@/lib/cache";
import * as ictSystemLogsRepository from "@/repositories/ict-system-logs.repository";

// Tipe log yang dihitung pada ringkasan (sama dengan yang dipakai halaman).
const COUNT_TYPES = ["succes", "warning", "info", "error"];

// ---------------------------------------------------------------------------
// Daftar log dengan paginasi + filter + urutan.
// Filter dirakit di halaman (bergantung state interaktif) lalu diteruskan.
// ---------------------------------------------------------------------------
export async function getSystemLogs({ page, perPage, filter, sort }) {
  try {
    const result = await ictSystemLogsRepository.findLogs({
      page,
      perPage,
      filter,
      sort,
      expand: "user_id",
    });

    return {
      logs: result.items,
      totalItems: result.totalItems,
      error: null,
    };
  } catch (error) {
    return { logs: [], totalItems: 0, error: describeError(error) };
  }
}

// ---------------------------------------------------------------------------
// Semua log (untuk export Excel).
// ---------------------------------------------------------------------------
export async function getAllSystemLogs({ filter, sort }) {
  try {
    const logs = await ictSystemLogsRepository.findAllLogs({
      filter,
      sort,
      expand: "user_id",
    });
    return { logs, error: null };
  } catch (error) {
    return { logs: [], error: describeError(error) };
  }
}

// ---------------------------------------------------------------------------
// Statistik global per tipe (bukan hanya halaman yang sedang tampil)
// ---------------------------------------------------------------------------
export async function getSystemLogCounts() {
  try {
    const [all, ...perType] = await Promise.all([
      ictSystemLogsRepository.countLogs({ fields: "id" }),
      ...COUNT_TYPES.map((t) =>
        ictSystemLogsRepository.countLogs({
          fields: "id",
          filter: `type = "${t}"`,
        }),
      ),
    ]);

    return {
      totalAll: all.totalItems,
      typeCounts: Object.fromEntries(
        COUNT_TYPES.map((t, i) => [t, perType[i].totalItems]),
      ),
      error: null,
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}

// ---------------------------------------------------------------------------
// Jumlah log pada beberapa rentang waktu sekaligus.
// Dibatasi 6 query paralel per gelombang: PocketBase di server produksi
// menggantung bila menerima lebih dari itu sekaligus.
// ---------------------------------------------------------------------------
const COUNT_CONCURRENCY = 6;
const PAST_BUCKET_TTL_MS = 600000;

function rangeFilter({ start, end, type }) {
  const range = `created >= "${start}" && created < "${end}"`;
  return type ? `${range} && type = "${type}"` : range;
}

// Rentang yang sudah lewat sepenuhnya tidak akan berubah lagi (created
// diisi otomatis oleh PocketBase), jadi aman di-cache. Rentang yang masih
// berjalan — hari ini, minggu ini, bulan ini — selalu diambil live.
function isPastRange({ end }) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return new Date(end).getTime() <= todayStart.getTime();
}

function countOne(range) {
  const run = () =>
    ictSystemLogsRepository
      .countLogs({ fields: "id", filter: rangeFilter(range) })
      .then((res) => res.totalItems);

  if (!isPastRange(range)) return run();
  return cached(`syslog:count:${JSON.stringify(range)}`, PAST_BUCKET_TTL_MS, run);
}

async function countInBatches(ranges) {
  const results = new Array(ranges.length);

  for (let i = 0; i < ranges.length; i += COUNT_CONCURRENCY) {
    const batch = ranges.slice(i, i + COUNT_CONCURRENCY);
    const res = await Promise.all(batch.map(countOne));
    res.forEach((v, k) => {
      results[i + k] = v;
    });
  }

  return results;
}

export async function getLogCounts(ranges = []) {
  try {
    const results = await countInBatches(ranges);

    return {
      counts: Object.fromEntries(ranges.map((r, i) => [r.key, results[i]])),
      error: null,
    };
  } catch (error) {
    return { counts: {}, error: describeError(error) };
  }
}

// ---------------------------------------------------------------------------
// User relasi untuk log yang masuk lewat realtime (expand manual di halaman).
// ---------------------------------------------------------------------------
export async function getSystemLogUser(userId) {
  try {
    const user = await ictSystemLogsRepository.findUserById(userId);
    return { user, error: null };
  } catch (error) {
    return { user: null, error: describeError(error) };
  }
}
