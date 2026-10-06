"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// ================================================================
// UTIL
// ================================================================
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function numOrNull(v) {
  return typeof v === "number" && !isNaN(v) && v !== -1 ? v : null;
}

function safeSheetName(name, used) {
  const base =
    String(name || "Mapel")
      .replace(/[\\/*?:\[\]]/g, "-")
      .trim()
      .slice(0, 31) || "Mapel";
  let final = base;
  let i = 2;
  while (used.has(final.toLowerCase())) {
    const suffix = ` (${i++})`;
    final = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(final.toLowerCase());
  return final;
}

export default function PilihMapelPenilaian() {
  const [currentKelas, setCurrentKelas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapel, setMapel] = useState([]);

  // state export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  const user = getCurrentUser();
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. Ambil data kelas
        const kelas = await pb
          .collection("kelas")
          .getFirstListItem(
            `walikelas_id = "${user.id}" || pendamping_id = "${user.id}"`,
            { requestKey: null },
          );

        setCurrentKelas(kelas);

        if (kelas) {
          // 2. Fetch Mapel Khusus & Tingkat
          const fetchKhusus = pb.collection("mata_pelajaran").getFullList({
            filter: `spesifik_kelas_id ~ "${kelas.id}"`,
            requestKey: null,
          });

          const fetchTingkat = pb.collection("mata_pelajaran").getFullList({
            filter: `target_tingkat ~ "${String(kelas.tingkat)}"`,
            requestKey: null,
          });

          // 3. Fetch Ploting Guru dengan expand guru_id
          const fetchPloting = pb.collection("ploting_guru").getFullList({
            filter: `kelas_id ~ "${kelas.id}"`,
            expand: "guru_id",
            requestKey: null,
          });

          const [mapelKhusus, mapelTingkat, plotingData] = await Promise.all([
            fetchKhusus,
            fetchTingkat,
            fetchPloting,
          ]);

          // 4. Gabungkan & filter mapel
          const combinedMapel = [...mapelKhusus, ...mapelTingkat];
          const uniqueMapelRaw = Array.from(
            new Map(combinedMapel.map((item) => [item.id, item])).values(),
          );

          const uniqueMapel = uniqueMapelRaw.filter((m) => {
            const spesifik = m.spesifik_kelas_id;
            const punyaRestriksi =
              Array.isArray(spesifik) && spesifik.length > 0;
            if (!punyaRestriksi) return true;
            return spesifik.includes(kelas.id);
          });

          // 5. Buat Mapping Guru
          const guruMap = new Map();
          plotingData.forEach((plot) => {
            if (plot.mapel_id && plot.expand?.guru_id) {
              const guruObj = Array.isArray(plot.expand.guru_id)
                ? plot.expand.guru_id[0]
                : plot.expand.guru_id;
              const namaGuru =
                guruObj?.nama_lengkap || guruObj?.name || guruObj?.username;
              if (namaGuru) {
                if (Array.isArray(plot.mapel_id)) {
                  plot.mapel_id.forEach((mId) => guruMap.set(mId, namaGuru));
                } else {
                  guruMap.set(plot.mapel_id, namaGuru);
                }
              }
            }
          });

          // 6. Set ke state
          const mapelWithGuru = uniqueMapel.map((m) => ({
            ...m,
            guru_pengampu: guruMap.get(m.id) || "Walikelas",
          }));

          setMapel(mapelWithGuru);
        }
      } catch (error) {
        if (!error?.isAbort) {
          console.error("Error fetching data:", error);
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // ================================================================
  // EXPORT EXCEL PER MAPEL (1 sheet = 1 mapel)
  // ================================================================
  // ================================================================
  // EXPORT EXCEL PER MAPEL (1 sheet = 1 mapel)
  // ================================================================
  async function handleExportPerMapel() {
    if (!currentKelas || mapel.length === 0) return;
    try {
      setExporting(true);
      setExportProgress("Mengambil data...");

      const mapelIds = mapel.map((m) => m.id);
      const mapelFilter = mapelIds
        .map((id) => `mapel_id ~ "${id}"`)
        .join(" || ");

      const [tpAll, lmAll, nfAll, nsAll, siswaAll] = await Promise.all([
        pb.collection("tujuan_pembelajaran").getFullList({
          filter: `(${mapelFilter}) && kelas_id ~ "${currentKelas.id}"`,
          requestKey: null,
        }),
        pb.collection("lingkup_materi").getFullList({
          filter: `(${mapelFilter}) && kelas_id ~ "${currentKelas.id}"`,
          sort: "created",
          requestKey: null,
        }),
        pb.collection("nilai_formatif").getFullList({
          filter: `kelas_id = "${currentKelas.id}"`,
          requestKey: null,
        }),
        pb.collection("nilai_sumatif").getFullList({
          filter: `kelas_id = "${currentKelas.id}"`,
          requestKey: null,
        }),
        pb.collection("siswa").getFullList({
          filter: `kelas_id = "${currentKelas.id}"`,
          sort: "nama_siswa",
          requestKey: null,
        }),
      ]);

      const tpById = new Map(tpAll.map((t) => [t.id, t]));
      const lmById = new Map(lmAll.map((l) => [l.id, l]));
      const lmOrder = new Map(lmAll.map((l, i) => [l.id, i]));

      setExportProgress("Menyusun file Excel...");

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sistem Penilaian";
      workbook.created = new Date();

      const usedNames = new Set();
      const border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      const GREEN = "FFD9EAD3";
      const GREEN_ALT = "FFEAF4E4";
      const ORANGE = "FFFCE5CD";
      const YELLOW_LIGHT = "FFFFF2CC";

      function styleHead(cell, argb) {
        cell.font = { bold: true, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = border;
      }

      const collator = new Intl.Collator("id", { numeric: true });
      const siswaSorted = [...siswaAll].sort((a, b) =>
        collator.compare(a.nama_siswa || "", b.nama_siswa || ""),
      );

      for (let mi = 0; mi < mapel.length; mi++) {
        const m = mapel[mi];
        const mapelName = (m.nama_mapel || m.nama || "-").trim();
        setExportProgress(
          `Menyusun sheet ${mi + 1}/${mapel.length}: ${mapelName}`,
        );
        await new Promise((r) => setTimeout(r, 0));

        // Filter TP/LM/nilai khusus mapel ini
        const tps = tpAll.filter((t) => firstOf(t.mapel_id) === m.id);
        const lms = lmAll.filter((l) => firstOf(l.mapel_id) === m.id);
        const nf = nfAll.filter((n) => {
          const tp = tpById.get(firstOf(n.tp_id));
          return tp && firstOf(tp.mapel_id) === m.id;
        });
        const ns = nsAll.filter((n) => {
          const lm = lmById.get(firstOf(n.lm_id));
          return lm && firstOf(lm.mapel_id) === m.id;
        });

        // ---- maxTp dihitung dari MASTER TP (bukan dari nilai)
        let maxTp = 0;
        tps.forEach((tp) => {
          const noTp = parseInt(String(tp.no_tp || "").replace(/\D/g, ""), 10);
          if (noTp && noTp > maxTp) maxTp = noTp;
        });

        // ---- Formatif: data[sid][noTp] = [k1..k4]
        const data = new Map();
        nf.forEach((n) => {
          const tp = tpById.get(firstOf(n.tp_id));
          if (!tp) return;
          const noTp = parseInt(String(tp.no_tp || "").replace(/\D/g, ""), 10);
          if (!noTp) return;
          const ks = [n.k1, n.k2, n.k3, n.k4].map(numOrNull);
          if (ks.every((v) => v === null)) return;
          const sid = firstOf(n.siswa_id);
          if (!data.has(sid)) data.set(sid, {});
          data.get(sid)[noTp] = ks;
        });

        // ---- Sumatif: nama LM terurut dari MASTER LM (bukan dari nilai)
        const lmNameToOrder = new Map();
        lms.forEach((l) => {
          const nm = (l.nama || "-").trim();
          const ord = lmOrder.get(l.id) ?? 0;
          if (!lmNameToOrder.has(nm) || ord < lmNameToOrder.get(nm)) {
            lmNameToOrder.set(nm, ord);
          }
        });
        const lmNames = Array.from(lmNameToOrder.entries())
          .sort((a, b) => a[1] - b[1])
          .map((e) => e[0]);
        const maxLm = lmNames.length;

        const sData = new Map();
        ns.forEach((n) => {
          const lm = lmById.get(firstOf(n.lm_id));
          if (!lm) return;
          const nilai = numOrNull(n.nilai);
          if (nilai === null) return;
          const namaLm = (lm.nama || "-").trim();
          const sid = firstOf(n.siswa_id);
          if (!sData.has(sid)) sData.set(sid, {});
          sData.get(sid)[namaLm] = nilai;
        });

        const sheet = workbook.addWorksheet(
          safeSheetName(mapelName, usedNames),
        );

        // Kalau tidak ada TP maupun LM sama sekali, buat sheet minimal
        // Tapi tetap tampilkan tabel (No, NIS, Nama, Mapel) + daftar siswa
        const FIXED = 4;
        const tpEnd = FIXED + maxTp * 4;
        const lastCol = tpEnd + maxLm;

        const h1 = sheet.getRow(1);
        const h2 = sheet.getRow(2);

        ["No", "NIS", "Nama Siswa", "Mapel"].forEach((label, c) => {
          sheet.mergeCells(1, c + 1, 2, c + 1);
          h1.getCell(c + 1).value = label;
          styleHead(h1.getCell(c + 1), GREEN);
          styleHead(h2.getCell(c + 1), GREEN);
        });

        for (let t = 1; t <= maxTp; t++) {
          const startCol = FIXED + (t - 1) * 4 + 1;
          sheet.mergeCells(1, startCol, 1, startCol + 3);
          h1.getCell(startCol).value = `TP ${t}`;
          const argb = t % 2 === 0 ? GREEN_ALT : GREEN;
          for (let k = 0; k < 4; k++) {
            styleHead(h1.getCell(startCol + k), argb);
            h2.getCell(startCol + k).value = `K${k + 1}`;
            styleHead(h2.getCell(startCol + k), argb);
          }
        }

        if (maxLm > 0) {
          const s = tpEnd + 1;
          if (maxLm > 1) sheet.mergeCells(1, s, 1, lastCol);
          h1.getCell(s).value = "SUMATIF";
          for (let l = 0; l < maxLm; l++) {
            styleHead(h1.getCell(s + l), ORANGE);
            h2.getCell(s + l).value = `LM ${l + 1}`;
            styleHead(h2.getCell(s + l), ORANGE);
          }
        }
        h1.height = 22;
        h2.height = 20;

        // Baris judul LM
        if (maxLm > 0) {
          const titleRow = sheet.addRow([]);
          titleRow.getCell(3).value = "Lingkup Materi";
          titleRow.getCell(4).value = mapelName;
          lmNames.forEach((nm, l) => {
            titleRow.getCell(tpEnd + l + 1).value = nm;
          });
          for (let c = 1; c <= lastCol; c++) {
            const cell = titleRow.getCell(c);
            cell.font = { bold: true, size: 9 };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: YELLOW_LIGHT },
            };
            cell.alignment = {
              horizontal: c === 3 || c === 4 ? "left" : "center",
              vertical: "middle",
              wrapText: true,
            };
            cell.border = border;
          }
          titleRow.height = 42;
        }

        // Body: daftar siswa (selalu tampil walaupun nilai kosong)
        if (siswaSorted.length === 0) {
          const row = sheet.addRow([]);
          sheet.mergeCells(row.number, 1, row.number, lastCol);
          row.getCell(1).value = "Belum ada siswa di kelas ini.";
          row.getCell(1).font = { italic: true, color: { argb: "FF888888" } };
          row.getCell(1).alignment = {
            horizontal: "center",
            vertical: "middle",
          };
          row.getCell(1).border = border;
        } else {
          siswaSorted.forEach((siswa, idx) => {
            const perTp = data.get(siswa.id) || {};
            const perLm = sData.get(siswa.id) || {};
            const row = sheet.addRow([
              idx + 1,
              siswa.nis || "",
              siswa.nama_siswa,
              mapelName,
            ]);
            for (let t = 1; t <= maxTp; t++) {
              const ks = perTp[t] || [null, null, null, null];
              for (let k = 0; k < 4; k++) {
                row.getCell(FIXED + (t - 1) * 4 + k + 1).value = ks[k];
              }
            }
            lmNames.forEach((nm, l) => {
              row.getCell(tpEnd + l + 1).value = perLm[nm] ?? null;
            });
            for (let c = 1; c <= lastCol; c++) {
              const cell = row.getCell(c);
              cell.border = border;
              cell.alignment = {
                horizontal: c === 3 || c === 4 ? "left" : "center",
                vertical: "middle",
              };
            }
          });
        }

        sheet.getColumn(1).width = 6;
        sheet.getColumn(2).width = 14;
        sheet.getColumn(3).width = 28;
        sheet.getColumn(4).width = 26;
        for (let c = FIXED + 1; c <= tpEnd; c++) sheet.getColumn(c).width = 6;
        for (let c = tpEnd + 1; c <= lastCol; c++)
          sheet.getColumn(c).width = 14;

        sheet.views = [{ state: "frozen", xSplit: 4, ySplit: 2 }];
      }

      setExportProgress("Membuat file...");
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(
        blob,
        `Nilai_Mentah_${currentKelas.nama_kelas}.xlsx`.replace(/\s+/g, "_"),
      );
    } catch (error) {
      console.error("Gagal export nilai mentah per mapel:", error);
      alert(
        "Gagal export. Pastikan package 'exceljs' dan 'file-saver' sudah terinstall.",
      );
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="mt-3 text-sm">Memuat data kelas & mata pelajaran...</p>
        </div>
      </div>
    );
  }

  if (!currentKelas) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">Akses Ditolak</h1>
        <p className="mt-2 text-sm text-red-600">
          Anda belum terdaftar sebagai wali kelas atau pendamping di kelas
          manapun.
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      {/* Banner */}
      <div className="w-full mb-6">
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="absolute right-0 bottom-0 w-80 h-80 bg-white/5 rounded-full translate-x-10 translate-y-20 pointer-events-none" />
          <div className="absolute right-20 bottom-[-40px] w-64 h-64 bg-white/5 rounded-full pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 z-10 relative">
            <div>
              <span className="text-xs uppercase tracking-widest text-blue-200 font-semibold block">
                Tingkat {currentKelas.tingkat}
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide mt-1">
                {currentKelas.nama_kelas}
              </h1>
              <p className="text-sm text-blue-100 mt-1">
                Pilih mata pelajaran untuk mengelola penilaian
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportPerMapel}
              disabled={exporting || mapel.length === 0}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur text-white text-xs font-bold px-4 py-2.5 rounded-lg whitespace-nowrap inline-flex items-center gap-2 border border-white/20 self-start md:self-center transition"
            >
              {exporting
                ? exportProgress || "Mengexport..."
                : "⬇ Export Pengolahan Nilai"}
            </button>
          </div>
        </div>
      </div>

      {/* Grid Mapel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mapel.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <p className="text-sm text-slate-400">
              Belum ada mata pelajaran untuk kelas ini.
            </p>
          </div>
        ) : (
          mapel.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                router.push(`/walikelas/nilai/penilaian/${item.id}`)
              }
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-200 hover:bg-blue-600 active:scale-[0.98]"
            >
              {/* Kode Mapel - Badge */}
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 group-hover:text-blue-200 transition-colors duration-300">
                  {item.kode_mapel || "MPL"}
                </span>
                <span className="text-[10px] font-medium text-slate-400 group-hover:text-blue-200 transition-colors duration-300">
                  {currentKelas.nama_kelas?.split(" ")[0] || "Kelas"}
                </span>
              </div>

              {/* Nama Mapel */}
              <h2 className="text-lg font-extrabold text-slate-900 group-hover:text-white transition-colors duration-300 mt-2 tracking-wide">
                {item.nama_mapel || item.nama}
              </h2>

              <hr className="border-slate-100 group-hover:border-blue-500/30 my-3 transition-colors duration-300" />

              {/* Guru Pengampu */}
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 border border-blue-100 text-blue-600 font-bold text-xs group-hover:bg-white/20 group-hover:border-white/30 group-hover:text-white transition-colors duration-300">
                  {item.guru_pengampu !== "Belum ditentukan" &&
                  item.guru_pengampu !== "Walikelas"
                    ? item.guru_pengampu.substring(0, 2).toUpperCase()
                    : "G"}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-blue-200 transition-colors duration-300 block">
                    Guru Pengampu
                  </span>
                  <p className="text-sm font-semibold text-slate-700 group-hover:text-white transition-colors duration-300 truncate">
                    {item.guru_pengampu}
                  </p>
                </div>
              </div>

              {/* Arrow indicator */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-white group-hover:translate-x-1.5 transition-all duration-300">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>

              {/* Shimmer */}
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />

              {/* Bottom gradient */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-blue-400 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
            </button>
          ))
        )}
      </div>
    </section>
  );
}
