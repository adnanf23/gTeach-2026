"use server";

import * as ictMapelService from "@/services/ict-mapel.service";

export async function getIctMapel() {
  return ictMapelService.getIctMapel();
}

export async function getIctMapelItem(id) {
  return ictMapelService.getIctMapelItem(id);
}
