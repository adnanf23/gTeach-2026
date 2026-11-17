// Cek penyusun halaman rapor tahfizh: halaman terisi penuh sebelum pindah
// halaman, tidak ada item hilang, dan halaman terakhir menyisakan ruang
// untuk blok penutup. Jalankan: node scripts/check-rapor-tahfizh-paging.cjs
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "components", "organism", "tahfizh", "RaporTahfizhSheet.js"),
  "utf8",
);
const mulai = src.indexOf("const TINGGI_KONTEN");
const akhir = src.indexOf("function Watermark");
assert.ok(mulai > 0 && akhir > mulai, "blok penyusun halaman tidak ditemukan");
const tmp = path.join(require("node:os").tmpdir(), `paging-${Date.now()}.cjs`);
fs.writeFileSync(
  tmp,
  src.slice(mulai, akhir) +
    "\nmodule.exports = { susunHalaman, segmenDariBlok, TINGGI_KONTEN, TINGGI_KOP, TINGGI_CATATAN, TINGGI_TUTUP, BARIS_MIN, BARIS_MAKS, kapasitasHalaman, barisMuat };",
);
const {
  susunHalaman,
  segmenDariBlok,
  TINGGI_KONTEN,
  TINGGI_KOP,
  TINGGI_CATATAN,
  TINGGI_TUTUP,
  BARIS_MIN,
  BARIS_MAKS,
  kapasitasHalaman,
  barisMuat,
} = require(tmp);
fs.unlinkSync(tmp);

const kat = (kategori, n, kolom = 1) => ({
  kategori,
  label: kategori.toUpperCase(),
  item_label: "ITEM",
  kolom,
  predikat_d: false,
  n,
});
const ambil = (list) => (kategori) => {
  const k = list.find((x) => x.kategori === kategori);
  return Array.from({ length: k?.n || 0 }, (_, i) => ({
    id: `${kategori}${i}`,
    komponen: `${kategori} ${i + 1}`,
  }));
};
const barisHalaman = (h) => h.baris;
const totalItem = (halaman) =>
  halaman.reduce((n, h) => n + h.blok.reduce((m, b) => m + b.jumlah, 0), 0);

// Kapasitas harus konsisten dengan geometri kertas.
assert.equal(barisMuat(0), Math.floor((TINGGI_KONTEN - TINGGI_KOP) / BARIS_MIN));
assert.equal(barisMuat(1), Math.floor(TINGGI_KONTEN / BARIS_MIN));

// ── Kasus 1: tingkat 1 (6 kategori, isi sedang) ──────────────────────────
{
  const list = [kat("hafalan", 5), kat("jaritmatika", 2), kat("gesture", 1), kat("hadits", 2), kat("doa", 3), kat("wudhu", 2)];
  const halaman = susunHalaman(list, ambil(list));
  assert.equal(halaman.length, 1, "isi kecil harus muat satu halaman");
  assert.equal(totalItem(halaman), 15, "semua item harus terpakai");
}

// ── Kasus 2: tingkat 3 (asmaul husna 2 kolom, 99 item) ───────────────────
{
  const list = [kat("hafalan", 5), kat("jaritmatika", 2), kat("gesture", 1), kat("hadits", 2), kat("sholat_sunnah", 8), kat("asmaul_husna", 99, 2)];
  const halaman = susunHalaman(list, ambil(list));
  assert.ok(halaman.length >= 2, "asmaul husna harus memecah halaman");

  // Halaman yang bukan terakhir wajib penuh: hanya boleh sisa < 1 baris.
  halaman.slice(0, -1).forEach((h, i) => {
    const muat = barisMuat(i);
    assert.ok(barisHalaman(h) <= muat, `halaman ${i + 1} kelebihan: ${barisHalaman(h)} > ${muat}`);
    assert.ok(
      muat - barisHalaman(h) < 2,
      `halaman ${i + 1} menyisakan ruang kosong: ${barisHalaman(h)} dari ${muat}`,
    );
  });

  // Potongan asmaul husna harus bersambung, tidak hilang/duplikat.
  const potongan = halaman
    .flatMap((h) => h.blok)
    .filter((b) => b.info.kategori === "asmaul_husna")
    .sort((a, b) => a.mulai - b.mulai);
  let harap = 0;
  for (const p of potongan) {
    assert.equal(p.mulai, harap, "potongan tidak bersambung");
    harap += p.jumlah;
  }
  assert.equal(harap, 50, "99 item 2 kolom = 50 baris");

  // Halaman terakhir harus menyisakan ruang penutup.
  const last = halaman[halaman.length - 1];
  const sisa = kapasitasHalaman(halaman.length - 1) - last.baris * BARIS_MIN;
  assert.ok(sisa >= TINGGI_TUTUP, `halaman terakhir kurang ruang tutup: ${sisa} < ${TINGGI_TUTUP}`);
}

