import * as kesiapanRepository from "@/repositories/ict-monitoring-kesiapan.repository";

/* ------------------------------------------------------------------ */
/* Konfigurasi (dipindah apa adanya dari halaman)                      */
/* ------------------------------------------------------------------ */

const MAPEL_KATEGORI_DIPAKAI = ["umum"];
const KOLOM_FORMATIF = ["k1", "k2", "k3", "k4"];
const FORMATIF_SKIP = -1;

/* ------------------------------------------------------------------ */
/* Helper murni                                                        */
/* ------------------------------------------------------------------ */

const ids = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const hasText = (v) => typeof v === "string" && v.trim().length > 0;
const terisi = (v) =>
  v !== null && v !== undefined && v !== "" && Number(v) > 0;

const stateOf = (done, total) =>
  total === 0 ? "na" : done >= total ? "ok" : done === 0 ? "empty" : "partial";
const pct = (done, total) => (total ? Math.floor((done / total) * 100) : 0);

const mapelTitle = (m) =>
  (m?.Label && String(m.Label).trim()) || m?.nama_mapel || "(tanpa nama)";

function ujianBerlaku(ujian, kelas) {
  const tingkatOk =
    !kelas.tingkat ||
    ids(ujian.target_tingkat).map(String).includes(String(kelas.tingkat));
  const targetKelas = ids(ujian.target_kelas_id);
  const kelasOk = targetKelas.length === 0 || targetKelas.includes(kelas.id);
  return tingkatOk && kelasOk;
}

/* ------------------------------------------------------------------ */
/* Hitung kelengkapan (logika sama dengan halaman per kelas)           */
/* ------------------------------------------------------------------ */

