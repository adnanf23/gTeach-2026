import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Akses data murni untuk halaman ICT > Monitoring Harian > Absensi.
// Fungsi-fungsi ini hanya membungkus query PocketBase dan melempar error apa
// adanya; seluruh agregasi/rekap ditangani di layer services.

export async function findKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    sort: "tingkat,nama_kelas",
    // Halaman hanya memakai id & nama_kelas — join walikelas/pendamping dihapus.
    fields: "id,nama_kelas,tingkat",
    requestKey: null,
  });
}

export async function findSiswa() {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    sort: "nama_siswa",
    // Proyeksi kolom yang benar-benar dipakai halaman (render + export).
    fields: "id,nis,nama_siswa,jenis_kelamin,kelas_id",
    requestKey: null,
  });
}

export async function findHariLibur() {
  const pb = await getServerPb();
  return pb.collection("hari_libur").getFullList({ requestKey: null });
}

// Rentang tanggal untuk mode monitoring (30 hari, sort -tanggal) dan export.
// `kelasId` opsional ("semua" ditangani pemanggil dengan mengirim null).
// `fields` opsional untuk proyeksi kolom (hemat payload pada agregasi).
import { cached, bolehCacheSampai } from "@/lib/cache";

export async function findAbsensiByRange({ kelasId, startStr, endStr, sort, fields }) {
  const load = async () => {
    const pb = await getServerPb();

    let filter = `tanggal >= "${startStr}" && tanggal <= "${endStr}"`;
    if (kelasId) filter += ` && kelas_id = "${kelasId}"`;

    const options = { filter, requestKey: null };
    if (sort) options.sort = sort;
    if (fields) options.fields = fields;

    return pb.collection("absensi").getFullList(options);
  };
  if (!bolehCacheSampai(endStr)) return load();
  return cached(
    `absensi:${kelasId || ""}|${startStr}|${endStr}|${sort || ""}|${fields || ""}`,
    600000,
    load,
  );
}

// Absensi satu hari, dikelompokkan per kelas_id di service.
// Tanpa expand: nama siswa/kelas sudah dikirim ke client lewat getBaseData,
// join di server hanya memperbesar payload & memperlambat query.
export async function findAbsensiByDate({ dateStr }) {
  const load = async () => {
    const pb = await getServerPb();
    return pb.collection("absensi").getFullList({
      filter: `tanggal >= "${dateStr} 00:00:00" && tanggal <= "${dateStr} 23:59:59"`,
      requestKey: null,
    });
  };
  if (!bolehCacheSampai(dateStr)) return load();
  return cached(`absensi:date:${dateStr}`, 600000, load);
}
