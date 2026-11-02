import * as absensiRepository from "@/repositories/guru-mapel-harian-absensi.repository";

// ---------------------------------------------------------------------------
// Helper murni (tanpa I/O)
// ---------------------------------------------------------------------------
function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// expand.kelas_id bisa berupa array record atau satu record.
export function normalizeKelasArr(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

// Plotting diurutkan berdasarkan nama mapel (seperti tampilan di halaman).
export function sortPlotingByMapel(records) {
  return [...records].sort((a, b) =>
    (a.expand?.mapel_id?.nama_mapel || "").localeCompare(
      b.expand?.mapel_id?.nama_mapel || "",
    ),
  );
}

// Opsi kelas siap tampil: pasangan kelas + jumlah siswa, diurutkan per tingkat
// lalu nama kelas.
export function buildKelasOptions(kelasArr, counts) {
  return kelasArr
    .map((k, idx) => ({ kelas: k, siswaCount: counts[idx] }))
    .sort((a, b) => {
      const t =
        (Number(a.kelas.tingkat) || 0) - (Number(b.kelas.tingkat) || 0);
      if (t !== 0) return t;
      return (a.kelas.nama_kelas || "").localeCompare(b.kelas.nama_kelas || "");
    });
}

// Absensi dikelompokkan per tanggal: { 'YYYY-MM-DD': { siswaId: status } }.
export function groupAbsensiByDate(records) {
  const grouped = {};
  for (const r of records) {
    const key = toISODate(new Date(r.tanggal));
    if (!grouped[key]) grouped[key] = {};
    grouped[key][r.siswa_id] = r.status;
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Baca data halaman absensi harian guru mapel
// ---------------------------------------------------------------------------

// Daftar plotting guru beserta mapel & kelas yang diampu.
export async function getPlotingGuru(guruId) {
  try {
    const records = await absensiRepository.findPlotingGuruByGuru(guruId);
    return { plotingList: sortPlotingByMapel(records), error: null };
  } catch (error) {
    console.error("Error fetching ploting_guru:", error);
    return {
      plotingList: [],
      error: "Gagal memuat daftar mata pelajaran Anda.",
    };
  }
}

// Opsi kelas dari plotting terpilih (lengkap dengan jumlah siswa per kelas).
export async function getKelasOptions(ploting) {
  try {
    const kelasArr = normalizeKelasArr(ploting?.expand?.kelas_id);

    // Satu kelas gagal dihitung tidak boleh menggagalkan seluruh daftar.
    const counts = await Promise.all(
      kelasArr.map((k) =>
        absensiRepository.countSiswaByKelas(k.id).catch(() => 0),
      ),
    );

    return { kelasOptions: buildKelasOptions(kelasArr, counts), error: null };
  } catch (error) {
    console.error("Error building kelas options:", error);
    return {
      kelasOptions: [],
      error: "Gagal memuat daftar kelas untuk mata pelajaran ini.",
    };
  }
}

// Siswa kelas + absensi satu bulan (sudah dikelompokkan per tanggal).
export async function getAbsensiBulan({ kelasId, year, month }) {
  try {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startStr = `${toISODate(first)} 00:00:00`;
    const endStr = `${toISODate(last)} 23:59:59`;

    const [siswa, records] = await Promise.all([
      absensiRepository.findSiswaByKelas(kelasId),
      absensiRepository.findAbsensiByRange({
        kelasId,
        startStr,
        endStr,
      }),
    ]);

    return {
      siswa,
      monthAbsensi: groupAbsensiByDate(records),
      error: null,
    };
  } catch (error) {
    console.error("Error loading absensi:", error);
    return {
      siswa: [],
      monthAbsensi: {},
      error: "Gagal memuat data absensi. Silakan coba lagi.",
    };
  }
}
