import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// Daftar seluruh periode semester (tahun ajaran) untuk pemilih semester.
export async function findAllTahunAjaran() {
  const pb = await getServerPb();
  return pb.collection("tahun_ajaran").getFullList({
    sort: "-tahun,-semester",
    requestKey: null,
  });
}
