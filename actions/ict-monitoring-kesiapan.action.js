"use server";

import * as kesiapanService from "@/services/ict-monitoring-kesiapan.service";

export async function getMonitoringKesiapanInit() {
  return kesiapanService.getMonitoringKesiapanInit();
}

export async function getMonitoringKesiapanBase(kelasIds) {
  return kesiapanService.getMonitoringKesiapanBase(kelasIds);
}

export async function getMonitoringKesiapanNilaiUjian(params) {
  return kesiapanService.getMonitoringKesiapanNilaiUjian(params);
}

export async function getMonitoringKesiapanReports(params) {
  return kesiapanService.getMonitoringKesiapanReports(params);
}
