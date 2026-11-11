import { describeError } from "@/lib/app-error";
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
