"use server";

import * as legerService from "@/services/walikelas-nilai-leger.service";

export async function getWalikelasLegerData({ userId }) {
  return legerService.getLegerData({ userId });
}
