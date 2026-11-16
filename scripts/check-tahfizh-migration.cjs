// Cek statis: pastikan migration memakai API PB 0.26 yang benar dan
// susunan kategori cocok dengan gambar rapor di assets/rapor_tahfiz.
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "pb_migrations/1763000000_tahfizh_rapor_schema.js",
  ),
  "utf8",
);

const errors = [];
const ok = (cond, msg) => cond || errors.push(msg);

ok(/migrate\(\s*\(app\)\s*=>/.test(src), "harus ada migrate((app) => ...)");
ok(/app\.findCollectionByNameOrId\(/.test(src), "pakai findCollectionByNameOrId");
ok(/new Collection\(/.test(src), "koleksi baru pakai new Collection(...)");
ok(/new Record\(/.test(src), "record baru pakai new Record(col)");
ok(/app\.save\(/.test(src), "simpan pakai app.save");
ok(/app\.delete\(/.test(src), "down pakai app.delete");
ok(!/\\\$apis/.test(src), "tidak boleh pakai $apis (tidak ada di JSVM)");

// Down-migration: setiap koleksi yang dibuat harus dihapus.
for (const c of ["tahfizh_kategori", "tahfizh_asmaul_husna", "tahfizh_sholat_sunnah"]) {
  ok(
    src.includes(`app.findCollectionByNameOrId("${c}")`),
    `down harus menangani ${c}`,
  );
}

// Kategori baru harus muncul di komponen dan di koleksi predikat.
for (const k of ["sholat_sunnah", "asmaul_husna"]) {
  ok(src.includes(`"tahfizh_${k}"`), `harus ada koleksi tahfizh_${k}`);
}

// Susunan harus mencakup tingkat 1-6.
for (const t of ["1", "2", "3", "4", "5", "6"]) {
  ok(new RegExp(`"${t}":\\s*\\[`).test(src), `susunan tingkat ${t} hilang`);
}

// Tingkat 6 = satu-satunya yang memakai predikat D.
ok(
  /rec\.set\("predikat_d",\s*tingkat === "6"\)/.test(src),
  "predikat_d harus hanya untuk tingkat 6",
);

// Nilai select predikat konsisten.
ok(src.includes('["A", "B", "C", "D", "*"]'), "predikat harus A,B,C,D,*");

if (errors.length) {
  console.error("GAGAL:");
  errors.forEach((e) => console.error(" -", e));
  process.exit(1);
}
console.log("migration check ok");
