"use server";

import * as walikelasService from "@/services/walikelas.service";

export async function getWalikelasDashboard(params) {
  return walikelasService.getWalikelasDashboard(params);
}
