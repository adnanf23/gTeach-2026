// Definisi kategori tahfizh dipakai bersama UI admin/ICT, panel penilaian,
// dan lembar rapor. Urutan di sini sama dengan urutan kolom di koleksi
// tahfizh_komponen (select `kategori`).
export const KATEGORI_TAHFIZH = [
  "hafalan",
  "jaritmatika",
  "gesture",
  "hadits",
  "doa",
  "wudhu",
  "sholat_sunnah",
  "asmaul_husna",
];

// Label untuk UI input (bukan untuk cetak rapor -- itu dari tahfizh_kategori).
export const LABEL_KATEGORI = {
  hafalan: { label: "Hafalan Al-Qur'an", item: "Surat" },
  jaritmatika: { label: "Jaritmatika Al-Qur'an", item: "Surat" },
  gesture: { label: "Gesture", item: "Surat" },
  hadits: { label: "Hadits", item: "Hadits" },
  doa: { label: "Doa", item: "Niat & Doa" },
  wudhu: { label: "Doa Berwudhu", item: "Doa" },
  sholat_sunnah: { label: "Sholat Sunnah Rawatib", item: "Niat" },
  asmaul_husna: { label: "Terjemah Asmaul Husna", item: "Asmaul Husna" },
};

// Label khusus lembar cetak, mengikuti gambar rapor di assets/rapor_tahfiz.
export const LABEL_CETAK = {
  hafalan: { label: "HAFALAN AL-QUR'AN", item: "SURAT" },
  jaritmatika: { label: "JARIMATIKA AL-QUR'AN", item: "SURAT" },
  gesture: { label: "GESTURE", item: "SURAT" },
  hadits: { label: "HADITS", item: "HADITS" },
  doa: { label: "DOA", item: "NIAT & DOA" },
  wudhu: { label: "DOA BERWUDHU", item: "DOA" },
  sholat_sunnah: { label: "SHOLAT SUNNAH RAWATIB", item: "NIAT" },
  asmaul_husna: { label: "TERJEMAH ASMAUL HUSNA", item: "ASMAUL HUSNA" },
};

// Predikat A-C dipakai semua tingkat; D hanya rapor tingkat 6.
export const PREDIKAT_TAHFIZH = ["A", "B", "C", "D", "*"];

// TahfizhPanel menerima daftar kategori dalam bentuk apa pun. Server action
// mengembalikan record tahfizh_kategori (punya `kategori`), sedangkan komponen
// lain memakai `cat`/`key`. Semua dinormalkan ke { key, label, item, kolom }.
export function normalisasiKategori(
  list,
  { fallback = KATEGORI_TAHFIZH, cetak = false } = {},
) {
  const label = cetak ? LABEL_CETAK : LABEL_KATEGORI;
  const rows = Array.isArray(list) && list.length ? list : null;
  if (!rows) {
    return fallback.map((key) => ({
      key,
      kategori: key,
      label: label[key]?.label || key,
      item: label[key]?.item || key,
      item_label: label[key]?.item || key,
      kolom: 1,
      predikat_d: false,
    }));
  }
  return rows
    .map((r) => {
      const key = r.kategori || r.key || r.cat;
      if (!key) return null;
      const item = r.item_label || r.item || label[key]?.item || key;
      return {
        key,
        kategori: key,
        label: r.label || label[key]?.label || key,
        item,
        item_label: item,
        kolom: Number(r.kolom) === 2 ? 2 : 1,
        predikat_d: !!(r.predikat_d ?? r.predikatD),
      };
    })
    .filter(Boolean);
}
