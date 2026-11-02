"use server";

import * as ictDataKelasDetailService from "@/services/ict-data-kelas-detail.service";

export async function getKelasDetail(id) {
  return ictDataKelasDetailService.getKelasDetail(id);
}

export async function getSiswaKelas(id) {
  return ictDataKelasDetailService.getSiswaKelas(id);
}

export async function getMapelKelas(id, tingkat) {
  return ictDataKelasDetailService.getMapelKelas(id, tingkat);
}
