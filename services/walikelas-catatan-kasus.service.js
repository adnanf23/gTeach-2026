import * as walikelasCatatanKasusRepository from "@/repositories/walikelas-catatan-kasus.repository";

// Resolve kelas milik walikelas / pendamping yang login.
export async function resolveKelasWalikelas(userId) {
  try {
    const rec =
      await walikelasCatatanKasusRepository.findKelasByWaliOrPendamping(
        userId,
      );
    return { kelas: rec, error: null };
  } catch (e) {
    return { kelas: null, error: null };
  }
}

// Tahun ajaran aktif.
export async function getTahunAjaranAktif() {
  try {
    const rec = await walikelasCatatanKasusRepository.findTahunAjaranAktif();
    return { tahunAjaran: rec, error: null };
  } catch (e) {
    return {
      tahunAjaran: null,
      error: "Tahun ajaran aktif belum diatur. Hubungi admin/ICT.",
    };
  }
}

// Load siswa & catatan kasus untuk kelas ini, beserta statistik ringkasnya.
export async function getCatatanKasusData(kelasId) {
  try {
    const [siswaRes, catatanRes] = await Promise.all([
      walikelasCatatanKasusRepository.findSiswaByKelas(kelasId),
      walikelasCatatanKasusRepository.findCatatanKasusByKelas(kelasId),
    ]);

    const stats = {
      totalKasus: catatanRes.length,
      totalBerat: catatanRes.filter(
        (c) => c.jenis_kasus === "pelanggaran berat",
      ).length,
      siswaTerlibat: new Set(catatanRes.map((c) => c.siswa_id)).size,
    };

    return { siswaList: siswaRes, catatanList: catatanRes, stats, error: null };
  } catch (e) {
    return { error: "Gagal memuat data catatan kasus." };
  }
}

// Riwayat kasus seorang siswa (untuk modal).
export async function getRiwayatKasusSiswa({ siswaId, excludeId = null }) {
  try {
    const filter = excludeId
      ? `siswa_id="${siswaId}" && id != "${excludeId}"`
      : `siswa_id="${siswaId}"`;
    const records =
      await walikelasCatatanKasusRepository.findCatatanKasusByFilter(filter);
    return { records, error: null };
  } catch (e) {
    return { records: [], error: "Gagal memuat riwayat kasus." };
  }
}
