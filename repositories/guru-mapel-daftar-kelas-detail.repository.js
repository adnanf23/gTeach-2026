import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Satu-satunya lapisan yang menyentuh PocketBase untuk fitur
// Guru Mapel > Daftar Kelas > Detail Kelas ([id]).

// Detail satu kelas (dengan expand relasi wali kelas/pendamping/tahun ajaran).
export async function findKelasById(id) {
  const pb = await getServerPb();
  return pb.collection("kelas").getOne(id, {
    expand: "walikelas_id,pendamping_id,tahun_ajaran_id",
    requestKey: null,
  });
}

// Siswa yang terdaftar pada satu kelas.
export async function findSiswaByKelasId(kelasId) {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    filter: `kelas_id="${kelasId}"`,
    sort: "nama_siswa",
    requestKey: null,
  });
}

// Ploting guru yang menyebut kelas ini (field kelas_id bisa berisi banyak
// relasi, sehingga filternya memakai operator `~`).
export async function findPlotingByKelasId(kelasId) {
  const pb = await getServerPb();
  return pb.collection("ploting_guru").getFullList({
    filter: `kelas_id~"${kelasId}"`,
    expand: "guru_id,mapel_id",
    requestKey: null,
  });
}
