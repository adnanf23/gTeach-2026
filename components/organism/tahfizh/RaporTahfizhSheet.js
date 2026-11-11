"use client";

import logo from "@/assets/logo.png";

const KATEGORI = [
  { key: "hafalan", label: "HAFALAN AL-QUR’AN", item: "SURAT" },
  { key: "jaritmatika", label: "JARIMATIKA AL-QUR’AN", item: "SURAT" },
  { key: "gesture", label: "GESTURE", item: "SURAT" },
  { key: "hadits", label: "HADITS", item: "HADITS" },
  { key: "doa", label: "DOA", item: "NIAT & DOA" },
  { key: "wudhu", label: "DOA BERWUDHU", item: "DOA" },
];

const SEKOLAH_JUDUL = "SD GLOBAL GARUDA NUSANTARA ISLAMIC CENTRE";
const YAYASAN = "YAYASAN BI ASHOKAL HAJAR";

function semesterLabel(semester) {
  return Number(semester) === 2 ? "GENAP" : "GANJIL";
}

function PredikatTable({ info, komponen, predikat }) {
  return (
    <table className="rt-table">
      <thead>
        <tr>
          <th colSpan={3} className="rt-cat">
            {info.label}
          </th>
        </tr>
        <tr>
          <th className="rt-green" style={{ width: "10%" }}>
            NO
          </th>
          <th className="rt-green">{info.item}</th>
          <th className="rt-green" style={{ width: "36%" }}>
            PREDIKAT
          </th>
        </tr>
      </thead>
      <tbody>
        {komponen.length === 0 ? (
          <tr>
            <td colSpan={3} className="rt-center">
              -
            </td>
          </tr>
        ) : (
          komponen.map((k, i) => (
            <tr key={k.id}>
              <td className="rt-center">{i + 1}</td>
              <td>{k.komponen}</td>
              <td className="rt-center">{predikat?.[k.id] || "-"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function Watermark() {
  return <img src={logo.src} alt="" className="rt-watermark" />;
}

export default function RaporTahfizhSheet({
  kelas,
  siswa,
  rapor,
  tahsinNama = "Tahsin",
  jenisSemester = "",
  tanggalRapor = "",
  kepalaSekolah = "Syafrina Ahda, S.Pd",
}) {
  const ta = kelas?.expand?.tahun_ajaran_id;
  const walikelas = kelas?.expand?.walikelas_id;
  const semesterText = jenisSemester
    ? jenisSemester.toUpperCase()
    : semesterLabel(ta?.semester);

  const komponenByKategori = (kategori) =>
    (rapor?.komponen || []).filter((k) => (k.kategori || "") === kategori);

  const page1 = KATEGORI.slice(0, 5);
  const page2 = KATEGORI.slice(5);

  return (
    <div className="rt-root">
      <style jsx global>{`
        .rt-root {
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }
        .rt-page {
          width: 215mm;
          min-height: 330mm;
          margin: 0 auto 12mm;
          background: #fff;
          padding: 14mm 14mm 12mm;
          box-shadow: 0 6px 24px rgba(15, 23, 42, 0.12);
          position: relative;
          box-sizing: border-box;
          overflow: hidden;
        }
        .rt-content {
          position: relative;
          z-index: 1;
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
          margin-bottom: 14px;
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
        .rt-info {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 22px;
        }
        .rt-info td {
          padding: 6px 2px;
        }
        .rt-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          table-layout: fixed;
          page-break-inside: auto;
        }
        .rt-table th,
        .rt-table td {
          border: 1px solid #555;
          padding: 0 12px;
          height: 17.5px;
          line-height: 1.1;
          background: transparent;
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
          .rt-page {
            box-shadow: none;
            margin: 0;
            width: auto;
            min-height: auto;
            padding: 0;
            overflow: visible;
          }
          .rt-page + .rt-page {
            break-before: page;
          }
          .rt-table tr {
            break-inside: avoid;
          }
          .rt-root * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: 215mm 330mm;
            margin: 10mm;
          }
        }
      `}</style>

      {/* ================= HALAMAN 1 ================= */}
      <div className="rt-page">
        <Watermark />
        <div className="rt-content">
          <div className="rt-header">
            <img src={logo.src} alt="Logo" />
            <div className="rt-title">
              <h1>RAPOR TAHFIZH</h1>
              <p>{SEKOLAH_JUDUL}</p>
              <p>{YAYASAN}</p>
            </div>
          </div>

          <table className="rt-info">
            <tbody>
              <tr>
                <td style={{ width: "17%" }}>NAMA SISWA</td>
                <td style={{ width: "36%" }}>: {siswa?.nama_siswa || "-"}</td>
                <td style={{ width: "25%" }}>SEMESTER</td>
                <td>: {semesterText}</td>
              </tr>
              <tr>
                <td>KELAS</td>
                <td>: {kelas?.nama_kelas || "-"}</td>
                <td>TAHUN PELAJARAN</td>
                <td>: {ta?.tahun || "-"}</td>
              </tr>
            </tbody>
          </table>

          {page1.map((info) => (
            <PredikatTable
              key={info.key}
              info={info}
              komponen={komponenByKategori(info.key)}
              predikat={rapor?.predikat?.[info.key]}
            />
          ))}
        </div>
      </div>

      {/* ================= HALAMAN 2 ================= */}
      <div className="rt-page">
        <Watermark />
        <div className="rt-content">
          {page2.map((info) => (
            <PredikatTable
              key={info.key}
              info={info}
              komponen={komponenByKategori(info.key)}
              predikat={rapor?.predikat?.[info.key]}
            />
          ))}

          <div className="rt-catatan">
            <b>CATATAN TAHFIZH :</b>
            <p>{rapor?.catatanTahfizh || "-"}</p>
          </div>

          <table className="rt-tahsin">
            <thead>
              <tr>
                <th style={{ width: "9%" }}>NO</th>
                <th style={{ width: "18%" }}>MATA PELAJARAN</th>
                <th style={{ width: "14%" }}>NILAI</th>
                <th>CATATAN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td style={{ textAlign: "left", paddingLeft: 14 }}>
                  {tahsinNama}
                </td>
                <td>{rapor?.tahsinNilai ?? "-"}</td>
                <td className="catatan">{rapor?.catatanTahsin || "-"}</td>
              </tr>
            </tbody>
          </table>

          <div className="rt-legend">
            <span className="full">Keterangan :</span>
            <span>A = Hafal</span>
            <span>B = Hafal dengan sedikit bantuan</span>
            <span>C = Hafal dengan banyak bantuan</span>
            <span>(-) = Belum Hafal</span>
            <span>(*) = Belum Diajarkan</span>
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
                  Bogor, {tanggalRapor || "........................"}
                </p>
                <p>Wali Kelas</p>
              </div>
              <div className="space" />
              <p className="name">
                {walikelas?.nama_lengkap || "............................"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
