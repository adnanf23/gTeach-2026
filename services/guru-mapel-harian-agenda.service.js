import * as agendaRepository from "@/repositories/guru-mapel-harian-agenda.repository";

// ---------------------------------------------------------------------------
// Helper murni (dipindah apa adanya dari halaman agenda harian guru mapel)
// ---------------------------------------------------------------------------
function pad(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const JAM_ORDER = [
  "1 dan 2",
  "3 dan 4",
  "5 dan 6",
  "7 dan 8",
  "9 dan 10",
  "11 dan 12",
];

function sortByJam(items) {
  return items.sort((a, b) => {
    const indexA = JAM_ORDER.indexOf(a.jam_mapel);
    const indexB = JAM_ORDER.indexOf(b.jam_mapel);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });
}

// ---------------------------------------------------------------------------
// Ploting guru
// ---------------------------------------------------------------------------
export async function getPlotingGuru({ guruId }) {
  try {
    const records = await agendaRepository.findPlotingByGuruId(guruId);
    return { plotingList: records, error: null };
  } catch (e) {
    return { plotingList: [], error: "Gagal memuat data ploting mengajar." };
  }
}

// ---------------------------------------------------------------------------
// Kelas + jumlah siswa
// ---------------------------------------------------------------------------
export async function getKelasOptions({ plotingList, mapelId }) {
  try {
    const kelasSet = new Map();
    const list = Array.isArray(plotingList) ? plotingList : [];

    for (const r of list) {
      if (r.mapel_id !== mapelId) continue;
      const kelasArr = r.expand?.kelas_id || [];
      for (const k of kelasArr) {
        if (!kelasSet.has(k.id)) kelasSet.set(k.id, k);
      }
    }

    const kelasList = Array.from(kelasSet.values()).sort((a, b) =>
      a.nama_kelas.localeCompare(b.nama_kelas),
    );

    const withCount = await Promise.all(
      kelasList.map(async (k) => {
        try {
          const total = await agendaRepository.countSiswaByKelas(k.id);
          return { ...k, siswaCount: total };
        } catch {
          return { ...k, siswaCount: 0 };
        }
      }),
    );

    return { kelasOptions: withCount, error: null };
  } catch (e) {
    console.error("Error fetching kelas with count:", e);
    return { kelasOptions: [], error: "Gagal memuat data kelas." };
  }
}

// ---------------------------------------------------------------------------
// Agenda per bulan
// ---------------------------------------------------------------------------
export async function getAgendaBulan({
  kelasId,
  mapelId,
  year,
  month,
  semesterMulai,
  semesterAkhir,
}) {
  try {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startStr = `${toISODate(first)} 00:00:00`;
    const endStr = `${toISODate(last)} 23:59:59`;

    const records = await agendaRepository.findAgendaByBulan({
      kelasId,
      mapelId,
      startStr,
      endStr,
      semesterMulai,
      semesterAkhir,
    });

    const grouped = {};
    for (const r of records) {
      const key = toISODate(new Date(r.date));
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    return { monthAgenda: grouped, error: null };
  } catch (e) {
    console.error("Error loading month agenda:", e);
    return { monthAgenda: {}, error: "Gagal memuat data agenda bulan ini." };
  }
}

// ---------------------------------------------------------------------------
// Detail agenda (refresh per item + urut jam pelajaran)
// ---------------------------------------------------------------------------
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

    return { items: sortByJam(refreshedItems), error: null };
  } catch (e) {
    return { items: [], error: "Gagal memuat detail agenda." };
  }
}

export async function getAgendaById({ id }) {
  try {
    const item = await agendaRepository.findAgendaById(id);
    return { item, error: null };
  } catch (e) {
    return { item: null, error: "Gagal memuat detail agenda." };
  }
}

// ---------------------------------------------------------------------------
// Pengecekan bentrok jadwal (dipakai sebelum create/update)
// ---------------------------------------------------------------------------
export async function checkAgendaConflict({
  kelasId,
  mapelId,
  date,
  jamMapel,
  excludeId,
}) {
  try {
    const sameMapel = await agendaRepository.findAgendaByMapelSlot({
      kelasId,
      mapelId,
      date,
      jamMapel,
      excludeId,
    });
    if (sameMapel.length > 0) return { conflict: "mapel", error: null };

    const sameJam = await agendaRepository.findAgendaByJamSlot({
      kelasId,
      date,
      jamMapel,
      excludeId,
    });
    if (sameJam.length > 0) return { conflict: "jam", error: null };

    return { conflict: null, error: null };
  } catch (e) {
    console.error("Error checking agenda conflict:", e);
    return { conflict: null, error: "Gagal memeriksa jadwal agenda." };
  }
}
