import * as walikelasRepository from "@/repositories/walikelas.repository";

// ---------------------------------------------------------------------------
// Helper tanggal (dipindah apa adanya dari halaman walikelas)
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
const HARI_SINGKAT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
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
function dayRangeISO(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    start: `${toISODate(d)} 00:00:00`,
    end: `${toISODate(d)} 23:59:59`,
  };
}
function monthRangeISO(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: `${toISODate(start)} 00:00:00`,
    end: `${toISODate(end)} 23:59:59`,
  };
}
function weekBuckets(base) {
  const days = [];
  const now = base;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = toISODate(d);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    days.push({
      key,
      label: HARI_SINGKAT[d.getDay()],
      dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
      start: `${key} 00:00:00`,
      end: `${toISODate(next)} 00:00:00`,
    });
  }
  return days;
}
function monthBuckets(base) {
  const now = base;
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 1; i <= lastDay; i++) {
    const d = new Date(year, month, i);
    const key = toISODate(d);
    const next = new Date(year, month, i + 1);
    days.push({
      key,
      label: String(i),
      dateLabel: BULAN[month].slice(0, 3),
      start: `${key} 00:00:00`,
      end: `${toISODate(next)} 00:00:00`,
    });
  }
  return days;
}
function average(arr) {
  const nums = arr.filter(
    (v) => typeof v === "number" && !isNaN(v) && v !== -1,
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ---------------------------------------------------------------------------
// Agregasi leger (dipindah apa adanya dari halaman)
// ---------------------------------------------------------------------------
async function buildLegerSiswaStats({ kelasData, siswaData, absensiData }) {
  const [mapelKhusus, mapelTingkat, presentaseData, ujianData, nfData, nsData] =
    await Promise.all([
      walikelasRepository.findMapelSpesifikKelas(kelasData.id),
      walikelasRepository.findMapelByTingkat(String(kelasData.tingkat)),
      walikelasRepository.findPresentasePenilaian(),
      walikelasRepository.findPengaturanUjianBuka(
        kelasData.id,
        String(kelasData.tingkat),
      ),
      walikelasRepository.findNilaiFormatifByKelas(kelasData.id),
      walikelasRepository.findNilaiSumatifByKelas(kelasData.id),
    ]);

  const combined = [...mapelKhusus, ...mapelTingkat];
  const uniqueMapelRaw = Array.from(
    new Map(combined.map((m) => [m.id, m])).values(),
  );
  const uniqueMapel = uniqueMapelRaw.filter((m) => {
    if ((m.kategori || "").toLowerCase() !== "umum") return false;
    const spesifik = m.spesifik_kelas_id;
    const punyaRestriksi = Array.isArray(spesifik) && spesifik.length > 0;
    if (!punyaRestriksi) return true;
    return spesifik.includes(kelasData.id);
  });

  const mapelByName = new Map();
  uniqueMapel.forEach((m) => {
    const key = (m.nama_mapel || m.nama || "").trim();
    if (!mapelByName.has(key)) mapelByName.set(key, m);
  });
  const sortedMapel = Array.from(mapelByName.values());

  if (sortedMapel.length === 0 || siswaData.length === 0) {
    return { listRata: [] };
  }

  function getBobot(nama) {
    const found = presentaseData.find(
      (p) =>
        (p.nama_presentase || "").trim().toLowerCase() === nama.toLowerCase(),
    );
    return found ? Number(found.angka_presentase) || 0 : 0;
  }
  const bobotFormatif = getBobot("Formatif");
  const bobotSumatif = getBobot("Sumatif");
  const bobotUts = getBobot("UTS");
  const bobotUas = getBobot("UAS");
  const bobotKehadiran = getBobot("Kehadiran");

  const kehadiranMap = {};
  siswaData.forEach((s) => {
    const records = absensiData.filter((a) => a.siswa_id === s.id);
    if (records.length === 0) {
      kehadiranMap[s.id] = null;
      return;
    }
    const hadir = records.filter((a) => a.status === "hadir").length;
    kehadiranMap[s.id] = (hadir / records.length) * 100;
  });

  const utsIds = ujianData
    .filter((u) => u.jenis_ujian === "ahb")
    .map((u) => u.id);
  const uasIds = ujianData
    .filter((u) => u.jenis_ujian === "asas")
    .map((u) => u.id);

  const mapelFilter = sortedMapel
    .map((m) => `mapel_id ~ "${m.id}"`)
    .join(" || ");
  // Hanya siswa kelas ini yang dipakai (siswaData), jadi batasi filter agar
  // tidak menarik nilai ujian seluruh sekolah.
  const siswaFilter = siswaData
    .map((s) => `siswa_id = "${s.id}"`)
    .join(" || ");
  const [nilaiUjianData, tpAll, lpAll] = await Promise.all([
    ujianData.length > 0
      ? walikelasRepository.findNilaiUjianByFilter(
          `(${ujianData
            .map((u) => `pengaturan_ujian_id = "${u.id}"`)
            .join(" || ")}) && (${siswaFilter})`,
        )
      : Promise.resolve([]),
    walikelasRepository.findTujuanPembelajaranByFilter(mapelFilter),
    walikelasRepository.findLingkupMateriByFilter(mapelFilter),
  ]);
  const ujianMap = {};
  nilaiUjianData.forEach((n) => {
    if (!ujianMap[n.pengaturan_ujian_id]) ujianMap[n.pengaturan_ujian_id] = {};
    ujianMap[n.pengaturan_ujian_id][n.siswa_id] = n.nilai;
  });
  function avgUjian(ids, siswaId) {
    const vals = ids
      .map((uid) => ujianMap[uid]?.[siswaId])
      .filter((v) => typeof v === "number" && !isNaN(v) && v !== -1);
    return average(vals);
  }
  const utsAvgMap = {};
  const uasAvgMap = {};
  siswaData.forEach((s) => {
    utsAvgMap[s.id] = avgUjian(utsIds, s.id);
    uasAvgMap[s.id] = avgUjian(uasIds, s.id);
  });

  const tpToMapel = {};
  tpAll.forEach((tp) => {
    tpToMapel[tp.id] = tp.mapel_id;
  });
  const lpToMapel = {};
  lpAll.forEach((lp) => {
    lpToMapel[lp.id] = lp.mapel_id;
  });

  const formatifValues = {};
  nfData.forEach((n) => {
    const mapelId = tpToMapel[n.tp_id];
    if (!mapelId) return;
    if (!formatifValues[mapelId]) formatifValues[mapelId] = {};
    if (!formatifValues[mapelId][n.siswa_id])
      formatifValues[mapelId][n.siswa_id] = [];
    ["k1", "k2", "k3", "k4"].forEach((k) => {
      const val = n[k];
      if (typeof val === "number" && !isNaN(val) && val !== -1) {
        formatifValues[mapelId][n.siswa_id].push(val);
      }
    });
  });

  const sumatifValues = {};
  nsData.forEach((n) => {
    const mapelId = lpToMapel[n.lm_id];
    if (!mapelId) return;
    if (!sumatifValues[mapelId]) sumatifValues[mapelId] = {};
    if (!sumatifValues[mapelId][n.siswa_id])
      sumatifValues[mapelId][n.siswa_id] = [];
    if (typeof n.nilai === "number" && !isNaN(n.nilai) && n.nilai !== -1) {
      sumatifValues[mapelId][n.siswa_id].push(n.nilai);
    }
  });

  const nilaiAkhirMap = {};
  sortedMapel.forEach((m) => {
    nilaiAkhirMap[m.id] = {};
    siswaData.forEach((s) => {
      const formatifAvg = average(formatifValues[m.id]?.[s.id] || []);
      const sumatifAvg = average(sumatifValues[m.id]?.[s.id] || []);
      const utsVal = utsAvgMap[s.id];
      const uasVal = uasAvgMap[s.id];
      const kehadiranVal = kehadiranMap[s.id];

      const otherComponents = [
        { value: formatifAvg, bobot: bobotFormatif },
        { value: sumatifAvg, bobot: bobotSumatif },
        { value: utsVal, bobot: bobotUts },
        { value: uasVal, bobot: bobotUas },
      ].filter(
        (k) =>
          k.value !== null &&
          k.value !== undefined &&
          !isNaN(k.value) &&
          k.bobot > 0,
      );

      let komponen = [...otherComponents];
      if (otherComponents.length > 0) {
        if (
          kehadiranVal !== null &&
          kehadiranVal !== undefined &&
          !isNaN(kehadiranVal) &&
          bobotKehadiran > 0
        ) {
          komponen.push({ value: kehadiranVal, bobot: bobotKehadiran });
        }
      }

      const totalBobot = komponen.reduce((a, k) => a + k.bobot, 0);
      if (totalBobot === 0) {
        nilaiAkhirMap[m.id][s.id] = null;
        return;
      }
      const weightedSum = komponen.reduce((a, k) => a + k.value * k.bobot, 0);
      nilaiAkhirMap[m.id][s.id] = weightedSum / totalBobot;
    });
  });

  const listRataPerSiswa = siswaData
    .map((s) => {
      const vals = sortedMapel
        .map((m) => nilaiAkhirMap[m.id][s.id])
        .filter((v) => typeof v === "number" && !isNaN(v));
      const rataRata = vals.length
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : null;
      return {
        siswa: s,
        rataRata,
        jumlahMapel: vals.length,
      };
    })
    .filter((r) => r.rataRata !== null);

  return { listRata: listRataPerSiswa };
}

// ---------------------------------------------------------------------------
// Dashboard walikelas
// ---------------------------------------------------------------------------

// getFullList mengambil 1000 baris per request secara BERURUTAN, sehingga satu
// query berisi puluhan ribu baris butuh puluhan request berurutan. Untuk rentang
// besar, rentang tanggal dipecah menjadi beberapa sub-rentang yang dijalankan
// PARALEL. Gabungan hasilnya identik dengan filter asli.
async function absensiRangeParallel({
  baseFilter,
  startStr,
  endStr,
  fields,
  parts = 8,
}) {
  const dayMs = 86400000;
  const start = new Date(`${String(startStr).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(endStr).slice(0, 10)}T00:00:00`);
  const totalDays = Math.max(1, Math.ceil((end - start) / dayMs));
  const per = Math.max(1, Math.ceil(totalDays / parts));

  const jobs = [];
  for (let i = 0; i < parts; i++) {
    const cs = new Date(start.getTime() + i * per * dayMs);
    if (cs >= end) break;
    const ce = new Date(Math.min(cs.getTime() + per * dayMs, end.getTime()));
    jobs.push(
      walikelasRepository.findAbsensiByFilter({
        filter: `${baseFilter} && tanggal>="${toISODate(cs)} 00:00:00" && tanggal<"${toISODate(ce)} 00:00:00"`,
        fields,
      }),
    );
  }

  const results = await Promise.all(jobs);
  return results.flat();
}

export async function getWalikelasDashboard({ userId, todayIso }) {
  const [ty, tm, td] = String(todayIso).split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const todayStr = toISODate(today);
  const tomorrowStr = toISODate(new Date(ty, tm - 1, td + 1));

  const { start: todayStart, end: todayEnd } = dayRangeISO(today);
  const { start: monthStart, end: monthEnd } = monthRangeISO(today);

  const [kelasSaya, hariLibur] = await Promise.all([
    walikelasRepository
      .findKelasByWaliOrPendamping(userId)
      .catch(() => null),
    walikelasRepository.findHariLibur().catch(() => []),
  ]);

  if (!kelasSaya) {
    return { found: false, hariLiburList: hariLibur };
  }

  const kelasId = kelasSaya.id;

  const weekly = weekBuckets(today);
  const monthly = monthBuckets(today);
  const rangeStart =
    weekly[0].start < monthly[0].start ? weekly[0].start : monthly[0].start;
  const rangeEnd =
    weekly[weekly.length - 1].end > monthly[monthly.length - 1].end
      ? weekly[weekly.length - 1].end
      : monthly[monthly.length - 1].end;

  const [
    siswaKelasSaya,
    absensiToday,
    agendaToday,
    absensiBulanIni,
    semuaKelas,
    semuaSiswa,
    absensiRangeHadir,
    absensiAllKelas,
    taOne,
    taAktif,
  ] = await Promise.all([
    walikelasRepository.findSiswaByKelas(kelasId),
    walikelasRepository.findAbsensiByFilter({
      filter: `kelas_id="${kelasId}" && tanggal>="${todayStart}" && tanggal<="${todayEnd}"`,
      fields: "id,siswa_id,kelas_id,status,tanggal",
    }),
    walikelasRepository.findAgendaByFilter({
      filter: `kelas_id="${kelasId}" && date>="${todayStart}" && date<="${todayEnd}"`,
    }),
    walikelasRepository.findAbsensiByFilter({
      filter: `kelas_id="${kelasId}" && tanggal>="${monthStart}" && tanggal<="${monthEnd}"`,
      fields: "id,siswa_id,kelas_id,status,tanggal",
    }),
    walikelasRepository.findKelasRingkas(),
    walikelasRepository.findSiswaRingkas(),
    absensiRangeParallel({
      baseFilter: 'status = "hadir"',
      startStr: rangeStart,
      endStr: rangeEnd,
      fields: "id,kelas_id,status,tanggal",
    }),
    absensiRangeParallel({
      baseFilter: `kelas_id ~ "${kelasId}"`,
      startStr: "2000-01-01",
      endStr: tomorrowStr,
      fields: "id,siswa_id,status,tanggal",
    }).catch(() => []),
    kelasSaya.tahun_ajaran_id
      ? walikelasRepository
          .findTahunAjaranById(kelasSaya.tahun_ajaran_id)
          .catch(() => null)
      : Promise.resolve(null),
    walikelasRepository.findTahunAjaranAktif().catch(() => []),
  ]);

  // Data range (hadir saja) dipakai untuk trend; rekap bulanan (semua kelas)
  // hanya menghitung "hadir", jadi cukup diturunkan dari data yang sama.
  const absensiRange = absensiRangeHadir;
  const absensiSemuaKelas = absensiRangeHadir.filter(
    (a) => a.tanggal >= monthStart && a.tanggal <= monthEnd,
  );

  // Periode dari tahun ajaran
  let periodeMulaiStr = toISODate(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  let label = "bulan ini";
  try {
    const ta = taOne || taAktif[0] || null;
    if (ta?.Mulai) {
      periodeMulaiStr = toISODate(new Date(ta.Mulai));
      const parts = [];
      if (ta.tahun) parts.push(`TA ${ta.tahun}`);
      if (ta.semester) parts.push(`Semester ${ta.semester}`);
      label = parts.join(" · ") || "periode berjalan";
    }
  } catch (e) {
    console.warn("Gagal ambil tahun_ajaran:", e);
  }

  const absensiPeriode = await absensiRangeParallel({
    baseFilter: `kelas_id="${kelasId}"`,
    startStr: `${periodeMulaiStr} 00:00:00`,
    endStr: tomorrowStr,
    fields: "id,siswa_id,kelas_id,status,tanggal",
  });

  const monthStartStr = toISODate(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const hariEfektifBulanIni = countEffectiveDays(
    monthStartStr,
    todayStr,
    hariLibur,
  );

  const absensiPeriodeByDate = {};
  for (const a of absensiPeriode) {
    const key = toISODate(new Date(a.tanggal));
    absensiPeriodeByDate[key] = (absensiPeriodeByDate[key] || 0) + 1;
  }

  const incomplete = [];
  let totalKerja = 0;
  const [psy, psm, psd] = periodeMulaiStr.split("-").map(Number);
  const [ey, em, ed] = todayStr.split("-").map(Number);
  const cursor = new Date(psy, psm - 1, psd);
  const endCursor = new Date(ey, em - 1, ed);
  while (cursor <= endCursor) {
    if (!isWeekend(cursor) && !isHoliday(cursor, hariLibur)) {
      totalKerja += 1;
      const key = toISODate(cursor);
      const filled = absensiPeriodeByDate[key] || 0;
      if (filled < siswaKelasSaya.length) {
        incomplete.push({ date: toISODate(cursor), filled });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Ranking siswa
  const rekapPerSiswa = {};
  siswaKelasSaya.forEach((s) => {
    rekapPerSiswa[s.id] = { siswa: s, hadir: 0, total: 0 };
  });
  absensiBulanIni.forEach((a) => {
    if (!rekapPerSiswa[a.siswa_id]) return;
    rekapPerSiswa[a.siswa_id].total += 1;
    if (a.status === "hadir") rekapPerSiswa[a.siswa_id].hadir += 1;
  });
  const denomSiswa = hariEfektifBulanIni > 0 ? hariEfektifBulanIni : 1;
  const rankingSiswa = Object.values(rekapPerSiswa)
    .map((r) => ({
      ...r,
      persen:
        hariEfektifBulanIni > 0
          ? Math.round((r.hadir / denomSiswa) * 100)
          : 0,
    }))
    .sort((a, b) => b.persen - a.persen || b.hadir - a.hadir);

  // Ranking kelas
  const jumlahSiswaPerKelas = {};
  semuaSiswa.forEach((s) => {
    const kid = Array.isArray(s.kelas_id) ? s.kelas_id[0] : s.kelas_id;
    if (!kid) return;
    jumlahSiswaPerKelas[kid] = (jumlahSiswaPerKelas[kid] || 0) + 1;
  });

  const rekapPerKelas = {};
  semuaKelas.forEach((k) => {
    rekapPerKelas[k.id] = {
      kelas: k,
      hadir: 0,
      totalSiswa: jumlahSiswaPerKelas[k.id] || 0,
    };
  });
  absensiSemuaKelas.forEach((a) => {
    const kid = Array.isArray(a.kelas_id) ? a.kelas_id[0] : a.kelas_id;
    if (!rekapPerKelas[kid]) return;
    if (a.status === "hadir") rekapPerKelas[kid].hadir += 1;
  });

  const rankingKelas = Object.values(rekapPerKelas)
    .map((r) => {
      const denom = hariEfektifBulanIni * r.totalSiswa;
      return {
        ...r,
        persen: denom > 0 ? Math.round((r.hadir / denom) * 100) : 0,
      };
    })
    .sort((a, b) => b.persen - a.persen);

  const idx = rankingKelas.findIndex((r) => r.kelas.id === kelasId);
  const posisiKelasSaya = idx >= 0 ? idx + 1 : null;

  // Trend (weekly/monthly/absensiRange sudah disiapkan di ronde awal)
  const jumlahKelasAktif =
    Object.values(jumlahSiswaPerKelas).filter((v) => v > 0).length || 1;

  const hadirPerTanggalKelas = {};
  absensiRange.forEach((a) => {
    if (a.status !== "hadir") return;
    const key = (a.tanggal || "").slice(0, 10);
    const kid = Array.isArray(a.kelas_id) ? a.kelas_id[0] : a.kelas_id;
    if (!key || !kid) return;
    if (!hadirPerTanggalKelas[key]) hadirPerTanggalKelas[key] = {};
    hadirPerTanggalKelas[key][kid] =
      (hadirPerTanggalKelas[key][kid] || 0) + 1;
  });

  function buildTrend(buckets) {
    return buckets.map((b) => {
      const perKelas = hadirPerTanggalKelas[b.key] || {};
      const hadirSaya = perKelas[kelasId] || 0;
      const totalHadirSekolah = Object.values(perKelas).reduce(
        (s, v) => s + v,
        0,
      );
      const hadirAvg = totalHadirSekolah / jumlahKelasAktif;
      return {
        key: b.key,
        label: b.label,
        dateLabel: b.dateLabel,
        hadirSaya,
        hadirAvg,
      };
    });
  }

  const weeklyTrend = buildTrend(weekly);
  const monthlyTrend = buildTrend(monthly);

  // Rata-rata NILAI AKHIR
  let nilaiTertinggi = null;
  let nilaiTerendah = null;
  try {
    const { listRata } = await buildLegerSiswaStats({
      kelasData: kelasSaya,
      siswaData: siswaKelasSaya,
      absensiData: absensiAllKelas,
    });

    if (listRata.length > 0) {
      nilaiTertinggi = listRata.reduce((max, m) =>
        m.rataRata > max.rataRata ? m : max,
      );
      nilaiTerendah = listRata.reduce((min, m) =>
        m.rataRata < min.rataRata ? m : min,
      );
    }
  } catch (e) {
    console.error("Gagal menghitung rata-rata nilai siswa:", e);
    nilaiTertinggi = null;
    nilaiTerendah = null;
  }

  return {
    found: true,
    hariLiburList: hariLibur,
    kelas: kelasSaya,
    totalSiswa: siswaKelasSaya.length,
    absensiHariIni: absensiToday,
    agendaHariIni: agendaToday,
    periodeMulai: periodeMulaiStr,
    periodeLabel: label,
    incompleteDaysPeriode: incomplete,
    totalHariKerjaPeriode: totalKerja,
    rankingSiswa,
    rankingKelas,
    posisiKelasSaya,
    weeklyTrend,
    monthlyTrend,
    nilaiTertinggi,
    nilaiTerendah,
  };
}
