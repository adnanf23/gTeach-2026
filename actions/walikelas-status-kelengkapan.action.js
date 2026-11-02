"use server";

import * as statusKelengkapanService from "@/services/walikelas-status-kelengkapan.service";

export async function getStatusKelengkapanInit(params) {
  return statusKelengkapanService.getStatusKelengkapanInit(params);
}

export async function getStatusKelengkapanBase(kelasId) {
  return statusKelengkapanService.getStatusKelengkapanBase(kelasId);
}

export async function getStatusKelengkapanNilaiUjian(params) {
  return statusKelengkapanService.getStatusKelengkapanNilaiUjian(params);
}

export async function getStatusKelengkapanReport(params) {
  return statusKelengkapanService.getStatusKelengkapanReport(params);
}
