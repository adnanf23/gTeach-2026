"use server";

import * as guruMapelDaftarKelasService from "@/services/guru-mapel-daftar-kelas.service";

export async function getDaftarKelasGuruMapel(userId) {
  return guruMapelDaftarKelasService.getDaftarKelasGuruMapel(userId);
}
