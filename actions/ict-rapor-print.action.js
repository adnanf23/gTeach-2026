"use server";

import * as raporPrintService from "@/services/ict-rapor-print.service";

// Pintu masuk server action halaman ICT > Rapor > Cek & Print Rapor.
// Tipis: seluruh pembacaan data & agregasi didelegasikan ke layer services.

export async function getRaporPrintBase() {
  return raporPrintService.getRaporPrintBase();
}

export async function getRaporPrintKelasData(params) {
  return raporPrintService.getRaporPrintKelasData(params);
}

export async function getPengaturanRapor(ujianId) {
  return raporPrintService.getPengaturanRapor(ujianId);
}

export async function getRaporPrintSiswa(params) {
  return raporPrintService.getRaporPrintSiswa(params);
}
