"use server";

import * as detailService from "@/services/ict-full-data-detail.service";

export async function getIctFullDataDetail({ kelasId, mapelId }) {
  return detailService.getFullDataDetail({ kelasId, mapelId });
}

export async function getIctNilaiFormatifByTp({ tpId }) {
  return detailService.getNilaiFormatifByTp({ tpId });
}

export async function getIctNilaiSumatifByLm({ lmId }) {
  return detailService.getNilaiSumatifByLm({ lmId });
}
