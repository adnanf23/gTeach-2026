"use server";

import * as walikelasGuruPengajarService from "@/services/walikelas-guru-pengajar.service";

export async function resolveWalikelasKelas(params) {
  return walikelasGuruPengajarService.resolveWalikelasKelas(params);
}

export async function getGuruPengajarRows(kelasId) {
  return walikelasGuruPengajarService.getGuruPengajarRows(kelasId);
}
