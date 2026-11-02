import * as walikelasDataKelasRepository from "@/repositories/walikelas-data-kelas.repository";

// Helper lokal (disalin apa adanya dari halaman data-kelas)
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function toArray(val) {
  if (Array.isArray(val)) return val;
  return val ? [val] : [];
}

// Ambil kelas + siswa + mata_pelajaran + wali_murid untuk wali kelas/pendamping
// yang login, beserta seluruh grouping turunannya.
export async function getKelasSayaData(userId) {
  try {
    const kelasRecords =
      await walikelasDataKelasRepository.findKelasByWaliOrPendampingDetailed(
        userId,
      );

    if (kelasRecords.length === 0) {
      return {
        kelasList: [],
        siswaByKelas: {},
        mapelByKelas: {},
        waliMuridBySiswa: {},
        error: null,
      };
    }

    const kelasIds = kelasRecords.map((k) => k.id);
    const distinctTingkat = Array.from(
      new Set(kelasRecords.map((k) => String(k.tingkat))),
    );

    const siswaFilter = kelasIds
      .map((kid) => `kelas_id = "${kid}"`)
      .join(" || ");

    const [siswaRecords, spesifikMapel, kandidatUmumMapel] = await Promise.all([
      walikelasDataKelasRepository.findSiswaByFilter(siswaFilter),
      walikelasDataKelasRepository
        .findMapelByFilter(
          kelasIds.map((kid) => `spesifik_kelas_id ~ "${kid}"`).join(" || "),
        )
        .catch(() => []),
      walikelasDataKelasRepository
        .findMapelByFilter(
          distinctTingkat
            .map((t) => `target_tingkat ~ "${t}"`)
            .join(" || "),
        )
        .catch(() => []),
    ]);

    /* ---------- Ambil akun wali murid untuk siswa-siswa ini ---------- */
    const siswaIds = siswaRecords.map((s) => s.id);
    let waliMuridRecords = [];
    if (siswaIds.length > 0) {
      const CHUNK = 50;
      const chunks = [];
      for (let i = 0; i < siswaIds.length; i += CHUNK) {
        chunks.push(siswaIds.slice(i, i + CHUNK));
      }
      const results = await Promise.all(
        chunks.map((chunk) =>
          walikelasDataKelasRepository
            .findWaliMuridByFilter(
              chunk.map((id) => `siswa_id ~ "${id}"`).join(" || "),
            )
            .catch(() => []),
        ),
      );
      waliMuridRecords = results.flat();
    }

    // Map siswaId -> [wali_murid, ...]
    const waliBySiswa = {};
    for (const w of waliMuridRecords) {
      for (const sid of toArray(w.siswa_id)) {
        if (!waliBySiswa[sid]) waliBySiswa[sid] = [];
        waliBySiswa[sid].push(w);
      }
    }

    /* ---------- Grouping siswa per kelas ---------- */
    const groupedSiswa = {};
    for (const s of siswaRecords) {
      const kid = firstOf(s.kelas_id);
      if (!kid) continue;
      if (!groupedSiswa[kid]) groupedSiswa[kid] = [];
      groupedSiswa[kid].push(s);
    }

    const umumMapel = kandidatUmumMapel.filter((m) => {
      const ids = Array.isArray(m.spesifik_kelas_id)
        ? m.spesifik_kelas_id
        : m.spesifik_kelas_id
          ? [m.spesifik_kelas_id]
          : [];
      return ids.length === 0;
    });

    const groupedMapel = {};
    for (const kelas of kelasRecords) {
      const tingkat = String(kelas.tingkat);
      const applied = [];
      const seen = new Set();

      for (const m of spesifikMapel) {
        const ids = Array.isArray(m.spesifik_kelas_id)
          ? m.spesifik_kelas_id
          : m.spesifik_kelas_id
            ? [m.spesifik_kelas_id]
            : [];
        if (ids.includes(kelas.id) && !seen.has(m.id)) {
          applied.push({ ...m, __khusus: true });
          seen.add(m.id);
        }
      }

      for (const m of umumMapel) {
        if (seen.has(m.id)) continue;
        if (!(m.target_tingkat || []).includes(tingkat)) continue;
        applied.push({ ...m, __khusus: false });
        seen.add(m.id);
      }

      groupedMapel[kelas.id] = applied.sort((a, b) =>
        (a.nama_mapel || "").localeCompare(b.nama_mapel || ""),
      );
    }

    return {
      kelasList: kelasRecords,
      siswaByKelas: groupedSiswa,
      mapelByKelas: groupedMapel,
      waliMuridBySiswa: waliBySiswa,
      error: null,
    };
  } catch (err) {
    console.error("Error fetching data:", err);
    return { error: "Gagal memuat data kelas atau mata pelajaran Anda." };
  }
}
