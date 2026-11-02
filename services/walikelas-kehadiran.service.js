import * as kehadiranRepository from "@/repositories/walikelas-kehadiran.repository";

// Baca data halaman Ketidakhadiran Manual walikelas:
// kelas walikelas -> siswa kelas -> kehadiran_manual (di-map ke UI).
export async function getKehadiranData({ userId }) {
  try {
    const kelasData = await kehadiranRepository.findKelasGuru(
      `walikelas_id = "${userId}" || pendamping_id = "${userId}"`,
    );

    const [siswaData, kehadiranData] = await Promise.all([
      kehadiranRepository.findSiswaByKelas(`kelas_id = "${kelasData.id}"`),
      kehadiranRepository
        .findKehadiranByKelas(`kelas_id = "${kelasData.id}"`)
        .catch((err) => {
          console.warn("kehadiran_manual tidak bisa dibaca:", err?.status);
          return [];
        }),
    ]);

    const initValues = {};
    const initIds = {};

    siswaData.forEach((s) => {
      const rec = kehadiranData.find((k) => k.siswa_id === s.id);
      // Mapping UI ↔ DB:
      //   UI alpha  ↔  DB `hadir`
      initValues[s.id] = {
        sakit: Number(rec?.sakit ?? 0),
        izin: Number(rec?.izin ?? 0),
        alpha: Number(rec?.hadir ?? 0),
      };
      if (rec) initIds[s.id] = rec.id;
    });

    return {
      kelas: kelasData,
      siswaList: siswaData,
      values: initValues,
      saved: JSON.parse(JSON.stringify(initValues)),
      recordIds: initIds,
      error: null,
    };
  } catch (e) {
    if (e?.status !== 404 && !e?.isAbort) {
      console.error(e);
      return {
        kelas: null,
        siswaList: [],
        values: {},
        saved: {},
        recordIds: {},
        error: "Gagal memuat data kelas / kehadiran.",
      };
    }
    // 404: akun belum terdaftar sebagai walikelas/pendamping kelas mana pun.
    return {
      kelas: null,
      siswaList: [],
      values: {},
      saved: {},
      recordIds: {},
      error: null,
    };
  }
}
