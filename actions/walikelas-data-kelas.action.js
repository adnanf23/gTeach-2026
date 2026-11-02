"use server";

import * as walikelasDataKelasService from "@/services/walikelas-data-kelas.service";

export async function getKelasSayaData(userId) {
  return walikelasDataKelasService.getKelasSayaData(userId);
}
