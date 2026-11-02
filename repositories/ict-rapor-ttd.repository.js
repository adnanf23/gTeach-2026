import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Daftar seluruh user (termasuk field file `ttd`) — halaman ICT > Rapor >
// Tanda Tangan. Dipakai untuk mencocokkan nama file dengan username sekaligus
// mengisi galeri TTD.
// ---------------------------------------------------------------------------
export async function findSemuaUser() {
  const pb = await getServerPb();
  return pb.collection("users").getFullList({
    sort: "nama_lengkap",
    batch: 200,
    requestKey: null,
  });
}
