"use server";

import * as catatanSiswaService from "@/services/walikelas-catatan-siswa.service";

export async function getCatatanSiswaData({ userId }) {
  return catatanSiswaService.getCatatanSiswaData({ userId });
}
