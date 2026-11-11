"use server";

import * as catatanSiswaService from "@/services/walikelas-catatan-kokurikuler.service";

export async function getCatatanKokurikulerData({ userId }) {
  return catatanSiswaService.getCatatanKokurikulerData({ userId });
}
