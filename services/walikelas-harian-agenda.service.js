import * as agendaRepository from "@/repositories/walikelas-harian-agenda.repository";

// ---------------------------------------------------------------------------
// Helper tanggal
// ---------------------------------------------------------------------------
function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Baca data pendukung
// ---------------------------------------------------------------------------
export async function resolveWalikelasKelas({ userId, role }) {
  if (role === "guru walikelas" || role === "guru pendamping") {
    try {
      const rec = await agendaRepository.findKelasByWalikelas(userId);
      return { status: "assigned", kelas: rec };
    } catch {
      return { status: "none" };
    }
  }

  try {
    const list = await agendaRepository.findAllKelas();
    const sorted = list.sort((a, b) =>
      a.nama_kelas.localeCompare(b.nama_kelas),
    );
    return { status: "picker", kelasOptions: sorted };
  } catch {
    return { status: "error", message: "Gagal memuat daftar kelas." };
  }
}

export async function getAgendaBulan({ kelasId, year, month, mulai, akhir }) {
  try {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startStr = `${toISODate(first)} 00:00:00`;
    const endStr = `${toISODate(last)} 23:59:59`;

    const records = await agendaRepository.findAgendaByBulan({
      kelasId,
      startStr,
      endStr,
      mulai: mulai || null,
      akhir: akhir || null,
    });

    const grouped = {};
    for (const r of records) {
      const key = toISODate(new Date(r.date));
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    return { monthAgenda: grouped, error: null };
  } catch (e) {
    return { monthAgenda: {}, error: "Gagal memuat data agenda bulan ini." };
  }
}

export async function getAgendaDetail({ items }) {
  try {
    const list = Array.isArray(items) ? items : [];
    const refreshedItems = await Promise.all(
      list.map(async (item) => {
        try {
          const fullItem = await agendaRepository.findAgendaById(item.id);
          return fullItem;
        } catch {
          return item;
        }
      }),
    );

    const jamOrder = [
      "1 dan 2",
      "3 dan 4",
      "5 dan 6",
      "7 dan 8",
      "9 dan 10",
      "11 dan 12",
    ];
    const sortedItems = refreshedItems.sort((a, b) => {
      const indexA = jamOrder.indexOf(a.jam_mapel);
      const indexB = jamOrder.indexOf(b.jam_mapel);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    return { items: sortedItems, error: null };
  } catch (e) {
    return { items: [], error: "Gagal memuat detail agenda." };
  }
}

export async function getAgendaFormData({ userId, role }) {
  try {
    let kelasData = null;
    let allKelas = [];

    if (role === "guru walikelas" || role === "guru pendamping") {
      try {
        kelasData = await agendaRepository.findKelasByWalikelas(userId);
      } catch (e) {
        console.log("Tidak ada kelas yang ditugaskan");
      }
    } else if (role === "admin" || role === "ict") {
      allKelas = await agendaRepository.findAllKelas();
    }

    let mapelData = [];
    if (kelasData) {
      const [mapelKhusus, mapelTingkat] = await Promise.all([
        agendaRepository.findMapelKhususKelas(kelasData.id),
        agendaRepository.findMapelByTingkat(String(kelasData.tingkat)),
      ]);

      const combined = [...mapelKhusus, ...mapelTingkat];
      mapelData = Array.from(
        new Map(combined.map((item) => [item.id, item])).values(),
      );
      mapelData.sort((a, b) => a.nama_mapel.localeCompare(b.nama_mapel));
    }

    return {
      kelas: kelasData,
      listKelas: allKelas,
      listMapel: mapelData,
      error: null,
    };
  } catch (error) {
    console.error("Gagal mengambil data:", error);
    return {
      kelas: null,
      listKelas: [],
      listMapel: [],
      error: "Gagal mengambil data.",
    };
  }
}

export async function getAgendaExportRows({ kelasId, startDate, endDate }) {
  try {
    const records = await agendaRepository.findAgendaByRange({
      startDate,
      endDate,
      kelasId,
    });

    return { records, error: null };
  } catch (e) {
    return { records: [], error: "Gagal memuat data agenda untuk export." };
  }
}
