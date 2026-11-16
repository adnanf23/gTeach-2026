import { describeError } from "@/lib/app-error";
import * as tahfizhRepository from "@/repositories/tahfizh.repository";
import { writeLog } from "@/services/systemLog.service";
import {
  KATEGORI_TAHFIZH as KATEGORI,
  normalisasiKategori,
  LABEL_CETAK,
} from "@/lib/tahfizh-kategori";

const firstOf = (v) => (Array.isArray(v) ? v[0] : v);

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

    // 6 kategori diambil paralel (sebelumnya berurutan -> 6x latensi).
    const hasil = await Promise.all(
      KATEGORI.map(async (kategori) => {
        const ids = komponen
          .filter((k) => k.kategori === kategori)
          .map((k) => k.id);
        const rows = await tahfizhRepository.findPredikat(kategori, {
          komponenIds: ids,
          tahunAjaranId,
        });
        return [kategori, mapPredikat(rows)];
      }),
    );

    const predikat = {};
    hasil.forEach(([kategori, map]) => {
      predikat[kategori] = map;
    });

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
    await writeLog({
      type: "info",
      msg: `Menambah komponen tahfizh '${komponen.trim()}' (kategori ${kategori}, tingkat ${kelas?.tingkat ?? "-"}).`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: "create", collection: "tahfizh_komponen", id: created?.id },
    }).catch(() => {});
    return { record: created, error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function removeKomponen(id) {
  try {
    await tahfizhRepository.deleteKomponen(id);
    await writeLog({
      type: "warning",
      msg: `Menghapus komponen tahfizh [${id}].`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: "delete", collection: "tahfizh_komponen", id },
    }).catch(() => {});
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
    await writeLog({
      type: "info",
      msg: `Menyimpan predikat ${kategori} siswa [${siswaId}]${predikat ? ` = ${predikat}` : " (kosong)"}.`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: existingId ? "update" : "create", collection: `tahfizh_${kategori}` },
    }).catch(() => {});
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
    await writeLog({
      type: "info",
      msg: `Menyimpan nilai tahsin siswa [${siswaId}] = ${data.nilai ?? "-"}.`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: existingId ? "update" : "create", collection: "tahfizh_nilai_tahsin" },
    }).catch(() => {});
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
    await writeLog({
      type: "info",
      msg: `Menyimpan catatan tahsin siswa [${siswaId}].`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: existingId ? "update" : "create", collection: "tahfizh_tahsin_catatan" },
    }).catch(() => {});
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
    await writeLog({
      type: "info",
      msg: `Menyimpan catatan tahfizh siswa [${siswaId}].`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: existingId ? "update" : "create", collection: "tahfizh_catatan" },
    }).catch(() => {});
    return { record: saved, error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/* ============================ RAPOR TAHFIZH ============================ */

// Susunan kategori rapor default, dipakai kalau tahfizh_kategori kosong
// (mis. migrasi belum dijalankan).
const KATEGORI_RAPOR_DEFAULT = normalisasiKategori(null, { cetak: true });

export async function getRaporTahfizhContext({ userId, kelasId, tahunAjaranId }) {
  try {
    const kelas = kelasId
      ? await tahfizhRepository.findKelasById(kelasId)
      : await tahfizhRepository.findKelasByWali(userId);
    if (!kelas) return { error: "Kelas tidak ditemukan." };

    // Ikut tahun ajaran ujian yang sedang dicetak, bukan tahun ajaran kelas.
    const taId = tahunAjaranId || firstOf(kelas.tahun_ajaran_id);
    const [mapelTahfizh, tahsinMapel, siswa, kategoriTingkat] = await Promise.all([
      tahfizhRepository.findMapelTahfizh(),
      resolveTahsinMapel(kelas.id),
      tahfizhRepository.findSiswaByKelas(kelas.id),
      tahfizhRepository.findKategoriByTingkat(String(kelas?.tingkat ?? "")),
    ]);

    return {
      kelas,
      tahunAjaranId: taId,
      mapelTahfizh,
      tahsinMapel,
      siswa,
      kategoriRapor: kategoriTingkat.length
        ? kategoriTingkat.map((r) => ({
            key: r.kategori,
            kategori: r.kategori,
            label: r.label || LABEL_CETAK[r.kategori]?.label,
            item_label:
              r.item_label || LABEL_CETAK[r.kategori]?.item || "SURAT",
            kolom: Number(r.kolom) === 2 ? 2 : 1,
            predikat_d: !!r.predikat_d,
          }))
        : KATEGORI_RAPOR_DEFAULT,
      error: null,
    };
  } catch (error) {
    console.error("[getRaporTahfizhContext]", error);
    return { error: describeError(error) };
  }
}

// Ambil seluruh data tahfizh satu kelas sekali, lalu petakan per siswa.
// Sebelumnya tiap siswa mengulang query komponen + 6 predikat + nilai tahsin +
// catatan (semuanya identik untuk satu kelas) sehingga biaya jadi N kali.
export async function getRaporTahfizhKelas({
  kelasId,
  tahunAjaranId,
  mapelTahfizhId,
  tahsinMapelId,
  siswaIds = [],
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

    const nilaiBySiswa = new Map();
    nilaiRows.forEach((r) => nilaiBySiswa.set(firstOf(r.siswa_id), r));
    const catatanTahsinBySiswa = new Map();
    catatanTahsinRows.forEach((r) =>
      catatanTahsinBySiswa.set(firstOf(r.siswa_id), r),
    );
    const catatanTahfizhBySiswa = new Map();
    catatanTahfizhRows.forEach((r) =>
      catatanTahfizhBySiswa.set(firstOf(r.siswa_id), r),
    );

    const komponen = tahfizhData.komponen || [];

    // Hasil dipetakan per siswa sebagai objek biasa (bukan fungsi) supaya bisa
    // dikirim lewat server action ke Client Component.
    // Kalau daftar siswa kelas diberikan, itulah yang jadi cakupan output.
    // Tanpa itu, pakai semua siswa yang muncul di data (nilai/predikat/catatan).
    let cakupan;
    if (siswaIds.length) {
      cakupan = siswaIds;
    } else {
      const siswaData = new Set();
      nilaiBySiswa.forEach((_, sid) => siswaData.add(sid));
      catatanTahsinBySiswa.forEach((_, sid) => siswaData.add(sid));
      catatanTahfizhBySiswa.forEach((_, sid) => siswaData.add(sid));
      for (const kategori of KATEGORI) {
        const map = tahfizhData.predikat?.[kategori] || {};
        Object.values(map).forEach((siswaMap) => {
          Object.keys(siswaMap).forEach((sid) => siswaData.add(sid));
        });
      }
      cakupan = Array.from(siswaData);
    }

    const dataPerSiswa = {};
    for (const siswaId of cakupan) {
      const predikatSiswa = {};
      for (const kategori of KATEGORI) {
        const map = tahfizhData.predikat?.[kategori] || {};
        predikatSiswa[kategori] = {};
        Object.entries(map).forEach(([komponenId, siswaMap]) => {
          predikatSiswa[kategori][komponenId] =
            siswaMap?.[siswaId]?.predikat || "";
        });
      }
      dataPerSiswa[siswaId] = {
        predikat: predikatSiswa,
        tahsinNilai: nilaiBySiswa.get(siswaId)?.nilai ?? null,
        catatanTahsin: catatanTahsinBySiswa.get(siswaId)?.catatan || "",
        catatanTahfizh: catatanTahfizhBySiswa.get(siswaId)?.catatan || "",
        error: null,
      };
    }

    // Komponen identik untuk semua siswa, jadi dikirim sekali di level atas.
    return { komponen, dataPerSiswa, error: null };
  } catch (error) {
    console.error("[getRaporTahfizhKelas]", error);
    return { komponen: [], dataPerSiswa: null, error: describeError(error) };
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

// Susunan kategori yang dipakai UI input (admin/ICT & panel penilaian).
// Hanya urutan + flag; label sengaja tidak dibawa karena label di
// tahfizh_kategori berformat cetak (huruf kapital).
export async function getKategoriTahfizh({ tingkat }) {
  try {
    const rows = await tahfizhRepository.findKategoriByTingkat(String(tingkat));
    return {
      kategori: rows.map((r) => ({
        key: r.kategori,
        kolom: Number(r.kolom) === 2 ? 2 : 1,
        predikatD: !!r.predikat_d,
      })),
      error: null,
    };
  } catch (error) {
    return { kategori: null, error: describeError(error) };
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
    await writeLog({
      type: "info",
      msg: `Menambah komponen tahfizh '${komponen.trim()}' (kategori ${kategori}, tingkat ${tingkat}).`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: "create", collection: "tahfizh_komponen", tingkat, kategori },
    }).catch(() => {});
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
    await writeLog({
      type: "warning",
      msg: `Menghapus komponen tahfizh '${komponen}' (kategori ${kategori}, tingkat ${tingkat}).`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: "delete", collection: "tahfizh_komponen", tingkat, kategori, jumlah: target.length },
    }).catch(() => {});
    return { error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}
