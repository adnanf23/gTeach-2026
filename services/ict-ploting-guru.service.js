import { describeError } from "@/lib/app-error";
import * as ictPlotingGuruRepository from "@/repositories/ict-ploting-guru.repository";

// Role guru yang ikut diploting (disalin apa adanya dari halaman ploting-guru).
const GURU_ROLES = ["guru walikelas", "guru pendamping", "guru mapel"];

// ---------------------------------------------------------------------------
// Helper murni (tanpa I/O)
// ---------------------------------------------------------------------------

// Filter PocketBase untuk semua role guru (digabung dengan OR).
export function buildGuruFilter() {
  return GURU_ROLES.map((r) => `role="${r}"`).join(" || ");
}

// Kelas yang eligible untuk sebuah mapel: kelas spesifik kalau ada,
// kalau tidak semua kelas pada tingkat target. Disalin apa adanya dari halaman
// supaya perhitungan "perlu sinkron" tetap identik.
export function eligibleKelasForMapel(mapel, kelasList) {
  if (!mapel) return [];
  const specificIds = mapel.spesifik_kelas_id || [];
  if (specificIds.length > 0) {
    return kelasList.filter((k) => specificIds.includes(k.id));
  }
  const targetTingkat = (mapel.target_tingkat || []).map((t) => String(t));
  return kelasList.filter((k) => targetTingkat.includes(String(k.tingkat)));
}

// Id ploting yang daftar kelasnya sudah tidak cocok lagi dengan data mapel.
export function computeOutOfSyncIds(plotingList, mapelList, kelasList) {
  const mapelById = Object.fromEntries(mapelList.map((m) => [m.id, m]));
  const set = new Set();
  for (const r of plotingList) {
    const current = eligibleKelasForMapel(mapelById[r.mapel_id], kelasList).map(
      (k) => k.id,
    );
    const saved = r.kelas_id || [];
    if (saved.length !== current.length || saved.some((kid) => !current.includes(kid))) {
      set.add(r.id);
    }
  }
  return [...set];
}

// Banyak guru unik yang sudah punya ploting.
export function countGuruTerploting(plotingList) {
  return new Set(plotingList.map((r) => r.guru_id)).size;
}

// ---------------------------------------------------------------------------
// Baca data halaman ICT > Manajemen Utama > Ploting Guru:
// daftar guru + mata pelajaran + kelas + ploting + turunannya
// (perlu sinkron, jumlah guru terploting).
// ---------------------------------------------------------------------------
export async function getIctPlotingGuru() {
  try {
    const [guruList, mapelList, kelasList, plotingList] = await Promise.all([
      ictPlotingGuruRepository.findGuruByFilter(buildGuruFilter()),
      ictPlotingGuruRepository.findMapel(),
      ictPlotingGuruRepository.findKelas(),
      ictPlotingGuruRepository.findPlotingGuru(),
    ]);

    return {
      guruList,
      mapelList,
      kelasList,
      plotingList,
      outOfSyncIds: computeOutOfSyncIds(plotingList, mapelList, kelasList),
      guruTerplotingCount: countGuruTerploting(plotingList),
      error: null,
    };
  } catch (error) {
    console.error(error);
    return {
      guruList: [],
      mapelList: [],
      kelasList: [],
      plotingList: [],
      outOfSyncIds: [],
      guruTerplotingCount: 0,
      error: describeError(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Data terkait satu ploting (lingkup materi, nilai ujian, dan nilai harian di
// dalam lingkup materi) — dipakai untuk mengunci ganti guru/mapel dan untuk
// menghitung dampak cascade delete.
// ---------------------------------------------------------------------------
export async function getIctPlotingGuruUsage(plotingId) {
  try {
    const [lingkupMateri, nilaiUjian] = await Promise.all([
      ictPlotingGuruRepository.findLingkupMateriByPlotingId(plotingId),
      ictPlotingGuruRepository.findNilaiUjianByPlotingId(plotingId),
    ]);

    const lingkupIds = lingkupMateri.map((l) => l.id);

    let nilaiHarianCount = 0;
    if (lingkupIds.length > 0) {
      const nilaiHarian =
        await ictPlotingGuruRepository.findNilaiHarianByLingkupIds(lingkupIds);
      nilaiHarianCount = nilaiHarian.length;
    }

    return {
      lingkupIds,
      lingkupCount: lingkupIds.length,
      nilaiUjianIds: nilaiUjian.map((n) => n.id),
      nilaiUjianCount: nilaiUjian.length,
      nilaiHarianCount,
      error: null,
    };
  } catch (error) {
    console.error(error);
    return {
      lingkupIds: [],
      lingkupCount: 0,
      nilaiUjianIds: [],
      nilaiUjianCount: 0,
      nilaiHarianCount: 0,
      error: describeError(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Id nilai harian milik sekumpulan lingkup materi — dipakai sebelum cascade
// delete supaya daftar id yang dihapus selalu diambil ulang saat aksi dijalankan.
// ---------------------------------------------------------------------------
export async function getIctNilaiHarianIdsByLingkup(lingkupIds) {
  try {
    const nilaiHarian =
      await ictPlotingGuruRepository.findNilaiHarianByLingkupIds(lingkupIds);
    return { ids: nilaiHarian.map((n) => n.id), error: null };
  } catch (error) {
    console.error(error);
    return { ids: [], error: describeError(error) };
  }
}
