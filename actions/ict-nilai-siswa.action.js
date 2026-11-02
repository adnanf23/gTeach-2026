"use server";

import * as nilaiSiswaService from "@/services/ict-nilai-siswa.service";

export async function getKelasDanSiswaCount() {
  return nilaiSiswaService.getKelasDanSiswaCount();
}

export async function getLegerKelasData({ kelasId, tingkat }) {
  return nilaiSiswaService.getLegerKelasData({ kelasId, tingkat });
}

export async function getNilaiMentahExportData({ kelasList }) {
  return nilaiSiswaService.getNilaiMentahExportData({ kelasList });
}
