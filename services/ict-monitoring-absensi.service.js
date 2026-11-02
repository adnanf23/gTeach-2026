import { describeError } from "@/lib/app-error";
import * as absensiRepository from "@/repositories/ict-monitoring-absensi.repository";

// ---------------------------------------------------------------------------
// Helper tanggal & sistem absensi (dipindah apa adanya dari halaman)
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
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}
function parseISODate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
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
  const start = parseISODate(startStr);
  const end = parseISODate(endStr);
  if (!start || !end || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (!isWeekend(cur) && !isHoliday(cur, hariLiburList)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
function todayStr() {
  return toISODate(new Date());
}
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

// Rekap statistik kehadiran per kelas (30 hari × jumlah siswa sebagai denom).
function buildStatistikKelas({
  records,
  kelasList,
  siswaCountPerKelas,
  hariEfektif30,
}) {
  if (hariEfektif30 === 0) return [];

  const map = new Map();
  for (const a of records) {
    const kid = firstOf(a.kelas_id);
    if (!kid) continue;
    if (!map.has(kid)) map.set(kid, { hadir: 0 });
    const entry = map.get(kid);
    if (a.status === "hadir") entry.hadir += 1;
  }

  const result = [];
  for (const k of kelasList) {
    const jumlahSiswa = siswaCountPerKelas[k.id] || 0;
    if (jumlahSiswa === 0) continue;
    const entry = map.get(k.id) || { hadir: 0 };
    const denom = hariEfektif30 * jumlahSiswa;
    result.push({
      kelas: k,
      rate: denom > 0 ? (entry.hadir / denom) * 100 : 0,
      total: denom,
      hadir: entry.hadir,
    });
  }
  result.sort((a, b) => b.rate - a.rate);
  return result;
}

// ---------------------------------------------------------------------------
// Data dasar halaman: kelas, siswa (dikelompokkan per kelas), hari libur,
// jumlah siswa, dan hari efektif 30 hari terakhir.
// ---------------------------------------------------------------------------
export async function getBaseData() {
  try {
    const [kelasList, siswaList, hariLiburList] = await Promise.all([
      absensiRepository.findKelas(),
      absensiRepository.findSiswa(),
      absensiRepository.findHariLibur().catch(() => []),
    ]);

    const siswaPerKelas = {};
    for (const s of siswaList) {
      const kid = firstOf(s.kelas_id);
      if (!kid) continue;
      if (!siswaPerKelas[kid]) siswaPerKelas[kid] = [];
      siswaPerKelas[kid].push(s);
    }

    // Jumlah siswa per kelas (versi ringkas, dipakai untuk agregasi lewat
    // server action tanpa mengirim seluruh data siswa).
    const siswaCountPerKelas = {};
    for (const kid of Object.keys(siswaPerKelas)) {
      siswaCountPerKelas[kid] = siswaPerKelas[kid].length;
    }

    const hariEfektif30 = countEffectiveDays(
      daysAgoStr(30),
      todayStr(),
      hariLiburList,
    );

    return {
      kelasList,
      siswaPerKelas,
      siswaCountPerKelas,
      hariLiburList,
      totalSiswa: siswaList.length,
      hariEfektif30,
      error: null,
    };
  } catch (error) {
    console.error(error);
    return {
      kelasList: [],
      siswaPerKelas: {},
      siswaCountPerKelas: {},
      hariLiburList: [],
      totalSiswa: 0,
      hariEfektif30: 0,
      error:
        "Gagal memuat data. Pastikan PocketBase berjalan dan kamu sudah login.",
    };
  }
}

// ---------------------------------------------------------------------------
// Agregasi 30 hari terakhir: statistik kehadiran per kelas siap tampil.
// ---------------------------------------------------------------------------
export async function getAbsensiRange({
  kelasList,
  siswaCountPerKelas,
  hariEfektif30,
}) {
  try {
    const records = await absensiRepository.findAbsensiByRange({
      startStr: `${daysAgoStr(30)} 00:00:00`,
      endStr: `${todayStr()} 23:59:59`,
      sort: "-tanggal",
    });

    const statistikKelas = buildStatistikKelas({
      records,
      kelasList,
      siswaCountPerKelas,
      hariEfektif30,
    });

    return { statistikKelas, error: null };
  } catch (error) {
    console.error(error);
    return { statistikKelas: [], error: describeError(error) };
  }
}

// ---------------------------------------------------------------------------
// Agregasi satu tanggal: absensi dikelompokkan per kelas + daftar kelas yang
// absensinya sudah lengkap pada tanggal tersebut.
// ---------------------------------------------------------------------------
export async function getAbsensiTanggal({
  dateStr,
  kelasList,
  siswaCountPerKelas,
}) {
  try {
    const records = await absensiRepository.findAbsensiByDate({ dateStr });

    const absensiPerKelas = {};
    const recordsPerKelas = new Map();
    for (const a of records) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      if (!absensiPerKelas[kid]) absensiPerKelas[kid] = [];
      absensiPerKelas[kid].push(a);
      recordsPerKelas.set(kid, (recordsPerKelas.get(kid) || 0) + 1);
    }

    const kelasLengkapIds = [];
    for (const k of kelasList) {
      const jumlahSiswa = siswaCountPerKelas[k.id] || 0;
      if (jumlahSiswa > 0 && (recordsPerKelas.get(k.id) || 0) >= jumlahSiswa) {
        kelasLengkapIds.push(k.id);
      }
    }

    return { absensiPerKelas, kelasLengkapIds, error: null };
  } catch (error) {
    console.error(error);
    return {
      absensiPerKelas: {},
      kelasLengkapIds: [],
      error: describeError(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Baca absensi untuk export (rentang tanggal + filter kelas opsional).
// ---------------------------------------------------------------------------
export async function getAbsensiExport({ kelasId, startDate, endDate }) {
  try {
    const records = await absensiRepository.findAbsensiByRange({
      kelasId: kelasId === "semua" ? null : kelasId,
      startStr: `${startDate} 00:00:00`,
      endStr: `${endDate} 23:59:59`,
    });

    return { records, error: null };
  } catch (error) {
    console.error(error);
    return { records: [], error: describeError(error) };
  }
}
