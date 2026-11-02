import * as agendaRepository from "@/repositories/ict-monitoring-agenda.repository";

// ---------------------------------------------------------------------------
// Helper murni (disalin apa adanya dari halaman agenda mengajar ICT)
// ---------------------------------------------------------------------------
const JAM_SLOTS = [
  "1 dan 2",
  "2 dan 3",
  "3 dan 4",
  "4 dan 5",
  "5 dan 6",
  "6 dan 7",
  "7 dan 8",
];

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Data dasar: kelas, hari libur, dan siswa terkelompok per kelas.
// ---------------------------------------------------------------------------
export async function getAgendaBaseData() {
  try {
    const [kelasList, siswaList, hariLiburList] = await Promise.all([
      agendaRepository.findKelas(),
      agendaRepository.findSiswa(),
      agendaRepository.findHariLibur().catch(() => []),
    ]);

    const siswaPerKelas = {};
    for (const s of siswaList) {
      const kid = firstOf(s.kelas_id);
      if (!kid) continue;
      if (!siswaPerKelas[kid]) siswaPerKelas[kid] = [];
      siswaPerKelas[kid].push(s);
    }

    return { kelasList, siswaPerKelas, hariLiburList, error: null };
  } catch (err) {
    console.error(err);
    return {
      kelasList: [],
      siswaPerKelas: {},
      hariLiburList: [],
      error: err?.message || "Gagal memuat data.",
    };
  }
}

// ---------------------------------------------------------------------------
// Ranking aktivitas kelas dari agenda 30 hari terakhir.
// ---------------------------------------------------------------------------
export async function getAgendaTerbaru({ kelasList }) {
  try {
    const records = await agendaRepository.findAgendaTerbaru({
      startStr: `${daysAgoStr(30)} 00:00:00`,
      endStr: `${todayStr()} 23:59:59`,
    });

    const count = new Map();
    for (const a of records) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      count.set(kid, (count.get(kid) || 0) + 1);
    }

    const result = [];
    for (const k of kelasList || []) {
      const c = count.get(k.id) || 0;
      if (c === 0) continue;
      result.push({ kelas: k, count: c });
    }
    result.sort((a, b) => b.count - a.count);
    const max = result.length ? result[0].count : 1;
    const teraktif = result
      .map((r) => ({
        kelas: r.kelas,
        rate: (r.count / max) * 100,
        display: `${r.count}x`,
      }))
      .slice(0, 5);

    const arr = (kelasList || []).map((k) => ({
      kelas: k,
      count: count.get(k.id) || 0,
    }));
    arr.sort((a, b) => a.count - b.count);
    const maxPasif = Math.max(1, ...arr.map((r) => r.count));
    const terpasif = arr.slice(0, 5).map((r) => ({
      kelas: r.kelas,
      rate: maxPasif ? (r.count / maxPasif) * 100 : 0,
      display: `${r.count}x`,
    }));

    return { teraktif, terpasif, error: null };
  } catch (err) {
    console.error(err);
    return { teraktif: [], terpasif: [], error: err?.message || "Gagal memuat data." };
  }
}

