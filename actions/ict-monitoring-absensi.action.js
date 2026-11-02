"use server";

import * as absensiService from "@/services/ict-monitoring-absensi.service";

export async function getBaseData() {
  return absensiService.getBaseData();
}

export async function getAbsensiRange(params) {
  return absensiService.getAbsensiRange(params);
}

export async function getAbsensiTanggal(params) {
  return absensiService.getAbsensiTanggal(params);
}

export async function getAbsensiExport(params) {
  return absensiService.getAbsensiExport(params);
}
