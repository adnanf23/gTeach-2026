"use server";

import * as kehadiranService from "@/services/walikelas-kehadiran.service";

export async function getKehadiranData({ userId }) {
  return kehadiranService.getKehadiranData({ userId });
}
