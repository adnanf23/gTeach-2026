"use server";

import * as ictDataKelasService from "@/services/ict-data-kelas.service";

export async function getIctDataKelas() {
  return ictDataKelasService.getIctDataKelas();
}

export async function countSiswaKelas(kelasId) {
  return ictDataKelasService.countSiswaKelas(kelasId);
}

export async function getSemuaUser() {
  return ictDataKelasService.getSemuaUser();
}
