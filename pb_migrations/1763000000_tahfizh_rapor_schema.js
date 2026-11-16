/// <reference path="../pb_data/types.d.ts" />

// Menyesuaikan schema tahfizh dengan layout rapor tingkat 1-6 di assets/rapor_tahfiz.
// - kategori baru: sholat_sunnah & asmaul_husna (rapor tingkat 3)
// - predikat D = Belum Hafal (rapor tingkat 6)
// - koleksi predikat untuk 2 kategori baru
// - tahfizh_kategori: susunan/label/kolom tiap kategori per tingkat
migrate(
  (app) => {
    const RULES = '@request.auth.id != ""';
    const KOMPONEN_ID = "pbc_4214372476";
    const SISWA_ID = "pbc_siswa0000001";
    const TA_ID = "pbc_thnajaran01";

    const SEMUA_KATEGORI = [
      "hafalan",
      "jaritmatika",
      "gesture",
      "hadits",
      "doa",
      "wudhu",
      "sholat_sunnah",
      "asmaul_husna",
    ];

    const buatPredikat = (name) =>
      new Collection({
        name,
        type: "base",
        listRule: RULES,
        viewRule: RULES,
        createRule: RULES,
        updateRule: RULES,
        deleteRule: RULES,
        fields: [
          {
            name: "siswa_id",
            type: "relation",
            collectionId: SISWA_ID,
            maxSelect: 1,
            required: false,
          },
          {
            name: "predikat",
            type: "select",
            maxSelect: 1,
            values: ["A", "B", "C", "D", "*"],
          },
          {
            name: "komponen_id",
            type: "relation",
            collectionId: KOMPONEN_ID,
            maxSelect: 1,
            required: false,
          },
          {
            name: "tahun_ajaran_id",
            type: "relation",
            collectionId: TA_ID,
            maxSelect: 1,
            required: false,
          },
          {
            name: "created",
            type: "autodate",
            onCreate: true,
            onUpdate: false,
          },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX `idx_" +
            name +
            "_siswa_ta` ON `" +
            name +
            "` (`siswa_id`, `tahun_ajaran_id`)",
          "CREATE INDEX `idx_" +
            name +
            "_komponen` ON `" +
            name +
            "` (`komponen_id`)",
        ],
      });

    // 1. Kategori baru pada tahfizh_komponen.
    const komponen = app.findCollectionByNameOrId("tahfizh_komponen");
    const kategoriField = komponen.fields.getByName("kategori");
    kategoriField.values = SEMUA_KATEGORI;
    app.save(komponen);

    // 2. Predikat D pada koleksi predikat yang sudah ada.
    for (const name of [
      "tahfizh_hafalan",
      "tahfizh_jaritmatika",
      "tahfizh_gesture",
      "tahfizh_hadits",
      "tahfizh_doa",
      "tahfizh_wudhu",
    ]) {
      const col = app.findCollectionByNameOrId(name);
      col.fields.getByName("predikat").values = ["A", "B", "C", "D", "*"];
      app.save(col);
    }

    // 3. Koleksi predikat untuk kategori baru.
    app.save(buatPredikat("tahfizh_sholat_sunnah"));
    app.save(buatPredikat("tahfizh_asmaul_husna"));

    // 4. Susunan kategori per tingkat.
    app.save(
      new Collection({
        name: "tahfizh_kategori",
        type: "base",
        listRule: RULES,
        viewRule: RULES,
        createRule: RULES,
        updateRule: RULES,
        deleteRule: RULES,
        fields: [
          {
            name: "tingkat",
            type: "select",
            maxSelect: 1,
            values: ["1", "2", "3", "4", "5", "6"],
            required: true,
          },
          {
            name: "kategori",
            type: "select",
            maxSelect: 1,
            values: SEMUA_KATEGORI,
            required: true,
          },
          { name: "urutan", type: "number", onlyInt: true },
          { name: "label", type: "text", max: 60 },
          { name: "item_label", type: "text", max: 40 },
          { name: "kolom", type: "number", onlyInt: true },
          { name: "predikat_d", type: "bool" },
          {
            name: "created",
            type: "autodate",
            onCreate: true,
            onUpdate: false,
          },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX `idx_tahfizh_kategori_unik` ON `tahfizh_kategori` (`tingkat`, `kategori`)",
        ],
      }),
    );

    // Susunan mengikuti gambar rapor di assets/rapor_tahfiz.
    const SUSUNAN = {
      "1": [
        ["hafalan", "HAFALAN AL-QUR'AN", "SURAT", 1],
        ["jaritmatika", "JARIMATIKA AL-QUR'AN", "SURAT", 1],
        ["gesture", "GESTURE", "SURAT", 1],
        ["hadits", "HADITS", "HADITS", 1],
        ["doa", "DOA", "NIAT & DOA", 1],
        ["wudhu", "DOA BERWUDHU", "DOA", 1],
      ],
      "2": [
        ["hafalan", "HAFALAN AL-QUR'AN", "SURAT", 1],
        ["jaritmatika", "JARIMATIKA AL-QUR'AN", "SURAT", 1],
        ["gesture", "GESTURE", "SURAT", 1],
        ["doa", "DOA", "DOA", 1],
        ["hadits", "HADITS", "HADITS", 1],
      ],
      "3": [
        ["hafalan", "HAFALAN AL-QUR'AN", "SURAT", 1],
        ["jaritmatika", "JARIMATIKA AL-QUR'AN", "SURAT", 1],
        ["gesture", "GESTURE", "SURAT", 1],
        ["hadits", "HADITS", "HADITS", 1],
        ["sholat_sunnah", "SHOLAT SUNNAH RAWATIB", "NIAT", 1],
        ["asmaul_husna", "TERJEMAH ASMAUL HUSNA", "ASMAUL HUSNA", 2],
      ],
      "4": [
        ["hafalan", "HAFALAN AL-QUR'AN", "SURAT", 1],
        ["jaritmatika", "JARIMATIKA AL-QUR'AN", "SURAT", 1],
        ["gesture", "GESTURE", "SURAT", 1],
        ["doa", "DOA", "DOA", 1],
        ["hadits", "HADITS", "HADITS", 1],
      ],
      "5": [
        ["hafalan", "HAFALAN AL-QUR'AN", "SURAT", 1],
        ["jaritmatika", "JARIMATIKA AL-QUR'AN", "SURAT", 1],
        ["gesture", "GESTURE", "SURAT", 1],
        ["hadits", "HADITS", "HADITS", 1],
        ["doa", "DOA", "DOA", 1],
      ],
      "6": [["hafalan", "HAFALAN AL-QUR'AN", "SURAT", 1]],
    };

    const col = app.findCollectionByNameOrId("tahfizh_kategori");
    Object.keys(SUSUNAN).forEach((tingkat) => {
      SUSUNAN[tingkat].forEach(([kat, label, itemLabel, kolom], i) => {
        const rec = new Record(col);
        rec.set("tingkat", tingkat);
        rec.set("kategori", kat);
        rec.set("urutan", i + 1);
        rec.set("label", label);
        rec.set("item_label", itemLabel);
        rec.set("kolom", kolom);
        // Rapor tingkat 6 memakai D = Belum Hafal.
        rec.set("predikat_d", tingkat === "6");
        app.save(rec);
      });
    });
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("tahfizh_kategori"));
    app.delete(app.findCollectionByNameOrId("tahfizh_asmaul_husna"));
    app.delete(app.findCollectionByNameOrId("tahfizh_sholat_sunnah"));

    const komponen = app.findCollectionByNameOrId("tahfizh_komponen");
    komponen.fields.getByName("kategori").values = [
      "hafalan",
      "jaritmatika",
      "gesture",
      "hadits",
      "doa",
      "wudhu",
    ];
    app.save(komponen);

    for (const name of [
      "tahfizh_hafalan",
      "tahfizh_jaritmatika",
      "tahfizh_gesture",
      "tahfizh_hadits",
      "tahfizh_doa",
      "tahfizh_wudhu",
    ]) {
      const col = app.findCollectionByNameOrId(name);
      col.fields.getByName("predikat").values = ["A", "B", "C", "*"];
      app.save(col);
    }
  },
);
