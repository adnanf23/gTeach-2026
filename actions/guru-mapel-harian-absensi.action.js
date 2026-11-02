"use server";

import * as absensiService from "@/services/guru-mapel-harian-absensi.service";

export async function getPlotingGuru(guruId) {
  return absensiService.getPlotingGuru(guruId);
}

export async function getKelasOptions(ploting) {
  return absensiService.getKelasOptions(ploting);
}

export async function getAbsensiBulan(params) {
  return absensiService.getAbsensiBulan(params);
}
