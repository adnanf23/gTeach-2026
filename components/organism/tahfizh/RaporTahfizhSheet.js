"use client";

import logo from "@/assets/logo.png";
import { normalisasiKategori } from "@/lib/tahfizh-kategori";

const PREDIKAT_LEGEND = {
  A: "Hafal",
  B: "Hafal dengan sedikit bantuan",
  C: "Hafal dengan banyak bantuan",
  D: "Belum Hafal",
  "-": "Belum Hafal",
  "*": "Belum Diajarkan",
};

const SEKOLAH_JUDUL = "SD GLOBAL GARUDA NUSANTARA ISLAMIC CENTRE";
const YAYASAN = "YAYASAN BI ASHOKAL HAJAR";

function semesterLabel(semester) {
  return Number(semester) === 2 ? "GENAP" : "GANJIL";
}

// Satu <tbody> per kategori 1 kolom. Semua kategori dalam satu halaman
// ditumpuk di SATU <table> supaya border-collapse menyatukan garis antar
// kategori (kalau tabel terpisah, garis bawah + garis atas jadi double).
// Potongan lanjutan (halaman berikutnya) tidak mengulang judul + header.
function KategoriBody({ blok, predikat }) {
  const itemLabel = blok.info.item_label || blok.info.item || "SURAT";
  const items = blok.items.slice(blok.mulai, blok.mulai + blok.jumlah);
  return (
    <tbody>
      {!blok.lanjutan && (
        <>
          <tr>
            <th colSpan={3} className="rt-cat">
              {blok.info.label}
            </th>
          </tr>
          <tr>
            <th className="rt-green rt-no">NO</th>
            <th className="rt-green">{itemLabel}</th>
            <th className="rt-green">PREDIKAT</th>
          </tr>
        </>
      )}
      {items.length === 0 ? (
        <tr>
          <td colSpan={3} className="rt-center">
            -
          </td>
        </tr>
      ) : (
        items.map((k, i) => (
          <tr key={k.id}>
            <td className="rt-center rt-no">{blok.mulai + i + 1}</td>
            <td>{k.komponen}</td>
            <td className="rt-center">{predikat?.[k.id] || "-"}</td>
          </tr>
        ))
      )}
    </tbody>
  );
}

