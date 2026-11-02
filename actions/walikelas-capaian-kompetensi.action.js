"use server";

import * as capaianKompetensiService from "@/services/walikelas-capaian-kompetensi.service";

export async function getCapaianKompetensiData({ userId }) {
  return capaianKompetensiService.getCapaianKompetensiData({ userId });
}
