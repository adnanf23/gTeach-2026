"use server";

import * as ictDataSiswaService from "@/services/ict-data-siswa.service";

export async function getIctDataSiswa() {
  return ictDataSiswaService.getIctDataSiswa();
}

export async function getIctKelasList() {
  return ictDataSiswaService.getIctKelasList();
}