function buildReport({ base, kelasList, ujian, nilaiUjian }) {
  const {
    siswa,
    ploting,
    tp,
    lm,
    formatif,
    sumatif,
    capaian,
    catatan,
    mapelAll,
  } = base;

  const siswaByKelas = {};
  siswa.forEach((s) => {
    const k = ids(s.kelas_id)[0];
    if (k) (siswaByKelas[k] ||= []).push(s);
  });

  const groupBy = (list) => {
    const out = {};
    list.forEach((x) =>
      ids(x.kelas_id).forEach((k) =>
        ids(x.mapel_id).forEach((m) => (out[`${k}|${m}`] ||= []).push(x)),
      ),
    );
    return out;
  };
  const tpByKey = groupBy(tp);
  const lmByKey = groupBy(lm);

  const plotByKelas = {};
  ploting.forEach((p) =>
    ids(p.kelas_id).forEach((k) => (plotByKelas[k] ||= []).push(p)),
  );

  const formatifKosong = {};
  formatif.forEach((f) => {
    const kosong = KOLOM_FORMATIF.filter(
      (c) => Number(f[c]) !== FORMATIF_SKIP && !terisi(f[c]),
    ).length;
    const key = `${ids(f.siswa_id)[0]}|${ids(f.tp_id)[0]}`;
    formatifKosong[key] = Math.min(formatifKosong[key] ?? Infinity, kosong);
  });

  const sumatifSet = new Set();
  sumatif.forEach((n) => {
    if (terisi(n.nilai))
      sumatifSet.add(`${ids(n.siswa_id)[0]}|${ids(n.lm_id)[0]}`);
  });

  const ujianPloting = new Set();
  const ujianMapel = new Set();
  nilaiUjian.forEach((n) => {
    if (!terisi(n.nilai)) return;
    const s = ids(n.siswa_id)[0];
    const p = ids(n.ploting_guru_id);
    if (p.length) p.forEach((x) => ujianPloting.add(`${s}|${x}`));
    else ids(n.mapel_id).forEach((m) => ujianMapel.add(`${s}|${m}`));
  });

  const capMap = {};
  capaian.forEach((c) =>
    ids(c.kelas_id).forEach((k) =>
      ids(c.mapel_id).forEach((m) => {
        const cur = (capMap[`${k}|${m}`] ||= { tinggi: false, rendah: false });
        if (hasText(c.capaian_tinggi)) cur.tinggi = true;
        if (hasText(c.capaian_rendah)) cur.rendah = true;
      }),
    ),
  );

  const catSet = new Set();
  catatan.forEach((c) => {
    if (!hasText(c.catatan)) return;
    const s = ids(c.siswa_id)[0];
    const k = ids(c.kelas_id);
    if (!k.length) catSet.add(`${s}|*`);
    else k.forEach((x) => catSet.add(`${s}|${x}`));
  });

  return kelasList.map((k) => {
    const students = siswaByKelas[k.id] || [];
    const uApplies = !!ujian && ujianBerlaku(ujian, k);

    const fallbackGuru =
      k.expand?.walikelas_id?.nama_lengkap ||
      k.expand?.pendamping_id?.nama_lengkap ||
      null;

    const plotByMapel = new Map();
    (plotByKelas[k.id] || []).forEach((p) => {
      const mid = ids(p.mapel_id)[0];
      if (mid && !plotByMapel.has(mid)) plotByMapel.set(mid, p);
    });

    const seenMapel = new Set();
    const relevantMapels = [];
    (mapelAll || []).forEach((m) => {
      if (seenMapel.has(m.id)) return;
      if (!MAPEL_KATEGORI_DIPAKAI.includes(m.kategori)) return;
      const spesifik = ids(m.spesifik_kelas_id);
      if (spesifik.length && !spesifik.includes(k.id)) return;
      const tingkatOk = k.tingkat
        ? ids(m.target_tingkat).map(String).includes(String(k.tingkat))
        : false;
      if (!tingkatOk && !plotByMapel.has(m.id)) return;
      seenMapel.add(m.id);
      relevantMapels.push(m);
    });

    const rows = relevantMapels
      .map((m) => {
        const p = plotByMapel.get(m.id);
        const mapelId = m.id;
        const tps = tpByKey[`${k.id}|${mapelId}`] || [];
        const lms = lmByKey[`${k.id}|${mapelId}`] || [];
        const noTp = tps.length === 0;
        const noLm = lms.length === 0;
        const noPlot = !p;
        const n = students.length;

        const plottedGuru = p?.expand?.guru_id?.nama_lengkap || null;
        const isFallback = !plottedGuru && !!fallbackGuru;
        const guru = plottedGuru || fallbackGuru || "Belum diploting";

        const fExpected = noTp ? n : n * tps.length;
        const sExpected = noLm ? n : n * lms.length;
        const uExpected = uApplies ? n : 0;
        let fDone = 0;
        let sDone = 0;
        let uDone = 0;

        students.forEach((s) => {
          tps.forEach((t) => {
            if (formatifKosong[`${s.id}|${t.id}`] === 0) fDone++;
          });
          lms.forEach((l) => {
            if (sumatifSet.has(`${s.id}|${l.id}`)) sDone++;
          });
          if (uApplies) {
            const ok = p
              ? ujianPloting.has(`${s.id}|${p.id}`) ||
                ujianMapel.has(`${s.id}|${mapelId}`)
              : ujianMapel.has(`${s.id}|${mapelId}`);
            if (ok) uDone++;
          }
        });

        const state = noPlot
          ? "empty"
          : stateOf(fDone + sDone + uDone, fExpected + sExpected + uExpected);

        const todo = [];
        if (noTp) todo.push("TP belum dibuat");
        else if (fDone < fExpected) todo.push(`${fExpected - fDone} formatif`);
        if (noLm) todo.push("lingkup materi belum dibuat");
        else if (sDone < sExpected) todo.push(`${sExpected - sDone} sumatif`);
        if (uApplies && uDone < uExpected)
          todo.push(`${uExpected - uDone} ujian`);

        return {
          id: mapelId,
          mapel: mapelTitle(m),
          guru,
          isFallback,
          noPlot,
          todo,
          fDone,
          sDone,
          uDone,
          fExpected,
          sExpected,
          uExpected,
          state,
        };
      })
      .sort((a, b) => a.mapel.localeCompare(b.mapel, "id"));

    const pDone = rows.reduce((a, r) => a + r.fDone + r.sDone + r.uDone, 0);
    const pTotal = rows.reduce(
      (a, r) => a + r.fExpected + r.sExpected + r.uExpected,
      0,
    );
    const penilaian = {
      rows,
      done: pDone,
      total: pTotal,
      percent: pct(pDone, pTotal),
      state: rows.length ? stateOf(pDone, pTotal) : "empty",
      issues: rows.filter((r) => r.state !== "ok").length,
    };

    const items = rows.map((r) => {
      const c = capMap[`${k.id}|${r.id}`] || {};
      return {
        id: r.id,
        mapel: r.mapel,
        state:
          c.tinggi && c.rendah
            ? "ok"
            : c.tinggi || c.rendah
              ? "partial"
              : "empty",
      };
    });
    const cDone = items.filter((i) => i.state === "ok").length;
    const cap = {
      items,
      done: cDone,
      total: items.length,
      percent: pct(cDone, items.length),
      state: items.length ? stateOf(cDone, items.length) : "empty",
      issues: items.length - cDone,
    };

    const missingCat = students.filter(
      (s) => !(catSet.has(`${s.id}|${k.id}`) || catSet.has(`${s.id}|*`)),
    );
    const catDone = students.length - missingCat.length;
    const cat = {
      missing: missingCat,
      done: catDone,
      total: students.length,
      percent: pct(catDone, students.length),
      state: stateOf(catDone, students.length),
      issues: missingCat.length,
    };

    const ready = [penilaian, cap, cat].every((s) => s.state === "ok");
    const anyDone = penilaian.done + cap.done + cat.done > 0;

    return {
      id: k.id,
      nama: k.nama_kelas || "(tanpa nama)",
      tingkat: k.tingkat,
      tahun: k.expand?.tahun_ajaran_id
        ? `${k.expand.tahun_ajaran_id.tahun} semester ${k.expand.tahun_ajaran_id.semester}`
        : "Tanpa tahun ajaran",
      walikelas: k.expand?.walikelas_id?.nama_lengkap || "-",
      siswaCount: students.length,
      penilaian,
      cap,
      cat,
      ready,
      overall: Math.floor((penilaian.percent + cap.percent + cat.percent) / 3),
      state: ready ? "ok" : anyDone ? "partial" : "empty",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Layanan                                                             */
/* ------------------------------------------------------------------ */

// Tahun ajaran + semua kelas + semua ujian untuk halaman ini.
export async function getMonitoringKesiapanInit() {
  try {
    const [tahunList, kelasAll, ujianAll] = await Promise.all([
      kesiapanRepository.findTahunAjaranAll(),
      kesiapanRepository.findKelasAll(),
      kesiapanRepository.findUjianAll(),
    ]);

    return { tahunList, kelasAll, ujianAll, error: null };
  } catch (e) {
    console.error("Error loading monitoring kesiapan init:", e);
    return { error: e?.message || "Gagal memuat data kelas" };
  }
}

// Data penilaian (siswa, ploting, TP, LM, formatif, sumatif, capaian, catatan,
// mapel) untuk semua kelas terpilih.
export async function getMonitoringKesiapanBase(kelasIds) {
  try {
    const list = Array.isArray(kelasIds) ? kelasIds.filter(Boolean) : [];

    if (!list.length) {
      return {
        base: {
          siswa: [],
          ploting: [],
          tp: [],
          lm: [],
          formatif: [],
          sumatif: [],
          capaian: [],
          catatan: [],
          mapelAll: [],
        },
        error: null,
      };
    }

    const base = await kesiapanRepository.findPenilaianBase(list);

    return { base, error: null };
  } catch (e) {
    console.error("Error loading data penilaian:", e);
    return { error: e?.message || "Gagal memuat data penilaian" };
  }
}

// Nilai ujian untuk periode ujian terpilih.
export async function getMonitoringKesiapanNilaiUjian({ ujianId }) {
  try {
    const nilaiUjian = await kesiapanRepository.findNilaiUjianByUjian(ujianId);
    return { nilaiUjian, error: null };
  } catch (e) {
    console.error("Error loading nilai ujian:", e);
    return { error: e?.message || "Gagal memuat nilai ujian" };
  }
}

// Agregasi kesiapan rapor untuk semua kelas terpilih.
export async function getMonitoringKesiapanReports({
  base,
  kelasList,
  ujian,
  nilaiUjian,
}) {
  try {
    const reports = buildReport({ base, kelasList, ujian, nilaiUjian });
    return { reports, error: null };
  } catch (e) {
    console.error("Error menghitung kesiapan rapor:", e);
    return { error: e?.message || "Gagal menghitung kesiapan rapor" };
  }
}
