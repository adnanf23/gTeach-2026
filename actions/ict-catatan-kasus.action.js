"use server";

import * as ictCatatanKasusService from "@/services/ict-catatan-kasus.service";

export async function getCatatanKasusOverview() {
  return ictCatatanKasusService.getCatatanKasusOverview();
}

export async function getCatatanKasusByKelas(kelasId) {
  return ictCatatanKasusService.getCatatanKasusByKelas(kelasId);
}
