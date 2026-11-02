"use server";

import * as ictRaporPengaturanService from "@/services/ict-rapor-pengaturan.service";

export async function getPengaturanRaporInit() {
  return ictRaporPengaturanService.getPengaturanRaporInit();
}

export async function getPengaturanRaporData(tahunAjaranId) {
  return ictRaporPengaturanService.getPengaturanRaporData(tahunAjaranId);
}
