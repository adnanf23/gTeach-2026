// Menentukan semester (tahun ajaran) dari sebuah tanggal.
//
// Dipakai untuk mengisi `tahun_ajaran_id` otomatis dan untuk memetakan record
// lama. Rentang yang tumpang tindih sengaja TIDAK dipilihkan: lebih baik kosong
// daripada salah semester.

const toDay = (v) => String(v || "").slice(0, 10);

export function rentangSemester(tahunAjaran) {
  const mulai = toDay(tahunAjaran?.Mulai);
  const akhir = toDay(tahunAjaran?.Akhir);
  return mulai && akhir ? { mulai, akhir } : null;
}

export function semesterUntukTanggal(tanggal, daftarTahunAjaran) {
  const d = toDay(tanggal);
  if (!d || !Array.isArray(daftarTahunAjaran)) return null;
  const cocok = daftarTahunAjaran.filter((t) => {
    const r = rentangSemester(t);
    return r && d >= r.mulai && d <= r.akhir;
  });
  return cocok.length === 1 ? cocok[0] : null;
}

export function semesterAktif(daftarTahunAjaran) {
  if (!Array.isArray(daftarTahunAjaran)) return null;
  return (
    daftarTahunAjaran.find((t) => t.is_aktif) || daftarTahunAjaran[0] || null
  );
}
