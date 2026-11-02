import * as walikelasGuruPengajarRepository from "@/repositories/walikelas-guru-pengajar.repository";

// Menentukan kelas untuk wali kelas/pendamping, atau daftar pilihan untuk admin/ict.
export async function resolveWalikelasKelas({ userId, role }) {
  if (role === "guru walikelas" || role === "guru pendamping") {
    try {
      const rec =
        await walikelasGuruPengajarRepository.findKelasByWaliOrPendamping(
          userId,
        );
      return { status: "assigned", kelas: rec };
    } catch {
      return { status: "none" };
    }
  }

  if (role === "admin" || role === "ict") {
    try {
      const list =
        await walikelasGuruPengajarRepository.findAllKelasSorted();
      return { status: "picker", kelasOptions: list };
    } catch {
      return { status: "error", message: "Gagal memuat daftar kelas." };
    }
  }

  return { status: "forbidden" };
}

export async function getGuruPengajarRows(kelasId) {
  try {
    const records =
      await walikelasGuruPengajarRepository.findPlotingGuruByKelas(kelasId);

    const filteredRecords = records.filter((r) => {
      const kelasIds = Array.isArray(r.kelas_id) ? r.kelas_id : [r.kelas_id];
      return kelasIds.includes(kelasId);
    });

    const list = filteredRecords.map((r) => ({
      id: r.id,
      guru: r.expand?.guru_id || null,
      mapel: r.expand?.mapel_id || null,
      kelasIds: r.kelas_id || [],
    }));

    list.sort((a, b) =>
      (a.mapel?.nama_mapel || "").localeCompare(b.mapel?.nama_mapel || ""),
    );

    return { rows: list, error: null };
  } catch (e) {
    console.error("Error loading pengajar:", e);
    return { rows: [], error: "Gagal memuat daftar guru pengajar." };
  }
}
