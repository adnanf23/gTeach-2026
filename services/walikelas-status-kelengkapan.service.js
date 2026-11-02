import * as statusKelengkapanRepository from "@/repositories/walikelas-status-kelengkapan.repository";

/* ------------------------------------------------------------------ */
/* Konfigurasi                                                         */
/* ------------------------------------------------------------------ */

const MAPEL_KATEGORI_DIPAKAI = ["umum"];

const KOLOM_FORMATIF = ["k1", "k2", "k3", "k4"];
const FORMATIF_SKIP = -1;

const ROLE_ADMIN = new Set(["admin", "ict"]);

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

const ids = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const hasText = (v) => typeof v === "string" && v.trim().length > 0;
const terisi = (v) =>
  v !== null && v !== undefined && v !== "" && Number(v) > 0;

const stateOf = (done, total) => {
  if (total === 0) return "na";
  if (done >= total) return "ok";

  const percent = (done / total) * 100;

  if (percent > 90) return "almost";
  if (done === 0) return "empty";

  return "partial";
};

const pct = (done, total) => (total ? Math.floor((done / total) * 100) : 0);

function ujianBerlaku(ujian, kelas) {
  const tingkatOk =
    !kelas.tingkat ||
    ids(ujian.target_tingkat).map(String).includes(String(kelas.tingkat));
  const targetKelas = ids(ujian.target_kelas_id);
  const kelasOk = targetKelas.length === 0 || targetKelas.includes(kelas.id);
  return tingkatOk && kelasOk;
}

const mapelTitle = (m) =>
  (m?.Label && String(m.Label).trim()) || m?.nama_mapel || "(tanpa nama)";

