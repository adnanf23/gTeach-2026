"use client";

// app/wali-murid/rapor/page.js
// Preview rapor (tabel) + download PDF.
// Data dibangun langsung dari: siswa, nilai_ujian, nilai_harian,
// absensi, nilai_ekskul. Sumber "periode" adalah pengaturan_ujian
// yang akses_rapor = true.

import { useEffect, useMemo, useRef, useState } from "react";
import { pb } from "@/lib/pocketbase";
import html2pdf from "html2pdf.js";

/* ───────────── konfigurasi ───────────── */
const SEKOLAH_DEFAULT = {
  nama: "SD Global Garuda Nusantara Islamic Centre",
  alamat: "Jl. Raya Semplak Salabenda",
  kota: "Bogor",
  kepala_sekolah: "Syafrina Ahda, S.Pd",
};

const TEXT_TINGGI = "Ananda menunjukkan pemahaman dalam";
const TEXT_RENDAH = "Ananda membutuhkan bimbingan dalam";

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

const ujianLabel = (u) => {
  const ta = u.expand?.tahun_ajaran_id;
  return `${u.nama_ujian || "Rapor"} — Semester ${ta?.semester ?? "-"} ${ta?.tahun ?? ""}`.trim();
};

/* ───────────── susun data rapor ───────────── */
async function buildRapor(siswa, ujian) {
  const ta = ujian.expand?.tahun_ajaran_id;
  const kelas = siswa.expand?.kelas_id;
  const sid = siswa.id;
  const kelasId = toArray(siswa.kelas_id)[0] || null;

  const [nilaiRes, harianRes, absenRes, ekskulRes] = await Promise.all([
    pb.collection("nilai_ujian").getFullList({
      filter: `siswa_id = "${sid}" && pengaturan_ujian_id = "${ujian.id}"`,
      expand: "mapel_id",
      requestKey: null,
    }),
    pb.collection("nilai_harian").getFullList({
      filter: `siswa_id = "${sid}"`,
      expand: "lingkup_materi_id",
      requestKey: null,
    }),
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
  ]);

  // nilai akhir per mapel (rata-rata bila ada lebih dari satu record)
  const perMapel = new Map();
  nilaiRes.forEach((r) => {
    const m = r.expand?.mapel_id;
    if (!m) return;
    const e = perMapel.get(m.id) || { mapel: m, total: 0, n: 0 };
    e.total += Number(r.nilai) || 0;
    e.n += 1;
    perMapel.set(m.id, e);
  });

  // capaian: rata-rata nilai harian per lingkup materi, dikelompokkan per mapel
  const lingkupPerMapel = new Map();
  harianRes.forEach((h) => {
    const l = h.expand?.lingkup_materi_id;
    if (!l) return;
    const kelasH = toArray(h.kelas_id)[0];
    if (kelasH && kelasId && kelasH !== kelasId) return;
    const mid = toArray(h.mapel_id)[0] || toArray(l.mapel_id)[0];
    if (!mid) return;
    const group = lingkupPerMapel.get(mid) || new Map();
    const e = group.get(l.id) || {
      cap: l.capaian_kompetensi || "",
      total: 0,
      n: 0,
    };
    e.total += Number(h.nilai) || 0;
    e.n += 1;
    group.set(l.id, e);
    lingkupPerMapel.set(mid, group);
  });

  const akademikSaja = ujian?.template_rapor === "akademik";

  const nilai = [...perMapel.values()]
    .filter(
      (e) => !akademikSaja || !e.mapel.kategori || e.mapel.kategori === "umum",
    )
    .map(({ mapel, total, n }) => {
      const entries = [...(lingkupPerMapel.get(mapel.id)?.values() || [])]
        .filter((e) => e.cap)
        .map((e) => ({ cap: e.cap.trim(), avg: e.total / e.n }))
        .sort((a, b) => a.avg - b.avg);
      const rendah = entries.length > 1 ? entries[0] : null;
      const tinggi = entries.length ? entries[entries.length - 1] : null;
      return {
        mapel: mapel.nama_mapel,
        nilai: n ? Math.round(total / n) : "-",
        capaian_tinggi: tinggi ? `${TEXT_TINGGI} ${tinggi.cap}` : TEXT_TINGGI,
        capaian_rendah: rendah ? `${TEXT_RENDAH} ${rendah.cap}` : TEXT_RENDAH,
      };
    });

  const hitung = (s) => absenRes.filter((a) => a.status === s).length;

  return {
    semester: ta?.semester,
    tahun_ajaran: ta?.tahun,
    kelas: kelas?.tingkat,
    fase: faseDari(kelas?.tingkat),
    wali_kelas: kelas?.expand?.walikelas_id?.nama_lengkap || "-",
    kepala_sekolah: SEKOLAH_DEFAULT.kepala_sekolah,
    catatan: "-",
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

  return (
    <div className="rapor-sheet" ref={innerRef}>
      <h1 className="rapor-title">
        LAPORAN HASIL BELAJAR
        <br />
        (RAPOR)
      </h1>

      {/* Identitas */}
      <table className="rapor-plain">
        <tbody>
          <tr>
            <td className="lbl">Nama</td>
            <td className="sep">:</td>
            <td className="val">{(siswa.nama_siswa || "-").toUpperCase()}</td>
            <td className="lbl2">Kelas</td>
            <td className="sep">:</td>
            <td>{kelasLabel(rapor.kelas)}</td>
          </tr>
          <tr>
            <td className="lbl">NIS / NISN</td>
            <td className="sep">:</td>
            <td className="val">
              {siswa.nis || "-"} / {siswa.nisn || "-"}
            </td>
            <td className="lbl2">Fase</td>
            <td className="sep">:</td>
            <td>{rapor.fase || "-"}</td>
          </tr>
          <tr>
            <td className="lbl">Sekolah</td>
            <td className="sep">:</td>
            <td className="val">{SEKOLAH_DEFAULT.nama}</td>
            <td className="lbl2">Semester</td>
            <td className="sep">:</td>
            <td>{semesterLabel(rapor.semester)}</td>
          </tr>
          <tr>
            <td className="lbl">Alamat</td>
            <td className="sep">:</td>
            <td className="val" colSpan={4}>
              {SEKOLAH_DEFAULT.alamat}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Nilai */}
      <table className="rapor-table">
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
          {nilai.length === 0 && (
            <tr>
              <td colSpan={4} className="center" style={{ padding: 12 }}>
                Belum ada data nilai.
              </td>
            </tr>
          )}
          {nilai.map((m, i) => (
            <tr key={i} className="no-break">
              <td className="center">{i + 1}</td>
              <td>{m.mapel}</td>
              <td className="center">{m.nilai ?? "-"}</td>
              <td className="cap-cell">
                <div className="cap">{m.capaian_tinggi || "-"}</div>
                <div className="cap cap-last">{m.capaian_rendah || "-"}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Ekstrakurikuler */}
      <table className="rapor-table gap-top no-break">
        <thead>
          <tr>
            <th style={{ width: "6%" }}>No</th>
            <th style={{ width: "40%" }}>Ekstrakurikuler</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {ekskulRows.map((e, i) => (
            <tr key={i}>
              <td className="center">{i + 1}</td>
              <td>{e.nama || "-"}</td>
              <td className="center">{e.keterangan || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Catatan */}
      <table className="rapor-table gap-top no-break">
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

      {/* Ketidakhadiran + tanda tangan */}
      <div className="rapor-bottom no-break">
        <table className="rapor-table absen">
          <thead>
            <tr>
              <th colSpan={3}>Ketidakhadiran</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Sakit", rapor.sakit],
              ["Izin", rapor.izin],
              ["Tanpa Keterangan", rapor.alpa],
            ].map(([l, v]) => (
              <tr key={l}>
                <td>{l}</td>
                <td className="center" style={{ width: 40 }}>
                  {v ?? 0}
                </td>
                <td style={{ width: 50 }}>hari</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ttd">
          <p className="ttd-tanggal">
            {SEKOLAH_DEFAULT.kota}, {formatTanggal()}
          </p>
          <div className="ttd-row">
            <div className="ttd-col">
              <p>Orang Tua,</p>
              <div className="ttd-space" />
              <p>……………………….</p>
            </div>
            <div className="ttd-col">
              <p>&nbsp;</p>
              <div className="ttd-space" />
              <p>{rapor.wali_kelas || "-"}</p>
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

/* ───────────── halaman ───────────── */
export default function RaporPage() {
  const [siswaList, setSiswaList] = useState([]);
  const [siswaId, setSiswaId] = useState("");
  const [ujianList, setUjianList] = useState([]);
  const [ujianId, setUjianId] = useState("");
  const [rapor, setRapor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingRapor, setLoadingRapor] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const sheetRef = useRef(null);

  // 1. anak milik wali murid
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

  // 2. daftar periode rapor: pengaturan_ujian yang akses_rapor = true
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

  // 3. bangun isi rapor
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
        const data = await buildRapor(siswa, ujian);
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
  }, [siswa, ujian]);

  const handleDownloadPdf = async () => {
    if (!rapor || !siswa || !sheetRef.current) return;
    setDownloading(true);
    try {
      const filename = `Rapor_${slug(siswa.nama_siswa)}_Semester_${rapor.semester}_${slug(
        rapor.tahun_ajaran,
      )}.pdf`;

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(sheetRef.current)
        .save();
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

      {/* Toolbar */}
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {siswaList.length > 1 && (
            <label className="flex flex-col gap-1 text-[11px] text-gray-500">
              Anak
              <select
                value={siswaId}
                onChange={(e) => setSiswaId(e.target.value)}
                className="h-10 rounded-xl bg-white px-3 text-[13px] text-gray-800 shadow-[0_4px_14px_rgba(99,120,200,0.12)] outline-none focus:ring-2 focus:ring-[#3b6ef5]/40"
              >
                {siswaList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama_siswa}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-[11px] text-gray-500">
            Periode rapor
            <select
              value={ujianId}
              onChange={(e) => setUjianId(e.target.value)}
              disabled={!adaPeriode}
              className="h-10 rounded-xl bg-white px-3 text-[13px] text-gray-800 shadow-[0_4px_14px_rgba(99,120,200,0.12)] outline-none focus:ring-2 focus:ring-[#3b6ef5]/40 disabled:opacity-50"
            >
              {!adaPeriode && <option value="">Belum ada rapor</option>}
              {ujianList.map((u) => (
                <option key={u.id} value={u.id}>
                  {ujianLabel(u)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          onClick={handleDownloadPdf}
          disabled={!rapor || downloading}
          className="h-10 rounded-xl bg-[#3b6ef5] px-5 text-[13px] font-medium text-white shadow-[0_8px_18px_rgba(59,110,245,0.35)] transition hover:bg-[#2f5ee0] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {downloading ? "Menyiapkan PDF…" : "Download PDF"}
        </button>
      </div>

      {(loading || loadingRapor) && (
        <div className="no-print flex items-center gap-2 py-10 text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
          Memuat rapor…
        </div>
      )}
      {error && (
        <p className="no-print rounded-xl bg-red-50 px-4 py-3 text-red-600">
          {error}
        </p>
      )}
      {!loading && !error && !siswa && (
        <p className="no-print py-10 text-center text-gray-400">
          Akun Anda belum terhubung dengan data anak. Hubungi wali kelas atau
          admin.
        </p>
      )}
      {!loading && !loadingRapor && !error && siswa && !adaPeriode && (
        <p className="no-print py-10 text-center text-gray-400">
          Rapor {siswa.nama_siswa} belum dibuka oleh admin.
        </p>
      )}

      {/* Preview di layar */}
      {siswa && rapor && !loadingRapor && (
        <div className="no-print overflow-x-auto pb-6">
          <div className="rapor-paper">
            <RaporPreview siswa={siswa} rapor={rapor} innerRef={sheetRef} />
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────── CSS ───────────── */
const CSS = `
  .rapor-paper {
    width: 210mm;
    min-width: 210mm;
    margin: 0 auto;
    padding: 12mm;
    background: #fff;
    color: #000;
    box-shadow: 0 8px 30px rgba(99,120,200,.15);
    border-radius: 6px;
  }

  .rapor-sheet {
    font-family: Cambria, "Times New Roman", Georgia, serif;
    font-size: 11px;
    line-height: 1.35;
    color: #000;
    background: #fff;
  }
  .rapor-title {
    text-align: center;
    font-size: 12px;
    font-weight: 400;
    margin: 0 0 14px;
    letter-spacing: .02em;
  }

  .rapor-plain { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .rapor-plain td { padding: 1px 0; vertical-align: top; }
  .rapor-plain .lbl { width: 70px; }
  .rapor-plain .sep { width: 12px; }
  .rapor-plain .val { width: 46%; }
  .rapor-plain .lbl2 { width: 60px; padding-left: 18px; }

  .rapor-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .rapor-table th, .rapor-table td { border: 1px solid #000; padding: 3px 6px; vertical-align: middle; }
  .rapor-table th { font-weight: 700; text-align: center; text-decoration: underline; }
  .rapor-table td.center { text-align: center; }
  .rapor-table.gap-top { margin-top: 14px; }
  .rapor-table td.cap-cell { padding: 0; }
  .cap { padding: 3px 6px; border-bottom: 1px solid #000; font-size: 10px; }
  .cap-last { border-bottom: 0; }
  .catatan { padding: 6px 8px !important; min-height: 40px; }

  .rapor-bottom { margin-top: 14px; }
  .rapor-table.absen { width: 180px; }
  .rapor-table.absen th, .rapor-table.absen td { border: 0; padding: 1px 4px; }
  .rapor-table.absen th { border-bottom: 1px solid #000; }
  .rapor-table.absen tr td:first-child { text-decoration: underline; }

  .ttd { margin-top: -50px; text-align: center; }
  .ttd-tanggal { text-align: right; margin: 0 0 6px; }
  .ttd-row { display: flex; justify-content: space-between; padding: 0 20px 0 10px; }
  .ttd-col { text-align: center; min-width: 150px; }
  .ttd-col p, .ttd-kepsek p { margin: 0; }
  .ttd-space { height: 44px; }
  .ttd-kepsek { margin-top: 6px; }

  .no-break, .rapor-table tr { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
`;
