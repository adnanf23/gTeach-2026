"use server";

import * as previewRaporService from "@/services/walikelas-preview-rapor.service";

export async function getPreviewRaporBase(params) {
  return previewRaporService.getPreviewRaporBase(params);
}

export async function getPengaturanRapor(ujianId) {
  return previewRaporService.getPengaturanRapor(ujianId);
}

export async function getPreviewRaporSiswa(params) {
  return previewRaporService.getPreviewRaporSiswa(params);
}
