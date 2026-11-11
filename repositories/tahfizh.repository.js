import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

export const KATEGORI_TAHFIZH = [
  "hafalan",
  "jaritmatika",
  "gesture",
  "hadits",
  "doa",
  "wudhu",
];

/* ============================ KOMPONEN ============================ */

export async function findKomponenByTingkat({ tingkat, tahunAjaranId, mapelId }) {
  const pb = await getServerPb();
  return pb.collection("tahfizh_komponen").getFullList({
    filter: `tingkat="${tingkat}" && tahun_ajaran_id="${tahunAjaranId}" && mapel_id="${mapelId}"`,
    sort: "created",
    requestKey: null,
  });
}

export async function createKomponen(data) {
  const pb = await getServerPb();
  return pb.collection("tahfizh_komponen").create(data);
}

export async function deleteKomponen(id) {
  const pb = await getServerPb();
  return pb.collection("tahfizh_komponen").delete(id);
}

/* ============================ PREDIKAT (6 kategori) ============================ */

export async function findPredikat(kategori, { komponenIds, tahunAjaranId }) {
  if (!komponenIds.length) return [];
  const pb = await getServerPb();
  const kf = komponenIds.map((id) => `komponen_id="${id}"`).join(" || ");
  return pb.collection(`tahfizh_${kategori}`).getFullList({
    filter: `(${kf}) && tahun_ajaran_id="${tahunAjaranId}"`,
    requestKey: null,
  });
}

export async function savePredikat(kategori, data, existingId) {
  const pb = await getServerPb();
  const col = pb.collection(`tahfizh_${kategori}`);
  if (existingId) return col.update(existingId, data);
  return col.create(data);
}

/* ============================ NILAI TAHSIN ============================ */

export async function findNilaiTahsin({ kelasId, tahunAjaranId, mapelId }) {
  const pb = await getServerPb();
  return pb.collection("tahfizh_nilai_tahsin").getFullList({
    filter: `kelas_id="${kelasId}" && tahun_ajaran_id="${tahunAjaranId}" && mapel_id="${mapelId}"`,
    requestKey: null,
  });
}

export async function saveNilaiTahsin(data, existingId) {
  const pb = await getServerPb();
  const col = pb.collection("tahfizh_nilai_tahsin");
  if (existingId) return col.update(existingId, data);
  return col.create(data);
}

/* ============================ CATATAN TAHSIN ============================ */

export async function findTahsinCatatan({ kelasId, tahunAjaranId }) {
  const pb = await getServerPb();
  return pb.collection("tahfizh_tahsin_catatan").getFullList({
    filter: `kelas_id="${kelasId}" && tahun_ajaran_id="${tahunAjaranId}"`,
    requestKey: null,
  });
}

export async function saveTahsinCatatan(data, existingId) {
  const pb = await getServerPb();
  const col = pb.collection("tahfizh_tahsin_catatan");
  if (existingId) return col.update(existingId, data);
  return col.create(data);
}

/* ============================ CATATAN TAHFIZH ============================ */

export async function findTahfizhCatatan({ kelasId, tahunAjaranId }) {
  const pb = await getServerPb();
  return pb.collection("tahfizh_catatan").getFullList({
    filter: `kelas_id="${kelasId}" && tahun_ajaran_id="${tahunAjaranId}"`,
    requestKey: null,
  });
}

export async function saveTahfizhCatatan(data, existingId) {
  const pb = await getServerPb();
  const col = pb.collection("tahfizh_catatan");
  if (existingId) return col.update(existingId, data);
  return col.create(data);
}

/* ============================ PENENTUAN MAPEL TAHSIN ============================ */

// Mapel TAHSIN yang diploting untuk kelas (ikut ploting guru).
export async function findPlotingByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    filter: `kelas_id ~ "${kelasId}"`,
    expand: "mapel_id",
    requestKey: null,
  });
}

/* ============================ KONTEKS RAPOR ============================ */

export async function findKelasByWali(userId) {
  const pb = await getServerPb();
  try {
    return await pb.collection("kelas").getFirstListItem(
      `walikelas_id="${userId}" || pendamping_id="${userId}"`,
      { expand: "walikelas_id,tahun_ajaran_id", requestKey: null },
    );
  } catch {
    return null;
  }
}

export async function findKelasById(id) {
  const pb = await getServerPb();
  return pb.collection("kelas").getOne(id, {
    expand: "walikelas_id,tahun_ajaran_id",
    requestKey: null,
  });
}

export async function findSiswaByKelas(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id="${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

export async function findMapelTahfizh() {
  const pb = await getServerPb();
  const list = await pb.collection("mata_pelajaran").getFullList({
    filter: `kategori="tahfizh"`,
    requestKey: null,
  });
  return (
    list.find((m) => /TAHFIZH/i.test(m.nama_mapel || "")) || null
  );
}

/* ===================== KOMPONEN PER TINGKAT ===================== */

// Semua kelas pada satu tingkat (opsional dibatasi tahun ajaran).
export async function findKelasByTingkat(tingkat, tahunAjaranId) {
  const pb = await getServerPb();
  const rows = await pb.collection("kelas").getFullList({
    sort: "nama_kelas",
    requestKey: null,
  });
  return rows.filter(
    (k) =>
      String(k.tingkat) === String(tingkat) &&
      (!tahunAjaranId ||
        String(Array.isArray(k.tahun_ajaran_id) ? k.tahun_ajaran_id[0] : k.tahun_ajaran_id) ===
          String(tahunAjaranId)),
  );
}