/* ------------------------------------------------------------------ */
/* Hitung kelengkapan                                                  */
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
    const fallbackLabel = k.expand?.walikelas_id?.nama_lengkap
      ? "walikelas"
      : k.expand?.pendamping_id?.nama_lengkap
        ? "pendamping"
        : null;

    const plotByMapel = new Map();
    ploting
      .filter((p) => ids(p.kelas_id).includes(k.id))
      .forEach((p) => {
        const mid = ids(p.mapel_id)[0];
        if (mid && !plotByMapel.has(mid)) plotByMapel.set(mid, p);
      });

    const seenMapel = new Set();
    const relevantMapels = [];
    (mapelAll || []).forEach((m) => {
      if (seenMapel.has(m.id)) return;
      if (!MAPEL_KATEGORI_DIPAKAI.includes(m.kategori)) return;

      const spesifik = ids(m.spesifik_kelas_id);
      const kelasOk = spesifik.length === 0 || spesifik.includes(k.id);
      if (!kelasOk) return;

      const tingkatOk = k.tingkat
        ? ids(m.target_tingkat).map(String).includes(String(k.tingkat))
        : false;
      const isPlotted = plotByMapel.has(m.id);

      if (!tingkatOk && !isPlotted) return;

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
        const guruLabel = plottedGuru || fallbackGuru || "Belum diploting";

        const fExpected = noTp ? n : n * tps.length;
        const sExpected = noLm ? n : n * lms.length;
        const uExpected = uApplies ? n : 0;
        let fDone = 0;
        let sDone = 0;
        let uDone = 0;
        const missing = [];

        students.forEach((s) => {
          let fMiss = 0;
          let sMiss = 0;
          let uMiss = false;
          tps.forEach((t) => {
            if (formatifKosong[`${s.id}|${t.id}`] === 0) fDone++;
            else fMiss++;
          });
          lms.forEach((l) => {
            if (sumatifSet.has(`${s.id}|${l.id}`)) sDone++;
            else sMiss++;
          });
          if (uApplies) {
            const ok = p
              ? ujianPloting.has(`${s.id}|${p.id}`) ||
                ujianMapel.has(`${s.id}|${mapelId}`)
              : ujianMapel.has(`${s.id}|${mapelId}`);
            if (ok) uDone++;
            else uMiss = true;
          }
          if (fMiss || sMiss || uMiss) {
            const parts = [];
            if (fMiss) parts.push(`${fMiss} formatif`);
            if (sMiss) parts.push(`${sMiss} sumatif`);
            if (uMiss) parts.push("ujian");
            missing.push({
              id: s.id,
              nama: s.nama_siswa,
              detail: `(${parts.join(", ")})`,
            });
          }
        });

        const totalDone = fDone + sDone + uDone;
        const totalExpected = fExpected + sExpected + uExpected;

        const state =
          totalDone > 0
            ? stateOf(totalDone, totalExpected)
            : noPlot
              ? "empty"
              : stateOf(totalDone, totalExpected);

        return {
          id: mapelId,
          plotingId: p?.id || null,
          mapelId,
          mapel: mapelTitle(m),
          guru: guruLabel,
          isFallback,
          fallbackLabel,
          noPlot,
          noTp,
          tpCount: tps.length,
          fDone,
          fExpected,
          noLm,
          lmCount: lms.length,
          sDone,
          sExpected,
          uApplies,
          uDone,
          uExpected,
          missing,
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

    const seen = new Set();
    const items = [];
    rows.forEach((r) => {
      if (!r.mapelId || seen.has(r.mapelId)) return;
      seen.add(r.mapelId);
      const c = capMap[`${k.id}|${r.mapelId}`] || {};
      const tinggi = !!c.tinggi;
      const rendah = !!c.rendah;
      items.push({
        id: r.mapelId,
        mapel: r.mapel,
        tinggi,
        rendah,
        state: tinggi && rendah ? "ok" : tinggi || rendah ? "partial" : "empty",
      });
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
    const cat = {
      missing: missingCat,
      done: students.length - missingCat.length,
      total: students.length,
      percent: pct(students.length - missingCat.length, students.length),
      state: stateOf(students.length - missingCat.length, students.length),
      issues: missingCat.length,
    };

    const ready = [penilaian, cap, cat].every((s) => s.state === "ok");
    const anyDone = penilaian.done + cap.done + cat.done > 0;

    return {
      id: k.id,
      nama: k.nama_kelas || "(tanpa nama)",
      walikelas: k.expand?.walikelas_id?.nama_lengkap || "-",
      siswaCount: students.length,
      penilaian,
      cap,
      cat,
      ready,
      state: ready ? "ok" : anyDone ? "partial" : "empty",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Layanan                                                             */
/* ------------------------------------------------------------------ */

// Tahun ajaran aktif + daftar kelas + daftar ujian untuk halaman ini.
export async function getStatusKelengkapanInit({ userId, role }) {
  try {
    const tahunAll = await statusKelengkapanRepository.findTahunAjaranAll();
    const t = tahunAll.find((x) => x.is_aktif) || tahunAll[0] || null;

    const isAdmin = ROLE_ADMIN.has(role);

    const [kelas, ujian] = await Promise.all([
      isAdmin
        ? t
          ? statusKelengkapanRepository.findKelasByTahunAjaran(t.id)
          : Promise.resolve([])
        : statusKelengkapanRepository.findKelasByWaliOrPendamping(userId),
      t
        ? statusKelengkapanRepository.findUjianByTahunAjaran(t.id)
        : Promise.resolve([]),
    ]);

    const tId = t?.id;
    const sorted = [...kelas].sort((a, b) => {
      const aAktif = tId && ids(a.tahun_ajaran_id)[0] === tId ? 0 : 1;
      const bAktif = tId && ids(b.tahun_ajaran_id)[0] === tId ? 0 : 1;
      if (aAktif !== bAktif) return aAktif - bAktif;
      return (a.nama_kelas || "").localeCompare(b.nama_kelas || "", "id");
    });

    return { tahun: t, kelasList: sorted, ujianList: ujian, error: null };
  } catch (e) {
    console.error("Error loading status kelengkapan:", e);
    return { error: e?.message || "Gagal memuat data kelas" };
  }
}

// Data penilaian (siswa, ploting, TP, LM, formatif, sumatif, capaian, catatan, mapel).
export async function getStatusKelengkapanBase(kelasId) {
  try {
    const data = await statusKelengkapanRepository.findPenilaianBase(kelasId);

    return {
      base: {
        kelasId,
        siswa: data.siswa,
        ploting: data.ploting,
        tp: data.tp,
        lm: data.lm,
        formatif: data.formatif,
        sumatif: data.sumatif,
        capaian: data.capaian,
        catatan: data.catatan,
        mapelAll: data.mapelAll,
      },
      error: null,
    };
  } catch (e) {
    console.error("Error loading data penilaian:", e);
    return { error: e?.message || "Gagal memuat data penilaian" };
  }
}

// Nilai ujian untuk kelas + periode terpilih.
export async function getStatusKelengkapanNilaiUjian({ ujianId, kelasId }) {
  try {
    const nilaiUjian = await statusKelengkapanRepository.findNilaiUjianKelas({
      ujianId,
      kelasId,
    });
    return { nilaiUjian, error: null };
  } catch (e) {
    console.error("Error loading nilai ujian:", e);
    return { error: e?.message || "Gagal memuat nilai ujian" };
  }
}

// Agregasi kelengkapan rapor untuk satu kelas.
export async function getStatusKelengkapanReport({
  base,
  kelas,
  ujian,
  nilaiUjian,
}) {
  try {
    return {
      report: buildReport({ base, kelasList: [kelas], ujian, nilaiUjian })[0],
      error: null,
    };
  } catch (e) {
    console.error("Error menghitung kelengkapan:", e);
    return { error: e?.message || "Gagal menghitung kelengkapan rapor" };
  }
}
