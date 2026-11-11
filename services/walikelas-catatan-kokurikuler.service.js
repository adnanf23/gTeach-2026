import * as catatanSiswaRepository from "@/repositories/walikelas-catatan-kokurikuler.repository";

function pbQuote(str) {
  return String(str).replace(/"/g, '\\"');
}

// Baca + agregasi data halaman Catatan Kokurikuler walikelas:
// kelas guru -> siswa -> catatan_kokurikuler.
export async function getCatatanKokurikulerData({ userId }) {
  try {
    const kelasGuru = await catatanSiswaRepository.findKelasGuru(
      `walikelas_id = "${pbQuote(userId)}" || pendamping_id = "${pbQuote(userId)}"`,
    );

    if (kelasGuru.length === 0) {
      return { guruKelasList: [], siswaList: [], list: [], error: null };
    }

    const myKelasIds = kelasGuru.map((k) => k.id);

    const siswaRes = await catatanSiswaRepository.findSiswa(
      myKelasIds.map((id) => `kelas_id = "${pbQuote(id)}"`).join(" || "),
    );

    if (siswaRes.length === 0) {
      return {
        guruKelasList: kelasGuru,
        siswaList: [],
        list: [],
        error: null,
      };
    }

    const mySiswaIds = siswaRes.map((s) => s.id);

    const filterCatatan =
      `(${mySiswaIds.map((id) => `siswa_id = "${pbQuote(id)}"`).join(" || ")})` +
      ` && ` +
      `(${myKelasIds.map((id) => `kelas_id = "${pbQuote(id)}"`).join(" || ")})`;

    const catatanRes =
      await catatanSiswaRepository.findCatatanKokurikuler(filterCatatan);

    return {
      guruKelasList: kelasGuru,
      siswaList: siswaRes,
      list: catatanRes,
      error: null,
    };
  } catch (err) {
    console.error(err);
    return {
      guruKelasList: [],
      siswaList: [],
      list: [],
      error:
        "Gagal memuat data. Pastikan PocketBase berjalan dan kamu sudah login.",
    };
  }
}
