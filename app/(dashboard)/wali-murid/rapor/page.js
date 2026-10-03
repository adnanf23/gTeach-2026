"use client";

// app/wali-murid/rapor/page.js
// Preview rapor (tabel) + download PDF.
// Data dibangun langsung dari: siswa, nilai_ujian, nilai_harian,
// absensi, nilai_ekskul, catatan_siswa. Sumber "periode" adalah
// pengaturan_ujian yang akses_rapor = true.
// Header (nama sekolah, alamat, kepala sekolah, tanggal) diambil dari
// pengaturan_rapor bila tersedia, fallback ke SEKOLAH_DEFAULT.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pb } from "@/lib/pocketbase";

/* ───────────── konfigurasi ───────────── */
const SEKOLAH_DEFAULT = {
  nama: "SD Global Garuda Nusantara Islamic Centre",
  alamat: "Jl. Raya Semplak Salabenda",
  kota: "Bogor",
  kepala_sekolah: "Syafrina Ahda, S.Pd",
};

const TEXT_TINGGI = "Ananda menunjukkan pemahaman dalam";
const TEXT_RENDAH = "Ananda membutuhkan bimbingan dalam";

/* ───────────── konfigurasi halaman ───────────── */
const MAX_MAPEL_HAL1 = 8; // mapel ke-9 dst pindah ke halaman 2

/* ───────────── urutan mapel ───────────── */
const URUTAN_MAPEL = [
  ["pai", "pendidikan agama islam dan budi pekerti"],
  ["pancsl", "pancasila", "pendidikan pancasila dan kewarganegaraan"],
  ["bind", "bahasa indonesia"],
  ["mtk", "matematika"],
  ["ipas", "ilmu pengetahuan alam sosial"],
  ["senbud", "seni budaya"],
  ["pjok", "pendidikan jasmani olahraga dan kesehatan"],
  ["arab", "bahasa arab"],
  ["english", "bahasa inggris"],
  ["bsund", "bahasa sunda"],
  ["kka", "koding"],
];

