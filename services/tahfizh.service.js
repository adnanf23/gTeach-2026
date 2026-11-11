import { describeError } from "@/lib/app-error";
import * as tahfizhRepository from "@/repositories/tahfizh.repository";

const firstOf = (v) => (Array.isArray(v) ? v[0] : v);

const KATEGORI = tahfizhRepository.KATEGORI_TAHFIZH;

function mapPredikat(rows) {
  const map = {};
  rows.forEach((r) => {
    const sid = firstOf(r.siswa_id);
    if (!map[r.komponen_id]) map[r.komponen_id] = {};
    map[r.komponen_id][sid] = { id: r.id, predikat: r.predikat };
  });
  return map;
}

// Data tahfizh satu mapel: komponen + predikat per kategori.
export async function getTahfizhData({ kelasId, tahunAjaranId, mapelId }) {
  try {
    const kelas = await tahfizhRepository.findKelasById(kelasId);
    const komponen = await tahfizhRepository.findKomponenByTingkat({
      tingkat: String(kelas?.tingkat ?? ""),
      tahunAjaranId,
      mapelId,
    });

    const predikat = {};
    for (const kategori of KATEGORI) {
      const ids = komponen
        .filter((k) => k.kategori === kategori)
        .map((k) => k.id);
      const rows = await tahfizhRepository.findPredikat(kategori, {
        komponenIds: ids,
        tahunAjaranId,
      });
      predikat[kategori] = mapPredikat(rows);
    }

    return { komponen, predikat, error: null };
  } catch (error) {
    console.error("[getTahfizhData]", error);
    return { komponen: [], predikat: {}, error: describeError(error) };
  }
}

