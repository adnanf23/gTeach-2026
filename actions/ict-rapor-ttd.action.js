"use server";

import * as ttdService from "@/services/ict-rapor-ttd.service";

export async function getUsersTtd() {
  return ttdService.getUsersTtd();
}
