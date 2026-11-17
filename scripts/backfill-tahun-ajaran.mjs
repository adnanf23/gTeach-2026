// Backfill tahun_ajaran_id agenda_mengajar + absensi lewat API PocketBase.
// Hanya mengisi record yang relasinya KOSONG. Yang sudah berisi tidak disentuh.
//
// Pakai: node scripts/backfill-tahun-ajaran.mjs [--apply]
// Tanpa --apply hanya menghitung (dry-run).

import { readFileSync } from "node:fs";

const BASE = "https://cloud.ggans.my.id/api/collections";
const APPLY = process.argv.includes("--apply");

const token = JSON.parse(readFileSync(new URL("../auth.json", import.meta.url))).token;
const headers = { Authorization: token, "Content-Type": "application/json" };

const api = async (path, init) => {
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`${BASE}/${path}`, { headers, ...init });
      const body = await res.json();
      if (!res.ok) throw new Error(`${res.status} ${body?.message || "gagal"}`);
      return body;
    } catch (err) {
      lastErr = err;
      if (attempt < 5) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
};

const fetchAll = async (collection, fields) => {
  const out = [];
  for (let page = 1; ; page++) {
    const q = `perPage=500&page=${page}&sort=id&fields=${fields}`;
    const body = await api(`${collection}/records?${q}`);
    out.push(...body.items);
    if (page >= body.totalPages) return out;
  }
};

const shortDate = (v) => String(v || "").slice(0, 10);

const semesters = (await fetchAll("tahun_ajaran", "id,Mulai,Akhir"))
  .map((t) => ({ id: t.id, mulai: shortDate(t.Mulai), akhir: shortDate(t.Akhir) }))
  .filter((t) => t.mulai && t.akhir)
  .sort((a, b) => a.mulai.localeCompare(b.mulai));

if (semesters.length === 0) {
  console.log("Tidak ada tahun_ajaran dengan rentang tanggal lengkap. Batal.");
  process.exit(1);
}

console.log("Semester dipakai:");
for (const s of semesters) console.log(`  ${s.id}  ${s.mulai} .. ${s.akhir}`);

const findSemester = (tanggal) => {
  const d = shortDate(tanggal);
  if (!d) return "";
  const cocok = semesters.filter((s) => d >= s.mulai && d <= s.akhir);
  return cocok.length === 1 ? cocok[0].id : "";
};

const targets = [
  ["agenda_mengajar", "date"],
  ["absensi", "tanggal"],
];

console.log(APPLY ? "\nMODE: APPLY (menulis ke server)" : "\nMODE: DRY-RUN (tidak menulis)");

let totalTulis = 0;
let totalLewat = 0;

for (const [collection, dateField] of targets) {
  const rows = await fetchAll(collection, `id,${dateField},tahun_ajaran_id`);
  let tulis = 0;
  let lewat = 0;
  let sudah = 0;

  for (const row of rows) {
    const rel = row.tahun_ajaran_id;
    const current = Array.isArray(rel) ? rel[0] || "" : rel || "";
    if (current) {
      sudah++;
      continue;
    }
    const id = findSemester(row[dateField]);
    if (!id) {
      lewat++;
      continue;
    }
    if (APPLY) {
      await api(`${collection}/records/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tahun_ajaran_id: id }),
      });
    }
    tulis++;
  }

  totalTulis += tulis;
  totalLewat += lewat;
  console.log(
    `${collection.padEnd(16)} total=${rows.length}  sudah=${sudah}  ${APPLY ? "ditulis" : "akan ditulis"}=${tulis}  dilewati=${lewat}`,
  );
}

console.log(`\nRingkas: ${APPLY ? "ditulis" : "akan ditulis"}=${totalTulis}, dilewati=${totalLewat}`);
if (!APPLY && totalTulis > 0) console.log("Jalankan ulang dengan --apply untuk menerapkan.");
