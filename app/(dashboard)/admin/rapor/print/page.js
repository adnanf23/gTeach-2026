"use client";

// app/admin/rapor/page.js
// Halaman rapor untuk ADMIN.
// Alur:
//   1. Pilih periode rapor (pengaturan_ujian akses_rapor = true) + pilih kelas (kartu)
//   2. Pilih mode:
//        • Download Full  → 1 file PDF berisi rapor SEMUA siswa kelas itu
//        • Cek & Print    → CEK (preview tiap siswa: Terima / Tolak)
//                           → STATUS (ringkasan daftar diterima / ditolak)
//                           → PRINT (semua yang diterima, 1x klik)
// - Nilai akhir, ketidakhadiran, TTD, dan tampilan kertas F4 SAMA dengan
//   halaman rapor walikelas (kode hitung & preview disalin utuh).
// - PDF: html-to-image + jspdf (JPEG supaya ukuran file tetap wajar
//   untuk 1 kelas penuh).
// - Print: semua rapor yang diterima dirender di portal khusus cetak,
//   lalu window.print(). Atur kertas F4 / margin default di dialog cetak.
// - UI: semua komponen custom (tanpa <select> bawaan browser), gaya kartu
//   disamakan dengan pemilihan kelas, aksen biru gradasi.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { pb } from "@/lib/pocketbase";

// ✅ TTD kepala sekolah dari folder assets (static import Next.js)
import ttdKepsekAsset from "@/assets/TTD BUNDA AHDA_STAMPEL_BOLD.png";

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

const MAX_MAPEL_HAL1 = 8;

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

const semesterLabel = (s) => {
  const n = Number(s);
  return n === 1 ? "I (Satu)" : n === 2 ? "II (Dua)" : String(s ?? "-");
};

const KELAS_LABEL = {
  1: "I (Satu)",
  2: "II (Dua)",
  3: "III (Tiga)",
  4: "IV (Empat)",
  5: "V (Lima)",
  6: "VI (Enam)",
};
const ROMAWI = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI" };
const kelasLabel = (k) => {
  const m = String(k ?? "").match(/\d+/);
  return m && KELAS_LABEL[m[0]] ? KELAS_LABEL[m[0]] : k ? String(k) : "-";
};
const kelasBadge = (k) => {
  const m = String(k?.tingkat ?? "").match(/\d+/);
  return m && ROMAWI[m[0]] ? ROMAWI[m[0]] : "-";
};

const faseDari = (tingkat) => {
  const t = Number(tingkat);
  if (!t) return "-";
  return t <= 2 ? "A" : t <= 4 ? "B" : "C";
};

const parseTgl = (d) => new Date(String(d).replace(" ", "T"));

const formatTanggal = (d) =>
  (d ? parseTgl(d) : new Date()).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const slug = (s) =>
  String(s || "rapor")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_");

