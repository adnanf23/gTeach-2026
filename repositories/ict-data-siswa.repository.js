import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Siswa + expand kelas (untuk kolom Tingkat & Kelas, filter tingkat/kelas).
// ---------------------------------------------------------------------------
export async function findSiswaDetail() {
  const pb = await getServerPb();
  return pb.collection("siswa").getFullList({
    expand: "kelas_id",
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// Semua kelas (dropdown filter, dropdown form, dan pencocokan kelas saat import).
// ---------------------------------------------------------------------------
export async function findKelas() {
  const pb = await getServerPb();
  return pb.collection("kelas").getFullList({
    requestKey: null,
  });
}
