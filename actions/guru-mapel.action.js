"use server";

import * as guruMapelService from "@/services/guru-mapel.service";

export async function getGuruMapelDashboard(params) {
  return guruMapelService.getGuruMapelDashboard(params);
}
