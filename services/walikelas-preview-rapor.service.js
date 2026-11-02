import * as previewRaporRepository from "@/repositories/walikelas-preview-rapor.repository";

/* ───────────── konfigurasi ───────────── */
const SEKOLAH_DEFAULT = {
  nama: "SD Global Garuda Nusantara Islamic Centre",
  alamat: "Jl. Raya Semplak Salabenda",
  kota: "Bogor",
  kepala_sekolah: "Syafrina Ahda, S.Pd., M.M.",
};

const TEXT_TINGGI = "Ananda menunjukkan pemahaman dalam";
const TEXT_RENDAH = "Ananda membutuhkan bimbingan dalam";

const JENIS_UTS = "ahb";
const JENIS_UAS = "asas";

const KATEGORI_RAPOR = ["umum", "koding"];

const URUTAN_KODING = 10000;
const URUTAN_TIDAK_DIKENAL = 999;

/* ───────────── urutan mapel ───────────── */
const URUTAN_MAPEL = [
  ["pai", "pendidikan agama islam dan budi pekerti", "agama", "islam"],
  [
    "pancsl",
    "pancasila",
    "pendidikan pancasila dan kewarganegaraan",
    "pkn",
    "civic",
  ],
  ["bind", "bahasa indonesia", "indonesia"],
  ["mtk", "matematika", "math", "mathematics"],
  ["ipas", "ilmu pengetahuan alam sosial", "science", "sains", "ipa", "ips"],
  ["senbud", "seni budaya", "art", "seni"],
  ["pjok", "pendidikan jasmani olahraga dan kesehatan", "penjas", "sport"],
  ["arab", "bahasa arab", "arabic"],
  ["english", "bahasa inggris", "inggris"],
  ["bsund", "bahasa sunda", "sunda"],
  ["kka", "koding", "coding"],
];

const normMapel = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const urutanMapel = (mapel) => {
  if ((mapel?.kategori || "").toLowerCase() === "koding") return URUTAN_KODING;

  const kandidat = [mapel?.Label, mapel?.kode_mapel, mapel?.nama_mapel]
    .map(normMapel)
    .filter(Boolean);
  const idx = URUTAN_MAPEL.findIndex((alias) =>
    kandidat.some((k) => alias.includes(k)),
  );
  return idx === -1 ? URUTAN_TIDAK_DIKENAL : idx;
};

/* ───────────── helpers ───────────── */
const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const parseTgl = (d) => new Date(String(d).replace(" ", "T"));

const faseDari = (tingkat) => {
  const t = Number(tingkat);
  if (!t) return "-";
  return t <= 2 ? "A" : t <= 4 ? "B" : "C";
};

const sortUjian = (list) =>
  [...list].sort((a, b) => {
    const ta = (x) => x.expand?.tahun_ajaran_id;
    const ka = `${ta(a)?.tahun ?? ""}-${ta(a)?.semester ?? ""}`;
    const kb = `${ta(b)?.tahun ?? ""}-${ta(b)?.semester ?? ""}`;
    return kb.localeCompare(ka);
  });

const judulRapor = (ujian, semester) => {
  const jenis = String(ujian?.jenis_ujian || "").toLowerCase();
  const nama =
    jenis === JENIS_UAS
      ? "ASESMEN SUMATIF AKHIR SEMESTER (ASAS)"
      : "ASESMEN HARIAN BERSAMA (AHB)";
  return `${nama} ${Number(semester) === 2 ? "GENAP" : "GANJIL"}`;
};

