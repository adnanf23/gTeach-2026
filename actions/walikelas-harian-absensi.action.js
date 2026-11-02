"use server";

import * as absensiService from "@/services/walikelas-harian-absensi.service";

export async function getHariLibur() {
  return absensiService.getHariLibur();
}

export async function resolveWalikelasKelas(params) {
  return absensiService.resolveWalikelasKelas(params);
}

export async function getSiswaKelas(kelasId) {
  return absensiService.getSiswaKelas(kelasId);
}

export async function getAbsensiBulan(params) {
  return absensiService.getAbsensiBulan(params);
}

export async function getRekapAbsensi(params) {
  return absensiService.getRekapAbsensi(params);
}
