"use server";

import * as ictDataGuruService from "@/services/ict-data-guru.service";

export async function getIctDataGuru() {
  return ictDataGuruService.getIctDataGuru();
}

export async function getSemuaUser() {
  return ictDataGuruService.getSemuaUser();
}
