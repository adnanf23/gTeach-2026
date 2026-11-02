"use server";

import * as ictManajemenUjianService from "@/services/ict-manajemen-ujian.service";

export async function getManajemenUjianInit() {
  return ictManajemenUjianService.getManajemenUjianInit();
}

export async function getManajemenUjianList(tahunAjaranId) {
  return ictManajemenUjianService.getManajemenUjianList(tahunAjaranId);
}