const normMapel = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const urutanMapel = (mapel) => {
  const kandidat = [mapel?.Label, mapel?.kode_mapel, mapel?.nama_mapel]
    .map(normMapel)
    .filter(Boolean);
  const idx = URUTAN_MAPEL.findIndex((alias) =>
    kandidat.some((k) => alias.includes(k)),
  );
  return idx === -1 ? 999 : idx;
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

const formatTanggal = (d) =>
  (d ? new Date(d) : new Date()).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
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

/* ───────────── hook: auto-fit kertas ke lebar container ───────────── */
/* F4/Folio: 215mm × 330mm. Lebar konten px @96dpi ≈ 812px. */
function useFitScale(contentWidthPx = 812 /* 215mm @96dpi */, active = true) {
  const outerRef = useRef(null);
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  // mobile: lebar & geser kiri agar kontainer = lebar layar penuh
  const [bleed, setBleed] = useState(null);

  useEffect(() => {
    // pratinjau baru dirender setelah data siap → jalankan ulang saat `active` berubah
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

/* ───────────── hook: tinggi elemen fixed di dasar layar (mis. bottom-nav) ───────────── */
/* Bar aksi dinaikkan otomatis supaya tidak tertutup / tenggelam di belakangnya. */
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

/* ───────────── susun data rapor ───────────── */
async function buildRapor(siswa, ujian, pengaturanRapor = null) {
  const ta = ujian.expand?.tahun_ajaran_id;
  const kelas = siswa.expand?.kelas_id;
  const sid = siswa.id;
  const kelasId = toArray(siswa.kelas_id)[0] || null;

  const [nilaiRes, capaianRes, absenRes, ekskulRes, catatanRes] =
    await Promise.all([
      pb.collection("nilai_ujian").getFullList({
        filter: `siswa_id = "${sid}" && pengaturan_ujian_id = "${ujian.id}"`,
        expand: "mapel_id",
        requestKey: null,
      }),
      kelasId
        ? pb.collection("capaian_kompetensi").getFullList({
            filter: `kelas_id = "${kelasId}"`,
            expand: "mapel_id",
            requestKey: null,
          })
        : Promise.resolve([]),
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
      kelasId
        ? pb.collection("catatan_siswa").getFullList({
            filter: `siswa_id = "${sid}" && kelas_id = "${kelasId}"`,
            sort: "-created",
            requestKey: null,
          })
        : Promise.resolve([]),
    ]);

  const perMapel = new Map();
  nilaiRes.forEach((r) => {
    const m = r.expand?.mapel_id;
    if (!m) return;
    const e = perMapel.get(m.id) || { mapel: m, total: 0, n: 0 };
    e.total += Number(r.nilai) || 0;
    e.n += 1;
    perMapel.set(m.id, e);
  });

  const capaianPerMapel = new Map();
  capaianRes.forEach((c) => {
    const mid = toArray(c.mapel_id)[0];
    if (!mid) return;
    capaianPerMapel.set(mid, c);
  });

  const akademikSaja = ujian?.template_rapor === "akademik";

  const nilai = [...perMapel.values()]
    .filter(
      (e) => !akademikSaja || !e.mapel.kategori || e.mapel.kategori === "umum",
    )
    .map(({ mapel, total, n }) => {
      const cap = capaianPerMapel.get(mapel.id);
      const label = mapel.Label || mapel.nama_mapel || "-";
      return {
        mapel: label,
        urutan: urutanMapel(mapel),
        nilai: n ? Math.round(total / n) : "-",
        capaian_tinggi: cap?.capaian_tinggi
          ? `${TEXT_TINGGI} ${cap.capaian_tinggi}`
          : TEXT_TINGGI,
        capaian_rendah: cap?.capaian_rendah
          ? `${TEXT_RENDAH} ${cap.capaian_rendah}`
          : TEXT_RENDAH,
      };
    })
    .sort((a, b) => a.urutan - b.urutan || a.mapel.localeCompare(b.mapel));

  const hitung = (s) => absenRes.filter((a) => a.status === s).length;

  const catatanTeks = catatanRes.length
    ? catatanRes
        .map((c) => {
          const isi =
            c.catatan || c.isi || c.deskripsi || c.keterangan || c.pesan || "";
          const tgl = c.tanggal
            ? new Date(c.tanggal).toLocaleDateString("id-ID", {
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

  return {
    semester: ta?.semester,
    tahun_ajaran: ta?.tahun,
    kelas: kelas?.tingkat,
    fase: faseDari(kelas?.tingkat),
    wali_kelas: kelas?.expand?.walikelas_id?.nama_lengkap || "-",
    kepala_sekolah:
      pengaturanRapor?.kepala_sekolah || SEKOLAH_DEFAULT.kepala_sekolah,
    nama_sekolah: pengaturanRapor?.nama_sekolah || SEKOLAH_DEFAULT.nama,
    alamat: pengaturanRapor?.alamat || SEKOLAH_DEFAULT.alamat,
    kota: SEKOLAH_DEFAULT.kota,
    // Tanggal: utamakan pengaturan_rapor.tanggal_rapor
    tanggal_rapor: pengaturanRapor?.tanggal_rapor || null,
    catatan: catatanTeks,
    sakit: hitung("sakit"),
    izin: hitung("izin"),
    alpa: hitung("alpha"),
    nilai,
    ekstrakurikuler: ekskulRes.map((e) => ({
      nama: e.nama_ekskul,
      keterangan: [e.predikat, e.catatan].filter(Boolean).join(" — ") || "-",
    })),
  };
}

/* ───────────── tabel nilai (dipakai di hal 1 & 2) ───────────── */
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
            <div className="cap">{m.capaian_tinggi || "-"}</div>
            <div className="cap cap-last">{m.capaian_rendah || "-"}</div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/* ───────────── preview rapor (tabel) ───────────── */
const RaporPreview = ({ siswa, rapor, innerRef }) => {
  const nilai = toArray(rapor.nilai);
  const ekskul = toArray(rapor.ekstrakurikuler);
  const ekskulRows = ekskul.length
    ? ekskul
    : [
        { nama: "-", keterangan: "-" },
        { nama: "-", keterangan: "-" },
      ];

  // pecah nilai: hal 1 maksimal 8 mapel, sisanya ke hal 2
  const nilaiHal1 = nilai.slice(0, MAX_MAPEL_HAL1);
  const nilaiHal2 = nilai.slice(MAX_MAPEL_HAL1);

  const rowH1 = nilaiHal1.length
    ? Math.min(30, Math.floor((290 / nilaiHal1.length) * 10) / 10)
    : 30;
  const rowH2 = 24;

  return (
    <div className="rapor-sheet" ref={innerRef}>
      {/* ══════════════ HALAMAN 1 — IDENTITAS + NILAI (1–8) ══════════════ */}
      <div className="page page-1">
        <h1 className="rapor-title">
          LAPORAN HASIL BELAJAR
          <br />
          ASESMEN HARIAN BERSAMA (AHB) GANJIL
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
            {/* ── Tahun Pelajaran: 1 baris, kolom kanan digeser ── */}
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

      {/* ══════════════ HALAMAN 2 — LANJUTAN NILAI + EKSKUL + CATATAN + TTD ══════════════ */}
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
              <p>Orang Tua,</p>
              <div className="ttd-space" />
              <p>……………………….</p>
            </div>
            <div className="ttd-col">
              {/* ── Tanggal rapor murni dari DB (pengaturan_rapor.tanggal_rapor).
                     Kalau kosong → titik-titik, biar jelas belum diisi admin. ── */}
              <p className="text-left">
                {rapor.kota || SEKOLAH_DEFAULT.kota},{" "}
                {rapor.tanggal_rapor
                  ? formatTanggal(rapor.tanggal_rapor)
                  : "……………………"}
              </p>
              <div className="ttd-space" />
              <p className="text-left">{rapor.wali_kelas || "-"}</p>
            </div>
          </div>
          <div className="ttd-kepsek">
            <p>Mengetahui,</p>
            <p>Kepala Sekolah</p>
            <div className="ttd-space" />
            <p>{rapor.kepala_sekolah || "-"}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ───────────── komponen UI (mobile-first) ───────────── */
const CARD_SHADOW = "shadow-[0_4px_14px_rgba(99,120,200,0.12)]";

const ZOOM_BTN_CLS =
  "flex h-11 w-11 items-center justify-center rounded-xl text-[18px] font-medium " +
  "text-gray-700 active:bg-gray-200 hover:bg-gray-100 " +
  "disabled:opacity-40 disabled:hover:bg-transparent disabled:active:bg-transparent";

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

/* ───────────── picker kustom (bottom sheet / dialog) ───────────── */
const PilihanSheet = ({
  label,
  value,
  onChange,
  options, // [{ id, title, subtitle, badge }]
  disabled,
  placeholder = "Pilih…",
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
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

              <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
                {options.map((o) => {
                  const aktif = o.id === value;
                  return (
                    <li key={o.id}>
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
export default function RaporPage() {
  const [siswaList, setSiswaList] = useState([]);
  const [siswaId, setSiswaId] = useState("");
  const [ujianList, setUjianList] = useState([]);
  const [ujianId, setUjianId] = useState("");
  const [pengaturanRapor, setPengaturanRapor] = useState(null);
  const [rapor, setRapor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingRapor, setLoadingRapor] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const sheetRef = useRef(null);
  const fit = useFitScale(812, !!rapor && !loadingRapor); // 215mm @ 96dpi (F4)
  const bottomInset = useBottomInset(!!rapor && !loadingRapor);

  // zoom manual: null = auto-fit, angka = faktor tambahan (1.25, 1.5, 2, …)
  const [zoom, setZoom] = useState(null);

  // pinch-to-zoom refs
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

  useEffect(() => {
    (async () => {
      try {
        const me = pb.authStore.record || pb.authStore.model;
        const ids = toArray(me?.siswa_id);
        if (!ids.length) return;
        const res = await pb.collection("siswa").getFullList({
          filter: ids.map((id) => `id = "${id}"`).join(" || "),
          expand: "kelas_id.walikelas_id",
          sort: "nama_siswa",
          requestKey: null,
        });
        setSiswaList(res);
        if (res[0]) setSiswaId(res[0].id);
      } catch (e) {
        console.error(e);
        setError("Gagal memuat data siswa.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await pb.collection("pengaturan_ujian").getFullList({
          filter: `akses_rapor = true`,
          expand: "tahun_ajaran_id",
          requestKey: null,
        });
        const sorted = sortUjian(res);
        setUjianList(sorted);
        setUjianId(sorted[0]?.id || "");
      } catch (e) {
        console.error(e);
        setError("Gagal memuat periode rapor.");
      }
    })();
  }, []);

  const siswa = useMemo(
    () => siswaList.find((s) => s.id === siswaId),
    [siswaList, siswaId],
  );
  const ujian = useMemo(
    () => ujianList.find((u) => u.id === ujianId),
    [ujianList, ujianId],
  );

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
    () => siswaList.map((s) => ({ id: s.id, title: s.nama_siswa })),
    [siswaList],
  );

  // Ambil pengaturan_rapor yang terkait dengan ujian terpilih.
  // Coba relasi `ujian` dulu, fallback ke `ujian_id`.
  useEffect(() => {
    if (!ujian) {
      setPengaturanRapor(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let pr = null;
      try {
        pr = await pb
          .collection("pengaturan_rapor")
          .getFirstListItem(`ujian = "${ujian.id}"`, { requestKey: null });
      } catch {
        try {
          pr = await pb
            .collection("pengaturan_rapor")
            .getFirstListItem(`ujian_id = "${ujian.id}"`, { requestKey: null });
        } catch {
          pr = null;
        }
      }
      if (cancelled) return;
      console.log("[rapor] pengaturan_rapor:", pr);
      setPengaturanRapor(pr);
    })();
    return () => {
      cancelled = true;
    };
  }, [ujian]);

  useEffect(() => {
    if (!siswa || !ujian) {
      setRapor(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingRapor(true);
      setError("");
      try {
        const data = await buildRapor(siswa, ujian, pengaturanRapor);
        if (!cancelled) setRapor(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Gagal menyusun rapor.");
      } finally {
        if (!cancelled) setLoadingRapor(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siswa, ujian, pengaturanRapor]);

  // Pinch-to-zoom (2 jari) + Ctrl/⌘ + scroll untuk trackpad
  useEffect(() => {
    const el = fit.wrapRef.current;
    if (!el) return;

    const dist = (t) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const apply = (value) => {
      const clamped = Math.min(4, Math.max(0.25, value));
      // dekat 100% → kembali ke mode auto-fit
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
      e.preventDefault(); // cegah zoom bawaan browser
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
  }, [fit.wrapRef, siswa, rapor, loadingRapor]);

  const handleDownloadPdf = async () => {
    if (!rapor || !siswa || !sheetRef.current) return;
    setDownloading(true);
    try {
      const filename = `Rapor_${slug(siswa.nama_siswa)}_Semester_${rapor.semester}_${slug(
        rapor.tahun_ajaran,
      )}.pdf`;

      const pages = Array.from(sheetRef.current.querySelectorAll(".page"));

      // Dimuat saat dibutuhkan (hindari error SSR)
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Render dari salinan di luar layar: bebas dari transform/zoom preview,
      // ukuran selalu tepat 215mm × 330mm (F4). Margin 8mm sudah ada di
      // dalam .page (padding), jadi PDF tidak menambah margin lagi.
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

        const pdf = new jsPDF({
          unit: "mm",
          format: [215, 330],
          orientation: "portrait",
          compress: true,
        });

        for (let i = 0; i < clones.length; i++) {
          const canvas = await html2canvas(clones[i], {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            scrollX: 0,
            scrollY: 0,
          });
          if (i > 0) pdf.addPage([215, 330], "portrait");
          pdf.addImage(
            canvas.toDataURL("image/jpeg", 0.95),
            "JPEG",
            0,
            0,
            215,
            330,
          );
        }
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

  const adaPeriode = ujianList.length > 0;

  return (
    <>
      <style>{CSS}</style>

      {/* Judul */}
      <header className="no-print mb-3">
        <h1 className="text-[18px] font-semibold text-gray-900">
          Rapor Ananda
        </h1>
        <p className="mt-0.5 text-[12px] text-gray-500">
          Pilih periode, lihat pratinjau, lalu unduh PDF.
        </p>
      </header>

      {/* Filter: 1 kolom di mobile, 2 kolom di layar ≥ sm */}
      <section
        className={`no-print mb-4 grid gap-3 rounded-2xl bg-white p-3 sm:grid-cols-2 ${CARD_SHADOW}`}
      >
        {siswaList.length > 1 && (
          <PilihanSheet
            label="Anak"
            value={siswaId}
            onChange={setSiswaId}
            options={siswaOptions}
          />
        )}

        <PilihanSheet
          label="Periode rapor"
          value={ujianId}
          onChange={setUjianId}
          options={ujianOptions}
          disabled={!adaPeriode}
          placeholder="Belum ada rapor"
          className={siswaList.length > 1 ? "" : "sm:col-span-2"}
        />
      </section>

      {/* Status */}
      {(loading || loadingRapor) && (
        <div
          className={`no-print flex items-center justify-center gap-2 rounded-2xl bg-white py-12 text-[13px] text-gray-400 ${CARD_SHADOW}`}
        >
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
          Memuat rapor…
        </div>
      )}
      {error && <StateCard tone="error">{error}</StateCard>}
      {!loading && !error && !siswa && (
        <StateCard title="Data anak belum terhubung">
          Akun Anda belum terhubung dengan data anak. Hubungi wali kelas atau
          admin.
        </StateCard>
      )}
      {!loading && !loadingRapor && !error && siswa && !adaPeriode && (
        <StateCard title="Rapor belum dibuka">
          Rapor {siswa.nama_siswa} belum dibuka oleh admin.
        </StateCard>
      )}

      {/* Pratinjau + bar aksi */}
      {siswa && rapor && !loadingRapor && (
        <div
          className="no-print"
          style={{ paddingBottom: `calc(5.5rem + ${bottomInset}px)` }}
        >
          <div className="mb-2 px-1">
            <p className="text-[13px] font-medium text-gray-800">
              {siswa.nama_siswa}
            </p>
            <p className="text-[12px] text-gray-500">
              Semester {semesterLabel(rapor.semester)} · TP{" "}
              {rapor.tahun_ajaran || "-"}
            </p>
            <p className="mt-1 text-[11px] text-gray-400 sm:hidden">
              Cubit dengan dua jari untuk memperbesar.
            </p>
          </div>

          {/* Meja kerja: latar netral supaya lembar putih terlihat sebagai kertas */}
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
                <div className={`rapor-paper ${zoom != null ? "zoomed" : ""}`}>
                  <RaporPreview
                    siswa={siswa}
                    rapor={rapor}
                    innerRef={sheetRef}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bar aksi: fixed + portal ke <body> supaya tidak terpengaruh
                overflow/transform layout induk. Otomatis naik di atas bottom-nav. */}
          {createPortal(
            <div
              data-rapor-bar
              className="no-print fixed z-50 mx-auto flex max-w-3xl items-center gap-2 rounded-2xl bg-white/95 p-2 shadow-[0_8px_30px_rgba(15,23,42,0.18)] backdrop-blur"
              style={{
                left: 12,
                right: 12,
                bottom: bottomInset
                  ? bottomInset + 12
                  : "max(0.75rem, env(safe-area-inset-bottom))",
              }}
            >
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
                disabled={downloading}
                className="h-11 flex-1 rounded-xl bg-[#3b6ef5] px-4 text-[14px] font-medium text-white shadow-[0_8px_18px_rgba(59,110,245,0.30)] transition active:bg-[#2f5ee0] hover:bg-[#2f5ee0] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {downloading ? "Menyiapkan PDF…" : "Unduh PDF"}
              </button>
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

    /* Mobile: lebar kontainer & kertas = lebar layar dihitung di useFitScale */
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

    /* ── Kertas: tiap .page tampil langsung sebagai lembar F4 putih ── */
    .rapor-paper {
      width: 215mm;
      min-width: 215mm;
      padding: 0;                 /* tidak ada padding — kertas = .page */
      background: transparent;    /* hilangkan latar abu-biru */
      color: #000000;
      box-shadow: none;
      border-radius: 0;
    }
    /* Outline tegas saat user zoom manual */
    .rapor-paper.zoomed {
      outline: 2px solid rgba(59,110,245,.55);
      outline-offset: 6px;
      border-radius: 4px;
    }

    .rapor-sheet {
      display: flex;
      flex-direction: column;
      gap: 12mm;                  /* GAP antar halaman */
    }

    .rapor-sheet,
    .rapor-sheet * {
      box-sizing: border-box;
    }

    .rapor-sheet {
      font-family: "Times New Roman", Times, "Liberation Serif", serif;
      font-size: 12.5px;
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

    /* ── Tiap halaman = satu lembar kertas F4 ── */
    .page {
      display: block;
      width: 215mm;               /* full F4 width */
      height: 330mm;              /* full F4 height */
      padding: 8mm;               /* margin cetak di dalam kertas */
      overflow: hidden;
      background: #ffffff;
      position: relative;
      box-shadow:
        0 1px 2px rgba(0,0,0,.10),
        0 8px 24px rgba(15,23,42,.10);
      border-radius: 2px;
    }
    /* baris ke-2 dst tidak perlu margin lagi karena sudah pakai gap di .rapor-sheet */
    .page + .page { margin-top: 0; }

    .rapor-title {
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 12px;
      letter-spacing: .03em;
      color: #000000;
      -webkit-text-fill-color: #000000;
    }

    /* ── Identitas: kolom kanan (Kelas/Fase/Semester/TP) digeser ke kanan ──
       Cara kerja:
       • .val  = 52%  → kolom kiri "makan" ruang lebih banyak
       • .lbl2 = 120px → label kanan punya lebar tetap
       • Hasil: blok kanan (Kelas/Fase/Semester/TP) mulai di ±58% lebar tabel
    */
    .rapor-plain {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      color: #000000;
    }
    .rapor-plain td {
      padding: 2px 0;
      vertical-align: top;
      font-size: 12.5px;
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
      white-space: nowrap;      /* cegah "Tahun Pelajaran" pecah 2 baris */
    }
    .rapor-plain .lbl  { width: 80px; }
    .rapor-plain .sep  { width: 12px; }
    .rapor-plain .val  { width: 60%; }        /* kiri lebih lebar → kanan geser */
    .rapor-plain .lbl2 { width: 120px; }      /* label kanan lebar tetap */
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
      font-size: 12.5px;
      text-decoration: none;
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }
    .rapor-table th {
      font-weight: 700;
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
    .cap {
      padding: 2px 10px;
      border-bottom: 1px solid #000000;
      font-size: 12px;
      text-align: left;
      display: flex;
      align-items: center;
      min-height: calc(var(--row-h, 30mm) / 2 - 0.5px);
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }
    .cap-last { border-bottom: 0; }

    .rapor-table.catatan-table th {
      height: 14mm;
      color: #000000;
      -webkit-text-fill-color: #000000;
    }
    .rapor-table.catatan-table .catatan {
      padding: 12px 14px;
      height: 40mm;
      font-size: 12.5px;
      overflow: hidden;
      white-space: pre-line;
      text-align: left;
      vertical-align: top;
      color: #000000;
      -webkit-text-fill-color: #000000;
      background: transparent;
    }

    /* Ketidakhadiran: tabel kecil di kiri, garis antar baris, tanpa garis vertikal */
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
      /* line-height + padding-bottom: html2canvas menggeser teks ke bawah
        bila hanya mengandalkan vertical-align */
      line-height: 18px;
      padding: 0 8px 3px;
    }
    .rapor-table.absen tbody tr:last-child td { border-bottom: 0; }
    .rapor-table.absen td.absen-label { text-align: left; }
    .rapor-table.absen td.absen-angka { text-align: center; }
    .rapor-table.absen td.absen-satuan {
      text-align: left;
      padding-left: 20px;
    }

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
      font-size: 12.5px;
      color: #000000;
      -webkit-text-fill-color: #000000;
    }
    .ttd-col p,
    .ttd-kepsek p {
      margin: 0;
      color: #000000;
      -webkit-text-fill-color: #000000;
    }
    .ttd-space { height: 58px; }
    .ttd-kepsek {
      margin-top: 8px;
      font-size: 12.5px;
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
      size: 215mm 330mm; /* F4 / Folio */
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

      /* Di print: tiap .page auto-pecah ke halaman fisik */
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
    }
  `;
