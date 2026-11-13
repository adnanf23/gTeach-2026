"use server";

import {
  findAllKelasLengkap,
  findAllGuru,
  findAllSiswaRingkas,
  findAllHariLibur,
  findAllAbsensi,
  findAllNilaiFormatif,
} from "@/repositories/ai-analysis.repository";

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
const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const pad = (n) => String(n).padStart(2, "0");
const toISODate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const first = (v) => (Array.isArray(v) ? v[0] : v);

function isHoliday(date, hariLibur) {
  const dateStr = toISODate(date);
  const dayKey = HARI_KEY[date.getDay()];
  return hariLibur.some(
    (h) =>
      (h.tanggal && toISODate(new Date(h.tanggal)) === dateStr) ||
      (h.hari && h.hari === dayKey),
  );
}

function countEffectiveDays(start, end, hariLibur) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6 && !isHoliday(cur, hariLibur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

// ---------------------------------------------------------------------------
// Laporan bulanan
// ---------------------------------------------------------------------------
export async function fetchAiAnalysis({ bulan, tahun } = {}) {
  try {
    const now = new Date();
    const year = tahun ?? now.getFullYear();
    const month = bulan ?? now.getMonth(); // 0-11

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const upTo = monthEnd > now ? now : monthEnd; // bulan berjalan: sampai hari ini

    const [kelasList, guruList, siswaList, hariLibur, absensi, formatifList] =
      await Promise.all([
        findAllKelasLengkap(),
        findAllGuru(),
        findAllSiswaRingkas(),
        findAllHariLibur().catch(() => []),
        findAllAbsensi({
          startStr: `${toISODate(monthStart)} 00:00:00`,
          endStr: `${toISODate(monthEnd)} 23:59:59`,
        }),
        findAllNilaiFormatif(),
      ]);

    const hariEfektif = countEffectiveDays(monthStart, upTo, hariLibur);

    // --- Lookup ---------------------------------------------------------
    const guruMap = Object.fromEntries(guruList.map((g) => [g.id, g]));
    const kelasMap = Object.fromEntries(kelasList.map((k) => [k.id, k]));

    const siswaPerKelas = {};
    const siswaMap = {};
    siswaList.forEach((s) => {
      siswaMap[s.id] = s;
      const kid = first(s.kelas_id);
      if (kid) siswaPerKelas[kid] = (siswaPerKelas[kid] || 0) + 1;
    });

    // --- Rekap absensi per kelas ---------------------------------------
    const rekap = {};
    kelasList.forEach((k) => {
      rekap[k.id] = { hadir: 0, total: 0, tanggalTerisi: new Set() };
    });
    absensi.forEach((a) => {
      const r = rekap[first(a.kelas_id)];
      if (!r) return;
      r.total += 1;
      if (a.status === "hadir") r.hadir += 1;
      r.tanggalTerisi.add(String(a.tanggal).slice(0, 10));
    });

    const kelasRows = kelasList
      .filter((k) => (siswaPerKelas[k.id] || 0) > 0)
      .map((k) => {
        const r = rekap[k.id];
        const totalSiswa = siswaPerKelas[k.id];
        const guru =
          guruMap[first(k.walikelas_id)] || guruMap[first(k.pendamping_id)];
        return {
          id: k.id,
          nama: k.nama_kelas,
          tingkat: k.tingkat,
          walikelas: guru?.nama_lengkap || guru?.username || "-",
          totalSiswa,
          hadir: r.hadir,
          persenHadir: pct(r.hadir, hariEfektif * totalSiswa),
          hariTerisi: r.tanggalTerisi.size,
          persenKonsistensi: pct(
            Math.min(r.tanggalTerisi.size, hariEfektif),
            hariEfektif,
          ),
        };
      });

    const kehadiranRanking = [...kelasRows].sort(
      (a, b) => b.persenHadir - a.persenHadir,
    );
    const guruRanking = [...kelasRows].sort(
      (a, b) =>
        b.persenKonsistensi - a.persenKonsistensi ||
        b.hariTerisi - a.hariTerisi,
    );

    // --- Ringkasan umum --------------------------------------------------
    const totalSiswa = kelasRows.reduce((s, k) => s + k.totalSiswa, 0);
    const totalHadir = kelasRows.reduce((s, k) => s + k.hadir, 0);
    const rataKehadiran = pct(totalHadir, hariEfektif * totalSiswa);

    // --- Siswa nilai tertinggi per tingkat (formatif) --------------------
    const skor = {};
    formatifList.forEach((rec) => {
      const vals = [rec.k1, rec.k2, rec.k3, rec.k4].filter(
        (v) => typeof v === "number" && !isNaN(v) && v !== -1,
      );
      if (!vals.length) return;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (!skor[rec.siswa_id])
        skor[rec.siswa_id] = {
          total: 0,
          count: 0,
          kelas_id: first(rec.kelas_id),
        };
      skor[rec.siswa_id].total += avg;
      skor[rec.siswa_id].count += 1;
    });

    const bestPerTingkat = {};
    Object.entries(skor).forEach(([siswaId, v]) => {
      const siswa = siswaMap[siswaId];
      const kelas = kelasMap[first(siswa?.kelas_id) || v.kelas_id];
      if (!siswa || !kelas) return;
      const avg = v.total / v.count;
      const cur = bestPerTingkat[kelas.tingkat];
      if (!cur || avg > cur.rata) {
        bestPerTingkat[kelas.tingkat] = {
          tingkat: kelas.tingkat,
          nama: siswa.nama_siswa,
          kelas: kelas.nama_kelas,
          rata: Math.round(avg * 10) / 10,
        };
      }
    });
    const siswaTerbaik = Object.values(bestPerTingkat).sort(
      (a, b) => Number(a.tingkat) - Number(b.tingkat),
    );

    // --- Catatan otomatis --------------------------------------------------
    const best = kehadiranRanking[0];
    const worst = kehadiranRanking[kehadiranRanking.length - 1];
    const guruTop = guruRanking[0];
    const guruLow = guruRanking[guruRanking.length - 1];
    const catatan = [];
    if (best)
      catatan.push(
        `Kehadiran tertinggi dicapai ${best.nama} (${best.persenHadir}%), sedangkan rata-rata sekolah ${rataKehadiran}%.`,
      );
    if (worst && worst.id !== best?.id)
      catatan.push(
        `${worst.nama} memiliki kehadiran terendah (${worst.persenHadir}%) dan perlu mendapat perhatian.`,
      );
    if (guruTop)
      catatan.push(
        `${guruTop.walikelas} (${guruTop.nama}) paling konsisten mengisi absensi: ${guruTop.hariTerisi} dari ${hariEfektif} hari efektif.`,
      );
    if (
      guruLow &&
      guruLow.id !== guruTop?.id &&
      guruLow.persenKonsistensi < 100
    )
      catatan.push(
        `${guruLow.walikelas} (${guruLow.nama}) baru mengisi absensi ${guruLow.hariTerisi} dari ${hariEfektif} hari efektif.`,
      );

    return {
      periode: `${BULAN[month]} ${year}`,
      dibuatPada: now.toISOString(),
      ringkasan: {
        totalKelas: kelasRows.length,
        totalSiswa,
        hariEfektif,
        rataKehadiran,
      },
      kehadiranKelas: kehadiranRanking,
      konsistensiGuru: guruRanking,
      siswaTerbaik,
      catatan,
    };
  } catch (err) {
    console.error("fetchAiAnalysis error:", err);
    return { error: "Gagal menyusun laporan bulanan." };
  }
}
