"use server";

import * as penilaianService from "@/services/walikelas-nilai-penilaian.service";

export async function getWalikelasPenilaianData({ userId, tahunAjaranId }) {
  return penilaianService.getPenilaianData({ userId, tahunAjaranId });
}
