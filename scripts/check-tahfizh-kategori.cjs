// Cek unit: normalisasiKategori harus menghasilkan susunan sesuai tingkat,
// dengan label cetak KAPITAL dan label UI biasa.
const assert = require("node:assert");

const load = async () => {
  const src = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "lib", "tahfizh-kategori.js"),
    "utf8",
  );
  // Buang import/export supaya bisa dieksekusi dengan require.
  const mod = src
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")
    .concat(
      "\nmodule.exports = { KATEGORI_TAHFIZH, LABEL_KATEGORI, LABEL_CETAK, PREDIKAT_TAHFIZH, normalisasiKategori };",
    );
  const tmp = require("node:path").join(
    require("node:os").tmpdir(),
    "thk-" + Date.now() + ".cjs",
  );
  require("node:fs").writeFileSync(tmp, mod);
  const m = require(tmp);
  require("node:fs").unlinkSync(tmp);
  return m;
};

(async () => {
  const { normalisasiKategori, KATEGORI_TAHFIZH, PREDIKAT_TAHFIZH } = await load();

  // 1. Fallback: 8 kategori, label UI (bukan kapital semua).
  const fallback = normalisasiKategori(null);
  assert.equal(fallback.length, 8, "fallback harus 8 kategori");
  assert.equal(fallback[0].label, "Hafalan Al-Qur'an");
  assert.ok(fallback.every((k) => k.kategori === k.key), "kategori == key");

  // 2. Mode cetak: label kapital.
  const cetak = normalisasiKategori(null, { cetak: true });
  assert.equal(cetak[0].label, "HAFALAN AL-QUR'AN");
  assert.equal(cetak[7].label, "TERJEMAH ASMAUL HUSNA");

  // 3. Data ala tahfizh_kategori (tingkat 3) -> urutan & kolom dipertahankan.
  const t3 = normalisasiKategori(
    [
      { kategori: "hafalan", label: "HAFALAN AL-QUR'AN", item_label: "SURAT", kolom: 1, predikat_d: false },
      { kategori: "sholat_sunnah", label: "SHOLAT SUNNAH RAWATIB", item_label: "NIAT", kolom: 1, predikat_d: false },
      { kategori: "asmaul_husna", label: "TERJEMAH ASMAUL HUSNA", item_label: "ASMAUL HUSNA", kolom: 2, predikat_d: false },
    ],
    { cetak: true },
  );
  assert.deepEqual(
    t3.map((k) => k.kategori),
    ["hafalan", "sholat_sunnah", "asmaul_husna"],
  );
  assert.equal(t3[2].kolom, 2, "asmaul husna harus 2 kolom");

  // 4. tingkat 6: predikat_d ikut terbawa.
  const t6 = normalisasiKategori(
    [{ kategori: "hafalan", kolom: 1, predikat_d: true }],
    { cetak: true },
  );
  assert.equal(t6.length, 1);
  assert.equal(t6[0].predikat_d, true, "tingkat 6 pakai predikat D");
  assert.equal(t6[0].label, "HAFALAN AL-QUR'AN", "label diisi dari LABEL_CETAK");

  // 5. Bentuk alternatif (key/item) tetap dikenali.
  const alt = normalisasiKategori([{ key: "doa", item: "Doa" }]);
  assert.equal(alt[0].kategori, "doa");

  // 6. Entri tanpa kunci dibuang, tidak menghasilkan undefined.
  assert.equal(normalisasiKategori([{}, { kategori: "hadits" }]).length, 1);

  // 7. Predikat A-D-* konsisten dengan schema.
  assert.deepEqual(PREDIKAT_TAHFIZH, ["A", "B", "C", "D", "*"]);

  // 8. Daftar kategori harus memuat yang dipakai rapor.
  for (const k of ["sholat_sunnah", "asmaul_husna"]) {
    assert.ok(KATEGORI_TAHFIZH.includes(k), `${k} harus ada`);
  }

  console.log("normalisasiKategori ok (8 asersi)");
})();