export async function addKomponen({
  kelasId,
  tahunAjaranId,
  mapelId,
  komponen,
  kategori,
}) {
  try {
    if (!komponen?.trim() || !kategori) {
      return { error: "Nama komponen dan kategori wajib diisi." };
    }
    const kelas = await tahfizhRepository.findKelasById(kelasId);
    const created = await tahfizhRepository.createKomponen({
      komponen: komponen.trim(),
      tingkat: String(kelas?.tingkat ?? ""),
      tahun_ajaran_id: tahunAjaranId,
      mapel_id: mapelId,
      kategori,
    });
    return { record: created, error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function removeKomponen(id) {
  try {
    await tahfizhRepository.deleteKomponen(id);
    return { error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function setPredikat({
  kategori,
  siswaId,
  komponenId,
  tahunAjaranId,
  predikat,
  existingId,
}) {
  try {
    if (!KATEGORI.includes(kategori)) {
      return { error: "Kategori tidak valid." };
    }
    const data = {
      siswa_id: siswaId,
      komponen_id: komponenId,
      tahun_ajaran_id: tahunAjaranId,
      predikat: predikat || null,
    };
    const saved = await tahfizhRepository.savePredikat(
      kategori,
      data,
      existingId,
    );
    return { record: saved, error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/* ============================ TAHSIN (guru mapel) ============================ */

// Mapel TAHSIN untuk kelas = mapel "TAHSIN" yang ada di ploting_guru kelas itu.
async function resolveTahsinMapel(kelasId) {
  const ploting = await tahfizhRepository.findPlotingByKelas(kelasId);
  for (const p of ploting) {
    const mapel = p.expand?.mapel_id;
    const nama = String(mapel?.nama_mapel || "").toUpperCase();
    if (nama.includes("TAHSIN")) return mapel;
  }
  return null;
}

export async function getTahsinData({ kelasId, tahunAjaranId }) {
  try {
    const mapel = await resolveTahsinMapel(kelasId);
    if (!mapel) {
      return { mapel: null, nilai: [], catatan: [], error: null };
    }
    const [nilai, catatan] = await Promise.all([
      tahfizhRepository.findNilaiTahsin({
        kelasId,
        tahunAjaranId,
        mapelId: mapel.id,
      }),
      tahfizhRepository.findTahsinCatatan({ kelasId, tahunAjaranId }),
    ]);
    return { mapel, nilai, catatan, error: null };
  } catch (error) {
    console.error("[getTahsinData]", error);
    return { mapel: null, nilai: [], catatan: [], error: describeError(error) };
  }
}

export async function setNilaiTahsin({
  siswaId,
  kelasId,
  tahunAjaranId,
  mapelId,
  nilai,
  existingId,
}) {
  try {
    const data = {
      siswa_id: siswaId,
      kelas_id: kelasId,
      tahun_ajaran_id: tahunAjaranId,
      mapel_id: mapelId,
      nilai: nilai === "" || nilai === null ? null : Number(nilai),
    };
    const saved = await tahfizhRepository.saveNilaiTahsin(data, existingId);
    return { record: saved, error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function setCatatanTahsin({
  siswaId,
  kelasId,
  tahunAjaranId,
  catatan,
  existingId,
}) {
  try {
    const data = {
      siswa_id: siswaId,
      kelas_id: kelasId,
      tahun_ajaran_id: tahunAjaranId,
      catatan: catatan || "",
    };
    const saved = await tahfizhRepository.saveTahsinCatatan(data, existingId);
    return { record: saved, error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/* ============================ CATATAN TAHFIZH (rapor) ============================ */

export async function getTahfizhCatatan({ kelasId, tahunAjaranId }) {
  try {
    const rows = await tahfizhRepository.findTahfizhCatatan({
      kelasId,
      tahunAjaranId,
    });
    return { rows, error: null };
  } catch (error) {
    return { rows: [], error: describeError(error) };
  }
}

export async function setCatatanTahfizh({
  siswaId,
  kelasId,
  tahunAjaranId,
  catatan,
  existingId,
}) {
  try {
    const data = {
      siswa_id: siswaId,
      kelas_id: kelasId,
      tahun_ajaran_id: tahunAjaranId,
      catatan: catatan || "",
    };
    const saved = await tahfizhRepository.saveTahfizhCatatan(data, existingId);
    return { record: saved, error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/* ============================ RAPOR TAHFIZH ============================ */

export async function getRaporTahfizhContext({ userId, kelasId }) {
  try {
    const kelas = kelasId
      ? await tahfizhRepository.findKelasById(kelasId)
      : await tahfizhRepository.findKelasByWali(userId);
    if (!kelas) return { error: "Kelas tidak ditemukan." };

    const taId = firstOf(kelas.tahun_ajaran_id);
    const [mapelTahfizh, tahsinMapel, siswa] = await Promise.all([
      tahfizhRepository.findMapelTahfizh(),
      resolveTahsinMapel(kelas.id),
      tahfizhRepository.findSiswaByKelas(kelas.id),
    ]);

    return {
      kelas,
      tahunAjaranId: taId,
      mapelTahfizh,
      tahsinMapel,
      siswa,
      error: null,
    };
  } catch (error) {
    console.error("[getRaporTahfizhContext]", error);
    return { error: describeError(error) };
  }
}

export async function getRaporTahfizhSiswa({
  kelasId,
  tahunAjaranId,
  mapelTahfizhId,
  tahsinMapelId,
  siswaId,
}) {
  try {
    const [tahfizhData, nilaiRows, catatanTahsinRows, catatanTahfizhRows] =
      await Promise.all([
        mapelTahfizhId
          ? getTahfizhData({ kelasId, tahunAjaranId, mapelId: mapelTahfizhId })
          : Promise.resolve({ komponen: [], predikat: {} }),
        tahsinMapelId
          ? tahfizhRepository.findNilaiTahsin({
              kelasId,
              tahunAjaranId,
              mapelId: tahsinMapelId,
            })
          : Promise.resolve([]),
        tahfizhRepository.findTahsinCatatan({ kelasId, tahunAjaranId }),
        tahfizhRepository.findTahfizhCatatan({ kelasId, tahunAjaranId }),
      ]);

    const predikatSiswa = {};
    for (const kategori of KATEGORI) {
      const map = tahfizhData.predikat?.[kategori] || {};
      predikatSiswa[kategori] = {};
      Object.entries(map).forEach(([komponenId, perSiswa]) => {
        predikatSiswa[kategori][komponenId] =
          perSiswa?.[siswaId]?.predikat || "";
      });
    }

    const nilai = nilaiRows.find(
      (r) => firstOf(r.siswa_id) === siswaId,
    );
    const catatanTahsin = catatanTahsinRows.find(
      (r) => firstOf(r.siswa_id) === siswaId,
    );
    const catatanTahfizh = catatanTahfizhRows.find(
      (r) => firstOf(r.siswa_id) === siswaId,
    );

    return {
      komponen: tahfizhData.komponen || [],
      predikat: predikatSiswa,
      tahsinNilai: nilai?.nilai ?? null,
      catatanTahsin: catatanTahsin?.catatan || "",
      catatanTahfizh: catatanTahfizh?.catatan || "",
      error: null,
    };
  } catch (error) {
    console.error("[getRaporTahfizhSiswa]", error);
    return { error: describeError(error) };
  }
}

/* ============== KOMPONEN PER TINGKAT (dashboard admin/ICT) ============== */

export async function getMapelTahfizh() {
  try {
    const mapel = await tahfizhRepository.findMapelTahfizh();
    return { mapel, error: null };
  } catch (error) {
    return { mapel: null, error: describeError(error) };
  }
}

export async function getKomponenTingkat({ tingkat, tahunAjaranId, mapelId }) {
  try {
    const kelas = await tahfizhRepository.findKelasByTingkat(
      tingkat,
      tahunAjaranId,
    );
    if (kelas.length === 0) return { kelas: [], komponen: [], error: null };
    const rows = await tahfizhRepository.findKomponenByTingkat({
      tingkat,
      tahunAjaranId,
      mapelId,
    });
    return {
      kelas,
      komponen: rows.map((k) => ({
        key: k.id,
        id: k.id,
        komponen: k.komponen,
        kategori: k.kategori,
      })),
      error: null,
    };
  } catch (error) {
    console.error("[getKomponenTingkat]", error);
    return { kelas: [], komponen: [], error: describeError(error) };
  }
}

export async function addKomponenTingkat({
  tingkat,
  tahunAjaranId,
  mapelId,
  komponen,
  kategori,
}) {
  try {
    if (!komponen?.trim() || !kategori) {
      return { error: "Nama komponen dan kategori wajib diisi." };
    }
    const kelas = await tahfizhRepository.findKelasByTingkat(
      tingkat,
      tahunAjaranId,
    );
    if (kelas.length === 0) return { error: "Tidak ada kelas pada tingkat ini." };
    await tahfizhRepository.createKomponen({
      komponen: komponen.trim(),
      tingkat: String(tingkat),
      tahun_ajaran_id: tahunAjaranId,
      mapel_id: mapelId,
      kategori,
    });
    return { error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function removeKomponenTingkat({
  tingkat,
  tahunAjaranId,
  mapelId,
  komponen,
  kategori,
}) {
  try {
    const kelas = await tahfizhRepository.findKelasByTingkat(
      tingkat,
      tahunAjaranId,
    );
    if (kelas.length === 0) return { error: null };
    const rows = await tahfizhRepository.findKomponenByTingkat({
      tingkat,
      tahunAjaranId,
      mapelId,
    });
    const nama = String(komponen).trim().toLowerCase();
    const target = rows.filter(
      (r) =>
        String(r.kategori) === String(kategori) &&
        String(r.komponen).trim().toLowerCase() === nama,
    );
    await Promise.all(target.map((r) => tahfizhRepository.deleteKomponen(r.id)));
    return { error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}
