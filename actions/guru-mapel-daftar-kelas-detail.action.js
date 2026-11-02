"use server";

import * as guruMapelDaftarKelasDetailService from "@/services/guru-mapel-daftar-kelas-detail.service";

export async function getKelasDetailData(id) {
  return guruMapelDaftarKelasDetailService.getKelasDetailData(id);
}
