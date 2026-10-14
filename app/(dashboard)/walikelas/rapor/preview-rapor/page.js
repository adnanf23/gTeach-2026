"use client";

// app/walikelas/rapor/page.js
// Pratinjau rapor SELURUH siswa di kelas walikelas, cukup "next next".
// - Periode diambil dari pengaturan_ujian (akses_rapor = true)
// - Navigasi: tombol Sebelumnya / Berikutnya, picker siswa (bisa dicari),
//   atau tombol keyboard ← →
// - Rapor siswa berikutnya & sebelumnya di-prefetch, jadi pindah siswa terasa instan
// - Tampilan kertas F4, zoom, dan unduh PDF sama seperti halaman rapor wali murid
// - Nilai akhir per mapel DIHITUNG SAMA PERSIS dengan halaman leger
//   (UTS/UAS dikelompokkan per mapel, rata-rata sederhana, tanpa kehadiran)
// - ✅ Ketidakhadiran:
//     • Sakit & Izin → dari `kehadiran_manual` (fallback ke `absensi`)
//     • Alpa (Tanpa Keterangan) → dari `kehadiran_manual.hadir`
//       (field `hadir` di collection ini berisi data alpha),
//       fallback ke `absensi` jika tidak ada record.
// - ✅ Foto TTD:
//     • Wali kelas → field `ttd` di collection users (via relasi kelas.walikelas_id)
//     • Kepala sekolah → file statis di folder assets/
// - ✅ PDF: pakai `html-to-image` (bukan html2canvas) supaya hasil 100% sama
//   dengan UI (justify, flexbox, font, dst).

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { getCurrentUser, pb } from "@/lib/pocketbase";

