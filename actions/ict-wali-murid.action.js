"use server";

import * as ictWaliMuridService from "@/services/ict-wali-murid.service";

export async function getIctWaliMurid() {
  return ictWaliMuridService.getIctWaliMurid();
}

export async function getIctSiswaOptions() {
  return ictWaliMuridService.getIctSiswaOptions();
}
