"use server";

import * as fullDataService from "@/services/ict-full-data.service";

export async function getIctFullDataKelasList() {
  return fullDataService.getKelasList();
}

export async function getIctFullDataMapel({ kelasId, tingkat }) {
  return fullDataService.getMapelData({ kelasId, tingkat });
}

export async function getIctFullDataExport({ kelasId, mapelIds }) {
  return fullDataService.getExportData({ kelasId, mapelIds });
}

export async function getIctFullDataImportSiswa({ kelasId }) {
  return fullDataService.getImportSiswaData({ kelasId });
}

export async function getIctFullDataMapelSheet({ mapelId, kelasId }) {
  return fullDataService.getMapelSheetData({ mapelId, kelasId });
}
