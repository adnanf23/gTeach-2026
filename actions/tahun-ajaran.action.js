"use server";

import * as tahunAjaranService from "@/services/tahun-ajaran.service";

export async function getTahunAjaranList() {
  return tahunAjaranService.getTahunAjaranList();
}

export async function getSemesterBounds(tahunAjaranId) {
  const { list } = await tahunAjaranService.getTahunAjaranList();
  const found = list.find((t) => t.id === tahunAjaranId);
  return { bounds: tahunAjaranService.semesterDateBounds(found) };
}