// Kategori 2 kolom (asmaul husna): daftar dibelah dua, tiap belahan punya
// NO/NAMA/PREDIKAT. `mulai`/`jumlah` menandai potongan halaman.
function DuaKolomTable({ blok, predikat }) {
  const info = blok.info;
  const itemLabel = info.item_label || info.item || "ASMAUL HUSNA";
  const tengah = blok.tengah;
  const kiri = blok.items.slice(0, tengah);
  const kanan = blok.items.slice(tengah);
  const baris = [];
  for (let i = blok.mulai; i < blok.mulai + blok.jumlah; i++) {
    baris.push({ no: i, a: kiri[i], b: kanan[i] });
  }
  return (
    <table className="rt-table rt-table-2col">
      <colgroup>
        <col style={{ width: "6%" }} />
        <col />
        <col style={{ width: "14%" }} />
        <col style={{ width: "6%" }} />
        <col />
        <col style={{ width: "14%" }} />
      </colgroup>
      <tbody>
        {!blok.lanjutan && (
          <>
            <tr>
              <th colSpan={6} className="rt-cat">
                {info.label}
              </th>
            </tr>
            <tr>
              <th className="rt-green rt-no">NO</th>
              <th className="rt-green">{itemLabel}</th>
              <th className="rt-green">PREDIKAT</th>
              <th className="rt-green rt-no">NO</th>
              <th className="rt-green">{itemLabel}</th>
              <th className="rt-green">PREDIKAT</th>
            </tr>
          </>
        )}
        {baris.length === 0 ? (
          <tr>
            <td colSpan={6} className="rt-center">
              -
            </td>
          </tr>
        ) : (
          baris.map(({ no, a, b }) => (
            <tr key={no}>
              <td className="rt-center rt-no">{no + 1}</td>
              <td>{a?.komponen || ""}</td>
              <td className="rt-center">{a ? predikat?.[a.id] || "-" : ""}</td>
              <td className="rt-center rt-no">{b ? tengah + no + 1 : ""}</td>
              <td>{b?.komponen || ""}</td>
              <td className="rt-center">{b ? predikat?.[b.id] || "-" : ""}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

/* ================================================================
   PEMBAGIAN HALAMAN (satuan px, hasil pengukuran render)
   Kertas 330mm = 1247px, padding 14/12mm -> konten 1149px.
   Kop + identitas = 169px (hanya halaman 1).
   Penutup boleh dipecah seperti rapor asli: catatan (154px) menyusul
   tabel di halaman yang sama bila masih ada ruang; tahsin + legenda +
   tanda tangan (278px) selalu di halaman terakhir.
   Baris tabel 18.5px, boleh ditinggikan sampai 27px supaya tabel
   mengisi halaman penuh sebelum isinya dilanjutkan ke halaman berikutnya.
   ================================================================ */
const TINGGI_KONTEN = 1149;
const TINGGI_KOP = 169;
const TINGGI_CATATAN = 154;
const TINGGI_TUTUP = 278;
// Tinggi baris terukur: 16.4px tanpa padding, bertambah 2px tiap 1px padding.
const BARIS_MIN = 16.4;
const BARIS_MAKS = 30;
const TINGGI_TEKS = 16.4;

const kapasitasHalaman = (idx) => TINGGI_KONTEN - (idx === 0 ? TINGGI_KOP : 0);
const barisMuat = (idx) => Math.floor(kapasitasHalaman(idx) / BARIS_MIN);
// Judul kategori + baris header (NO/ITEM/PREDIKAT) hanya digambar sekali, di
// potongan pertama; potongan lanjutan langsung meneruskan baris isi.
const tinggiBlok = (b) => b.jumlah + (b.lanjutan ? 0 : 2);

// Satu kategori = satu blok. `tengah` adalah jumlah baris yang dipakai
// (untuk kategori 2 kolom separuh item, karena tiap baris memuat 2 item),
// sedangkan `mulai`/`jumlah` menandai potongan saat blok dipecah ke halaman
// berikutnya.
function blokDariKategori(info, items) {
  const duaK = Number(info.kolom) === 2;
  return {
    info,
    items,
    duaK,
    tengah: duaK ? Math.ceil(Math.max(items.length, 1) / 2) : items.length,
  };
}

function susunHalaman(kategoriList, ambilKomponen) {
  const halaman = [];
  const halamanBaru = () => {
    const h = { blok: [], baris: 0 };
    halaman.push(h);
    return h;
  };
  let cur = halamanBaru();

  for (const info of kategoriList) {
    const semua = blokDariKategori(info, ambilKomponen(info.kategori));
    const total = Math.max(semua.tengah, 1);
    let mulai = 0;

    while (mulai < total) {
      const lanjutan = mulai > 0;
      const biayaHeader = lanjutan ? 0 : 2;
      const muat = barisMuat(halaman.length - 1) - cur.baris - biayaHeader;
      if (muat < 1) {
        cur = halamanBaru();
        continue;
      }
      const jumlah = Math.min(muat, total - mulai);
      cur.blok.push({ ...semua, mulai, jumlah, lanjutan });
      cur.baris += biayaHeader + jumlah;
      mulai += jumlah;
    }
  }

  // Halaman terakhir cukup menyisakan ruang untuk catatan. Kalau masih muat
  // untuk tahsin+legenda+TTD, semuanya di halaman yang sama. Kalau hanya muat
  // catatan, tabel + catatan tetap di halaman itu dan tutup pindah ke halaman
  // baru (persis rapor asli kelas 6: tabel + catatan di hal. 1). Tabel hanya
  // dipecah kalau sisa ruang bahkan tidak cukup untuk catatan.
  for (;;) {
    const idx = halaman.length - 1;
    const last = halaman[idx];
    const sisa = () => kapasitasHalaman(idx) - last.baris * BARIS_MIN;
    if (sisa() >= TINGGI_CATATAN || last.blok.length === 0) break;

    const pindah = [];
    while (last.blok.length > 1 && sisa() < TINGGI_CATATAN) {
      const b = last.blok.pop();
      last.baris -= tinggiBlok(b);
      pindah.unshift(b);
    }
    if (last.blok.length === 1 && sisa() < TINGGI_CATATAN) {
      const b = last.blok[0];
      const biayaHeader = b.lanjutan ? 0 : 2;
      const muatBaris =
        Math.floor((kapasitasHalaman(idx) - TINGGI_CATATAN) / BARIS_MIN) -
        biayaHeader;
      if (muatBaris >= 1 && b.jumlah > 1) {
        const potong = Math.min(muatBaris, b.jumlah - 1);
        last.blok[0] = { ...b, jumlah: potong };
        last.baris = biayaHeader + potong;
        pindah.unshift({
          ...b,
          mulai: b.mulai + potong,
          jumlah: b.jumlah - potong,
          lanjutan: true,
        });
      }
    }
    if (!pindah.length) break;
    const baru = halamanBaru();
    baru.blok = pindah;
    baru.baris = pindah.reduce((n, b) => n + tinggiBlok(b), 0);
  }

  // Tutup butuh halaman sendiri kalau catatan sudah menghabiskan sisa ruang.
  const akhir = halaman[halaman.length - 1];
  const sisaAkhir = kapasitasHalaman(halaman.length - 1) - akhir.baris * BARIS_MIN;
  // Catatan menempati sisa ruang (>= TINGGI_CATATAN), jadi tutup butuh
  // TINGGI_CATATAN + TINGGI_TUTUP agar bisa berbagi halaman.
  if (sisaAkhir < TINGGI_CATATAN + TINGGI_TUTUP) {
    halaman.push({ blok: [], baris: 0 });
  }

  return halaman;
}

// Gabungkan blok 1 kolom berurutan supaya dirender sebagai satu tabel:
// border-collapse lalu menyatukan garis antar kategori (tidak dobel).
function segmenDariBlok(blok) {
  const segmen = [];
  for (const b of blok) {
    const akhir = segmen[segmen.length - 1];
    if (b.duaK) segmen.push({ duaK: true, blok: [b] });
    else if (akhir && !akhir.duaK) akhir.blok.push(b);
    else segmen.push({ duaK: false, blok: [b] });
  }
  return segmen;
}

function Watermark() {
  return <img src={logo.src} alt="" className="rt-watermark" />;
}

export default function RaporTahfizhSheet({
  kelas,
  siswa,
  rapor,
  kategoriRapor,
  tahsinNama = "Tahsin",
  pengaturan,
  semester = "",
  tanggalRapor = "",
  kepalaSekolah = "Syafrina Ahda, S.Pd",
}) {
  const ta = kelas?.expand?.tahun_ajaran_id;
  const walikelas = kelas?.expand?.walikelas_id;
  // Semester tidak ada di koleksi pengaturan_rapor; sumbernya relasi
  // ujian -> tahun_ajaran (dikirim pemanggil sebagai prop `semester`).
  const semesterText = semester
    ? semesterLabel(semester)
    : semesterLabel(ta?.semester);
  const tahunPelajaran = ta?.tahun || "-";
  const tanggalTtd = pengaturan?.tanggal_rapor
    ? new Date(pengaturan.tanggal_rapor).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : tanggalRapor;

  const kategoriList = normalisasiKategori(kategoriRapor, { cetak: true });

  const komponenByKategori = (kategori) =>
    (rapor?.komponen || []).filter((k) => (k.kategori || "") === kategori);

  const halaman = susunHalaman(kategoriList, komponenByKategori);

  // Catatan hanya tampil SEKALI, di halaman pertama yang masih punya ruang
  // setelah tabel (mengikuti rapor asli: bisa halaman 1 atau 2).
  const sisaBaris = halaman.map(
    (h, idx) => kapasitasHalaman(idx) - h.baris * BARIS_MIN,
  );
  const catatanDiSini = halaman.map(() => false);
  const idxCatatan = halaman.findIndex((h, idx) => {
    if (idx === halaman.length - 1 && h.baris === 0) return true;
    return sisaBaris[idx] >= TINGGI_CATATAN;
  });
  const posCatatan = idxCatatan >= 0 ? idxCatatan : halaman.length - 1;
  catatanDiSini[posCatatan] = true;

  // Semua halaman memakai SATU tinggi baris yang sama: dihitung dari halaman
  // paling sempit (paling banyak isi), lalu dipakai seragam supaya halaman 1
  // dan halaman lanjutan tidak beda tinggi baris.
  const paddingBaris = (() => {
    let pad = Infinity;
    halaman.forEach((h, idx) => {
      if (!h.baris) return;
      let ruang = kapasitasHalaman(idx);
      if (idx === halaman.length - 1) ruang -= TINGGI_TUTUP;
      if (catatanDiSini[idx]) ruang -= TINGGI_CATATAN;
      const tinggi = Math.min(BARIS_MAKS, Math.max(BARIS_MIN, ruang / h.baris));
      pad = Math.min(pad, (tinggi - TINGGI_TEKS) / 2);
    });
    return Number.isFinite(pad) ? Math.max(0, pad) : 0;
  })();

  // Pakai D = Belum Hafal kalau tingkat ini memakainya.
  const pakaiPredikatD = kategoriList.some((k) => k.predikat_d);

  return (
    <div className="rt-root">
      <style jsx global>{`
        .rt-root {
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }
        .rt-page {
          width: 215mm;
          height: 330mm;
          margin: 0 auto 12mm;
          background: #fff;
          padding: 14mm 18mm 12mm;
          box-shadow: 0 6px 24px rgba(15, 23, 42, 0.12);
          position: relative;
          box-sizing: border-box;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .rt-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        /* Area tabel TIDAK melar: tinggi baris sudah disamakan lewat --rt-pad,
           jadi tabel + catatan + tutup mengalir dari atas halaman. */
        .rt-isi {
          flex: 0 0 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          margin-bottom: 8px;
        }
        .rt-isi > table + table {
          /* Tabel 2 kolom memakai <table> sendiri (jumlah kolom beda). Margin
             negatif 1px menumpuk border atas dengan border bawah tabel
             sebelumnya supaya tetap tampak satu garis, bukan dua. */
          margin-top: -1px;
        }
        .rt-isi > table {
          width: 100%;
        }
        /* Jangan biarkan tabel melar sendiri: tinggi baris diatur lewat
           --rt-pad supaya isi yang kepanjangan tidak terpotong overflow. */
        .rt-isi > table:last-child {
          flex: 0 0 auto;
          margin-bottom: 0;
        }
        .rt-watermark {
          position: absolute;
          left: 50%;
          top: 52%;
          width: 150mm;
          transform: translate(-50%, -50%);
          opacity: 0.2;
          z-index: 0;
          pointer-events: none;
        }
        .rt-header {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
          padding: 0 2px;
        }
        .rt-header img {
          width: 22mm;
          height: auto;
        }
        .rt-title {
          flex: 1;
          text-align: center;
          padding-right: 22mm;
        }
        .rt-title h1,
        .rt-title p {
          margin: 0;
          font-size: 17px;
          font-weight: 700;
          line-height: 1.3;
        }
        /* Identitas: dua blok, kiri menempel tepi kiri dan blok kanan menempel
           tepi kanan garis tabel. Teks di dalamnya tetap rata kiri. */
        .rt-info {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 18px;
        }
        .rt-info table {
          border-collapse: collapse;
          table-layout: fixed;
        }
        .rt-info td {
          padding: 5px 0;
          vertical-align: top;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .rt-info td.k {
          padding-right: 6px;
        }
        .rt-info-kiri td.k {
          width: 96px;
        }
        .rt-info-kanan td.k {
          width: 132px;
        }
        .rt-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          table-layout: fixed;
        }
        .rt-table th,
        .rt-table td {
          border: 1px solid #555;
          padding: var(--rt-pad, 0px) 12px;
          line-height: 1.1;
          background: transparent;
        }
        /* Tinggi baris diatur lewat padding vertikal cell (--rt-pad). */
        .rt-table th,
        .rt-table td {
          vertical-align: middle;
        }
        /* Kolom NO diperkecil */
        .rt-table th.rt-no,
        .rt-table td.rt-no {
          padding: 0 2px;
        }
        .rt-table .rt-cat {
          text-align: left;
          font-weight: 700;
          background: transparent;
          padding-left: 12px;
        }
        .rt-table .rt-green {
          background: #70ad47;
          color: #000;
          font-weight: 700;
          text-align: center;
        }
        .rt-center {
          text-align: center;
        }
        /* Tabel 2 kolom (asmaul husna): garis pemisah antar belahan lebih tebal. */
        .rt-table-2col td:nth-child(3),
        .rt-table-2col th:nth-child(3) {
          border-right-width: 2px;
          border-right-color: #333;
        }
        .rt-catatan {
          border: 1px solid #555;
          padding: 8px 12px 18px;
          font-size: 14px;
          margin: 26px 0 28px;
          background: rgba(255, 255, 255, 0.4);
        }
        .rt-catatan b {
          display: block;
          text-align: center;
          text-decoration: underline;
          margin-bottom: 18px;
        }
        .rt-catatan p {
          margin: 0;
          text-align: justify;
          line-height: 1.35;
        }
        .rt-tahsin {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .rt-tahsin th {
          background: #70ad47;
          border: 1px solid #555;
          font-weight: 700;
          padding: 1px 6px;
        }
        .rt-tahsin td {
          border: 1px solid #555;
          padding: 2px 8px;
          text-align: center;
          vertical-align: middle;
        }
        .rt-tahsin th.rt-no,
        .rt-tahsin td.rt-no {
          padding-left: 2px;
          padding-right: 2px;
        }
        .rt-tahsin td.catatan {
          text-align: justify;
          vertical-align: top;
          line-height: 1.2;
        }
        .rt-legend {
          font-size: 11.5px;
          font-weight: 700;
          margin: 6px 0 0 20px;
          display: grid;
          grid-template-columns: 1.1fr 1.3fr 1fr;
          row-gap: 2px;
        }
        .rt-legend .full {
          grid-column: 1 / -1;
        }

        /* ===== Tanda tangan: semua kolom punya struktur tinggi yang sama ===== */
        .rt-sign {
          display: grid;
          grid-template-columns: 1fr 1.3fr 1fr;
          align-items: start;
          margin-top: 36px;
          font-size: 15px;
          text-align: center;
        }
        .rt-sign p {
          margin: 0;
        }
        .rt-sign .head {
          height: 3em; /* tepat 2 baris */
          line-height: 1.5;
        }
        .rt-sign .head p {
          height: 1.5em;
          white-space: nowrap;
        }
        .rt-sign .space {
          height: 70px;
        }
        .rt-sign .name {
          height: 1.5em;
          line-height: 1.5;
          white-space: nowrap;
          text-decoration: underline;
        }
        .rt-sign .line {
          height: 1.5em;
          width: 60%;
          margin: 0 auto;
          border-bottom: 1px solid #000;
          box-sizing: border-box;
        }
        @media print {
          .rt-no-print {
            display: none !important;
          }
          /* Geometri halaman dijaga sama dengan preview supaya tabel yang
             sudah mengisi penuh tidak meluber ke halaman berikutnya. */
          .rt-page {
            box-shadow: none;
            margin: 0;
            padding: 14mm 18mm 12mm;
            overflow: hidden;
            break-after: page;
          }
          .rt-page:last-child {
            break-after: auto;
          }
          .rt-root * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: 215mm 330mm;
            margin: 0;
          }
        }
      `}</style>

      {halaman.map((isiHalaman, idx) => {
        const terakhir = idx === halaman.length - 1;
        return (
          <div className="rt-page" key={idx}>
            <Watermark />
            <div className="rt-content">
              {idx === 0 && (
                <>
                  <div className="rt-header">
                    <img src={logo.src} alt="Logo" />
                    <div className="rt-title">
                      <h1>RAPOR TAHFIZH</h1>
                      <p>{SEKOLAH_JUDUL}</p>
                      <p>{YAYASAN}</p>
                    </div>
                  </div>

                  <div className="rt-info">
                    <table className="rt-info-kiri">
                      <tbody>
                        <tr>
                          <td className="k">NAMA SISWA</td>
                          <td>: {siswa?.nama_siswa || "-"}</td>
                        </tr>
                        <tr>
                          <td className="k">KELAS</td>
                          <td>: {kelas?.nama_kelas || "-"}</td>
                        </tr>
                      </tbody>
                    </table>
                    <table className="rt-info-kanan">
                      <tbody>
                        <tr>
                          <td className="k">SEMESTER</td>
                          <td>: {semesterText}</td>
                        </tr>
                        <tr>
                          <td className="k">TAHUN PELAJARAN</td>
                          <td>: {tahunPelajaran}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {isiHalaman.blok.length > 0 && (
                <div
                  className="rt-isi"
                  style={{ "--rt-pad": `${paddingBaris.toFixed(2)}px` }}
                >
                {segmenDariBlok(isiHalaman.blok).map((seg, i) =>
                  seg.duaK ? (
                    <DuaKolomTable
                      key={`d${i}`}
                      blok={seg.blok[0]}
                      predikat={rapor?.predikat?.[seg.blok[0].info.kategori]}
                    />
                  ) : (
                    <table className="rt-table" key={`s${i}`}>
                      <colgroup>
                        <col style={{ width: "6%" }} />
                        <col />
                        <col style={{ width: "36%" }} />
                      </colgroup>
                      {seg.blok.map((b) => (
                        <KategoriBody
                          key={`${b.info.kategori}-${b.mulai}`}
                          blok={b}
                          predikat={rapor?.predikat?.[b.info.kategori]}
                        />
                      ))}
                    </table>
                  ),
                )}
                </div>
              )}

              {catatanDiSini[idx] && (
                <div className="rt-catatan">
                  <b>CATATAN TAHFIZH :</b>
                  <p>{rapor?.catatanTahfizh || "-"}</p>
                </div>
              )}

              {terakhir && (
                <>
                  <table className="rt-tahsin">
                    <thead>
                      <tr>
                        <th className="rt-no" style={{ width: "5%" }}>
                          NO
                        </th>
                        <th style={{ width: "18%" }}>MATA PELAJARAN</th>
                        <th style={{ width: "14%" }}>NILAI</th>
                        <th>CATATAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="rt-no">1</td>
                        <td style={{ textAlign: "left", paddingLeft: 14 }}>
                          {tahsinNama}
                        </td>
                        <td>{rapor?.tahsinNilai ?? "-"}</td>
                        <td className="catatan">
                          {rapor?.catatanTahsin || "-"}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="rt-legend">
                    <span className="full">Keterangan :</span>
                    <span>A = {PREDIKAT_LEGEND.A}</span>
                    <span>B = {PREDIKAT_LEGEND.B}</span>
                    <span>C = {PREDIKAT_LEGEND.C}</span>
                    <span>
                      {pakaiPredikatD ? "D" : "(-)"} ={" "}
                      {PREDIKAT_LEGEND.D}
                    </span>
                    <span>(*) = {PREDIKAT_LEGEND["*"]}</span>
                  </div>

                  <div className="rt-sign">
                    <div>
                      <div className="head">
                        <p>Mengetahui,</p>
                        <p>Orang Tua/Wali</p>
                      </div>
                      <div className="space" />
                      <div className="line" />
                    </div>
                    <div>
                      <div className="head">
                        <p>Kepala SD Global Garuda Nusantara</p>
                        <p>Islamic Centre</p>
                      </div>
                      <div className="space" />
                      <p className="name">{kepalaSekolah}</p>
                    </div>
                    <div>
                      <div className="head">
                        <p style={{ textAlign: "right" }}>
                          Bogor, {tanggalTtd || "........................"}
                        </p>
                        <p>Wali Kelas</p>
                      </div>
                      <div className="space" />
                      <p className="name">
                        {walikelas?.nama_lengkap || "............................"}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
