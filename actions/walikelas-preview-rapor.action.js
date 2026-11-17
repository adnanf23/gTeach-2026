"use server";

import * as previewRaporService from "@/services/walikelas-preview-rapor.service";

export async function getPreviewRaporBase(params) {
  return previewRaporService.getPreviewRaporBase(params);
}

export async function getPengaturanRapor(ujian) {
  return previewRaporService.getPengaturanRapor(ujian);
}

export async function getPreviewRaporSiswa(params) {
  return previewRaporService.getPreviewRaporSiswa(params);
}