// ── Kasus 3: tingkat 6 (hafalan panjang, penutup panjang) ────────────────
{
  const list = [kat("hafalan", 38)];
  const halaman = susunHalaman(list, ambil(list));
  assert.equal(totalItem(halaman), 38, "38 item harus utuh");
  // 38 item = 703px + penutup 540px tidak muat 980px, jadi penutup pindah ke
  // halaman 2 dan halaman 1 dipadatkan lewat padding baris (bukan pecah data).
  assert.ok(halaman.length === 2, `harus 2 halaman, dapat ${halaman.length}`);
  const h1 = halaman[0];
  assert.equal(totalItem([h1]), 38, "semua item di halaman 1");
  // Kekosongan 32 -> 52 baris harus tertutup padding sampai BARIS_MAKS.
  const tinggiBaris = (kapasitasHalaman(0)) / h1.baris;
  assert.ok(
    tinggiBaris <= BARIS_MAKS,
    `baris perlu ${tinggiBaris.toFixed(1)}px, melebihi BARIS_MAKS ${BARIS_MAKS}`,
  );
  const last = halaman[halaman.length - 1];
  const sisa = kapasitasHalaman(halaman.length - 1) - last.baris * BARIS_MIN;
  assert.ok(sisa >= TINGGI_TUTUP, `tutup tidak muat: ${sisa} < ${TINGGI_TUTUP}`);
}

// ── Kasus 4: isi sangat banyak, tidak ada item hilang ────────────────────
{
  const list = [kat("hafalan", 40), kat("jaritmatika", 40), kat("gesture", 30), kat("hadits", 30), kat("doa", 25), kat("wudhu", 25), kat("sholat_sunnah", 12), kat("asmaul_husna", 99, 2)];
  const halaman = susunHalaman(list, ambil(list));
  let harap = 0;
  for (const k of list) harap += k.kolom === 2 ? Math.ceil(k.n / 2) : k.n;
  assert.equal(totalItem(halaman), harap, "tidak boleh ada item hilang");
  halaman.slice(0, -1).forEach((h, i) => {
    assert.ok(
      barisHalaman(h) <= barisMuat(i),
      `halaman ${i + 1} kelebihan (${barisHalaman(h)} > ${barisMuat(i)})`,
    );
  });
}

// ── Kasus 5: kategori 1 kolom berurutan digabung jadi satu tabel ─────────
{
  const list = [kat("hafalan", 2), kat("jaritmatika", 2), kat("asmaul_husna", 4, 2), kat("doa", 2)];
  const [h1] = susunHalaman(list, ambil(list));
  const seg = segmenDariBlok(h1.blok);
  assert.ok(seg[0].duaK === false && seg[0].blok.length === 2, "2 kategori berurutan harus satu tabel");
  assert.ok(seg[1].duaK === true, "asmaul husna jadi segmen sendiri");
  assert.ok(seg[2].duaK === false && seg[2].blok.length === 1, "kategori setelahnya jadi tabel baru");
}

console.log("susunHalaman ok (5 kasus)");
