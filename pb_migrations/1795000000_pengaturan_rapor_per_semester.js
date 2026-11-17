/// <reference path="../pb_data/types.d.ts" />

// Kunci pengaturan rapor dipindah dari per-ujian ke per (tahun ajaran, jenis rapor).
//
// Alasan: nilai tahfizh disimpan per `tahun_ajaran_id` (bukan per ujian), jadi
// rapor tahfizh memang satu per semester. Sementara AHB dan ASAS terikat
// ujian masing-masing. Kunci per-jenis menutup keduanya tanpa membedakan
// sumber nilai, dan mencegah satu semester punya dua rapor sejenis.
//
// Field yang dibuang:
// - `ujian_id`     : relasi multi (maxSelect 0) + filter `~` membuat pengaturan
//                    milik AHB terbaca sebagai milik ujian Tahfizh.
// - `tahun_ajaran` : teks bebas; diganti relasi supaya semester ikut terbaca.
//
// Backfill: setiap record lama dipetakan ke (tahun_ajaran_id, jenis_rapor)
// lewat ujian yang ditunjuk. Record tanpa ujian valid dibuang karena tidak
// bisa dipetakan dengan pasti.

migrate(
  (app) => {
    const RULES = '@request.auth.id != ""';
    const TA_ID = "pbc_thnajaran01";

    const col = app.findCollectionByNameOrId("pengaturan_rapor");

    // 1. Field baru.
    col.fields.add(
      new RelationField({
        name: "tahun_ajaran_id",
        collectionId: TA_ID,
        maxSelect: 1,
        required: false,
      }),
    );
    col.fields.add(
      new SelectField({
        name: "jenis_rapor",
        maxSelect: 1,
        values: ["tahfiz", "ahb", "asas"],
      }),
    );
    col.fields.add(
      new TextField({
        name: "kepala_sekolah",
        required: false,
      }),
    );

    // Field baru harus tersimpan dulu. Kalau belum, rec.set() untuk field baru
    // akan dibuang diam-diam dan backfill tidak pernah terpakai.
    app.save(col);

    // 2. Backfill dari record lama, sebelum `ujian_id` dibuang.
    const lama = app.findAllRecords("pengaturan_rapor");
    for (const rec of lama) {
      const relasi = rec.get("ujian_id");
      const ujianId = Array.isArray(relasi) ? relasi[0] || "" : relasi || "";
      const teksTa = (rec.getString("tahun_ajaran") || "").trim();
      const tanggal = rec.getString("tanggal_rapor");

      let ujian = null;
      if (ujianId) {
        try {
          ujian = app.findRecordById("pengaturan_ujian", ujianId);
        } catch {
          ujian = null;
        }
      }

      // Jenis rapor diturunkan dari ujian; template tahfiz menang karena
      // nilainya tersimpan per semester, bukan per ujian.
      let jenis = "";
      if (ujian) {
        if (ujian.getString("template_rapor") === "tahfiz") jenis = "tahfiz";
        else if (ujian.getString("jenis_ujian") === "asas") jenis = "asas";
        else if (ujian.getString("jenis_ujian") === "ahb") jenis = "ahb";
      }

      // Tahun ajaran: relasi ujian dulu, lalu cocokkan teks lama, lalu yang aktif.
      let tahunAjaranId = ujian ? ujian.getString("tahun_ajaran_id") : "";
      if (!tahunAjaranId && teksTa) {
        const cocok = app.findRecordsByFilter(
          "tahun_ajaran",
          "tahun = {:t}",
          "",
          1,
          0,
          { t: teksTa },
        );
        if (cocok.length > 0) tahunAjaranId = cocok[0].id;
      }
      if (!tahunAjaranId) {
        const aktif = app.findRecordsByFilter(
          "tahun_ajaran",
          "is_aktif = true",
          "",
          1,
          0,
        );
        if (aktif.length > 0) tahunAjaranId = aktif[0].id;
      }

      const lengkap = tahunAjaranId && jenis;
      if (!lengkap) {
        // Tidak bisa dipetakan dengan pasti (record uji tanpa ujian valid).
        app.delete(rec);
        continue;
      }

      rec.set("tahun_ajaran_id", tahunAjaranId);
      rec.set("jenis_rapor", jenis);
      if (tanggal) rec.set("tanggal_rapor", tanggal);
      app.save(rec);
    }

    // 3. Buang field lama + pasang unique index per (tahun ajaran, jenis).
    col.fields.removeByName("ujian_id");
    col.fields.removeByName("tahun_ajaran");
    col.indexes = [
      "CREATE UNIQUE INDEX `idx_pengaturan_rapor_ta_jenis` ON `pengaturan_rapor` (`tahun_ajaran_id`, `jenis_rapor`)",
    ];
    col.listRule = RULES;
    col.viewRule = RULES;
    col.createRule = RULES;
    col.updateRule = RULES;
    col.deleteRule = RULES;
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("pengaturan_rapor");

    col.indexes = [];
    col.fields.removeByName("tahun_ajaran_id");
    col.fields.removeByName("jenis_rapor");
    col.fields.removeByName("kepala_sekolah");
    col.fields.add(
      new RelationField({
        name: "ujian_id",
        collectionId: "pbc_ptrujian001",
        maxSelect: 0,
        required: false,
      }),
    );
    col.fields.add(
      new TextField({
        name: "tahun_ajaran",
        required: false,
      }),
    );
    app.save(col);
  },
);
