"use server";

import * as detailService from "@/services/walikelas-nilai-penilaian-detail.service";

export async function getWalikelasPenilaianDetail({
  userId,
  mapelId,
  tahunAjaranId,
}) {
  return detailService.getPenilaianDetail({
    userId,
    mapelId,
    tahunAjaranId,
  });
}
