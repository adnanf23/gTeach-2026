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

function PredikatTable({ info, komponen, predikat }) {
  const kolom = Number(info.kolom) === 2 ? 2 : 1;
  const itemLabel = info.item_label || info.item || "SURAT";

  // kolom=2 (asmaul husna): baris dibelah dua, tiap belahan punya NO/NAMA/PREDIKAT.
  if (kolom === 2) {
    const tengah = Math.ceil(komponen.length / 2);
    const kiri = komponen.slice(0, tengah);
    const kanan = komponen.slice(tengah);
    return (
      <table className="rt-table rt-table-2col">
        <colgroup>
          <col style={{ width: "6%" }} />
          <col />
          <col style={{ width: "12%" }} />
          <col style={{ width: "6%" }} />
          <col />
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead>
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
        </thead>
        <tbody>
          {komponen.length === 0 ? (
            <tr>
              <td colSpan={6} className="rt-center">
                -
              </td>
            </tr>
          ) : (
            kiri.map((k, i) => {
              const k2 = kanan[i];
              return (
                <tr key={k.id}>
                  <td className="rt-center rt-no">{i + 1}</td>
                  <td>{k.komponen}</td>
                  <td className="rt-center">{predikat?.[k.id] || "-"}</td>
                  <td className="rt-center rt-no">
                    {k2 ? tengah + i + 1 : ""}
                  </td>
                  <td>{k2?.komponen || ""}</td>
                  <td className="rt-center">
                    {k2 ? predikat?.[k2.id] || "-" : ""}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    );
  }

  return (
    <table className="rt-table">
      <colgroup>
        <col style={{ width: "6%" }} />
        <col />
        <col style={{ width: "36%" }} />
      </colgroup>
      <thead>
        <tr>
          <th colSpan={3} className="rt-cat">
            {info.label}
          </th>
        </tr>
        <tr>
          <th className="rt-green rt-no">NO</th>
          <th className="rt-green">{itemLabel}</th>
          <th className="rt-green">PREDIKAT</th>
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
              <td className="rt-center rt-no">{i + 1}</td>
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
  kategoriRapor,
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

  const kategoriList = normalisasiKategori(kategoriRapor, { cetak: true });

  const komponenByKategori = (kategori) =>
    (rapor?.komponen || []).filter((k) => (k.kategori || "") === kategori);

  // Kategori 2 kolom (asmaul husna, 99 baris) makan satu halaman penuh, jadi
  // tidak boleh ikut menumpuk dengan kategori lain di halaman yang sama.
  const halaman = [];
  let buffer = [];
  for (const info of kategoriList) {
    if (Number(info.kolom) === 2) {
      if (buffer.length) {
        halaman.push(buffer);
        buffer = [];
      }
      halaman.push([info]);
      continue;
    }
    buffer.push(info);
    if (buffer.length === 5) {
      halaman.push(buffer);
      buffer = [];
    }
  }
  if (buffer.length) halaman.push(buffer);

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

                  <table className="rt-info">
                    <tbody>
                      <tr>
                        <td style={{ width: "17%" }}>NAMA SISWA</td>
                        <td style={{ width: "36%" }}>
                          : {siswa?.nama_siswa || "-"}
                        </td>
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
                </>
              )}

              {isiHalaman.map((info) => (
                <PredikatTable
                  key={info.kategori}
                  info={info}
                  komponen={komponenByKategori(info.kategori)}
                  predikat={rapor?.predikat?.[info.kategori]}
                />
              ))}

              {terakhir && (
                <>
                  <div className="rt-catatan">
                    <b>CATATAN TAHFIZH :</b>
                    <p>{rapor?.catatanTahfizh || "-"}</p>
                  </div>

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
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
