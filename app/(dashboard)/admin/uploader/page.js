"use client";

import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { pb } from "@/lib/pocketbase"; // sesuaikan path file pocketbase kamu

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

const KOMPONEN = ["k1", "k2", "k3", "k4"];
const NAVY = "FF1E3A5F";
const DEFAULT_TP = [
  "TP 1",
  "TP 2",
  "TP 3",
  "TP 4",
  "TP 5",
  "TP 6",
  "TP 7",
  "TP 8",
  "TP 9",
  "TP 10",
];
const DEFAULT_LP = [
  "LP 1",
  "LP 2",
  "LP 3",
  "LP 4",
  "LP 5",
  "LP 6",
  "LP 7",
  "LP 8",
  "LP 9",
  "LP 10",
];

const normKey = (s) =>
  String(s ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
const normNama = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const noTpAngka = (s) => parseInt(String(s ?? "").replace(/\D/g, ""), 10) || 0;
const clean = (s) => String(s ?? "").replace(/[^a-z0-9]+/gi, "_");

function unwrapRel(v) {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function cellToValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return null;
  if (typeof v === "object") {
    if ("result" in v) return cellToValue(v.result);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

function parseNilai(raw) {
  const v = cellToValue(raw);
  if (v === null || String(v).trim() === "") return { kosong: true };
  const n = Number(String(v).trim().replace(",", "."));
  if (Number.isNaN(n) || n < 0 || n > 100)
    return { error: true, raw: String(v) };
  return { nilai: Math.round(n * 100) / 100 };
}

function styleHeader(row) {
  row.height = 28;
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
  });
}

const validasi = {
  type: "decimal",
  operator: "between",
  formulae: [0, 100],
  allowBlank: true,
  showErrorMessage: true,
  errorTitle: "Nilai tidak valid",
  error: "Isi angka 0 sampai 100.",
};

/* ------------------------------------------------------------------ */
/* Halaman                                                             */
/* ------------------------------------------------------------------ */

export default function UploadNilaiPage() {
  const [mode, setMode] = useState("tp"); // "tp" | "lp"

  const [tahunList, setTahunList] = useState([]);
  const [mapelAll, setMapelAll] = useState([]);
  const [plot, setPlot] = useState(null);

  const [tahunId, setTahunId] = useState("");
  const [mapelId, setMapelId] = useState("");

  const [kelasList, setKelasList] = useState([]);
  const [siswaList, setSiswaList] = useState([]);
  const [tpList, setTpList] = useState([]);
  const [lpList, setLpList] = useState([]);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pesan, setPesan] = useState(null);

  /* ---------- data awal ---------- */
  useEffect(() => {
    (async () => {
      try {
        const [tahun, mapel] = await Promise.all([
          pb
            .collection("tahun_ajaran")
            .getFullList({ sort: "-tahun,-semester" }),
          pb.collection("mata_pelajaran").getFullList({ sort: "nama_mapel" }),
        ]);
        setTahunList(tahun);
        setMapelAll(mapel);
        setTahunId((tahun.find((t) => t.is_aktif) || tahun[0])?.id || "");

        const user = pb.authStore.record;
        if (user && ["guru mapel", "guru pendamping"].includes(user.role)) {
          const p = await pb
            .collection("ploting_guru")
            .getFullList({ filter: `guru_id="${user.id}"` });
          setPlot(p);
        }
      } catch (e) {
        setPesan({
          tipe: "error",
          teks: "Gagal memuat data awal: " + e.message,
        });
      }
    })();
  }, []);

  const mapelOptions = useMemo(
    () =>
      plot
        ? mapelAll.filter((m) => plot.some((p) => p.mapel_id === m.id))
        : mapelAll,
    [plot, mapelAll],
  );

  /* ---------- siswa, kelas, TP, LP ---------- */
  useEffect(() => {
    setFile(null);
    setPreview(null);
    setKelasList([]);
    setSiswaList([]);
    setTpList([]);
    setLpList([]);
    if (!mapelId || mapelAll.length === 0) return;

    const mapelRec = mapelAll.find((m) => m.id === mapelId);
    if (!mapelRec) return;

    let batal = false;
    (async () => {
      try {
        const spesifikIds = Array.isArray(mapelRec.spesifik_kelas_id)
          ? mapelRec.spesifik_kelas_id
          : mapelRec.spesifik_kelas_id
            ? [mapelRec.spesifik_kelas_id]
            : [];

        const targetTingkat = Array.isArray(mapelRec.target_tingkat)
          ? mapelRec.target_tingkat
          : mapelRec.target_tingkat
            ? [mapelRec.target_tingkat]
            : [];

        let kelasFilter;
        if (spesifikIds.length > 0) {
          kelasFilter = spesifikIds.map((id) => `id="${id}"`).join(" || ");
        } else if (targetTingkat.length > 0) {
          kelasFilter = targetTingkat.map((t) => `tingkat=${t}`).join(" || ");
        } else {
          kelasFilter = "";
        }

        let kelasRecs = await pb.collection("kelas").getFullList({
          filter: kelasFilter,
          sort: "tingkat,nama_kelas",
        });

        if (plot) {
          const plotKelasIds = new Set(
            plot
              .filter((p) => p.mapel_id === mapelId)
              .flatMap((p) => p.kelas_id || []),
          );
          if (plotKelasIds.size > 0) {
            const intersected = kelasRecs.filter((k) => plotKelasIds.has(k.id));
            if (intersected.length > 0) kelasRecs = intersected;
          }
        }

        if (batal) return;
        setKelasList(kelasRecs);

        const kelasIds = kelasRecs.map((k) => k.id);
        if (kelasIds.length === 0) return;

        const siswaFilter = kelasIds
          .map((id) => `kelas_id="${id}"`)
          .join(" || ");
        const lmFilter =
          `mapel_id~"${mapelId}" && (` +
          kelasIds.map((id) => `kelas_id~"${id}"`).join(" || ") +
          `)`;

        const [siswaRaw, tpRaw, lp] = await Promise.all([
          pb.collection("siswa").getFullList({ filter: siswaFilter }),
          pb
            .collection("tujuan_pembelajaran")
            .getFullList({ filter: `mapel_id~"${mapelId}"` }),
          pb
            .collection("lingkup_materi")
            .getFullList({ filter: lmFilter, sort: "created" }),
        ]);
        if (batal) return;

        const tp = tpRaw.filter((t) => {
          const mapelIds = Array.isArray(t.mapel_id)
            ? t.mapel_id
            : t.mapel_id
              ? [t.mapel_id]
              : [];
          if (!mapelIds.includes(mapelId)) return false;
          const tKelasIds = Array.isArray(t.kelas_id)
            ? t.kelas_id
            : t.kelas_id
              ? [t.kelas_id]
              : [];
          if (tKelasIds.length === 0) return true;
          return tKelasIds.some((kid) => kelasIds.includes(kid));
        });

        const kelasOrder = new Map(kelasRecs.map((k, i) => [k.id, i]));
        const siswaSorted = [...siswaRaw].sort((a, b) => {
          const ka = kelasOrder.get(unwrapRel(a.kelas_id)) ?? 999;
          const kb = kelasOrder.get(unwrapRel(b.kelas_id)) ?? 999;
          if (ka !== kb) return ka - kb;
          return (a.nama_siswa || "").localeCompare(b.nama_siswa || "", "id");
        });

        setSiswaList(siswaSorted);
        setTpList(tp.sort((a, b) => noTpAngka(a.no_tp) - noTpAngka(b.no_tp)));
        setLpList(lp);
      } catch (e) {
        if (!batal) {
          setPesan({
            tipe: "error",
            teks: "Gagal memuat siswa/TP/LP: " + e.message,
          });
        }
      }
    })();

    return () => {
      batal = true;
    };
  }, [mapelId, plot, mapelAll]);

  const kelasById = useMemo(
    () => Object.fromEntries(kelasList.map((k) => [k.id, k])),
    [kelasList],
  );

  const mapelNama = mapelAll.find((m) => m.id === mapelId)?.nama_mapel || "";
  const tahunLabel = (() => {
    const t = tahunList.find((x) => x.id === tahunId);
    return t ? `${t.tahun} - Semester ${t.semester}` : "";
  })();

  const noTpList = useMemo(() => {
    const set = new Set();
    tpList.forEach((t) => {
      if (t.no_tp) set.add(t.no_tp);
    });
    if (set.size === 0) return DEFAULT_TP;
    return Array.from(set).sort((a, b) => noTpAngka(a) - noTpAngka(b));
  }, [tpList]);

  const tpHeaders = useMemo(() => {
    const out = [];
    noTpList.forEach((noTp) => {
      const kode = String(noTp || "").replace(/\s+/g, "");
      KOMPONEN.forEach((k) =>
        out.push({ label: `${kode} - ${k.toUpperCase()}`, noTp, k }),
      );
    });
    return out;
  }, [noTpList]);

  const lpGroups = useMemo(() => {
    const groups = new Map();
    lpList.forEach((lm) => {
      const key = normNama(lm.nama || "");
      if (!key) return;
      if (!groups.has(key)) {
        groups.set(key, {
          header: lm.nama || "LP tanpa nama",
          lmByKelas: new Map(),
        });
      }
      const g = groups.get(key);
      const kelasIds = Array.isArray(lm.kelas_id)
        ? lm.kelas_id
        : lm.kelas_id
          ? [lm.kelas_id]
          : [];
      kelasIds.forEach((kid) => {
        if (!g.lmByKelas.has(kid)) g.lmByKelas.set(kid, lm.id);
      });
    });
    return Array.from(groups.values());
  }, [lpList]);

  // Daftar header LP: kalau sudah ada LM pakai header LM, kalau belum ada
  // sediakan slot "LP 1..10" yang bisa diganti nama saat diisi.
  const lpHeaderList = useMemo(() => {
    if (lpGroups.length > 0) return lpGroups.map((g) => g.header);
    return DEFAULT_LP;
  }, [lpGroups]);

  const nilaiHeaders =
    mode === "tp" ? tpHeaders.map((h) => h.label) : lpHeaderList;

  const siapTemplate =
    siswaList.length > 0 && (mode === "tp" ? tpHeaders.length > 0 : true);

  /* ---------------------------------------------------------------- */
  /* Template                                                          */
  /* ---------------------------------------------------------------- */

  async function unduhTemplate() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(mode === "tp" ? "Nilai TP" : "Nilai LP");

    const headers = ["NIS", "Nama Siswa", "Kelas", ...nilaiHeaders];
    ws.addRow(headers);
    styleHeader(ws.getRow(1));

    if (mode === "tp") {
      noTpList.forEach((_, i) => {
        if (i % 2 === 1) {
          for (let c = 0; c < 4; c++) {
            const col = 4 + i * 4 + c;
            if (col <= headers.length) {
              ws.getRow(1).getCell(col).fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF3B6E8F" },
              };
            }
          }
        }
      });
    }

    siswaList.forEach((s, idx) => {
      const kelasNama = kelasById[unwrapRel(s.kelas_id)]?.nama_kelas || "";
      const row = ws.addRow([s.nis || "", s.nama_siswa, kelasNama]);
      row.getCell(1).numFmt = "@";
      for (let c = 4; c <= headers.length; c++) {
        row.getCell(c).dataValidation = validasi;
        row.getCell(c).alignment = { horizontal: "center" };
      }
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1F5F9" },
          };
        });
      }
    });

    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 30;
    ws.getColumn(3).width = 16;
    for (let c = 4; c <= headers.length; c++) {
      ws.getColumn(c).width = mode === "tp" ? 9 : 20;
    }
    ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];

    const info = wb.addWorksheet("Petunjuk");
    info.getColumn(1).width = 110;
    const baris =
      mode === "tp"
        ? [
            "PETUNJUK UPLOAD NILAI FORMATIF (TP)",
            `Tahun ajaran: ${tahunLabel}   |   Mapel: ${mapelNama}`,
            `Cakupan: ${kelasList.length} kelas, ${siswaList.length} siswa`,
            "",
            "1. Isi nilai pada kolom TP - K1 sampai K4 (angka 0-100). Kolom boleh dikosongkan.",
            "2. Sel yang dikosongkan tidak akan menimpa nilai yang sudah ada di sistem.",
            "3. Hanya TP yang diisi nilainya yang akan dibuat. Kolom TP yang dibiarkan kosong tidak akan membuat TP baru.",
            "4. TP yang dibuat akan otomatis terhubung ke kelas siswa yang nilainya diisi.",
            "5. Untuk TP yang baru dibuat, komponen K1-K4 yang dikosongkan otomatis diisi -1.",
            "6. Jangan mengubah nama kolom dan jangan menambah/menghapus kolom.",
            "7. Jangan mengubah isi kolom NIS / Nama Siswa / Kelas, karena dipakai untuk mencocokkan siswa.",
            "8. Siswa dicocokkan lewat NIS. Jika NIS kosong, dicocokkan lewat Nama + Kelas.",
            "9. Gunakan titik atau koma untuk desimal (contoh 85,5).",
            "",
            "Satu file bisa berisi nilai untuk semua kelas dalam cakupan mapel ini sekaligus.",
          ]
        : [
            "PETUNJUK UPLOAD NILAI SUMATIF (LP)",
            `Tahun ajaran: ${tahunLabel}   |   Mapel: ${mapelNama}`,
            `Cakupan: ${kelasList.length} kelas, ${siswaList.length} siswa`,
            "",
            "1. Isi nilai pada kolom LP (angka 0-100). Kolom boleh dikosongkan.",
            "2. Sel yang dikosongkan tidak akan menimpa nilai yang sudah ada di sistem.",
            "3. Kolom LP di sebelah kanan 'Kelas' adalah slot. Ganti namanya sesuai nama LP yang diinginkan (contoh: 'Bab 1 Aljabar').",
            "4. Hanya LP yang diisi nilainya yang akan dibuat. Kolom LP yang dibiarkan kosong tidak akan membuat LP baru.",
            "5. LP yang baru akan otomatis terhubung ke mapel ini dan kelas siswa yang nilainya diisi.",
            "6. Jangan mengubah isi kolom NIS / Nama Siswa / Kelas, karena dipakai untuk mencocokkan siswa.",
            "7. Siswa dicocokkan lewat NIS. Jika NIS kosong, dicocokkan lewat Nama + Kelas.",
            "8. Gunakan titik atau koma untuk desimal (contoh 85,5).",
            "",
            "Satu file bisa berisi nilai untuk semua kelas dalam cakupan mapel ini sekaligus.",
          ];
    baris.forEach((t, i) => {
      const r = info.addRow([t]);
      if (i === 0) r.font = { bold: true, size: 13 };
    });

    const buf = await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `template_${mode.toUpperCase()}_${clean(mapelNama)}_${clean(tahunLabel)}.xlsx`,
    );
  }

  /* ---------------------------------------------------------------- */
  /* Baca file                                                         */
  /* ---------------------------------------------------------------- */

  async function bacaFile(f) {
    setFile(f);
    setPreview(null);
    setPesan(null);
    if (!f) return;

    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("File Excel kosong.");

      const peta = {};
      const peringatan = [];

      const kunciTP = {};
      if (mode === "tp") {
        tpHeaders.forEach((h) => {
          kunciTP[normKey(h.label)] = { noTp: h.noTp, k: h.k };
        });
      }

      let kolomNis = 0;
      let kolomNama = 0;
      let kolomKelas = 0;

      ws.getRow(1).eachCell((cell, col) => {
        const teks = String(cellToValue(cell.value) ?? "").trim();
        if (!teks) return;
        const n = normKey(teks);
        if (n === "NIS") return void (kolomNis = col);
        if (n === "NAMASISWA" || n === "NAMA") return void (kolomNama = col);
        if (n === "KELAS") return void (kolomKelas = col);

        if (mode === "tp") {
          const target = kunciTP[n];
          if (target) peta[col] = { type: "tp", ...target };
          else peringatan.push(`Kolom "${teks}" tidak dikenali dan diabaikan.`);
        } else {
          // LP: semua kolom di luar NIS/Nama/Kelas dianggap kolom LM
          peta[col] = { type: "lp", lmNama: teks };
        }
      });

      if (!kolomNis && !kolomNama)
        throw new Error(
          "Kolom NIS / Nama Siswa tidak ditemukan. Gunakan template dari halaman ini.",
        );
      if (Object.keys(peta).length === 0)
        throw new Error(
          `Tidak ada kolom nilai ${mode.toUpperCase()} yang cocok. Pastikan file berasal dari template ${mode.toUpperCase()} untuk mapel ini.`,
        );

      const perNis = new Map(
        siswaList.filter((s) => s.nis).map((s) => [String(s.nis).trim(), s]),
      );
      const perNamaKelas = new Map(
        siswaList.map((s) => [
          `${normNama(s.nama_siswa)}|${unwrapRel(s.kelas_id)}`,
          s,
        ]),
      );
      const perNama = new Map();
      siswaList.forEach((s) => {
        const k = normNama(s.nama_siswa);
        if (!perNama.has(k)) perNama.set(k, []);
        perNama.get(k).push(s);
      });

      const kelasByName = new Map(
        kelasList.map((k) => [normNama(k.nama_kelas), k.id]),
      );

      const rows = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const nis = kolomNis
          ? String(cellToValue(row.getCell(kolomNis).value) ?? "").trim()
          : "";
        const nama = kolomNama
          ? String(cellToValue(row.getCell(kolomNama).value) ?? "").trim()
          : "";
        const kelasNama = kolomKelas
          ? String(cellToValue(row.getCell(kolomKelas).value) ?? "").trim()
          : "";
        if (!nis && !nama) return;

        const kelasIdFromSheet = kelasNama
          ? kelasByName.get(normNama(kelasNama)) || null
          : null;

        let siswa = null;
        if (nis && perNis.has(nis)) siswa = perNis.get(nis);
        if (!siswa && nama) {
          if (
            kelasIdFromSheet &&
            perNamaKelas.has(`${normNama(nama)}|${kelasIdFromSheet}`)
          ) {
            siswa = perNamaKelas.get(`${normNama(nama)}|${kelasIdFromSheet}`);
          } else if (!kelasIdFromSheet) {
            const arr = perNama.get(normNama(nama)) || [];
            if (arr.length === 1) siswa = arr[0];
          }
        }

        const item = {
          rowNum,
          nis,
          nama,
          kelasNama,
          siswa,
          data: {},
          jumlah: 0,
          errors: [],
        };

        if (!siswa) item.errors.push("Siswa tidak ditemukan di kelas manapun");

        const siswaKelasId = siswa ? unwrapRel(siswa.kelas_id) : "";

        Object.entries(peta).forEach(([col, target]) => {
          const p = parseNilai(row.getCell(Number(col)).value);
          if (p.kosong) return;
          const label = cellToValue(ws.getRow(1).getCell(Number(col)).value);
          if (p.error) {
            item.errors.push(`${label}: "${p.raw}" bukan angka 0-100`);
            return;
          }
          if (target.type === "tp") {
            if (!siswa) return;
            const key = `${target.noTp}|${siswaKelasId}`;
            item.data[key] = {
              ...(item.data[key] || {}),
              [target.k]: p.nilai,
            };
            item.jumlah++;
          } else {
            // LP: key = `normNama(lmNama)|kelasId`
            if (!siswa) return;
            const key = `${normNama(target.lmNama)}|${siswaKelasId}`;
            item.data[key] = { nilai: p.nilai, lmNama: target.lmNama };
            item.jumlah++;
          }
        });

        rows.push(item);
      });

      const valid = rows.filter((r) => r.errors.length === 0 && r.jumlah > 0);
      setPreview({
        rows,
        valid,
        peringatan,
        totalNilai: valid.reduce((a, r) => a + r.jumlah, 0),
      });
    } catch (e) {
      setPreview(null);
      setPesan({ tipe: "error", teks: e.message });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Simpan                                                            */
  /* ---------------------------------------------------------------- */

  async function simpan() {
    if (!preview || preview.valid.length === 0) return;
    setSaving(true);
    setProgress(0);
    setPesan(null);

    try {
      const isTP = mode === "tp";
      const koleksi = isTP ? "nilai_formatif" : "nilai_sumatif";
      const fk = isTP ? "tp_id" : "lm_id";

      /* ---- Cache TP (hanya dipakai untuk mode TP) ---- */
      const tpCache = new Map();
      if (isTP) {
        tpList.forEach((t) => {
          const tKelasIds = Array.isArray(t.kelas_id)
            ? t.kelas_id
            : t.kelas_id
              ? [t.kelas_id]
              : [];
          if (tKelasIds.length === 0) {
            tpCache.set(`${t.no_tp}|*`, t.id);
          } else {
            tKelasIds.forEach((kid) => tpCache.set(`${t.no_tp}|${kid}`, t.id));
          }
        });
      }

      async function resolveTpId(noTp, kelasId) {
        const key = `${noTp}|${kelasId}`;
        if (tpCache.has(key)) return tpCache.get(key);
        const fb = `${noTp}|*`;
        if (tpCache.has(fb)) return tpCache.get(fb);
        const rec = await pb.collection("tujuan_pembelajaran").create({
          no_tp: noTp,
          mapel_id: [mapelId],
          kelas_id: [kelasId],
        });
        tpCache.set(key, rec.id);
        return rec.id;
      }

      /* ---- Cache LM (hanya dipakai untuk mode LP) ---- */
      const lmCache = new Map(); // `normNama(nama)|kelasId` -> lmId
      if (!isTP) {
        lpList.forEach((lm) => {
          const nama = normNama(lm.nama);
          if (!nama) return;
          const kids = Array.isArray(lm.kelas_id)
            ? lm.kelas_id
            : lm.kelas_id
              ? [lm.kelas_id]
              : [];
          kids.forEach((kid) => lmCache.set(`${nama}|${kid}`, lm.id));
        });
      }

      /* ---- Kumpulkan nilai dari preview ---- */
      const valuesToSave = [];
      preview.valid.forEach((r) => {
        Object.entries(r.data).forEach(([key, val]) => {
          valuesToSave.push({
            siswa: r.siswa,
            siswaKelasId: unwrapRel(r.siswa.kelas_id),
            key,
            val,
          });
        });
      });

      /* ---- Resolve TP ---- */
      if (isTP) {
        const resolusi = new Set();
        valuesToSave.forEach((v) => resolusi.add(v.key));
        for (const k of resolusi) {
          const [noTp, kelasId] = k.split("|");
          await resolveTpId(noTp, kelasId);
        }
      }

      /* ---- Resolve LM: cari yang ada, kalau belum ada buat baru ---- */
      if (!isTP) {
        const needed = new Map();
        valuesToSave.forEach((v) => {
          const [nama, kelasId] = v.key.split("|");
          if (!needed.has(v.key)) {
            needed.set(v.key, {
              nama,
              kelasId,
              asli: v.val.lmNama,
            });
          }
        });
        for (const [key, info] of needed) {
          if (lmCache.has(key)) continue;
          const rec = await pb.collection("lingkup_materi").create({
            nama: info.asli,
            mapel_id: [mapelId],
            kelas_id: [info.kelasId],
          });
          lmCache.set(key, rec.id);
        }
      }

      /* ---- Target ids untuk lookup existing ---- */
      let targetIds = [];
      if (isTP) {
        targetIds = Array.from(new Set(tpCache.values()));
      } else {
        targetIds = Array.from(new Set(lmCache.values()));
      }

      /* ---- Ambil nilai yang sudah ada ---- */
      const existing = [];
      const CHUNK = 20;
      for (let i = 0; i < targetIds.length; i += CHUNK) {
        const chunk = targetIds.slice(i, i + CHUNK);
        const filter =
          `tahun_ajaran_id~"${tahunId}" && (` +
          chunk.map((id) => `${fk}~"${id}"`).join(" || ") +
          `)`;
        try {
          const recs = await pb
            .collection(koleksi)
            .getFullList({ filter }, { requestKey: null });
          existing.push(...recs);
        } catch (err) {
          console.warn("Lookup existing gagal untuk chunk", chunk, err);
        }
      }
      const peta = new Map(
        existing.map((r) => [
          `${unwrapRel(r.siswa_id)}|${unwrapRel(r[fk])}`,
          r.id,
        ]),
      );

      /* ---- Susun operasi create/update ---- */
      const ops = [];
      valuesToSave.forEach(({ siswa, siswaKelasId, key, val }) => {
        let targetId;
        if (isTP) {
          const [noTp] = key.split("|");
          targetId =
            tpCache.get(`${noTp}|${siswaKelasId}`) || tpCache.get(`${noTp}|*`);
        } else {
          targetId = lmCache.get(key);
        }
        if (!targetId) return;

        const id = peta.get(`${siswa.id}|${targetId}`);

        if (isTP) {
          if (id) {
            ops.push(() =>
              pb.collection(koleksi).update(
                id,
                {
                  ...val,
                  tp_id: [targetId],
                  siswa_id: [siswa.id],
                  kelas_id: [siswaKelasId],
                  tahun_ajaran_id: [tahunId],
                },
                { requestKey: null },
              ),
            );
          } else {
            ops.push(() =>
              pb.collection(koleksi).create(
                {
                  k1: -1,
                  k2: -1,
                  k3: -1,
                  k4: -1,
                  ...val,
                  tp_id: [targetId],
                  siswa_id: [siswa.id],
                  kelas_id: [siswaKelasId],
                  tahun_ajaran_id: [tahunId],
                },
                { requestKey: null },
              ),
            );
          }
        } else {
          const body = {
            nilai: val.nilai,
            lm_id: [targetId],
            siswa_id: [siswa.id],
            kelas_id: [siswaKelasId],
            tahun_ajaran_id: [tahunId],
          };
          ops.push(() =>
            id
              ? pb.collection(koleksi).update(id, body, { requestKey: null })
              : pb.collection(koleksi).create(body, { requestKey: null }),
          );
        }
      });

      let selesai = 0;
      let gagal = 0;
      const errDetails = [];
      const UKURAN = 5;
      for (let i = 0; i < ops.length; i += UKURAN) {
        const hasil = await Promise.allSettled(
          ops.slice(i, i + UKURAN).map((fn) => fn()),
        );
        hasil.forEach((h) => {
          if (h.status === "rejected") {
            gagal++;
            if (errDetails.length < 3) {
              const msg =
                h.reason?.data?.message ||
                h.reason?.message ||
                String(h.reason);
              errDetails.push(msg);
            }
          }
        });
        selesai += hasil.length;
        if (ops.length > 0) {
          setProgress(Math.round((selesai / ops.length) * 100));
        }
        // Jeda kecil biar server tidak kewalahan
        await new Promise((r) => setTimeout(r, 80));
      }

      if (gagal === 0) {
        setPesan({
          tipe: "ok",
          teks: `Berhasil menyimpan ${ops.length} data nilai untuk ${preview.valid.length} siswa.`,
        });
        setFile(null);
        setPreview(null);
      } else {
        setPesan({
          tipe: "error",
          teks: `${ops.length - gagal} data tersimpan, ${gagal} gagal. Contoh error: ${errDetails.join(" | ")}`,
        });
      }
    } catch (e) {
      setPesan({ tipe: "error", teks: "Gagal menyimpan: " + e.message });
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* UI                                                                */
  /* ---------------------------------------------------------------- */

  const tabCls = (aktif) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      aktif ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">
          Upload nilai siswa
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Unduh satu template untuk semua kelas, isi nilainya, lalu upload
          kembali. Formatif (TP) dan sumatif (LP) diupload terpisah.
        </p>
      </header>

      <div className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
        <button
          className={tabCls(mode === "tp")}
          onClick={() => {
            setMode("tp");
            setFile(null);
            setPreview(null);
            setPesan(null);
          }}
        >
          Formatif (TP)
        </button>
        <button
          className={tabCls(mode === "lp")}
          onClick={() => {
            setMode("lp");
            setFile(null);
            setPreview(null);
            setPesan(null);
          }}
        >
          Sumatif (LP)
        </button>
      </div>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
        <Field label="Tahun ajaran">
          <select
            className={selectCls}
            value={tahunId}
            onChange={(e) => setTahunId(e.target.value)}
          >
            {tahunList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tahun} - Semester {t.semester}
                {t.is_aktif ? " (aktif)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mata pelajaran">
          <select
            className={selectCls}
            value={mapelId}
            onChange={(e) => setMapelId(e.target.value)}
          >
            <option value="">Pilih mapel</option>
            {mapelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama_mapel}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {mapelId && tahunId && (
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>
              <b className="text-slate-900">{kelasList.length}</b> kelas
            </span>
            <span>
              <b className="text-slate-900">{siswaList.length}</b> siswa
            </span>
            {mode === "tp" ? (
              <span>
                <b className="text-slate-900">{noTpList.length}</b> slot TP
                tersedia
                {tpList.length === 0 && (
                  <span className="ml-1 text-amber-700">
                    (hanya TP yang diisi nilainya yang akan dibuat)
                  </span>
                )}
                , masing-masing K1-K4
              </span>
            ) : (
              <span>
                <b className="text-slate-900">{lpHeaderList.length}</b> slot LP
                tersedia
                {lpGroups.length === 0 && (
                  <span className="ml-1 text-amber-700">
                    (ganti nama kolom "LP 1.." sesuai nama LP yang diinginkan)
                  </span>
                )}
              </span>
            )}
          </div>

          {!siapTemplate && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {kelasList.length === 0
                ? "Mapel ini belum punya cakupan kelas. Isi Target Tingkat atau Spesifik Kelas di data mata pelajaran."
                : siswaList.length === 0
                  ? "Belum ada siswa di kelas-kelas dalam cakupan."
                  : "Template belum siap."}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
            <div>
              <p className="font-medium text-slate-900">
                1. Unduh template {mode.toUpperCase()}
              </p>
              <p className="text-sm text-slate-500">
                Semua siswa dari {kelasList.length} kelas sudah terisi. Tinggal
                isi kolom nilai.
              </p>
            </div>
            <button
              onClick={unduhTemplate}
              disabled={!siapTemplate}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              Unduh template {mode.toUpperCase()}
            </button>
          </div>

          <div>
            <p className="font-medium text-slate-900">
              2. Upload file yang sudah diisi
            </p>
            <label
              className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm ${
                siapTemplate
                  ? "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                  : "cursor-not-allowed border-slate-200 opacity-40"
              }`}
            >
              <span className="text-slate-700">
                {file ? file.name : "Klik untuk memilih file .xlsx"}
              </span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                disabled={!siapTemplate || saving}
                onChange={(e) => bacaFile(e.target.files?.[0] || null)}
                onClick={(e) => (e.target.value = "")}
              />
            </label>
          </div>

          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Baris terbaca" nilai={preview.rows.length} />
                <Stat
                  label="Siap disimpan"
                  nilai={preview.valid.length}
                  warna="text-emerald-700"
                />
                <Stat
                  label="Bermasalah"
                  nilai={preview.rows.filter((r) => r.errors.length).length}
                  warna="text-red-700"
                />
                <Stat label="Total nilai" nilai={preview.totalNilai} />
              </div>

              {preview.peringatan.length > 0 && (
                <ul className="list-disc space-y-0.5 rounded-lg bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-800">
                  {preview.peringatan.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}

              <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Baris</th>
                      <th className="px-3 py-2 font-medium">NIS</th>
                      <th className="px-3 py-2 font-medium">Nama</th>
                      <th className="px-3 py-2 font-medium">Kelas</th>
                      <th className="px-3 py-2 font-medium">Nilai terisi</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.map((r) => (
                      <tr
                        key={r.rowNum}
                        className={r.errors.length ? "bg-red-50/60" : ""}
                      >
                        <td className="px-3 py-2 text-slate-500">{r.rowNum}</td>
                        <td className="px-3 py-2">{r.nis || "-"}</td>
                        <td className="px-3 py-2">
                          {r.siswa?.nama_siswa || r.nama || "-"}
                        </td>
                        <td className="px-3 py-2">
                          {r.siswa
                            ? kelasById[unwrapRel(r.siswa.kelas_id)]
                                ?.nama_kelas || "-"
                            : r.kelasNama || "-"}
                        </td>
                        <td className="px-3 py-2">{r.jumlah}</td>
                        <td className="px-3 py-2">
                          {r.errors.length ? (
                            <span className="text-red-700">
                              {r.errors.join("; ")}
                            </span>
                          ) : r.jumlah === 0 ? (
                            <span className="text-slate-400">
                              Kosong, dilewati
                            </span>
                          ) : (
                            <span className="text-emerald-700">Siap</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-slate-500">
                Baris bermasalah tidak disimpan. Nilai yang sudah ada
                diperbarui, sel kosong tidak menimpa nilai lama. TP/LP yang
                diisi di file tapi belum ada di sistem akan dibuat otomatis, dan
                komponen K1–K4 yang dikosongkan diisi -1.
              </p>

              <div className="flex items-center gap-4">
                <button
                  onClick={simpan}
                  disabled={saving || preview.valid.length === 0}
                  className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
                >
                  {saving
                    ? `Menyimpan... ${progress}%`
                    : `Simpan ${preview.totalNilai} nilai`}
                </button>
                {saving && (
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-emerald-600 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {pesan && (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            pesan.tipe === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {pesan.teks}
        </div>
      )}
    </div>
  );
}

const selectCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-400";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, nilai, warna = "text-slate-900" }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className={`text-xl font-semibold ${warna}`}>{nilai}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