// ✅ TTD kepala sekolah dari folder assets (static import Next.js)
import ttdKepsekAsset from "@/assets/TTD BUNDA AHDA_STAMPEL.png";

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
const kelasLabel = (k) => {
  const m = String(k ?? "").match(/\d+/);
  return m && KELAS_LABEL[m[0]] ? KELAS_LABEL[m[0]] : k ? String(k) : "-";
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
const RaporPreview = ({ siswa, rapor, innerRef }) => {
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
    <div className="rapor-sheet" ref={innerRef}>
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
              <p>&nbsp;</p>
              <p>Orang Tua,</p>
              <div className="ttd-space" />
              <p>……………………….</p>
            </div>
            <div className="ttd-col">
              <p className="text-left top-[-10px]">
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
              <p className="text-left">{rapor.wali_kelas || "-"}</p>
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

/* ───────────── komponen UI ───────────── */
const CARD_SHADOW = "shadow-[0_4px_14px_rgba(99,120,200,0.12)]";

const ZOOM_BTN_CLS =
  "flex h-11 w-11 items-center justify-center rounded-xl text-[18px] font-medium " +
  "text-gray-700 active:bg-gray-200 hover:bg-gray-100 " +
  "disabled:opacity-40 disabled:hover:bg-transparent disabled:active:bg-transparent";

const Chevron = ({ dir = "right" }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <path
      d={
        dir === "right" ? "M7.5 4.5l5.5 5.5-5.5 5.5" : "M12.5 4.5L7 10l5.5 5.5"
      }
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const StateCard = ({ tone = "muted", title, children }) => (
  <div
    role={tone === "error" ? "alert" : undefined}
    className={`no-print rounded-2xl px-4 py-8 text-center ${
      tone === "error" ? "bg-red-50" : `bg-white ${CARD_SHADOW}`
    }`}
  >
    {title && (
      <p
        className={`mb-1 text-[14px] font-medium ${
          tone === "error" ? "text-red-800" : "text-gray-800"
        }`}
      >
        {title}
      </p>
    )}
    <p
      className={`text-[13px] leading-relaxed ${
        tone === "error" ? "text-red-700" : "text-gray-500"
      }`}
    >
      {children}
    </p>
  </div>
);

const Spinner = ({ children }) => (
  <div
    className={`no-print flex items-center justify-center gap-2 rounded-2xl bg-white py-12 text-[13px] text-gray-400 ${CARD_SHADOW}`}
  >
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
    {children}
  </div>
);

/* ───────────── picker kustom ───────────── */
const PilihanSheet = ({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder = "Pilih…",
  searchable = false,
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const activeRef = useRef(null);
  const selected = options.find((o) => o.id === value);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) =>
      `${o.title} ${o.subtitle || ""}`.toLowerCase().includes(s),
    );
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    const t = setTimeout(
      () => activeRef.current?.scrollIntoView({ block: "center" }),
      60,
    );
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div
      className={`flex flex-col gap-1 text-[12px] font-medium text-gray-600 ${className}`}
    >
      {label}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-white px-3 py-1.5 text-left ring-1 ring-gray-200 transition hover:ring-gray-300 active:bg-gray-50 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-gray-800">
            {selected?.title || placeholder}
          </span>
          {selected?.subtitle && (
            <span className="block truncate text-[11px] font-normal text-gray-500">
              {selected.subtitle}
            </span>
          )}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          className="shrink-0 text-gray-400"
        >
          <path
            d="M5 7.5l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={typeof label === "string" ? label : undefined}
            className="no-print fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
          >
            <button
              type="button"
              aria-label="Tutup"
              onClick={() => setOpen(false)}
              className="absolute inset-0 cursor-default bg-black/40"
            />
            <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.18)] sm:rounded-3xl">
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
              <div className="flex items-center justify-between px-4 pb-2 pt-3">
                <p className="text-[15px] font-semibold text-gray-900">
                  {label}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Tutup"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] text-gray-500 hover:bg-gray-100 active:bg-gray-200"
                >
                  ×
                </button>
              </div>

              {searchable && (
                <div className="px-4 pb-2">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Cari nama atau NIS…"
                    className="h-10 w-full rounded-xl bg-gray-50 px-3 text-[14px] text-gray-800 ring-1 ring-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3b6ef5]/60"
                  />
                </div>
              )}

              <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
                {shown.length === 0 && (
                  <li className="py-8 text-center text-[13px] text-gray-400">
                    Tidak ada yang cocok.
                  </li>
                )}
                {shown.map((o) => {
                  const aktif = o.id === value;
                  return (
                    <li key={o.id} ref={aktif ? activeRef : null}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(o.id);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                          aktif
                            ? "bg-[#3b6ef5]/10 ring-2 ring-[#3b6ef5]/50"
                            : "bg-gray-50 ring-1 ring-gray-100 hover:bg-gray-100 active:bg-gray-200"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-medium text-gray-900">
                              {o.title}
                            </span>
                            {o.badge && (
                              <span className="shrink-0 rounded-full bg-[#3b6ef5] px-2 py-0.5 text-[10px] font-medium text-white">
                                {o.badge}
                              </span>
                            )}
                          </span>
                          {o.subtitle && (
                            <span className="mt-0.5 block text-[12px] text-gray-500">
                              {o.subtitle}
                            </span>
                          )}
                        </span>
                        {aktif && (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 20 20"
                            fill="none"
                            className="shrink-0 text-[#3b6ef5]"
                          >
                            <path
                              d="M4 10.5l4 4 8-9"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

/* ───────────── halaman ───────────── */
export default function RaporWalikelasPage() {
  const user = getCurrentUser();
  const userId = user?.id;

  const [kelas, setKelas] = useState(null);
  const [siswaList, setSiswaList] = useState([]);
  const [capaianMap, setCapaianMap] = useState(() => new Map());
  const [nilaiAkhirData, setNilaiAkhirData] = useState({
    mapelList: [],
    nilaiAkhir: {},
  });
  const [index, setIndex] = useState(0);

  const [ujianList, setUjianList] = useState([]);
  const [ujianId, setUjianId] = useState("");
  const [pengaturan, setPengaturan] = useState(null);

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const cacheRef = useRef({});
  const inflightRef = useRef(new Set());
  const currentKeyRef = useRef("");
  const [, setTick] = useState(0);

  const sheetRef = useRef(null);
  const headRef = useRef(null);

  /* ───── data dasar ───── */
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const kelasData = await pb
          .collection("kelas")
          .getFirstListItem(
            `walikelas_id = "${userId}" || pendamping_id = "${userId}"`,
            { expand: "walikelas_id", requestKey: null },
          );

        const [siswaData, ujianData, capaianData] = await Promise.all([
          pb.collection("siswa").getFullList({
            filter: `kelas_id = "${kelasData.id}"`,
            sort: "nama_siswa",
            requestKey: null,
          }),
          pb.collection("pengaturan_ujian").getFullList({
            filter: `akses_rapor = true`,
            expand: "tahun_ajaran_id",
            requestKey: null,
          }),
          pb.collection("capaian_kompetensi").getFullList({
            filter: `kelas_id = "${kelasData.id}"`,
            requestKey: null,
          }),
        ]);

        const cMap = new Map();
        capaianData.forEach((c) => {
          const mid = toArray(c.mapel_id)[0];
          if (mid) cMap.set(mid, c);
        });

        const hasil = await hitungNilaiAkhir(kelasData, siswaData);

        const sorted = sortUjian(ujianData);
        setNilaiAkhirData(hasil);
        setKelas(kelasData);
        setSiswaList(siswaData);
        setCapaianMap(cMap);
        setUjianList(sorted);
        setUjianId(sorted[0]?.id || "");
      } catch (e) {
        if (e?.status !== 404 && !e?.isAbort) {
          console.error(e);
          setError("Gagal memuat data kelas.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const siswa = siswaList[index] || null;
  const ujian = useMemo(
    () => ujianList.find((u) => u.id === ujianId) || null,
    [ujianList, ujianId],
  );

  /* ───── pengaturan_rapor ───── */
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

  const raporKey = siswa && ujian ? `${ujian.id}:${siswa.id}` : "";
  currentKeyRef.current = raporKey;
  const rapor = raporKey ? cacheRef.current[raporKey] : null;

  /* ───── susun rapor + prefetch ───── */
  useEffect(() => {
    if (!kelas || !ujian || !pengaturanSiap || !siswaList.length) return;
    setError("");

    const ensure = (s) => {
      if (!s) return;
      const key = `${ujian.id}:${s.id}`;
      if (cacheRef.current[key] || inflightRef.current.has(key)) return;
      inflightRef.current.add(key);
      buildRapor(s, {
        kelas,
        ujian,
        mapelList: nilaiAkhirData.mapelList,
        nilaiAkhirMap: nilaiAkhirData.nilaiAkhir,
        capaianMap,
        pengaturanRapor: pengaturan.data,
      })
        .then((d) => {
          cacheRef.current[key] = d;
          setTick((t) => t + 1);
        })
        .catch((e) => {
          console.error(e);
          if (key === currentKeyRef.current) setError("Gagal menyusun rapor.");
        })
        .finally(() => inflightRef.current.delete(key));
    };

    ensure(siswaList[index]);
    ensure(siswaList[index + 1]);
    ensure(siswaList[index - 1]);
  }, [
    kelas,
    ujian,
    pengaturan,
    pengaturanSiap,
    siswaList,
    index,
    capaianMap,
    nilaiAkhirData,
  ]);

  /* ───── navigasi ───── */
  const total = siswaList.length;

  const step = useCallback(
    (delta) => {
      setIndex((i) => Math.min(total - 1, Math.max(0, i + delta)));
      const el = headRef.current;
      if (el && el.getBoundingClientRect().top < 0) {
        el.scrollIntoView({ block: "start" });
      }
    },
    [total],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  /* ───── fit + zoom ───── */
  const fit = useFitScale(812, !!rapor);
  const bottomInset = useBottomInset(!!siswa && !!ujian);

  const [zoom, setZoom] = useState(null);
  const pinchRef = useRef({ startDist: 0, startZoom: 1 });
  const zoomValRef = useRef(null);
  useEffect(() => {
    zoomValRef.current = zoom;
  }, [zoom]);

  const effectiveScale = useMemo(
    () => (zoom == null ? fit.scale : fit.scale * zoom),
    [fit.scale, zoom],
  );

  const zoomIn = () => setZoom((z) => Math.min(4, (z ?? 1) * 1.25));
  const zoomOut = () => setZoom((z) => Math.max(0.25, (z ?? 1) / 1.25));
  const zoomReset = () => setZoom(null);

  const adaRapor = !!rapor;
  useEffect(() => {
    const el = fit.wrapRef.current;
    if (!el) return;

    const dist = (t) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const apply = (value) => {
      const clamped = Math.min(4, Math.max(0.25, value));
      setZoom(Math.abs(clamped - 1) < 0.04 ? null : clamped);
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          startDist: dist(e.touches),
          startZoom: zoomValRef.current ?? 1,
        };
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !pinchRef.current.startDist) return;
      e.preventDefault();
      const ratio = dist(e.touches) / pinchRef.current.startDist;
      apply(pinchRef.current.startZoom * ratio);
    };
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) pinchRef.current.startDist = 0;
    };
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      apply((zoomValRef.current ?? 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [fit.wrapRef, adaRapor]);

  /* ───── unduh PDF ───── */
  const handleDownloadPdf = async () => {
    if (!rapor || !siswa || !sheetRef.current) return;
    setDownloading(true);
    try {
      const filename = `Rapor_${slug(siswa.nama_siswa)}_Semester_${rapor.semester}_${slug(
        rapor.tahun_ajaran,
      )}.pdf`;

      const pages = Array.from(sheetRef.current.querySelectorAll(".page"));

      const [{ toPng }, { jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);

      const stage = document.createElement("div");
      stage.style.cssText =
        "position:absolute;left:-10000px;top:0;width:215mm;background:#fff;";
      const sheet = document.createElement("div");
      sheet.className = "rapor-sheet";
      sheet.style.gap = "0";
      stage.appendChild(sheet);
      document.body.appendChild(stage);

      try {
        const clones = pages.map((p) => {
          const c = p.cloneNode(true);
          c.style.boxShadow = "none";
          c.style.borderRadius = "0";
          sheet.appendChild(c);
          return c;
        });

        const imgs = Array.from(sheet.querySelectorAll("img"));
        await Promise.all(
          imgs.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((res) => {
                  img.onload = img.onerror = () => res();
                }),
          ),
        );

        if (document.fonts?.ready) {
          try {
            await document.fonts.ready;
          } catch {
            /* ignore */
          }
        }

        const dataUrls = [];
        for (const c of clones) {
          const url = await toPng(c, {
            pixelRatio: 2,
            backgroundColor: "#ffffff",
            cacheBust: true,
            skipFonts: false,
          });
          dataUrls.push(url);
        }

        const pdf = new jsPDF({
          unit: "mm",
          format: [215, 330],
          orientation: "portrait",
          compress: true,
        });

        dataUrls.forEach((url, i) => {
          if (i > 0) pdf.addPage([215, 330], "portrait");
          pdf.addImage(url, "PNG", 0, 0, 215, 330);
        });
        pdf.save(filename);
      } finally {
        stage.remove();
      }
    } catch (e) {
      console.error(e);
      setError("Gagal membuat PDF.");
    } finally {
      setDownloading(false);
    }
  };

  /* ───── opsi picker ───── */
  const ujianOptions = useMemo(
    () =>
      ujianList.map((u, i) => {
        const ta = u.expand?.tahun_ajaran_id;
        return {
          id: u.id,
          title: u.nama_ujian || "Rapor",
          subtitle: `Semester ${semesterLabel(ta?.semester)} · ${ta?.tahun ?? "-"}`,
          badge: i === 0 ? "Terbaru" : null,
        };
      }),
    [ujianList],
  );

  const siswaOptions = useMemo(
    () =>
      siswaList.map((s, i) => ({
        id: s.id,
        title: `${i + 1}. ${s.nama_siswa}`,
        subtitle: s.nis ? `NIS ${s.nis}` : undefined,
      })),
    [siswaList],
  );

  const pilihSiswa = (id) => {
    const i = siswaList.findIndex((s) => s.id === id);
    if (i >= 0) setIndex(i);
  };

  /* ───── render ───── */
  if (loading) {
    return (
      <>
        <style>{CSS}</style>
        <Spinner>Memuat data kelas…</Spinner>
      </>
    );
  }

  if (!kelas) {
    return (
      <>
        <style>{CSS}</style>
        {error ? (
          <StateCard tone="error">{error}</StateCard>
        ) : (
          <StateCard title="Kelas tidak ditemukan">
            Akun Anda belum terdaftar sebagai wali kelas atau pendamping kelas
            mana pun.
          </StateCard>
        )}
      </>
    );
  }

  const adaPeriode = ujianList.length > 0;
  const tampilkanBar = !!siswa && !!ujian;
  const menyusun = !!siswa && !!ujian && !rapor && !error;

  return (
    <>
      <style>{CSS}</style>

      <header className="no-print mb-3">
        <h1 className="text-[18px] font-semibold text-gray-900">
          Pratinjau Rapor Siswa
        </h1>
        <p className="mt-0.5 text-[12px] text-gray-500">
          {kelas.nama_kelas} · {total} siswa. Tekan Berikutnya (atau tombol
          panah ← →) untuk berpindah siswa.
        </p>
      </header>

      <section
        className={`no-print mb-4 grid gap-3 rounded-2xl bg-white p-3 sm:grid-cols-2 ${CARD_SHADOW}`}
      >
        <PilihanSheet
          label="Periode rapor"
          value={ujianId}
          onChange={setUjianId}
          options={ujianOptions}
          disabled={!adaPeriode}
          placeholder="Belum ada rapor"
        />
        <PilihanSheet
          label="Siswa"
          value={siswa?.id || ""}
          onChange={pilihSiswa}
          options={siswaOptions}
          disabled={!total}
          placeholder="Belum ada siswa"
          searchable
        />
      </section>

      {error && <StateCard tone="error">{error}</StateCard>}
      {!error && !total && (
        <StateCard title="Belum ada siswa">
          Kelas ini belum memiliki data siswa.
        </StateCard>
      )}
      {!error && total > 0 && !adaPeriode && (
        <StateCard title="Rapor belum dibuka">
          Belum ada periode rapor yang dibuka oleh admin.
        </StateCard>
      )}
      {menyusun && <Spinner>Menyusun rapor…</Spinner>}

      {tampilkanBar && (
        <div
          className="no-print"
          style={{ paddingBottom: `calc(9.5rem + ${bottomInset}px)` }}
        >
          <div ref={headRef} className="mb-2 scroll-mt-20 px-1">
            <div className="flex items-center gap-2">
              <p className="min-w-0 truncate text-[13px] font-medium text-gray-800">
                {siswa.nama_siswa}
              </p>
              {rapor && rapor.nilai.every((n) => n.nilai === "-") && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  Belum ada nilai
                </span>
              )}
            </div>
            <p className="text-[12px] text-gray-500">
              Siswa {index + 1} dari {total}
              {rapor
                ? ` · Semester ${semesterLabel(rapor.semester)} · TP ${rapor.tahun_ajaran || "-"}`
                : ""}
            </p>
            <p className="mt-1 text-[11px] text-gray-400 sm:hidden">
              Cubit dengan dua jari untuk memperbesar.
            </p>
          </div>

          {rapor && (
            <div
              ref={fit.outerRef}
              className="rapor-fit-outer bg-[#dfe3ec] py-2 sm:rounded-2xl sm:p-4"
              style={
                fit.bleed
                  ? { width: fit.bleed.w, marginLeft: fit.bleed.ml }
                  : undefined
              }
            >
              <div
                ref={fit.wrapRef}
                className="rapor-fit-wrap"
                style={{
                  height: fit.height
                    ? `${fit.height * (effectiveScale / fit.scale)}px`
                    : undefined,
                  overflow: zoom != null && zoom > 1 ? "auto" : "hidden",
                  touchAction: "pan-x pan-y",
                }}
              >
                <div
                  ref={fit.innerRef}
                  className="rapor-fit-inner"
                  style={{ transform: `scale(${effectiveScale})` }}
                >
                  <div
                    className={`rapor-paper ${zoom != null ? "zoomed" : ""}`}
                  >
                    <RaporPreview
                      siswa={siswa}
                      rapor={rapor}
                      innerRef={sheetRef}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {createPortal(
            <div
              data-rapor-bar
              className="no-print fixed z-50 mx-auto max-w-3xl space-y-2 rounded-2xl bg-white/95 p-2 shadow-[0_8px_30px_rgba(15,23,42,0.18)] backdrop-blur"
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
                  onClick={() => step(-1)}
                  disabled={index <= 0}
                  aria-label="Siswa sebelumnya"
                  className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-gray-100 text-[14px] font-medium text-gray-700 transition hover:bg-gray-200 active:bg-gray-300 disabled:opacity-40 disabled:hover:bg-gray-100"
                >
                  <Chevron dir="left" />
                  Sebelumnya
                </button>
                <div
                  className="min-w-[56px] text-center text-[12px] font-medium tabular-nums text-gray-500"
                  aria-live="polite"
                >
                  {index + 1} / {total}
                </div>
                <button
                  onClick={() => step(1)}
                  disabled={index >= total - 1}
                  aria-label="Siswa berikutnya"
                  className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-[#3b6ef5] text-[14px] font-medium text-white shadow-[0_8px_18px_rgba(59,110,245,0.30)] transition hover:bg-[#2f5ee0] active:bg-[#2f5ee0] disabled:opacity-40 disabled:shadow-none disabled:hover:bg-[#3b6ef5]"
                >
                  Berikutnya
                  <Chevron dir="right" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  <button
                    onClick={zoomOut}
                    aria-label="Perkecil"
                    className={ZOOM_BTN_CLS}
                  >
                    −
                  </button>
                  <button
                    onClick={zoomReset}
                    disabled={zoom == null}
                    aria-label="Atur ulang zoom"
                    className="h-11 min-w-[48px] rounded-xl px-1 text-[12px] font-medium text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    {zoom == null ? "Auto" : `${Math.round(zoom * 100)}%`}
                  </button>
                  <button
                    onClick={zoomIn}
                    aria-label="Perbesar"
                    className={ZOOM_BTN_CLS}
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={handleDownloadPdf}
                  disabled={downloading || !rapor}
                  className="h-11 flex-1 rounded-xl bg-white px-4 text-[14px] font-medium text-[#3b6ef5] ring-1 ring-[#3b6ef5]/40 transition hover:bg-[#3b6ef5]/5 active:bg-[#3b6ef5]/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloading ? "Menyiapkan PDF…" : "Unduh PDF"}
                </button>
              </div>
            </div>,
            document.body,
          )}
        </div>
      )}
    </>
  );
}

/* ───────────── CSS ───────────── */
const CSS = `
    /* ── Wrapper auto-fit + zoom ── */
    .rapor-fit-outer { width: 100%; }

    @media screen and (max-width: 639px) {
      .rapor-sheet { gap: 8mm; }
      .rapor-paper.zoomed { outline: none; }
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
      box-shadow: none;
      border-radius: 0;
    }
    .rapor-paper.zoomed {
      outline: 2px solid rgba(59,110,245,.55);
      outline-offset: 6px;
      border-radius: 4px;
    }

    .rapor-sheet {
      display: flex;
      flex-direction: column;
      gap: 12mm;
    }

    .rapor-sheet,
    .rapor-sheet * {
      box-sizing: border-box;
    }

    /* ✅ Dua kategori ukuran font:
         --fs-header : judul & header tabel
         --fs-isi    : isi / data (diperbesar) */
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

    /* ✅ Capaian kompetensi: teks rata kiri-kanan (justify) */
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

    /* ✅ Header "CATATAN" — tinggi diperkecil */
    .rapor-table.catatan-table th {
      height: 8mm;
      padding: 4px 10px;
      color: #000000;
      -webkit-text-fill-color: #000000;
    }
    /* ✅ Isi catatan — tinggi menyesuaikan isi (auto), dengan min-height */
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
    /* ✅ Ketidakhadiran: teks lurus vertikal (center) */
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
    /* ✅ Label "Wali Kelas," di bawah tanggal — sejajar kiri dengan tanggal */
    .ttd-jabatan {
      margin-top: 6px;
      margin-left: -6px;
      margin-bottom: 2px;
      text-align: center;
    }
    /* Default: ruang TTD kecil (dipakai Orang Tua & Kepala Sekolah) */
    .ttd-space {
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    /* ✅ Ruang khusus TTD wali kelas — lebih tinggi untuk gambar besar */
    .ttd-space-wali {
      height: 90px;
    }
    /* ✅ Foto TTD wali kelas — diperbesar */
    .ttd-img {
      max-height: 110px;
      max-width: 240px;
      object-fit: contain;
      margin-bottom: -10px;
      opacity: 1 !important;
      -webkit-text-fill-color: initial !important;
      mix-blend-mode: normal;
    }
    /* ✅ Foto TTD kepala sekolah — ukuran besar */
    .ttd-img-kepsek {
      max-height: 150px;
      max-width: 290px;
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

    @page {
      size: 215mm 330mm;
      margin: 8mm;
    }
    @media print {
      .no-print { display: none !important; }

      .rapor-fit-outer,
      .rapor-fit-wrap {
        height: auto !important;
        overflow: visible !important;
        width: auto !important;
      }
      .rapor-fit-inner {
        transform: none !important;
        width: auto !important;
        min-width: 0 !important;
      }

      .rapor-paper {
        width: auto;
        min-width: 0;
        padding: 0;
        box-shadow: none;
        border-radius: 0;
        background: transparent;
        color: #000000;
        outline: none !important;
      }
      .rapor-sheet { gap: 0; }

      .page {
        width: 100%;
        height: auto;
        min-height: 0;
        padding: 0;
        box-shadow: none !important;
        border-radius: 0;
        background: transparent;
        overflow: visible;
      }
      .page + .page {
        margin-top: 0;
        break-before: page;
        page-break-before: always;
      }
      .rapor-sheet,
      .rapor-sheet * {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: transparent !important;
      }
      .rapor-table th,
      .rapor-table td {
        background-color: transparent !important;
      }
      /* ✅ Pastikan kedua foto TTD muncul & ukurannya terkontrol saat print */
      .ttd-img {
        max-height: 110px !important;
        max-width: 240px !important;
      }
      .ttd-img-kepsek {
        max-height: 150px !important;
        max-width: 290px !important;
      }
    }
  `;
