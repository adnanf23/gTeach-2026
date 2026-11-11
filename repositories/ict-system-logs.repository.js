import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Daftar log dengan paginasi (untuk tabel utama).
export async function findLogs({ page, perPage, filter, sort, expand }) {
  const pb = await getServerPb();
  return pb.collection("system_log").getList(page, perPage, {
    expand,
    sort,
    filter,
    requestKey: null,
  });
}

// Ambil SEMUA log (tanpa paginasi) untuk keperluan export.
export async function findAllLogs({ filter, sort, expand }) {
  const pb = await getServerPb();
  return pb.collection("system_log").getFullList({
    expand,
    sort,
    filter,
    requestKey: null,
  });
}

// Menghitung jumlah log sesuai filter (perPage=1, hanya butuh totalItems).
export async function countLogs({ filter, fields }) {
  const pb = await getServerPb();
  return pb.collection("system_log").getList(1, 1, {
    fields,
    filter,
    requestKey: null,
  });
}

// Ambil satu user untuk melengkapi relasi (expand) log yang masuk lewat realtime.
export async function findUserById(userId) {
  const pb = await getServerPb();
  return pb.collection("users").getOne(userId, { requestKey: null });
}
