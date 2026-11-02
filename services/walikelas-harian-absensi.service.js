import * as absensiRepository from "@/repositories/walikelas-harian-absensi.repository";

// ---------------------------------------------------------------------------
// Helper tanggal
// ---------------------------------------------------------------------------
const HARI_KEY = [
  "minggu",
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
];

function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}
function isHoliday(date, hariLiburList) {
  if (!hariLiburList || hariLiburList.length === 0) return false;
  const dateStr = toISODate(date);
  const dayKey = HARI_KEY[date.getDay()];
  for (const h of hariLiburList) {
    if (h.tanggal) {
      const liburDateStr = toISODate(new Date(h.tanggal));
      if (liburDateStr === dateStr) return true;
    }
    if (h.hari && h.hari === dayKey) return true;
  }
  return false;
}
function countEffectiveDays(startStr, endStr, hariLiburList) {
  if (!startStr || !endStr) return 0;
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (!isWeekend(cur) && !isHoliday(cur, hariLiburList)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Baca data pendukung
// ---------------------------------------------------------------------------
export async function getHariLibur() {
  try {
    const list = await absensiRepository.findHariLibur();
    return { hariLibur: list, error: null };
  } catch (e) {
    return { hariLibur: [], error: "Gagal memuat hari libur." };
  }
}

export async function resolveWalikelasKelas({ userId, role }) {
  if (role === "guru walikelas" || role === "guru pendamping") {
    try {
      const rec = await absensiRepository.findKelasByWalikelas(userId);
      return { status: "assigned", kelas: rec };
    } catch {
      return { status: "none" };
    }
  }

  try {
    const list = await absensiRepository.findAllKelas();
    return { status: "picker", kelasOptions: list };
  } catch {
    return { status: "error", message: "Gagal memuat daftar kelas." };
  }
}

export async function getSiswaKelas(kelasId) {
  try {
    const list = await absensiRepository.findSiswaByKelas(kelasId);
    return { siswa: list, error: null };
  } catch (e) {
    return { siswa: [], error: "Gagal memuat daftar siswa." };
  }
}

export async function getAbsensiBulan({ kelasId, year, month }) {
  try {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startStr = `${toISODate(first)} 00:00:00`;
    const endStr = `${toISODate(last)} 23:59:59`;

    const records = await absensiRepository.findAbsensiByRange({
      kelasId,
      startStr,
      endStr,
    });

    const grouped = {};
    for (const r of records) {
      const key = toISODate(new Date(r.tanggal));
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    return { monthAbsensi: grouped, error: null };
  } catch (e) {
    return { monthAbsensi: {}, error: "Gagal memuat data absensi bulan ini." };
  }
}

// ---------------------------------------------------------------------------
// Rekap absensi (query + agregasi)
// ---------------------------------------------------------------------------
export async function getRekapAbsensi({
  kelasId,
  rekapStart,
  rekapEnd,
  siswaList,
  hariLiburList,
  todayIso,
}) {
  const totalSiswa = Array.isArray(siswaList) ? siswaList.length : 0;
  const [ty, tm, td] = String(todayIso).split("-").map(Number);
  const today = new Date(ty, tm - 1, td);

  try {
    const startStr = `${rekapStart} 00:00:00`;
    const endStr = `${rekapEnd} 23:59:59`;
    const records = await absensiRepository.findAbsensiByRange({
      kelasId,
      startStr,
      endStr,
    });

    // ---- Total hari kerja (Senin-Jumat, di luar hari libur, sampai hari ini)
    let rekapTotalHariKerja = 0;
    if (rekapStart && rekapEnd) {
      const [sy, sm, sd] = rekapStart.split("-").map(Number);
      const [ey, em, ed] = rekapEnd.split("-").map(Number);
      const rangeStart = new Date(sy, sm - 1, sd);
      const rangeEnd = new Date(ey, em - 1, ed);
      if (rangeEnd >= rangeStart) {
        const cur = new Date(rangeStart);
        while (cur <= rangeEnd) {
          if (!isWeekend(cur) && !isHoliday(cur, hariLiburList) && cur <= today)
            rekapTotalHariKerja++;
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    // ---- Hari kerja yang belum lengkap diabsen
    const incompleteDaysRekap = [];
    if (totalSiswa !== 0 && rekapStart && rekapEnd) {
      const [sy, sm, sd] = rekapStart.split("-").map(Number);
      const [ey, em, ed] = rekapEnd.split("-").map(Number);
      const rangeStart = new Date(sy, sm - 1, sd);
      const rangeEnd = new Date(ey, em - 1, ed);
      if (rangeEnd >= rangeStart) {
        const byDate = {};
        for (const r of records) {
          const key = toISODate(new Date(r.tanggal));
          byDate[key] = (byDate[key] || 0) + 1;
        }

        const cur = new Date(rangeStart);
        while (cur <= rangeEnd) {
          const isOff = isWeekend(cur) || isHoliday(cur, hariLiburList);
          const isFuture = cur > today;
          if (!isOff && !isFuture) {
            const filled = byDate[toISODate(cur)] || 0;
            if (filled < totalSiswa) {
              incompleteDaysRekap.push({ date: new Date(cur), filled });
            }
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    // ---- Rekap per siswa
    const bySiswa = {};
    for (const s of siswaList) {
      bySiswa[s.id] = {
        siswaId: s.id,
        nama: s.nama_siswa,
        nis: s.nis,
        counts: { hadir: 0, izin: 0, sakit: 0, alpha: 0 },
      };
    }
    for (const r of records) {
      if (
        bySiswa[r.siswa_id] &&
        bySiswa[r.siswa_id].counts[r.status] !== undefined
      ) {
        bySiswa[r.siswa_id].counts[r.status]++;
      }
    }

    const totalHariEfektif =
      rekapTotalHariKerja > 0
        ? rekapTotalHariKerja
        : countEffectiveDays(rekapStart, rekapEnd, hariLiburList);

    const list = Object.values(bySiswa).map((s) => {
      const totalTercatat =
        s.counts.hadir + s.counts.izin + s.counts.sakit + s.counts.alpha;
      const denom = totalHariEfektif > 0 ? totalHariEfektif : totalTercatat;
      const persenHadir = denom > 0 ? (s.counts.hadir / denom) * 100 : 0;
      const persenTidakHadir = denom > 0 ? 100 - persenHadir : 0;
      return { ...s, totalTercatat, persenHadir, persenTidakHadir };
    });

    list.sort(
      (a, b) =>
        b.persenHadir - a.persenHadir || b.counts.hadir - a.counts.hadir,
    );

    const rekapPerSiswa = { list, totalHariEfektif };

    // ---- Total kelas
    const totals = { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
    for (const s of rekapPerSiswa.list) {
      totals.hadir += s.counts.hadir;
      totals.izin += s.counts.izin;
      totals.sakit += s.counts.sakit;
      totals.alpha += s.counts.alpha;
    }
    const totalSemua = totals.hadir + totals.izin + totals.sakit + totals.alpha;
    const persenHadir = totalSemua > 0 ? (totals.hadir / totalSemua) * 100 : 0;
    const persenTidakHadir = totalSemua > 0 ? 100 - persenHadir : 0;
    const rekapTotals = {
      ...totals,
      totalSemua,
      persenHadir,
      persenTidakHadir,
    };

    const siswaPalingRajin = rekapPerSiswa.list
      .filter((s) => s.totalTercatat > 0)
      .slice(0, 3);

    return {
      rekapPerSiswa,
      rekapTotals,
      rekapTotalHariKerja,
      incompleteDaysRekap,
      siswaPalingRajin,
      error: null,
    };
  } catch (e) {
    return { error: "Gagal memuat data rekap absensi." };
  }
}