/* ───────────── nilai akhir per mapel (SAMA DENGAN HALAMAN LEGER) ───────────── */
function average(arr) {
  const nums = arr.filter(
    (v) => typeof v === "number" && !isNaN(v) && v !== -1,
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function hitungNilaiAkhir(kelasData, siswaData) {
  const tingkat = String(kelasData.tingkat);

  const [mapelKhusus, mapelTingkat, plotingData, ujianData] = await Promise.all(
    [
      previewRaporRepository.findMapelSpesifikKelas(kelasData.id),
      previewRaporRepository.findMapelTargetTingkat(tingkat),
      previewRaporRepository.findPlotingByKelas(kelasData.id),
      previewRaporRepository.findUjianBukaByKelasOrTingkat({
        kelasId: kelasData.id,
        tingkat,
      }),
    ],
  );

  const combined = [...mapelKhusus, ...mapelTingkat];
  const uniqueMapel = Array.from(
    new Map(combined.map((m) => [m.id, m])).values(),
  ).filter((m) => {
    const kat = (m.kategori || "").toLowerCase();
    if (!KATEGORI_RAPOR.includes(kat)) return false;
    const spesifik = m.spesifik_kelas_id;
    const punyaRestriksi = Array.isArray(spesifik) && spesifik.length > 0;
    if (!punyaRestriksi) return true;
    return spesifik.includes(kelasData.id);
  });

  const punyaGuru = new Set();
  plotingData.forEach((plot) => {
    toArray(plot.mapel_id).forEach((mId) => punyaGuru.add(mId));
  });

  const mapelByName = new Map();
  uniqueMapel.forEach((m) => {
    const key = (m.nama_mapel || m.nama || "").trim();
    const existing = mapelByName.get(key);
    if (!existing) mapelByName.set(key, m);
    else if (!punyaGuru.has(existing.id) && punyaGuru.has(m.id))
      mapelByName.set(key, m);
  });
  const mapelList = Array.from(mapelByName.values());

  const utsIds = ujianData
    .filter((u) => u.jenis_ujian === JENIS_UTS)
    .map((u) => u.id);
  const uasIds = ujianData
    .filter((u) => u.jenis_ujian === JENIS_UAS)
    .map((u) => u.id);

  let nilaiUjianData = [];
  if (ujianData.length > 0) {
    nilaiUjianData =
      await previewRaporRepository.findNilaiUjianByPengaturanIds(
        ujianData.map((u) => u.id),
      );
  }
  const ujianMap = {};
  nilaiUjianData.forEach((n) => {
    const mId = Array.isArray(n.mapel_id) ? n.mapel_id[0] : n.mapel_id;
    if (!mId) return;
    if (!ujianMap[mId]) ujianMap[mId] = {};
    if (!ujianMap[mId][n.pengaturan_ujian_id])
      ujianMap[mId][n.pengaturan_ujian_id] = {};
    ujianMap[mId][n.pengaturan_ujian_id][n.siswa_id] = n.nilai;
  });
  const avgUjian = (ids, mapelId, siswaId) =>
    average(
      ids
        .map((uid) => ujianMap[mapelId]?.[uid]?.[siswaId])
        .filter((v) => typeof v === "number" && !isNaN(v) && v !== -1),
    );

  let tpAll = [];
  let lpAll = [];
  if (mapelList.length > 0) {
    const mapelIds = mapelList.map((m) => m.id);
    [tpAll, lpAll] = await Promise.all([
      previewRaporRepository.findTpByMapelIds(mapelIds),
      previewRaporRepository.findLmByMapelIds(mapelIds),
    ]);
  }
  const tpToMapel = {};
  tpAll.forEach((tp) => (tpToMapel[tp.id] = tp.mapel_id));
  const lpToMapel = {};
  lpAll.forEach((lp) => (lpToMapel[lp.id] = lp.mapel_id));

  const [nfData, nsData] = await Promise.all([
    previewRaporRepository.findNilaiFormatifByKelas(kelasData.id),
    previewRaporRepository.findNilaiSumatifByKelas(kelasData.id),
  ]);

  const formatifValues = {};
  nfData.forEach((n) => {
    const mapelId = tpToMapel[n.tp_id];
    if (!mapelId) return;
    if (!formatifValues[mapelId]) formatifValues[mapelId] = {};
    if (!formatifValues[mapelId][n.siswa_id])
      formatifValues[mapelId][n.siswa_id] = [];
    ["k1", "k2", "k3", "k4"].forEach((k) => {
      const val = n[k];
      if (typeof val === "number" && !isNaN(val) && val !== -1) {
        formatifValues[mapelId][n.siswa_id].push(val);
      }
    });
  });

  const sumatifValues = {};
  nsData.forEach((n) => {
    const mapelId = lpToMapel[n.lm_id];
    if (!mapelId) return;
    if (!sumatifValues[mapelId]) sumatifValues[mapelId] = {};
    if (!sumatifValues[mapelId][n.siswa_id])
      sumatifValues[mapelId][n.siswa_id] = [];
    if (typeof n.nilai === "number" && !isNaN(n.nilai) && n.nilai !== -1) {
      sumatifValues[mapelId][n.siswa_id].push(n.nilai);
    }
  });

  const nilaiAkhir = {};
  mapelList.forEach((m) => {
    nilaiAkhir[m.id] = {};
    siswaData.forEach((s) => {
      const komponen = [
        average(formatifValues[m.id]?.[s.id] || []),
        average(sumatifValues[m.id]?.[s.id] || []),
        avgUjian(utsIds, m.id, s.id),
        avgUjian(uasIds, m.id, s.id),
      ].filter((v) => v !== null && v !== undefined && !isNaN(v) && v !== -1);

      nilaiAkhir[m.id][s.id] =
        komponen.length === 0
          ? null
          : komponen.reduce((a, b) => a + b, 0) / komponen.length;
    });
  });

  return { mapelList, nilaiAkhir };
}

/* ───────────── susun data rapor satu siswa ───────────── */
async function buildRapor(
  siswa,
  { kelas, ujian, mapelList, nilaiAkhirMap, capaianMap, pengaturanRapor },
) {
  const ta = ujian.expand?.tahun_ajaran_id;
  const sid = siswa.id;

  const [absenRes, ekskulRes, catatanRes, kehadiranRes] = await Promise.all([
    ta?.Mulai && ta?.Akhir
      ? previewRaporRepository.findAbsensiBySiswaRange({
          siswaId: sid,
          mulai: ta.Mulai,
          akhir: ta.Akhir,
        })
      : Promise.resolve([]),
    previewRaporRepository.findNilaiEkskulBySiswa(sid),
    previewRaporRepository.findCatatanBySiswaKelas({ siswaId: sid, kelasId: kelas.id }),
    previewRaporRepository.findKehadiranManualBySiswaKelas({
      siswaId: sid,
      kelasId: kelas.id,
    }),
  ]);

  const nilai = mapelList
    .map((mapel) => {
      const cap = capaianMap.get(mapel.id);
      const v = nilaiAkhirMap[mapel.id]?.[sid];
      return {
        mapel: mapel.Label || mapel.nama_mapel || mapel.nama || "-",
        urutan: urutanMapel(mapel),
        nilai: typeof v === "number" && !isNaN(v) ? Math.round(v) : "-",
        capaian_tinggi: cap?.capaian_tinggi
          ? `${TEXT_TINGGI} ${cap.capaian_tinggi}`
          : TEXT_TINGGI,
        capaian_rendah: cap?.capaian_rendah
          ? `${TEXT_RENDAH} ${cap.capaian_rendah}`
          : TEXT_RENDAH,
      };
    })
    .sort((a, b) => a.urutan - b.urutan || a.mapel.localeCompare(b.mapel));

  const hitungAbsen = (s) => absenRes.filter((a) => a.status === s).length;

  const km = kehadiranRes[0] || null;
  const sakit = km ? Number(km.sakit ?? 0) : hitungAbsen("sakit");
  const izin = km ? Number(km.izin ?? 0) : hitungAbsen("izin");
  const alpa = km ? Number(km.hadir ?? 0) : hitungAbsen("alpha");

  const catatanTeks = catatanRes.length
    ? catatanRes
        .map((c) => {
          const isi =
            c.catatan || c.isi || c.deskripsi || c.keterangan || c.pesan || "";
          const tgl = c.tanggal
            ? parseTgl(c.tanggal).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "";
          const teks = String(isi).trim();
          if (!teks) return "";
          return tgl ? `[${tgl}] ${teks}` : teks;
        })
        .filter(Boolean)
        .join("\n")
    : "-";

  const waliUser = kelas?.expand?.walikelas_id;
  const waliKelasTtd =
    waliUser && waliUser.ttd
      ? await previewRaporRepository.getRecordFileUrl(waliUser, waliUser.ttd)
      : null;

  return {
    judul: judulRapor(ujian, ta?.semester),
    semester: ta?.semester,
    tahun_ajaran: pengaturanRapor?.tahun_ajaran || ta?.tahun,
    kelas: kelas?.tingkat,
    fase: faseDari(kelas?.tingkat),
    wali_kelas: waliUser?.nama_lengkap || "-",
    wali_kelas_ttd: waliKelasTtd,
    kepala_sekolah:
      pengaturanRapor?.kepala_sekolah || SEKOLAH_DEFAULT.kepala_sekolah,
    nama_sekolah: pengaturanRapor?.nama_sekolah || SEKOLAH_DEFAULT.nama,
    alamat: pengaturanRapor?.alamat || SEKOLAH_DEFAULT.alamat,
    kota: SEKOLAH_DEFAULT.kota,
    tanggal_rapor: pengaturanRapor?.tanggal_rapor || null,
    catatan: catatanTeks,
    sakit,
    izin,
    alpa,
    nilai,
    ekstrakurikuler: ekskulRes.map((e) => ({
      nama: e.nama_ekskul,
      keterangan: [e.predikat, e.catatan].filter(Boolean).join(" — ") || "-",
    })),
  };
}

/* ───────────── layanan ───────────── */

// Kelas + siswa + daftar periode rapor + nilai akhir seluruh mapel.
export async function getPreviewRaporBase({ userId }) {
  let kelasData;
  try {
    kelasData =
      await previewRaporRepository.findKelasByWaliOrPendamping(userId);
  } catch (e) {
    if (e?.status === 404) return { kelas: null, error: null };
    console.error(e);
    return { error: "Gagal memuat data kelas." };
  }

  try {
    const [siswaData, ujianData, capaianData] = await Promise.all([
      previewRaporRepository.findSiswaByKelas(kelasData.id),
      previewRaporRepository.findUjianAksesRapor(),
      previewRaporRepository.findCapaianByKelas(kelasData.id),
    ]);

    const cMap = new Map();
    capaianData.forEach((c) => {
      const mid = toArray(c.mapel_id)[0];
      if (mid) cMap.set(mid, c);
    });

    const hasil = await hitungNilaiAkhir(kelasData, siswaData);

    const sorted = sortUjian(ujianData);

    return {
      kelas: kelasData,
      siswaList: siswaData,
      ujianList: sorted,
      mapelList: hasil.mapelList,
      nilaiAkhir: hasil.nilaiAkhir,
      capaianList: Array.from(cMap.entries()),
      error: null,
    };
  } catch (e) {
    console.error(e);
    return { error: "Gagal memuat data kelas." };
  }
}

// Pengaturan rapor (judul, tanda tangan, dsb.) untuk satu periode ujian.
export async function getPengaturanRapor(ujianId) {
  try {
    const pr =
      await previewRaporRepository.findPengaturanRaporByUjian(ujianId);
    return { data: pr, error: null };
  } catch {
    return { data: null, error: null };
  }
}

// Susun data rapor satu siswa (absensi, ekskul, catatan, ketidakhadiran).
export async function getPreviewRaporSiswa({
  siswa,
  kelas,
  ujian,
  mapelList,
  nilaiAkhirMap,
  capaianList,
  pengaturanRapor,
}) {
  try {
    const capaianMap = new Map(capaianList || []);
    const rapor = await buildRapor(siswa, {
      kelas,
      ujian,
      mapelList,
      nilaiAkhirMap,
      capaianMap,
      pengaturanRapor,
    });
    return { rapor, error: null };
  } catch (e) {
    console.error(e);
    return { error: "Gagal menyusun rapor." };
  }
}