// ---------------------------------------------------------------------------
// Data satu tanggal: agenda hari itu + seluruh agregasi turunannya
// (per kelas, guru sudah/belum mengisi, mapel sudah/belum diisi).
// ---------------------------------------------------------------------------
export async function getAgendaHarian({ dateStr, kelasList, isWorkday }) {
  try {
    let agendaTanggal = [];
    let agendaError = null;
    try {
      agendaTanggal = await agendaRepository.findAgendaByTanggal({ dateStr });
    } catch (err) {
      console.error(err);
      agendaTanggal = [];
      agendaError = err?.message || "Gagal memuat data.";
    }

    // Data ploting/guru/mapel (dibungkus sendiri seperti perilaku halaman
    // semula: bila gagal, cukup dikosongkan tanpa menggagalkan agenda).
    let guruPerMapel = {};
    let semuaGuru = [];
    let mapelMap = {};
    let plotingGuruList = [];
    try {
      const [plotingGuru, usersList, mapelList] = await Promise.all([
        agendaRepository.findPlotingGuru(),
        agendaRepository.findGuruUsers(),
        agendaRepository.findMapel(),
      ]);
      plotingGuruList = plotingGuru;

      const userMap = {};
      for (const u of usersList) userMap[u.id] = u;
      for (const m of mapelList) mapelMap[m.id] = m;

      for (const pg of plotingGuruList) {
        const mapelId = firstOf(pg.mapel_id);
        const guruId = firstOf(pg.guru_id);
        if (mapelId && guruId) {
          const guru = userMap[guruId];
          if (guru) {
            if (!guruPerMapel[mapelId]) guruPerMapel[mapelId] = [];
            guruPerMapel[mapelId].push(guru.nama_lengkap || "Guru");
          }
        }
      }

      const guruNames = new Set();
      for (const pg of plotingGuruList) {
        const guruId = firstOf(pg.guru_id);
        if (guruId) {
          const guru = userMap[guruId];
          if (guru) guruNames.add(guru.nama_lengkap || "Guru");
        }
      }
      semuaGuru = Array.from(guruNames);
    } catch (err) {
      console.error("Gagal load ploting_guru:", err);
      guruPerMapel = {};
      semuaGuru = [];
      mapelMap = {};
      plotingGuruList = [];
    }

    // Agenda terkelompok per kelas, terurut per jam pelajaran.
    const agendaPerKelas = {};
    for (const a of agendaTanggal) {
      const kid = firstOf(a.kelas_id);
      if (!kid) continue;
      if (!agendaPerKelas[kid]) agendaPerKelas[kid] = [];
      agendaPerKelas[kid].push(a);
    }
    for (const arr of Object.values(agendaPerKelas)) {
      arr.sort(
        (a, b) =>
          JAM_SLOTS.indexOf(a.jam_mapel) - JAM_SLOTS.indexOf(b.jam_mapel),
      );
    }

    const kelasSudahIdsArr = Object.keys(agendaPerKelas);
    const kelasSudahIds = new Set(kelasSudahIdsArr);

    const kelasSudah = isWorkday
      ? (kelasList || []).filter((k) => kelasSudahIds.has(k.id))
      : [];
    const kelasBelum = isWorkday
      ? (kelasList || []).filter((k) => !kelasSudahIds.has(k.id))
      : [];

    const guruNames = new Set();
    for (const a of agendaTanggal) {
      const mapelId = firstOf(a.mapel_id);
      if (mapelId && guruPerMapel[mapelId]) {
        for (const guru of guruPerMapel[mapelId]) guruNames.add(guru);
      }
    }
    const guruSudahMengisi = Array.from(guruNames);
    const sudahSet = new Set(guruSudahMengisi);
    const guruBelumMengisi = semuaGuru.filter((g) => !sudahSet.has(g));

    const mapelNames = new Set();
    for (const a of agendaTanggal) {
      const mapelId = firstOf(a.mapel_id);
      if (mapelId) {
        const mapel = mapelMap[mapelId];
        if (mapel) mapelNames.add(mapel.nama_mapel);
      }
    }
    const mapelSudah = Array.from(mapelNames);

    const semuaMapelNames = new Set();
    for (const pg of plotingGuruList) {
      const mapelId = firstOf(pg.mapel_id);
      if (mapelId) {
        const mapel = mapelMap[mapelId];
        if (mapel) semuaMapelNames.add(mapel.nama_mapel);
      }
    }
    const sudahMapelSet = new Set(mapelSudah);
    const mapelBelum = Array.from(semuaMapelNames).filter(
      (m) => !sudahMapelSet.has(m),
    );

    const totalEntri = agendaTanggal.length;
    const persenSudah =
      (kelasList || []).length && isWorkday
        ? Math.round((kelasSudah.length / kelasList.length) * 100)
        : 0;

    return {
      agendaPerKelas,
      guruPerMapel,
      mapelMap,
      kelasSudahIds: kelasSudahIdsArr,
      kelasSudah,
      kelasBelum,
      guruSudahMengisi,
      guruBelumMengisi,
      mapelSudah,
      mapelBelum,
      totalEntri,
      persenSudah,
      error: agendaError,
    };
  } catch (err) {
    console.error(err);
    return {
      agendaPerKelas: {},
      guruPerMapel: {},
      mapelMap: {},
      kelasSudahIds: [],
      kelasSudah: [],
      kelasBelum: [],
      guruSudahMengisi: [],
      guruBelumMengisi: [],
      mapelSudah: [],
      mapelBelum: [],
      totalEntri: 0,
      persenSudah: 0,
      error: err?.message || "Gagal memuat data.",
    };
  }
}

// ---------------------------------------------------------------------------
// Baris agenda untuk export Excel (rentang tanggal, opsional per kelas).
// ---------------------------------------------------------------------------
export async function getAgendaExportRows({ kelasId, startDate, endDate }) {
  try {
    const records = await agendaRepository.findAgendaExport({
      kelasId,
      startDate,
      endDate,
    });
    return { records, error: null };
  } catch (err) {
    return { records: [], error: err?.message || "Gagal memuat data agenda." };
  }
}