const inisial = (nama) =>
  String(nama || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

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

const tungguGambar = (root) =>
  Promise.all(
    Array.from(root?.querySelectorAll("img") || []).map((img) =>
      img.complete
        ? null
        : new Promise((res) => {
            img.onload = img.onerror = () => res();
          }),
    ),
  );

const tungguFrame = () =>
  new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

/* ───────────── hook: auto-fit kertas ke lebar container ───────────── */
function useFitScale(contentWidthPx = 812, active = true) {
  const outerRef = useRef(null);
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const [bleed, setBleed] = useState(null);

  useEffect(() => {
    if (!active) return;
    const outer = outerRef.current;
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;

    const update = () => {
      const vw = document.documentElement.clientWidth;
      let avail;
      if (vw < 640 && outer) {
        const ml = parseFloat(outer.style.marginLeft) || 0;
        const left = outer.getBoundingClientRect().left - ml;
        const next = { w: vw, ml: -left };
        setBleed((p) => (p && p.w === next.w && p.ml === next.ml ? p : next));
        avail = vw;
      } else {
        setBleed((p) => (p ? null : p));
        avail = wrap.clientWidth;
      }
      if (!avail) return;
      const s = Math.min(1, avail / contentWidthPx);
      setScale(s);
      setHeight(inner.scrollHeight * s);
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    ro.observe(inner);

    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [contentWidthPx, active]);

  return { outerRef, wrapRef, innerRef, scale, height, bleed };
}

/* ───────────── hook: tinggi elemen fixed di dasar layar ───────────── */
function useBottomInset(active) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) return;

    const measure = () => {
      const vh = window.innerHeight;
      let found = 0;
      for (const el of document.elementsFromPoint(
        window.innerWidth / 2,
        vh - 2,
      )) {
        if (el === document.documentElement || el === document.body) continue;
        if (el.closest("[data-rapor-bar]")) continue;
        let n = el;
        while (n && n !== document.body) {
          const pos = getComputedStyle(n).position;
          if (pos === "fixed" || pos === "sticky") {
            const r = n.getBoundingClientRect();
            if (r.bottom >= vh - 2 && r.height < vh / 2) {
              found = Math.max(found, Math.round(vh - r.top));
            }
            break;
          }
          n = n.parentElement;
        }
      }
      setInset(found);
    };

    measure();
    const t = setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [active]);

  return inset;
}

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
      pb.collection("mata_pelajaran").getFullList({
        filter: `spesifik_kelas_id ~ "${kelasData.id}"`,
        requestKey: null,
      }),
      pb.collection("mata_pelajaran").getFullList({
        filter: `target_tingkat ~ "${tingkat}"`,
        requestKey: null,
      }),
      pb.collection("ploting_guru").getFullList({
        filter: `kelas_id ~ "${kelasData.id}"`,
        requestKey: null,
      }),
      pb.collection("pengaturan_ujian").getFullList({
        filter: `status_akses = "buka" && (target_kelas_id ~ "${kelasData.id}" || target_tingkat ~ "${tingkat}")`,
        requestKey: null,
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
    nilaiUjianData = await pb.collection("nilai_ujian").getFullList({
      filter: ujianData
        .map((u) => `pengaturan_ujian_id = "${u.id}"`)
        .join(" || "),
      requestKey: null,
    });
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
    const mapelFilter = mapelList
      .map((m) => `mapel_id ~ "${m.id}"`)
      .join(" || ");
    [tpAll, lpAll] = await Promise.all([
      pb.collection("tujuan_pembelajaran").getFullList({
        filter: mapelFilter,
        requestKey: null,
      }),
      pb.collection("lingkup_materi").getFullList({
        filter: mapelFilter,
        requestKey: null,
      }),
    ]);
  }
  const tpToMapel = {};
  tpAll.forEach((tp) => (tpToMapel[tp.id] = tp.mapel_id));
  const lpToMapel = {};
  lpAll.forEach((lp) => (lpToMapel[lp.id] = lp.mapel_id));

  const [nfData, nsData] = await Promise.all([
    pb.collection("nilai_formatif").getFullList({
      filter: `kelas_id = "${kelasData.id}"`,
      requestKey: null,
    }),
    pb.collection("nilai_sumatif").getFullList({
      filter: `kelas_id = "${kelasData.id}"`,
      requestKey: null,
    }),
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
      ? pb.collection("absensi").getFullList({
          filter: `siswa_id = "${sid}" && tanggal >= "${ta.Mulai}" && tanggal <= "${ta.Akhir}"`,
          requestKey: null,
        })
      : Promise.resolve([]),
    pb.collection("nilai_ekskul").getFullList({
      filter: `siswa_id = "${sid}"`,
      requestKey: null,
    }),
    pb.collection("catatan_siswa").getFullList({
      filter: `siswa_id = "${sid}" && kelas_id = "${kelas.id}"`,
      sort: "-created",
      requestKey: null,
    }),
    pb.collection("kehadiran_manual").getFullList({
      filter: `siswa_id = "${sid}" && kelas_id = "${kelas.id}"`,
      requestKey: null,
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
    waliUser && waliUser.ttd ? pb.files.getURL(waliUser, waliUser.ttd) : null;

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

/* ───────────── tabel nilai ───────────── */
const NilaiTable = ({ rows, startIndex = 0, rowH }) => (
  <table
    className="rapor-table nilai-table text-left"
    style={{ "--row-h": `${rowH}mm` }}
  >
    <thead>
      <tr>
        <th style={{ width: "6%" }}>NO</th>
        <th style={{ width: "24%" }}>Muatan Pelajaran</th>
        <th style={{ width: "10%" }}>
          Nilai
          <br />
          Akhir
        </th>
        <th>Capaian Kompetensi</th>
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 && (
        <tr className="row-mapel">
          <td colSpan={4} className="center">
            Belum ada data nilai.
          </td>
        </tr>
      )}
      {rows.map((m, i) => (
        <tr key={startIndex + i} className="row-mapel text-left">
          <td className="center">{startIndex + i + 1}</td>
          <td className="td-left">{m.mapel}</td>
          <td className="center">{m.nilai ?? "-"}</td>
          <td className="cap-cell">
            <div className="cap">
              <span>{m.capaian_tinggi || "-"}</span>
            </div>
            <div className="cap cap-last">
              <span>{m.capaian_rendah || "-"}</span>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/* ───────────── preview rapor ───────────── */
const RaporPreview = ({ siswa, rapor }) => {
  const nilai = toArray(rapor.nilai);
  const ekskul = toArray(rapor.ekstrakurikuler);
  const ekskulRows = ekskul.length
    ? ekskul
    : [
        { nama: "-", keterangan: "-" },
        { nama: "-", keterangan: "-" },
      ];

  const nilaiHal1 = nilai.slice(0, MAX_MAPEL_HAL1);
  const nilaiHal2 = nilai.slice(MAX_MAPEL_HAL1);

  const rowH1 = nilaiHal1.length
    ? Math.min(30, Math.floor((290 / nilaiHal1.length) * 10) / 10)
    : 30;
  const rowH2 = 24;

  const ttdKepsekSrc = ttdKepsekAsset?.src || null;

  return (
    <div className="rapor-sheet">
      {/* ══════════════ HALAMAN 1 ══════════════ */}
      <div className="page page-1">
        <h1 className="rapor-title">
          LAPORAN HASIL BELAJAR
          <br />
          {rapor.judul}
        </h1>

        <table className="rapor-plain">
          <tbody>
            <tr>
              <td className="lbl">Nama</td>
              <td className="sep">:</td>
              <td className="val">{(siswa.nama_siswa || "-").toUpperCase()}</td>
              <td className="lbl2">Kelas</td>
              <td className="sep">:</td>
              <td className="val2">{kelasLabel(rapor.kelas)}</td>
            </tr>
            <tr>
              <td className="lbl">NIS / NISN</td>
              <td className="sep">:</td>
              <td className="val">
                {siswa.nis || "-"} / {siswa.nisn || "-"}
              </td>
              <td className="lbl2">Fase</td>
              <td className="sep">:</td>
              <td className="val2">{rapor.fase || "-"}</td>
            </tr>
            <tr>
              <td className="lbl">Sekolah</td>
              <td className="sep">:</td>
              <td className="val">{rapor.nama_sekolah || "-"}</td>
              <td className="lbl2">Semester</td>
              <td className="sep">:</td>
              <td className="val2">{semesterLabel(rapor.semester)}</td>
            </tr>
            <tr>
              <td className="lbl">Alamat</td>
              <td className="sep">:</td>
              <td className="val">{rapor.alamat || "-"}</td>
              <td className="lbl2">Tahun Pelajaran</td>
              <td className="sep">:</td>
              <td className="val2">{rapor.tahun_ajaran || "-"}</td>
            </tr>
          </tbody>
        </table>

        <NilaiTable rows={nilaiHal1} startIndex={0} rowH={rowH1} />
      </div>

      {/* ══════════════ HALAMAN 2 ══════════════ */}
      <div className="page page-2">
        {nilaiHal2.length > 0 && (
          <>
            <NilaiTable
              rows={nilaiHal2}
              startIndex={MAX_MAPEL_HAL1}
              rowH={rowH2}
            />
            <div style={{ height: 20 }} />
          </>
        )}

        <table className="rapor-table ekskul-table">
          <thead>
            <tr>
              <th style={{ width: "6%" }}>No</th>
              <th style={{ width: "40%" }}>Ekstrakurikuler</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {ekskulRows.map((e, i) => (
              <tr key={i} className="row-ekskul">
                <td className="center">{i + 1}</td>
                <td className="td-center">{e.nama || "-"}</td>
                <td className="td-center">{e.keterangan || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="rapor-table gap-top catatan-table">
          <thead>
            <tr>
              <th>CATATAN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="catatan">{rapor.catatan || "-"}</td>
            </tr>
          </tbody>
        </table>

        <table className="rapor-table gap-top absen">
          <colgroup>
            <col style={{ width: "60%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "25%" }} />
          </colgroup>
          <thead>
            <tr>
              <th colSpan={3}>Ketidakhadiran</th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-absen">
              <td className="absen-label">Sakit</td>
              <td className="absen-angka">{rapor.sakit ?? 0}</td>
              <td className="absen-satuan">hari</td>
            </tr>
            <tr className="row-absen">
              <td className="absen-label">Izin</td>
              <td className="absen-angka">{rapor.izin ?? 0}</td>
              <td className="absen-satuan">hari</td>
            </tr>
            <tr className="row-absen">
              <td className="absen-label">Tanpa Keterangan</td>
              <td className="absen-angka">{rapor.alpa ?? 0}</td>
              <td className="absen-satuan">hari</td>
            </tr>
          </tbody>
        </table>

        <div className="ttd">
          <div className="ttd-row">
            <div className="ttd-col">
              <p>&nbsp;</p>
              <p>&nbsp;</p>
              <p>Orang Tua,</p>
              <div className="ttd-space" />
              <p>&nbsp;</p>
              <p>&nbsp;</p>
              <p>……………………….</p>
            </div>
            <div className="ttd-col">
              <p className="text-center top-[-10px]">
                {rapor.kota || SEKOLAH_DEFAULT.kota},{" "}
                {rapor.tanggal_rapor
                  ? formatTanggal(rapor.tanggal_rapor)
                  : "……………………"}
              </p>
              <br />
              <p className="text-center ttd-jabatan">Wali Kelas,</p>
              <div className="ttd-space ttd-space-wali">
                {rapor.wali_kelas_ttd && (
                  <img
                    src={rapor.wali_kelas_ttd}
                    alt=""
                    className="ttd-img"
                    crossOrigin="anonymous"
                  />
                )}
              </div>
              <p className="text-center">{rapor.wali_kelas || "-"}</p>
            </div>
          </div>
          <div className="ttd-kepsek">
            <p>Mengetahui,</p>
            <p>Kepala Sekolah</p>
            <div className="ttd-space">
              {ttdKepsekSrc && (
                <img
                  src={ttdKepsekSrc}
                  alt=""
                  className="ttd-img ttd-img-kepsek"
                  crossOrigin="anonymous"
                />
              )}
            </div>
            <p>{rapor.kepala_sekolah || "-"}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ───────────── komponen UI (custom, tanpa elemen bawaan browser) ───────────── */
const BTN_PRIMARY =
  "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white shadow-lg shadow-blue-300/50 transition hover:from-blue-500 hover:via-blue-500 hover:to-blue-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:active:scale-100";

const BTN_GLASS =
  "inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-bold text-white ring-1 ring-inset ring-white/20 backdrop-blur-sm transition hover:bg-white/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_UI = {
  terima: { label: "Diterima", cls: "bg-emerald-100 text-emerald-800" },
  tolak: { label: "Ditolak", cls: "bg-red-100 text-red-800" },
  belum: { label: "Belum dicek", cls: "bg-slate-100 text-slate-600" },
};

const Icon = ({ name, className = "h-4 w-4" }) => {
  const paths = {
    chevronRight: "M9 5l7 7-7 7",
    chevronLeft: "M15 19l-7-7 7-7",
    chevronDown: "M19 9l-7 7-7-7",
    check: "M5 13l4 4L19 7",
    back: "M10 19l-7-7m0 0l7-7m-7 7h18",
    download: "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4",
    clipboard:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    calendar:
      "M8 7V3m8 4V3M5 11h14M6 5h12a1 1 0 011 1v13a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1z",
    user: "M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    users:
      "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    swap: "M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4",
  };
  return (
    <svg
      className={`shrink-0 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={paths[name] || paths.check}
      />
    </svg>
  );
};

const Avatar = ({ nama, size = "h-10 w-10 text-sm" }) => (
  <span
    className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 font-bold text-white shadow-sm ${size}`}
  >
    {inisial(nama)}
  </span>
);

const Shimmer = () => (
  <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/15 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
);

const Hero = ({ eyebrow, title, subtitle, chips, children }) => (
  <div className="no-print relative mb-4 overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 p-6 text-white shadow-lg md:p-8">
    <div className="pointer-events-none absolute -right-10 -bottom-20 h-80 w-80 rounded-full bg-white/5" />
    <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-white/[0.04]" />
    <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <span className="block text-xs font-semibold uppercase tracking-widest text-blue-200">
          {eyebrow}
        </span>
        <h1 className="text-2xl font-extrabold tracking-wide md:text-3xl">
          {title}
        </h1>
        <p className="text-sm text-blue-100">{subtitle}</p>
        {chips && chips.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {chips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-blue-50 ring-1 ring-inset ring-white/15"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
      {children && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 self-start sm:self-end">
          {children}
        </div>
      )}
    </div>
  </div>
);

const StateCard = ({ tone = "muted", title, children }) => (
  <div
    role={tone === "error" ? "alert" : undefined}
    className={`no-print mb-4 rounded-2xl px-4 py-10 text-center ${
      tone === "error"
        ? "border border-red-200 bg-red-50"
        : "border border-dashed border-slate-300 bg-slate-50"
    }`}
  >
    {title && (
      <p
        className={`mb-1 text-sm font-semibold ${
          tone === "error" ? "text-red-800" : "text-slate-800"
        }`}
      >
        {title}
      </p>
    )}
    <p
      className={`text-[13px] leading-relaxed ${
        tone === "error" ? "text-red-700" : "text-slate-500"
      }`}
    >
      {children}
    </p>
  </div>
);

const Spinner = ({ children }) => (
  <div className="no-print flex items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white py-12 text-[13px] text-slate-500 shadow-sm">
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    {children}
  </div>
);

const LoadingGrid = () => (
  <div className="no-print grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <div
        key={i}
        className="h-[118px] animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="h-4 w-2/3 rounded bg-slate-100" />
        <div className="mt-3 h-3 w-1/2 rounded bg-slate-100" />
      </div>
    ))}
  </div>
);

const Badge = ({ status }) => {
  const s = STATUS_UI[status || "belum"];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}
    >
      {s.label}
    </span>
  );
};

// Dropdown custom (pengganti <select> bawaan browser)
const Dropdown = ({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
  icon = "calendar",
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const selected = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="relative">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold text-slate-500">
          {label}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`group flex h-12 w-full items-center gap-3 rounded-xl border bg-white px-3.5 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? "border-blue-600 shadow-md shadow-blue-200/60"
            : "border-slate-200 hover:border-blue-600"
        }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white">
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${
            selected ? "text-slate-900" : "text-slate-400"
          }`}
        >
          {selected ? selected.title : placeholder}
        </span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${
            open ? "rotate-180 text-blue-600" : ""
          }`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-blue-200/60"
        >
          {options.length === 0 && (
            <li className="px-3 py-3 text-center text-[13px] text-slate-400">
              Tidak ada pilihan.
            </li>
          )}
          {options.map((o) => {
            const aktif = o.id === value;
            return (
              <li key={o.id} role="option" aria-selected={aktif}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                    aktif
                      ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white"
                      : "text-slate-700 hover:bg-slate-100 active:bg-slate-200"
                  }`}
                >
                  <span className="min-w-0 flex-1">{o.title}</span>
                  {aktif && <Icon name="check" className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// Kartu pilihan (kelas / mode) — gaya sama dengan pemilihan kelas
const ModeCard = ({ icon, title, desc, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
  >
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    <div className="relative z-10 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-900 transition-colors duration-300 group-hover:text-white">
          {title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500 transition-colors duration-300 group-hover:text-blue-100">
          {desc}
        </p>
      </div>
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors duration-300 group-hover:bg-white/15 group-hover:text-white">
        <Icon name={icon} className="h-5 w-5" />
      </span>
    </div>
    <div className="relative z-10 mt-4 flex items-center justify-end border-t border-slate-100 pt-3 transition-colors duration-300 group-hover:border-white/20">
      <span className="text-slate-300 transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-white">
        <Icon name="chevronRight" className="h-4 w-4" />
      </span>
    </div>
    <Shimmer />
  </button>
);

const StepPills = ({ phase }) => {
  const steps = [
    { id: "pilih", label: "Pilih mode" },
    { id: "cek", label: "Cek" },
    { id: "ringkasan", label: "Print" },
  ];
  const aktif = steps.findIndex((s) => s.id === phase);
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <span
          key={s.id}
          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
            i === aktif
              ? "bg-white text-blue-600"
              : i < aktif
                ? "bg-white/25 text-white"
                : "bg-white/10 text-blue-200"
          }`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
};

/* ───────────── halaman ───────────── */
export default function AdminRaporPage() {
  const [kelasList, setKelasList] = useState([]);
  const [ujianList, setUjianList] = useState([]);
  const [kelasId, setKelasId] = useState("");
  const [ujianId, setUjianId] = useState("");

  const [siswaList, setSiswaList] = useState([]);
  const [capaianMap, setCapaianMap] = useState(() => new Map());
  const [nilaiAkhirData, setNilaiAkhirData] = useState({
    mapelList: [],
    nilaiAkhir: {},
  });
  const [loadedKelasId, setLoadedKelasId] = useState("");
  const [pengaturan, setPengaturan] = useState(null);

  // alur: "pilih" → "cek" → "ringkasan"
  const [phase, setPhase] = useState("pilih");
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState({}); // { [siswaId]: "terima" | "tolak" }
  const [balik, setBalik] = useState(false); // true = cek ulang dari ringkasan

  const [loading, setLoading] = useState(true);
  const [loadingKelas, setLoadingKelas] = useState(false);
  const [proses, setProses] = useState(null); // { jenis, done, total }
  const [error, setError] = useState("");

  const [printItems, setPrintItems] = useState([]);
  const [stage, setStage] = useState(null);

  const cacheRef = useRef({});
  const inflightRef = useRef({});
  const [, setTick] = useState(0);

  const headRef = useRef(null);
  const printRef = useRef(null);
  const stageRef = useRef(null);

  /* ───── data awal: daftar kelas + periode rapor ───── */
  useEffect(() => {
    (async () => {
      try {
        const [kelasData, ujianData] = await Promise.all([
          pb.collection("kelas").getFullList({
            expand: "walikelas_id",
            requestKey: null,
          }),
          pb.collection("pengaturan_ujian").getFullList({
            filter: `akses_rapor = true`,
            expand: "tahun_ajaran_id",
            requestKey: null,
          }),
        ]);
        kelasData.sort((a, b) =>
          String(a.nama_kelas || "").localeCompare(
            String(b.nama_kelas || ""),
            "id",
            { numeric: true },
          ),
        );
        const sorted = sortUjian(ujianData);
        setKelasList(kelasData);
        setUjianList(sorted);
        setUjianId(sorted[0]?.id || "");
      } catch (e) {
        if (!e?.isAbort) {
          console.error(e);
          setError("Gagal memuat daftar kelas.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const kelas = useMemo(
    () => kelasList.find((k) => k.id === kelasId) || null,
    [kelasList, kelasId],
  );
  const ujian = useMemo(
    () => ujianList.find((u) => u.id === ujianId) || null,
    [ujianList, ujianId],
  );

  const resetAlur = () => {
    setStatus({});
    setPhase("pilih");
    setIndex(0);
    setBalik(false);
    setPrintItems([]);
  };

  /* ───── data siswa + nilai saat kelas dipilih ───── */
  useEffect(() => {
    cacheRef.current = {};
    inflightRef.current = {};
    resetAlur();
    setSiswaList([]);
    setLoadedKelasId("");
    if (!kelas) return;

    let cancelled = false;
    (async () => {
      setLoadingKelas(true);
      setError("");
      try {
        const [siswaData, capaianData] = await Promise.all([
          pb.collection("siswa").getFullList({
            filter: `kelas_id = "${kelas.id}"`,
            sort: "nama_siswa",
            requestKey: null,
          }),
          pb.collection("capaian_kompetensi").getFullList({
            filter: `kelas_id = "${kelas.id}"`,
            requestKey: null,
          }),
        ]);

        const cMap = new Map();
        capaianData.forEach((c) => {
          const mid = toArray(c.mapel_id)[0];
          if (mid) cMap.set(mid, c);
        });

        const hasil = await hitungNilaiAkhir(kelas, siswaData);
        if (cancelled) return;
        setNilaiAkhirData(hasil);
        setCapaianMap(cMap);
        setSiswaList(siswaData);
        setLoadedKelasId(kelas.id);
      } catch (e) {
        if (!cancelled && !e?.isAbort) {
          console.error(e);
          setError("Gagal memuat data kelas.");
        }
      } finally {
        if (!cancelled) setLoadingKelas(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId, kelasList]);

  /* ───── pengaturan_rapor per periode ───── */
  useEffect(() => {
    if (!ujian) {
      setPengaturan(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let pr = null;
      try {
        pr = await pb
          .collection("pengaturan_rapor")
          .getFirstListItem(`ujian_id ~ "${ujian.id}"`, { requestKey: null });
      } catch {
        pr = null;
      }
      if (!cancelled) setPengaturan({ ujianId: ujian.id, data: pr });
    })();
    return () => {
      cancelled = true;
    };
  }, [ujian]);

  const pengaturanSiap = !!ujian && pengaturan?.ujianId === ujian.id;
  const siap =
    !!kelas &&
    loadedKelasId === kelas.id &&
    pengaturanSiap &&
    siswaList.length > 0;

  const total = siswaList.length;
  const siswa = siswaList[index] || null;

  /* ───── cache rapor ───── */
  const keyOf = (s) => `${ujian?.id}:${s.id}`;

  const bangun = (s) => {
    const k = keyOf(s);
    if (cacheRef.current[k]) return Promise.resolve(cacheRef.current[k]);
    if (!inflightRef.current[k]) {
      inflightRef.current[k] = buildRapor(s, {
        kelas,
        ujian,
        mapelList: nilaiAkhirData.mapelList,
        nilaiAkhirMap: nilaiAkhirData.nilaiAkhir,
        capaianMap,
        pengaturanRapor: pengaturan?.data ?? null,
      })
        .then((d) => {
          cacheRef.current[k] = d;
          return d;
        })
        .finally(() => {
          delete inflightRef.current[k];
        });
    }
    return inflightRef.current[k];
  };

  // siapkan banyak rapor sekaligus (3 paralel)
  const pastikanRapor = async (list, onTick) => {
    const antrean = list.filter((s) => !cacheRef.current[keyOf(s)]);
    let done = list.length - antrean.length;
    onTick?.(done);
    const worker = async () => {
      while (antrean.length) {
        await bangun(antrean.shift());
        onTick?.(++done);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  };

  const rapor = siswa && ujian ? cacheRef.current[keyOf(siswa)] : null;

  // prefetch: siswa aktif, berikutnya, sebelumnya
  useEffect(() => {
    if (phase !== "cek" || !siap) return;
    setError("");
    const target = [
      siswaList[index],
      siswaList[index + 1],
      siswaList[index - 1],
    ].filter(Boolean);
    let batal = false;
    Promise.all(target.map(bangun))
      .then(() => !batal && setTick((t) => t + 1))
      .catch((e) => {
        console.error(e);
        if (!batal) setError("Gagal menyusun rapor.");
      });
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, siap, index, siswaList, pengaturan, nilaiAkhirData, capaianMap]);

  /* ───── hitungan status ───── */
  const hitung = useMemo(() => {
    let terima = 0;
    let tolak = 0;
    siswaList.forEach((s) => {
      if (status[s.id] === "terima") terima++;
      else if (status[s.id] === "tolak") tolak++;
    });
    return { terima, tolak, belum: siswaList.length - terima - tolak };
  }, [siswaList, status]);

  /* ───── navigasi & keputusan ───── */
  const scrollKeAtas = () => {
    const el = headRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ block: "start" });
    }
  };

  const geser = (delta) => {
    setIndex((i) => Math.min(total - 1, Math.max(0, i + delta)));
    scrollKeAtas();
  };

  const putuskan = (val) => {
    if (!siswa) return;
    setStatus((s) => ({ ...s, [siswa.id]: val }));
    if (balik) {
      setBalik(false);
      setPhase("ringkasan");
    } else if (index < total - 1) {
      setIndex(index + 1);
    } else {
      setPhase("ringkasan");
    }
    scrollKeAtas();
  };

  const mulaiCek = () => {
    setBalik(false);
    setIndex(0);
    setPhase("cek");
  };

  const lanjutCek = () => {
    const i = siswaList.findIndex((s) => !status[s.id]);
    setBalik(false);
    setIndex(i >= 0 ? i : 0);
    setPhase("cek");
  };

  const cekUlang = (i) => {
    setIndex(i);
    setBalik(true);
    setPhase("cek");
  };

  useEffect(() => {
    if (phase !== "cek") return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") geser(1);
      else if (e.key === "ArrowLeft") geser(-1);
      else if (e.key === "a" || e.key === "A") putuskan("terima");
      else if (e.key === "t" || e.key === "T") putuskan("tolak");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // bersihkan area cetak setelah dialog print ditutup
  useEffect(() => {
    const clear = () => setPrintItems([]);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

  /* ───── fit kertas ───── */
  const fit = useFitScale(812, phase === "cek" && !!rapor);
  const bottomInset = useBottomInset(phase === "cek" && !!siswa);

  /* ───── DOWNLOAD FULL: 1 PDF semua siswa ───── */
  const handleDownloadFull = async () => {
    if (!siap || proses) return;
    setError("");
    setProses({ jenis: "pdf", done: 0, total });
    try {
      const [{ toJpeg }, { jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);

      const pdf = new jsPDF({
        unit: "mm",
        format: [215, 330],
        orientation: "portrait",
        compress: true,
      });

      let halamanPertama = true;
      let meta = null;

      for (let i = 0; i < siswaList.length; i++) {
        const s = siswaList[i];
        const data = await bangun(s);
        meta = meta || data;

        // render satu siswa di stage tersembunyi, lalu tangkap tiap halaman
        flushSync(() => setStage({ siswa: s, rapor: data }));
        await tungguFrame();
        await tungguGambar(stageRef.current);
        if (document.fonts?.ready) {
          try {
            await document.fonts.ready;
          } catch {
            /* ignore */
          }
        }

        const pages = Array.from(stageRef.current.querySelectorAll(".page"));
        for (const p of pages) {
          const url = await toJpeg(p, {
            pixelRatio: 2,
            quality: 0.95,
            backgroundColor: "#ffffff",
            cacheBust: true,
          });
          if (!halamanPertama) pdf.addPage([215, 330], "portrait");
          halamanPertama = false;
          pdf.addImage(url, "JPEG", 0, 0, 215, 330);
        }
        setProses({ jenis: "pdf", done: i + 1, total });
      }

      pdf.save(
        `Rapor_${slug(kelas?.nama_kelas)}_Semester_${meta?.semester ?? ""}_${slug(
          meta?.tahun_ajaran,
        )}.pdf`,
      );
    } catch (e) {
      console.error(e);
      setError("Gagal membuat PDF.");
    } finally {
      setStage(null);
      setProses(null);
    }
  };

  /* ───── PRINT: semua yang diterima, 1x klik ───── */
  const handlePrint = async () => {
    const dipilih = siswaList.filter((s) => status[s.id] === "terima");
    if (!dipilih.length || hitung.belum > 0 || proses) return;
    setError("");
    setProses({ jenis: "print", done: 0, total: dipilih.length });
    try {
      await pastikanRapor(dipilih, (done) =>
        setProses((p) => (p ? { ...p, done } : p)),
      );
      flushSync(() =>
        setPrintItems(
          dipilih.map((s) => ({ siswa: s, rapor: cacheRef.current[keyOf(s)] })),
        ),
      );
      await tungguFrame();
      await tungguGambar(printRef.current);
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* ignore */
        }
      }
      window.print();
    } catch (e) {
      console.error(e);
      setError("Gagal menyiapkan cetak.");
    } finally {
      setProses(null);
    }
  };

  /* ───── opsi picker ───── */
  const ujianOptions = useMemo(
    () =>
      ujianList.map((u, i) => {
        const ta = u.expand?.tahun_ajaran_id;
        return {
          id: u.id,
          title: `${u.nama_ujian || "Rapor"} — Smt ${semesterLabel(ta?.semester)} · ${ta?.tahun ?? "-"}${i === 0 ? " (Terbaru)" : ""}`,
        };
      }),
    [ujianList],
  );

  const gantiKelas = (id) => setKelasId(id);
  const gantiUjian = (id) => {
    cacheRef.current = {};
    resetAlur();
    setUjianId(id);
  };

  /* ───── portal: area cetak & stage PDF ───── */
  const portals = (
    <>
      {printItems.length > 0 &&
        createPortal(
          <div ref={printRef} className="print-root">
            {printItems.map((it) => (
              <RaporPreview
                key={it.siswa.id}
                siswa={it.siswa}
                rapor={it.rapor}
              />
            ))}
          </div>,
          document.body,
        )}
      {stage &&
        createPortal(
          <div ref={stageRef} className="rapor-stage">
            <RaporPreview siswa={stage.siswa} rapor={stage.rapor} />
          </div>,
          document.body,
        )}
    </>
  );

  /* ───── render ───── */
  if (loading) {
    return (
      <>
        <style>{CSS}</style>
        <div className="no-print mb-4 h-[132px] animate-pulse rounded-3xl bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700" />
        <LoadingGrid />
      </>
    );
  }

  const adaPeriode = ujianList.length > 0;
  const sibuk = !!proses;
  const persen = proses
    ? Math.round((proses.done / Math.max(1, proses.total)) * 100)
    : 0;
  const dicek = hitung.terima + hitung.tolak;
  const persenCek = total ? Math.round((dicek / total) * 100) : 0;
  const periodeTitle = ujianOptions.find((o) => o.id === ujianId)?.title;
  const namaWali = kelas?.expand?.walikelas_id?.nama_lengkap;

  return (
    <>
      <style>{CSS}</style>
      {portals}

      {/* ════════ HERO + PERIODE (disembunyikan saat mode cek) ════════ */}
      {phase !== "cek" && (
        <>
          {!kelas ? (
            <Hero
              eyebrow="Rapor"
              title="Rapor Kelas"
              subtitle="Pilih periode dan kelas, lalu download semua rapor sekaligus atau cek dan print."
            />
          ) : (
            <Hero
              eyebrow={`Tingkat ${kelas.tingkat ?? "-"}`}
              title={kelas.nama_kelas}
              subtitle={
                namaWali
                  ? `Wali kelas: ${namaWali}`
                  : "Wali kelas belum diatur."
              }
              chips={[
                <>
                  <Icon name="users" className="h-3.5 w-3.5" />
                  {loadingKelas ? "Memuat siswa…" : `${total} siswa`}
                </>,
                periodeTitle && (
                  <>
                    <Icon name="calendar" className="h-3.5 w-3.5" />
                    {periodeTitle}
                  </>
                ),
              ].filter(Boolean)}
            >
              <StepPills phase={phase} />
              <button
                type="button"
                onClick={() => gantiKelas("")}
                disabled={sibuk}
                className={BTN_GLASS}
              >
                <Icon name="swap" className="h-3.5 w-3.5" />
                Ganti Kelas
              </button>
            </Hero>
          )}

          <section className="no-print relative z-20 mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Dropdown
              label="Periode rapor"
              value={ujianId}
              onChange={gantiUjian}
              options={ujianOptions}
              disabled={!adaPeriode || sibuk}
              placeholder="Belum ada rapor"
              icon="calendar"
            />
          </section>
        </>
      )}

      {error && <StateCard tone="error">{error}</StateCard>}
      {!adaPeriode && !error && (
        <StateCard title="Rapor belum dibuka">
          Belum ada periode rapor yang dibuka (akses_rapor).
        </StateCard>
      )}

      {/* ════════ 0. PILIH KELAS (kartu) ════════ */}
      {adaPeriode && !kelas && (
        <>
          {kelasList.length === 0 ? (
            <StateCard title="Belum ada kelas">
              Belum ada data kelas yang terdaftar.
            </StateCard>
          ) : (
            <div className="no-print grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {kelasList.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => gantiKelas(k.id)}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-200 active:scale-[0.98]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-900 transition-colors duration-300 group-hover:text-white">
                        {k.nama_kelas}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 transition-colors duration-300 group-hover:text-blue-100">
                        <span className="flex items-center gap-1">
                          <Icon
                            name="user"
                            className="h-3.5 w-3.5 text-slate-400 transition-colors duration-300 group-hover:text-blue-200"
                          />
                          Tingkat {k.tingkat ?? "-"}
                        </span>
                        <span className="flex min-w-0 items-center gap-1">
                          <Icon
                            name="users"
                            className="h-3.5 w-3.5 text-slate-400 transition-colors duration-300 group-hover:text-blue-200"
                          />
                          <span className="truncate">
                            {k.expand?.walikelas_id?.nama_lengkap ||
                              "Belum ada wali"}
                          </span>
                        </span>
                      </div>
                    </div>
                    <span className="flex h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600 transition-colors duration-300 group-hover:bg-white/20 group-hover:text-white">
                      {kelasBadge(k)}
                    </span>
                  </div>
                  <div className="relative z-10 mt-4 flex items-center justify-end border-t border-slate-100 pt-3 transition-colors duration-300 group-hover:border-white/20">
                    <span className="text-slate-300 transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-white">
                      <Icon name="chevronRight" className="h-4 w-4" />
                    </span>
                  </div>
                  <Shimmer />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {kelas && loadingKelas && (
        <Spinner>Memuat data siswa &amp; nilai…</Spinner>
      )}
      {kelas && !loadingKelas && loadedKelasId === kelas.id && total === 0 && (
        <StateCard title="Belum ada siswa">
          Kelas ini belum memiliki data siswa.
        </StateCard>
      )}

      {/* ════════ progres PDF / persiapan cetak ════════ */}
      {proses && (
        <div className="no-print mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-slate-900">
              {proses.jenis === "pdf"
                ? "Membuat PDF seluruh siswa…"
                : "Menyiapkan rapor untuk dicetak…"}
            </p>
            <span className="text-xs font-bold tabular-nums text-slate-900">
              {persen}%
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {proses.done} / {proses.total} siswa
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 via-blue-600 to-blue-700 transition-all"
              style={{ width: `${persen}%` }}
            />
          </div>
        </div>
      )}

      {/* ════════ 1. PILIH MODE ════════ */}
      {phase === "pilih" && siap && (
        <section className="no-print grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ModeCard
            icon="download"
            title="Download Full"
            desc={`1 file PDF berisi rapor seluruh ${total} siswa ${kelas?.nama_kelas}.`}
            onClick={handleDownloadFull}
            disabled={sibuk}
          />
          <ModeCard
            icon="clipboard"
            title="Cek & Print"
            desc="Preview tiap rapor, terima atau tolak, lalu print semua yang diterima dengan 1x klik."
            onClick={mulaiCek}
            disabled={sibuk}
          />
        </section>
      )}

      {/* ════════ 2. CEK ════════ */}
      {phase === "cek" && siswa && ujian && (
        <div
          className="no-print"
          style={{ paddingBottom: `calc(9.5rem + ${bottomInset}px)` }}
        >
          <div
            ref={headRef}
            className="mb-3 scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <Avatar nama={siswa.nama_siswa} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                    {siswa.nama_siswa}
                  </p>
                  <Badge status={status[siswa.id]} />
                  {rapor && rapor.nilai.every((n) => n.nilai === "-") && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      Belum ada nilai
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {kelas?.nama_kelas} · Siswa {index + 1} dari {total}
                </p>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <p className="text-xs font-semibold text-slate-900">
                  {hitung.terima} diterima · {hitung.tolak} ditolak
                </p>
                <p className="text-[11px] text-slate-500">
                  {dicek} dari {total} dicek
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 via-blue-600 to-blue-700 transition-all duration-300"
                style={{ width: `${persenCek}%` }}
              />
            </div>
          </div>

          {!rapor && !error && <Spinner>Menyusun rapor…</Spinner>}

          {rapor && (
            <div
              ref={fit.outerRef}
              className="rapor-fit-outer bg-slate-200/70 py-2 sm:rounded-2xl sm:p-4"
              style={
                fit.bleed
                  ? { width: fit.bleed.w, marginLeft: fit.bleed.ml }
                  : undefined
              }
            >
              <div
                ref={fit.wrapRef}
                className="rapor-fit-wrap"
                style={{ height: fit.height ? `${fit.height}px` : undefined }}
              >
                <div
                  ref={fit.innerRef}
                  className="rapor-fit-inner"
                  style={{ transform: `scale(${fit.scale})` }}
                >
                  <div className="rapor-paper">
                    <RaporPreview siswa={siswa} rapor={rapor} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {createPortal(
            <div
              data-rapor-bar
              className="no-print fixed z-50 mx-auto max-w-3xl space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_8px_30px_rgba(15,23,42,0.22)] backdrop-blur"
              style={{
                left: 12,
                right: 12,
                bottom: bottomInset
                  ? bottomInset + 12
                  : "max(0.75rem, env(safe-area-inset-bottom))",
              }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => geser(-1)}
                  disabled={index <= 0}
                  aria-label="Siswa sebelumnya"
                  className="flex h-10 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                >
                  <Icon name="chevronLeft" className="h-[18px] w-[18px]" />
                </button>
                <button
                  onClick={() => setPhase("ringkasan")}
                  className="h-10 flex-1 rounded-xl text-xs font-semibold text-slate-600 transition hover:bg-slate-100 active:bg-slate-200"
                >
                  {index + 1} / {total} · Lihat ringkasan
                </button>
                <button
                  onClick={() => geser(1)}
                  disabled={index >= total - 1}
                  aria-label="Siswa berikutnya"
                  className="flex h-10 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                >
                  <Icon name="chevronRight" className="h-[18px] w-[18px]" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => putuskan("tolak")}
                  disabled={!rapor}
                  className="h-11 flex-1 rounded-xl border border-red-300 bg-white text-sm font-semibold text-red-700 transition hover:bg-red-50 active:scale-[0.98] disabled:opacity-50"
                >
                  Tolak
                </button>
                <button
                  onClick={() => putuskan("terima")}
                  disabled={!rapor}
                  className={`h-11 flex-1 rounded-xl text-sm font-semibold ${BTN_PRIMARY}`}
                >
                  Terima
                </button>
              </div>
            </div>,
            document.body,
          )}
        </div>
      )}

      {/* ════════ 3. STATUS → PRINT ════════ */}
      {phase === "ringkasan" && siap && (
        <section className="no-print space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-emerald-50 py-3">
                <p className="text-xl font-bold text-emerald-800">
                  {hitung.terima}
                </p>
                <p className="text-[11px] font-medium text-emerald-700">
                  Diterima
                </p>
              </div>
              <div className="rounded-xl bg-red-50 py-3">
                <p className="text-xl font-bold text-red-800">{hitung.tolak}</p>
                <p className="text-[11px] font-medium text-red-700">Ditolak</p>
              </div>
              <div className="rounded-xl bg-slate-100 py-3">
                <p className="text-xl font-bold text-slate-700">
                  {hitung.belum}
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  Belum dicek
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handlePrint}
                disabled={sibuk || hitung.belum > 0 || hitung.terima === 0}
                className={`h-12 flex-1 rounded-xl px-4 text-sm font-semibold ${BTN_PRIMARY}`}
              >
                Print {hitung.terima} rapor diterima
              </button>
              {hitung.belum > 0 ? (
                <button
                  onClick={lanjutCek}
                  disabled={sibuk}
                  className="h-12 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-blue-600 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
                >
                  Lanjut cek
                </button>
              ) : (
                <button
                  onClick={() => {
                    resetAlur();
                  }}
                  disabled={sibuk}
                  className="h-12 rounded-xl bg-slate-100 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50"
                >
                  Selesai
                </button>
              )}
            </div>
            {hitung.belum > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Print aktif setelah semua siswa dicek ({hitung.belum} belum).
              </p>
            )}
            {hitung.belum === 0 && hitung.terima === 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Tidak ada rapor yang diterima.
              </p>
            )}
          </div>

          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {siswaList.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => cekUlang(i)}
                  disabled={sibuk}
                  className="group flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60"
                >
                  <Avatar nama={s.nama_siswa} size="h-9 w-9 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {i + 1}. {s.nama_siswa}
                    </span>
                    {s.nis && (
                      <span className="block text-[11px] text-slate-500">
                        NIS {s.nis}
                      </span>
                    )}
                  </span>
                  <Badge status={status[s.id]} />
                  <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-slate-400 transition group-hover:text-blue-600">
                    {status[s.id] ? "Cek ulang" : "Cek"}
                    <Icon
                      name="chevronRight"
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ───────────── CSS ───────────── */
const CSS = `
    /* ── Wrapper auto-fit ── */
    .rapor-fit-outer { width: 100%; }

    @media screen and (max-width: 639px) {
      .rapor-sheet { gap: 8mm; }
    }

    .rapor-fit-wrap {
      width: 100%;
      overflow: hidden;
      position: relative;
    }
    .rapor-fit-inner {
      transform-origin: top left;
      will-change: transform;
      width: 215mm;
      min-width: 215mm;
    }

    /* ── Kertas ── */
    .rapor-paper {
      width: 215mm;
      min-width: 215mm;
      padding: 0;
      background: transparent;
      color: #000000;
    }

    /* ── Area cetak & stage PDF: tersembunyi di layar ── */
    .print-root { display: none; }
    .rapor-stage {
      position: absolute;
      left: -10000px;
      top: 0;
      width: 215mm;
      background: #ffffff;
    }
    .rapor-stage .rapor-sheet { gap: 0; }
    .rapor-stage .page { box-shadow: none; border-radius: 0; }

    .rapor-sheet {
      display: flex;
      flex-direction: column;
      gap: 12mm;
    }

    .rapor-sheet,
    .rapor-sheet * {
      box-sizing: border-box;
    }

    /* Dua kategori ukuran font:
         --fs-header : judul & header tabel
         --fs-isi    : isi / data */
    .rapor-sheet {
      --fs-header: 15px;
      --fs-isi: 13.5px;

      font-family: "Times New Roman", Times, "Liberation Serif", serif;
      font-size: var(--fs-isi);
      line-height: 1.3;
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
      opacity: 1;
      mix-blend-mode: normal;
    }

    .rapor-sheet * {
      color: #000000;
      -webkit-text-fill-color: #000000;
      opacity: 1;
      mix-blend-mode: normal;
      text-shadow: none;
    }

    /* ── Halaman ── */
    .page {
      display: block;
      width: 215mm;
      height: 330mm;
      padding: 8mm;
      overflow: hidden;
      background: #ffffff;
      position: relative;
      box-shadow:
        0 1px 2px rgba(0,0,0,.10),
        0 8px 24px rgba(15,23,42,.10);
      border-radius: 2px;
    }
    .page + .page { margin-top: 0; }

    .rapor-title {
      text-align: center;
      font-size: var(--fs-header);
      font-weight: 700;
      margin: 0 0 12px;
      letter-spacing: .03em;
      color: #000000;
      -webkit-text-fill-color: #000000;
    }

    .rapor-plain {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      color: #000000;
    }
    .rapor-plain td {
      padding: 2px 0;
      vertical-align: top;
      font-size: var(--fs-isi);
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
      white-space: nowrap;
    }
    .rapor-plain .lbl  { width: 80px; }
    .rapor-plain .sep  { width: 12px; }
    .rapor-plain .val  { width: 60%; }
    .rapor-plain .lbl2 { width: 130px; }
    .rapor-plain .val2 { white-space: nowrap; }

    .rapor-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      border-top: 1px solid #000000;
      border-left: 1px solid #000000;
      background: transparent;
      color: #000000;
    }
    .rapor-table th,
    .rapor-table td {
      border-right: 1px solid #000000;
      border-bottom: 1px solid #000000;
      padding: 8px 10px;
      vertical-align: middle;
      text-align: center;
      font-size: var(--fs-isi);
      text-decoration: none;
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }
    .rapor-table th {
      font-weight: 700;
      font-size: var(--fs-header);
      color: #000000;
      -webkit-text-fill-color: #000000;
    }
    .rapor-table.gap-top { margin-top: 20px; }

    .rapor-table td.td-left {
      text-align: left;
      padding-left: 10px;
    }

    .rapor-table .row-mapel td {
      height: var(--row-h, 30mm);
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }

    .rapor-table .row-ekskul td {
      height: 8mm;
      line-height: 20px;
      padding-top: 0;
      padding-bottom: 3px;
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }
    .rapor-table.ekskul-table th {
      height: 8mm;
      line-height: 20px;
      padding-top: 0;
      padding-bottom: 3px;
    }

    .rapor-table td.cap-cell {
      padding: 0;
      text-align: left;
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }

    /* Capaian kompetensi: teks rata kiri-kanan (justify) */
    .cap {
      padding: 4px 10px;
      border-bottom: 1px solid #000000;
      font-size: var(--fs-isi);
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: calc(var(--row-h, 30mm) / 2 - 0.5px);
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }
    .cap > span {
      display: block;
      width: 100%;
      text-align: justify;
      text-justify: inter-word;
      hyphens: auto;
    }
    .cap-last { border-bottom: 0; }

    .rapor-table.catatan-table th {
      height: 8mm;
      padding: 4px 10px;
      color: #000000;
      -webkit-text-fill-color: #000000;
    }
    .rapor-table.catatan-table .catatan {
      padding: 10px 14px;
      min-height: 15mm;
      font-size: var(--fs-isi);
      white-space: pre-line;
      text-align: justify;
      text-justify: inter-word;
      hyphens: auto;
      vertical-align: top;
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }

    .rapor-table.absen {
      width: 80mm;
      margin: 20px 0 0;
      border: 1px solid #000000;
    }
    .rapor-table.absen th,
    .rapor-table.absen td {
      border: 0;
      border-bottom: 1px solid #000000;
      height: 6mm;
      line-height: 6mm;
      padding: 0 8px;
      vertical-align: middle;
    }
    .rapor-table.absen tbody tr:last-child td { border-bottom: 0; }
    .rapor-table.absen td.absen-label { text-align: left; }
    .rapor-table.absen td.absen-angka { text-align: center; }
    .rapor-table.absen td.absen-satuan {
      text-align: left;
      padding-left: 20px;
    }

    /* ── Tanda tangan ── */
    .ttd {
      margin-top: 24px;
      text-align: center;
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }
    .ttd-row {
      display: flex;
      justify-content: space-between;
      padding: 0 20px 0 10px;
    }
    .ttd-col {
      text-align: center;
      min-width: 160px;
      font-size: var(--fs-isi);
      color: #000000;
      -webkit-text-fill-color: #000000;
    }
    .ttd-col p,
    .ttd-kepsek p {
      margin: 0;
      color: #000000;
      -webkit-text-fill-color: #000000;
    }
    .ttd-jabatan {
      margin-top: 6px;
      margin-bottom: 2px;
      text-align: center;
    }
    .ttd-space {
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: visible;
    }
    .ttd-space-wali {
      height: 90px;
    }
    .ttd-img {
      display: block;
      flex: none;
      margin: 0;
      max-height: 320px;
      max-width: 240px;
      object-fit: contain;
      opacity: 1 !important;
      -webkit-text-fill-color: initial !important;
      mix-blend-mode: normal;
    }
    .ttd-img-kepsek {
      max-height: 230px;
      max-width: 290px;
      margin-top: -50px;
      margin-left: -80px;
    }
    .ttd-kepsek {
      margin-top: 8px;
      font-size: var(--fs-isi);
      color: #000000;
      -webkit-text-fill-color: #000000;
    }
    .text-left { text-align: left; }

    .rapor-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    thead { display: table-header-group; }

    /* ── Cetak: hanya .print-root (semua rapor yang diterima) ── */
    @page {
      size: 215mm 330mm;
      margin: 8mm;
    }
    @media print {
      body > *:not(.print-root) { display: none !important; }
      .no-print { display: none !important; }
      .print-root { display: block !important; }

      .print-root .rapor-sheet { gap: 0; }

      .print-root .page {
        width: 100%;
        height: auto;
        min-height: 0;
        padding: 0;
        box-shadow: none !important;
        border-radius: 0;
        background: transparent;
        overflow: visible;
      }
      /* halaman 2 & tiap siswa baru selalu mulai di kertas baru */
      .print-root .page + .page,
      .print-root .rapor-sheet + .rapor-sheet .page-1 {
        margin-top: 0;
        break-before: page;
        page-break-before: always;
      }

      .print-root .rapor-sheet,
      .print-root .rapor-sheet * {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: transparent !important;
      }
      .print-root .ttd-img {
        max-height: 110px !important;
        max-width: 240px !important;
        margin: 0 !important;
      }
      .print-root .ttd-img-kepsek {
        max-height: 150px !important;
        max-width: 290px !important;
        margin: 0 !important;
      }
    }
  `;
