import * as guruMapelRepository from "@/repositories/guru-mapel.repository";

// ---------------------------------------------------------------------------
// Helper tanggal (dipindah apa adanya dari halaman guru-mapel)
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

const DASHBOARD_ERROR_MESSAGE =
  "Terjadi kesalahan saat memuat data dashboard. Coba muat ulang halaman.";

function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayRangeISO(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    start: `${toISODate(d)} 00:00:00`,
    end: `${toISODate(d)} 23:59:59`,
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
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}
function numOrNull(v) {
  return typeof v === "number" && !isNaN(v) && v !== -1 ? v : null;
}

// ---------------------------------------------------------------------------
// Dashboard guru mapel
// ---------------------------------------------------------------------------
export async function getGuruMapelDashboard({ userId, todayIso }) {
  try {
    const [ty, tm, td] = String(todayIso).split("-").map(Number);
    const today = new Date(ty, tm - 1, td);

    const { start: todayStart, end: todayEnd } = dayRangeISO(today);
    const todayName = HARI_KEY[today.getDay()];

    // ------------------------------------------------------------------
    // 1. Ploting guru + data independen (paralel)
    // ------------------------------------------------------------------
    const [plotingSaya, hariLibur, allPloting, jadwalToday, allAgendaToday] =
      await Promise.all([
        guruMapelRepository.findPlotingByGuruId(userId),
        guruMapelRepository.findHariLibur().catch(() => []),
        guruMapelRepository.findAllPloting(),
        guruMapelRepository
          .findJadwalByGuruDanHari({ guruId: userId, hari: todayName })
          .catch(() => []),
        guruMapelRepository
          .findAgendaByFilter({
            filter: `date>="${todayStart}" && date<="${todayEnd}"`,
          })
          .catch(() => []),
      ]);

    const result = {
      hariLiburList: hariLibur,
      jadwalHariIni: jadwalToday,
      jumlahKelas: 0,
      jumlahMapel: 0,
      jumlahSiswa: 0,
      agendaHariIni: [],
      rankingSiswa: [],
      rataRataPerMapel: [],
      weeklyTrend: [],
      monthlyTrend: [],
    };

    const kelasIdSet = new Set();
    const mapelIdSet = new Set();
    const mapelMap = {};
    const myCombos = new Set(); // "mapelId|kelasId"

    plotingSaya.forEach((p) => {
      const mapelId = firstOf(p.mapel_id);
      if (mapelId && p.expand?.mapel_id) {
        mapelMap[mapelId] = p.expand.mapel_id;
        mapelIdSet.add(mapelId);
      }
      const kelasArr = Array.isArray(p.expand?.kelas_id)
        ? p.expand.kelas_id
        : p.expand?.kelas_id
          ? [p.expand.kelas_id]
          : [];
      kelasArr.forEach((k) => {
        kelasIdSet.add(k.id);
        if (mapelId) myCombos.add(`${mapelId}|${k.id}`);
      });
    });

    result.jumlahKelas = kelasIdSet.size;
    result.jumlahMapel = mapelIdSet.size;

    const kelasIds = Array.from(kelasIdSet);
    const mapelIds = Array.from(mapelIdSet);

    // ------------------------------------------------------------------
    // 2. Siswa di kelas yang diajar
    // ------------------------------------------------------------------
    let siswaList = [];
    if (kelasIds.length > 0) {
      siswaList = await guruMapelRepository.findSiswaByKelasIds(kelasIds);
    }
    result.jumlahSiswa = siswaList.length;

    const siswaMap = {};
    siswaList.forEach((s) => {
      siswaMap[s.id] = s;
    });

    if (mapelIds.length === 0 || kelasIds.length === 0) {
      return result;
    }

    // ------------------------------------------------------------------
    // 3. TP & LM untuk mapel yang diajar
    // ------------------------------------------------------------------
    const mapelFilter = mapelIds
      .map((id) => `mapel_id ~ "${id}"`)
      .join(" || ");

    const [tpAll, lmAll] = await Promise.all([
      guruMapelRepository.findTujuanPembelajaranByFilter({
        filter: mapelFilter,
      }),
      guruMapelRepository.findLingkupMateriByFilter({ filter: mapelFilter }),
    ]);

    // Filter client-side: hanya TP/LM yang cocok dengan kombinasi mapel+kelas guru
    const myTps = tpAll.filter((tp) => {
      const mid = firstOf(tp.mapel_id);
      const kid = firstOf(tp.kelas_id);
      return myCombos.has(`${mid}|${kid}`);
    });
    const myLms = lmAll.filter((lm) => {
      const mid = firstOf(lm.mapel_id);
      const kid = firstOf(lm.kelas_id);
      return myCombos.has(`${mid}|${kid}`);
    });

    const tpToMapel = {};
    tpAll.forEach((tp) => {
      tpToMapel[tp.id] = firstOf(tp.mapel_id);
    });
    const lmToMapel = {};
    lmAll.forEach((lm) => {
      lmToMapel[lm.id] = firstOf(lm.mapel_id);
    });

    // ------------------------------------------------------------------
    // 4. Ambil nilai_formatif, nilai_sumatif, nilai_ujian
    // ------------------------------------------------------------------
    const kelasFilter = kelasIds
      .map((id) => `kelas_id ~ "${id}"`)
      .join(" || ");

    const nfFilter =
      myTps.length > 0
        ? `(${kelasFilter}) && (${myTps
            .map((tp) => `tp_id ~ "${tp.id}"`)
            .join(" || ")})`
        : null;
    const nsFilter =
      myLms.length > 0
        ? `(${kelasFilter}) && (${myLms
            .map((lm) => `lm_id ~ "${lm.id}"`)
            .join(" || ")})`
        : null;

    const [nfData, nsData, nuData] = await Promise.all([
      nfFilter
        ? guruMapelRepository.findNilaiFormatifByFilter({ filter: nfFilter })
        : Promise.resolve([]),
      nsFilter
        ? guruMapelRepository.findNilaiSumatifByFilter({ filter: nsFilter })
        : Promise.resolve([]),
      guruMapelRepository.findNilaiUjianByFilter({
        filter: mapelIds.map((id) => `mapel_id = "${id}"`).join(" || "),
      }),
    ]);

    // ------------------------------------------------------------------
    // 5. Agregasi per siswa (dan per mapel)
    // ------------------------------------------------------------------
    const siswaAgg = {};
    siswaList.forEach((s) => {
      siswaAgg[s.id] = { total: 0, count: 0, perMapel: {} };
    });

    function addValue(siswaId, mapelId, val) {
      const v = numOrNull(val);
      if (v === null) return;
      if (!siswaAgg[siswaId]) return;
      siswaAgg[siswaId].total += v;
      siswaAgg[siswaId].count += 1;
      if (mapelId) {
        if (!siswaAgg[siswaId].perMapel[mapelId]) {
          siswaAgg[siswaId].perMapel[mapelId] = { total: 0, count: 0 };
        }
        siswaAgg[siswaId].perMapel[mapelId].total += v;
        siswaAgg[siswaId].perMapel[mapelId].count += 1;
      }
    }

    // Formatif: K1..K4 per TP
    nfData.forEach((n) => {
      const mid = tpToMapel[firstOf(n.tp_id)];
      const sid = firstOf(n.siswa_id);
      ["k1", "k2", "k3", "k4"].forEach((k) => addValue(sid, mid, n[k]));
    });

    // Sumatif: nilai per LM
    nsData.forEach((n) => {
      const mid = lmToMapel[firstOf(n.lm_id)];
      const sid = firstOf(n.siswa_id);
      addValue(sid, mid, n.nilai);
    });

    // Ujian
    nuData.forEach((n) => {
      const sid = firstOf(n.siswa_id);
      const mid = firstOf(n.mapel_id);
      addValue(sid, mid, n.nilai);
    });

    // Ranking siswa
    result.rankingSiswa = Object.entries(siswaAgg)
      .map(([sid, agg]) => ({
        siswa: siswaMap[sid],
        rataRata:
          agg.count > 0 ? Math.round((agg.total / agg.count) * 10) / 10 : null,
        jumlahNilai: agg.count,
      }))
      .filter((r) => r.siswa && r.rataRata !== null)
      .sort((a, b) => b.rataRata - a.rataRata);

    // Rata-rata per mapel
    const mapelAgg = {};
    Object.values(siswaAgg).forEach((agg) => {
      Object.entries(agg.perMapel).forEach(([mid, v]) => {
        if (!mapelAgg[mid]) mapelAgg[mid] = { total: 0, count: 0 };
        mapelAgg[mid].total += v.total;
        mapelAgg[mid].count += v.count;
      });
    });

    result.rataRataPerMapel = Object.entries(mapelAgg)
      .map(([mid, agg]) => ({
        mapel: mapelMap[mid],
        rataRata:
          agg.count > 0 ? Math.round((agg.total / agg.count) * 10) / 10 : 0,
        jumlahNilai: agg.count,
      }))
      .filter((r) => r.mapel)
      .sort((a, b) => b.rataRata - a.rataRata);

    // ------------------------------------------------------------------
    // 6. Filter agenda hari ini (data sudah diambil di awal)
    // ------------------------------------------------------------------
    result.agendaHariIni = allAgendaToday.filter((a) => {
      const mid = firstOf(a.mapel_id);
      const kid = firstOf(a.kelas_id);
      return myCombos.has(`${mid}|${kid}`);
    });

    // ------------------------------------------------------------------
    // 7. Chart agenda
    // ------------------------------------------------------------------
    const plotingKeyToGuru = {};
    allPloting.forEach((p) => {
      const mapelIdsP = Array.isArray(p.mapel_id)
        ? p.mapel_id
        : p.mapel_id
          ? [p.mapel_id]
          : [];
      const kelasIdsP = Array.isArray(p.kelas_id)
        ? p.kelas_id
        : p.kelas_id
          ? [p.kelas_id]
          : [];
      mapelIdsP.forEach((mid) => {
        kelasIdsP.forEach((kid) => {
          if (mid && kid) plotingKeyToGuru[`${mid}|${kid}`] = p.guru_id;
        });
      });
    });

    const allGuruIds = new Set(allPloting.map((p) => p.guru_id).filter(Boolean));
    const jumlahGuru = allGuruIds.size || 1;

    const weekly = weekBuckets(today);
    const monthly = monthBuckets(today);

    const rangeStart =
      weekly[0].start < monthly[0].start ? weekly[0].start : monthly[0].start;
    const rangeEnd =
      weekly[weekly.length - 1].end > monthly[monthly.length - 1].end
        ? weekly[weekly.length - 1].end
        : monthly[monthly.length - 1].end;

    const allAgendaRange = await guruMapelRepository.findAgendaByFilter({
      filter: `date>="${rangeStart}" && date<"${rangeEnd}"`,
    });

    const countPerDateGuru = {};
    allAgendaRange.forEach((a) => {
      const mid = firstOf(a.mapel_id);
      const kid = firstOf(a.kelas_id);
      const guruId = plotingKeyToGuru[`${mid}|${kid}`];
      if (!guruId) return;
      const dateKey = (a.date || "").slice(0, 10);
      if (!dateKey) return;
      if (!countPerDateGuru[dateKey]) countPerDateGuru[dateKey] = {};
      countPerDateGuru[dateKey][guruId] =
        (countPerDateGuru[dateKey][guruId] || 0) + 1;
    });

    function buildTrend(buckets) {
      return buckets.map((b) => {
        const perGuru = countPerDateGuru[b.key] || {};
        const saya = perGuru[userId] || 0;
        const totalSekolah = Object.values(perGuru).reduce((s, v) => s + v, 0);
        const avg = totalSekolah / jumlahGuru;
        return {
          key: b.key,
          label: b.label,
          dateLabel: b.dateLabel,
          saya,
          avg,
        };
      });
    }

    result.weeklyTrend = buildTrend(weekly);
    result.monthlyTrend = buildTrend(monthly);

    return result;
  } catch (err) {
    console.error(err);
    return { error: DASHBOARD_ERROR_MESSAGE };
  }
}
