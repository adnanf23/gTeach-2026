"use server";

import * as onboardingService from "@/services/onboarding.service";

export async function backupDatabase() {
  return onboardingService.backupDatabase();
}

export async function getExportSiswaKelas() {
  return onboardingService.getExportSiswaKelas();
}

export async function getExportWaliPendamping() {
  return onboardingService.getExportWaliPendamping();
}

export async function getExportAbsensiSemester() {
  return onboardingService.getExportAbsensiSemester();
}

export async function getExportNilaiPerKelas() {
  return onboardingService.getExportNilaiPerKelas();
}

export async function deleteNilaiAgendaAbsensi() {
  return onboardingService.deleteNilaiAgendaAbsensi();
}

export async function resetSemester(payload) {
  return onboardingService.resetSemester(payload);
}

export async function importSiswa(rows) {
  return onboardingService.importSiswa(rows);
}

export async function importGuru(rows) {
  return onboardingService.importGuru(rows);
}
