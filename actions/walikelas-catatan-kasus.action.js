"use server";

import * as walikelasCatatanKasusService from "@/services/walikelas-catatan-kasus.service";

export async function resolveKelasWalikelas(userId) {
  return walikelasCatatanKasusService.resolveKelasWalikelas(userId);
}

export async function getTahunAjaranAktif() {
  return walikelasCatatanKasusService.getTahunAjaranAktif();
}

export async function getCatatanKasusData(kelasId) {
  return walikelasCatatanKasusService.getCatatanKasusData(kelasId);
}

export async function getRiwayatKasusSiswa(params) {
  return walikelasCatatanKasusService.getRiwayatKasusSiswa(params);
}
