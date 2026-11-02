import "server-only";

import { getServerPb, getAdminPb } from "@/lib/pocketbase.server";

/* ============================ BACA DATA ============================ */

export async function findAll(collection, options = {}) {
  const pb = await getServerPb();
  return pb.collection(collection).getFullList({
    requestKey: null,
    ...options,
  });
}

export async function findAllAsAdmin(collection, options = {}) {
  const pb = await getAdminPb();
  return pb.collection(collection).getFullList({
    requestKey: null,
    ...options,
  });
}

/* ============================ BACKUP ============================ */

export async function createDatabaseBackup(name) {
  const pb = await getAdminPb();
  // Catatan: SDK `backups.create()` mengembalikan `true` (bukan record),
  // jadi key backup diambil dari daftar backup (cocokkan nama / terbaru).
  await pb.backups.create(name);

  const list = await pb.backups.getFullList();
  const match =
    list.find((b) => b.key === name) ||
    [...list].sort((a, b) =>
      String(b.modified || "").localeCompare(String(a.modified || "")),
    )[0] ||
    null;

  const key = match?.key || name;
  if (!key) return { key: "", url: "" };

  // Unduhan backup mewajibkan FILE token (bukan auth token) sebagai ?token=.
  const fileToken = await pb.files.getToken();
  const url = pb.backups.getDownloadURL(fileToken, key);
  return { key, url };
}

/* ============================ HAPUS MASSAL ============================ */

export async function truncateCollection(collection) {
  const pb = await getAdminPb();
  await pb.collections.truncate(collection);
}

/* ============================ TAHUN AJARAN ============================ */

export async function deleteAllTahunAjaran() {
  const pb = await getAdminPb();
  const list = await pb.collection("tahun_ajaran").getFullList({
    requestKey: null,
  });
  for (const item of list) {
    await pb.collection("tahun_ajaran").delete(item.id);
  }
  return list.length;
}

export async function createTahunAjaran(data) {
  const pb = await getAdminPb();
  return pb.collection("tahun_ajaran").create({ ...data, is_aktif: true });
}

/* ============================ SISWA ============================ */

export async function updateSiswa(id, data) {
  const pb = await getAdminPb();
  return pb.collection("siswa").update(id, data);
}

export async function createSiswa(data) {
  const pb = await getAdminPb();
  return pb.collection("siswa").create(data);
}

export async function deleteSiswa(id) {
  const pb = await getAdminPb();
  return pb.collection("siswa").delete(id);
}

/* ============================ GURU / USER ============================ */

export async function updateUser(id, data) {
  const pb = await getAdminPb();
  return pb.collection("users").update(id, data);
}
