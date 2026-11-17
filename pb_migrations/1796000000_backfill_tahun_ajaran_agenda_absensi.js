/// <reference path="../pb_data/types.d.ts" />

// Isi `tahun_ajaran_id` pada agenda_mengajar dan absensi yang masih kosong.
//
// Kedua koleksi sudah punya field relasi ini sejak awal, tetapi jalur tulis
// aplikasinya tidak pernah mengirimnya (record.service.js tidak memasukkan
// kedua koleksi ini ke TAHUN_AJARAN_COLLECTIONS). Akibatnya ada 691 agenda dan
// 8433 absensi tanpa semester.
//
// Pemetaan memakai tanggal record terhadap rentang (Mulai..Akhir) tiap
// tahun_ajaran. Semester yang rentangnya kosong dilewati supaya tidak menebak.
// Record di luar semua rentang dibiarkan apa adanya dan dilaporkan -- tidak
// dihapus, tidak dipaksa masuk semester terdekat.
//
// Migration ini hanya MENULIS field yang tadinya kosong. Tidak ada query
// aplikasi yang memfilter kedua koleksi dengan tahun_ajaran_id (semuanya
// memakai rentang tanggal), jadi nilai yang tampil tidak berubah.

migrate(
  (app) => {
    const jumlah = { agenda_mengajar: 0, absensi: 0, dilewati: 0 };

    const semesters = app
      .findAllRecords("tahun_ajaran")
      .map((t) => ({
        id: t.id,
        mulai: String(t.getString("Mulai") || "").slice(0, 10),
        akhir: String(t.getString("Akhir") || "").slice(0, 10),
      }))
      .filter((t) => t.mulai && t.akhir)
      .sort((a, b) => a.mulai.localeCompare(b.mulai));

    if (semesters.length === 0) {
      console.log("backfill: tidak ada tahun_ajaran dengan rentang lengkap, dilewati");
      return;
    }

    const cariSemester = (tanggal) => {
      const d = String(tanggal || "").slice(0, 10);
      if (!d) return "";
      const cocok = semesters.filter((s) => d >= s.mulai && d <= s.akhir);
      // Hanya terima kalau tepat satu semester memuat tanggal ini. Rentang
      // yang tumpang tindih membuat pemetaan tidak pasti, jadi dibiarkan.
      return cocok.length === 1 ? cocok[0].id : "";
    };

    const koleksi = [
      ["agenda_mengajar", "date"],
      ["absensi", "tanggal"],
    ];

    for (const [nama, fieldTanggal] of koleksi) {
      const records = app.findAllRecords(nama);
      for (const rec of records) {
        const relasi = rec.get("tahun_ajaran_id");
        const sudah = Array.isArray(relasi) ? relasi[0] || "" : relasi || "";
        if (sudah) continue;

        const id = cariSemester(rec.get(fieldTanggal));
        if (!id) {
          jumlah.dilewati++;
          continue;
        }
        rec.set("tahun_ajaran_id", id);
        app.save(rec);
        jumlah[nama]++;
      }
    }

    console.log(
      `backfill tahun ajaran: agenda=${jumlah.agenda_mengajar}, absensi=${jumlah.absensi}, dilewati=${jumlah.dilewati}`,
    );
  },
  (app) => {
    // Tidak ada yang bisa dikembalikan dengan aman: sebelum migration ini
    // field yang kosong memang kosong, dan record yang sudah berisi tidak
    // disentuh. Karena itu rollback hanya mengosongkan record yang tanggalnya
    // berada di luar rentang semester mana pun -- mustahil dibedakan dari
    // hasil backfill. Sengaja dibiarkan tanpa aksi.
    console.log("backfill tahun ajaran: rollback tidak mengubah data");
  },
);
