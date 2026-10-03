"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";
import { createSystemLog } from "@/lib/logger";

// =========================================================
// Helper tanggal
// =========================================================
function pad(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameDate(a, b) {
  return a && b && toISODate(a) === toISODate(b);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatLong(d) {
  const date = new Date(d);
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulan = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return `${hari[date.getDay()]}, ${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
}

const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const METODE_PEMBELAJARAN = {
  praktikum: "Praktikum",
  diskusi: "Diskusi",
  presentasi: "Presentasi",
  "student centered": "Student Centered",
  "teacher centered": "Teacher Centered",
  assesmen: "Asesmen",
  refleksi: "Refleksi",
  ceramah: "Ceramah",
};

const JAM_PELAJARAN = [
  { value: "1 dan 2", label: "Jam ke-1 & 2" },
  { value: "3 dan 4", label: "Jam ke-3 & 4" },
  { value: "5 dan 6", label: "Jam ke-5 & 6" },
  { value: "7 dan 8", label: "Jam ke-7 & 8" },
];

// =========================================================
// Helper Export
// =========================================================
const JAM_SLOTS = ["1 dan 2", "3 dan 4", "5 dan 6", "7 dan 8"];
const EXPORT_FONT = { name: "Calibri" };
const BORDER_THIN = {
  top: { style: "thin", color: { rgb: "B0B0B0" } },
  bottom: { style: "thin", color: { rgb: "B0B0B0" } },
  left: { style: "thin", color: { rgb: "B0B0B0" } },
  right: { style: "thin", color: { rgb: "B0B0B0" } },
};

function formatTanggalID(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulan = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return `${hari[date.getDay()]}, ${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
}

async function exportAgendaWorkbook({
  kelasList,
  kelasId,
  startDate,
  endDate,
}) {
  const XLSX = await import("xlsx-js-style");

  const isSpecificClass = kelasId !== "semua";
  const kelasFilter = isSpecificClass ? ` && kelas_id = "${kelasId}"` : "";
  const filter = `date >= "${startDate} 00:00:00" && date <= "${endDate} 23:59:59"${kelasFilter}`;

  const records = await pb.collection("agenda_mengajar").getFullList({
    filter,
    expand: "kelas_id,mapel_id",
    sort: "date,jam_mapel",
    requestKey: null,
  });

  const targetKelas = isSpecificClass
    ? kelasList.filter((k) => k.id === kelasId)
    : kelasList;
  const kelasLabel = isSpecificClass
    ? targetKelas[0]?.nama_kelas || "Kelas"
    : "Semua Kelas";

  const allDates = [];
  {
    const c = new Date(`${startDate}T00:00:00`);
    const e = new Date(`${endDate}T00:00:00`);
    while (c <= e) {
      allDates.push(
        `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`,
      );
      c.setDate(c.getDate() + 1);
    }
  }

  const byDate = new Map();
  for (const r of records) {
    const rawDate = r.date || "";
    const d = rawDate.includes(" ")
      ? rawDate.split(" ")[0]
      : rawDate.split("T")[0];
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
  }

  const HEADERS = isSpecificClass
    ? ["Tanggal", "Jam", "Elemen", "Keterangan"]
    : ["Tanggal", "Jam", "Kelas", "Elemen", "Keterangan"];
  const COLS = HEADERS.length;
  const elemenColIdx = isSpecificClass ? 2 : 3;

  const aoa = [
    ["AGENDA MENGAJAR PESERTA DIDIK"],
    [
      `Kelas: ${kelasLabel}    •    Periode: ${formatTanggalID(startDate)}  —  ${formatTanggalID(endDate)}`,
    ],
    [],
    HEADERS,
  ];

  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
  ];

  allDates.forEach((d) => {
    const dayRecords = byDate.get(d) || [];
    const blockStart = aoa.length;

    if (isSpecificClass) {
      const slotMap = new Map();
      for (const r of dayRecords) {
        if (r.jam_mapel) slotMap.set(r.jam_mapel, r);
      }

      JAM_SLOTS.forEach((slot, i) => {
        const e = slotMap.get(slot);
        const tanggalVal = i === 0 ? formatTanggalID(d) : "";
        const mapel = e?.expand?.mapel_id?.nama_mapel || "";

        aoa.push([tanggalVal, slot, "Mapel", mapel]);
        aoa.push(["", "", "Metode", e?.metode || ""]);
        aoa.push(["", "", "Topik", e?.topik || ""]);
        aoa.push(["", "", "Detail", e?.deskripsi || ""]);
      });

      const blockEnd = aoa.length - 1;
      merges.push({ s: { r: blockStart, c: 0 }, e: { r: blockEnd, c: 0 } });
      JAM_SLOTS.forEach((_, i) => {
        const rStart = blockStart + i * 4;
        merges.push({ s: { r: rStart, c: 1 }, e: { r: rStart + 3, c: 1 } });
      });
    } else {
      let isFirstRowOfDate = true;
      let rowCursor = blockStart;

      JAM_SLOTS.forEach((slot) => {
        const entries = dayRecords
          .filter((r) => r.jam_mapel === slot)
          .sort((a, b) =>
            (a.expand?.kelas_id?.nama_kelas || "").localeCompare(
              b.expand?.kelas_id?.nama_kelas || "",
            ),
          );

        const slotStart = rowCursor;

        if (entries.length === 0) {
          aoa.push([
            isFirstRowOfDate ? formatTanggalID(d) : "",
            slot,
            "",
            "Mapel",
            "",
          ]);
          aoa.push(["", "", "", "Metode", ""]);
          aoa.push(["", "", "", "Topik", ""]);
          aoa.push(["", "", "", "Detail", ""]);
          rowCursor += 4;
          isFirstRowOfDate = false;
        } else {
          entries.forEach((e) => {
            const entryStart = rowCursor;
            const kelasNama = e.expand?.kelas_id?.nama_kelas || "";
            const mapel = e.expand?.mapel_id?.nama_mapel || "";

            aoa.push([
              isFirstRowOfDate ? formatTanggalID(d) : "",
              slot,
              kelasNama,
              "Mapel",
              mapel,
            ]);
            aoa.push(["", "", "", "Metode", e.metode || ""]);
            aoa.push(["", "", "", "Topik", e.topik || ""]);
            aoa.push(["", "", "", "Detail", e.deskripsi || ""]);

            merges.push({
              s: { r: entryStart, c: 2 },
              e: { r: entryStart + 3, c: 2 },
            });

            rowCursor += 4;
            isFirstRowOfDate = false;
          });
        }

        merges.push({
          s: { r: slotStart, c: 1 },
          e: { r: rowCursor - 1, c: 1 },
        });
      });

      const blockEnd = aoa.length - 1;
      merges.push({ s: { r: blockStart, c: 0 }, e: { r: blockEnd, c: 0 } });
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!merges"] = merges;
  ws["!cols"] = isSpecificClass
    ? [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 55 }]
    : [{ wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 50 }];
  ws["!rows"] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 6 }, { hpt: 22 }];
  ws["!freeze"] = "A5";

  const GREEN = "FFD9EAD3";
  const YELLOW = "FFFFFF00";
  const CYAN = "FF7FFFD4";

  const sTitle = {
    font: { ...EXPORT_FONT, bold: true, sz: 15, color: { rgb: "000000" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const sMeta = {
    font: { ...EXPORT_FONT, italic: true, sz: 10, color: { rgb: "6B7280" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const sHead = {
    font: { ...EXPORT_FONT, bold: true, sz: 11 },
    fill: { fgColor: { rgb: "D9E1F2" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: BORDER_THIN,
  };
  const sCell = {
    font: { ...EXPORT_FONT, sz: 11 },
    alignment: { vertical: "center", wrapText: true },
    border: BORDER_THIN,
  };
  const sCellC = {
    ...sCell,
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  const sElemenMapel = {
    ...sCell,
    font: { ...EXPORT_FONT, sz: 11, bold: true },
    fill: { fgColor: { rgb: GREEN } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  const sElemenMetode = {
    ...sCell,
    font: { ...EXPORT_FONT, sz: 11, italic: true, color: { rgb: "374151" } },
    fill: { fgColor: { rgb: YELLOW } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  const sElemenTopik = {
    ...sCell,
    font: { ...EXPORT_FONT, sz: 11, italic: true, color: { rgb: "374151" } },
    fill: { fgColor: { rgb: CYAN } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  const sElemenDetail = {
    ...sCell,
    font: { ...EXPORT_FONT, sz: 11, italic: true, color: { rgb: "374151" } },
    alignment: { horizontal: "left", vertical: "center" },
  };

  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };

      if (R === 0) {
        ws[addr].s = sTitle;
      } else if (R === 1) {
        ws[addr].s = sMeta;
      } else if (R === 3) {
        ws[addr].s = sHead;
      } else if (R >= 4) {
        if (C === 0 || C === 1 || (C === 2 && !isSpecificClass)) {
          ws[addr].s = sCellC;
        } else if (C === elemenColIdx) {
          if (ws[addr].v === "Mapel") ws[addr].s = sElemenMapel;
          else if (ws[addr].v === "Metode") ws[addr].s = sElemenMetode;
          else if (ws[addr].v === "Topik") ws[addr].s = sElemenTopik;
          else ws[addr].s = sElemenDetail;
        } else {
          ws[addr].s = sCell;
        }
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "AGENDA");

  const kelasSlug = isSpecificClass
    ? (targetKelas[0]?.nama_kelas || "kelas").replace(/\s+/g, "_")
    : "semua-kelas";
  XLSX.writeFile(wb, `agenda_${kelasSlug}_${startDate}_${endDate}.xlsx`);
}

// =========================================================
// Toast Notifikasi
// =========================================================
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  const isSuccess = toast.type === "success";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="alert"
        className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-[toast-in_0.2s_ease-out] ${
          isSuccess
            ? "border-sky-200 bg-sky-50 text-sky-800"
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}
      >
        <span
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            isSuccess ? "bg-sky-500" : "bg-rose-500"
          }`}
        >
          {isSuccess ? "✓" : "!"}
        </span>
        <p className="flex-1 text-sm font-medium">{toast.text}</p>
        <button
          onClick={onClose}
          className="text-lg leading-none text-current opacity-50 hover:opacity-100"
          aria-label="Tutup notifikasi"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// =========================================================
// Modal Form Agenda
// =========================================================
function AgendaModal({ isOpen, onClose, onSubmit, initialData, defaultDate }) {
  const [loading, setLoading] = useState(false);
  const [listMapel, setListMapel] = useState([]);
  const [kelas, setKelas] = useState(null);
  const [listKelas, setListKelas] = useState([]);

  const [deskripsi, setDeskripsi] = useState("");
  const [mapelId, setMapelId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [date, setDate] = useState(defaultDate || toISODate(new Date()));
  const [topik, setTopik] = useState("");
  const [jamMapel, setJamMapel] = useState("");
  const [metode, setMetode] = useState("");
  const [siswaTidakHadir, setSiswaTidakHadir] = useState("");

  const user = useMemo(() => getCurrentUser(), []);

  useEffect(() => {
    if (!user || !isOpen) return;
    let cancelled = false;

    async function fetchData() {
      try {
        let kelasData = null;
        let allKelas = [];

        if (user.role === "guru walikelas" || user.role === "guru pendamping") {
          try {
            kelasData = await pb
              .collection("kelas")
              .getFirstListItem(
                `walikelas_id = "${user.id}" || pendamping_id = "${user.id}"`,
                { requestKey: null },
              );
            if (!cancelled) setKelas(kelasData);
          } catch (e) {
            console.log("Tidak ada kelas yang ditugaskan");
          }
        } else if (user.role === "admin" || user.role === "ict") {
          allKelas = await pb.collection("kelas").getFullList({
            sort: "nama_kelas",
            requestKey: null,
          });
          if (!cancelled) setListKelas(allKelas);
        }

        let mapelData = [];
        if (kelasData) {
          const [mapelKhusus, mapelTingkat] = await Promise.all([
            pb.collection("mata_pelajaran").getFullList({
              filter: `spesifik_kelas_id ~ "${kelasData.id}"`,
              requestKey: null,
            }),
            pb.collection("mata_pelajaran").getFullList({
              filter: `target_tingkat ~ "${String(kelasData.tingkat)}"`,
              requestKey: null,
            }),
          ]);

          const combined = [...mapelKhusus, ...mapelTingkat];
          mapelData = Array.from(
            new Map(combined.map((item) => [item.id, item])).values(),
          );
          mapelData.sort((a, b) => a.nama_mapel.localeCompare(b.nama_mapel));
        }

        if (!cancelled) setListMapel(mapelData);
      } catch (error) {
        console.error("Gagal mengambil data:", error);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [user, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setDeskripsi(initialData.deskripsi || "");
      setMapelId(initialData.mapel_id || "");
      setKelasId(initialData.kelas_id || "");
      setDate(initialData.date || defaultDate || toISODate(new Date()));
      setTopik(initialData.topik || "");
      setJamMapel(initialData.jam_mapel || "");
      setMetode(initialData.metode || "");
      setSiswaTidakHadir(initialData.siswa_tidak_hadir || "");
    } else {
      setDeskripsi("");
      setMapelId("");
      setKelasId("");
      setDate(defaultDate || toISODate(new Date()));
      setTopik("");
      setJamMapel("");
      setMetode("");
      setSiswaTidakHadir("");
    }
  }, [initialData, isOpen, defaultDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!deskripsi.trim() || !mapelId) {
      return;
    }

    setLoading(true);
    try {
      const data = {
        deskripsi: deskripsi.trim(),
        mapel_id: mapelId,
        kelas_id: kelasId || (kelas ? kelas.id : ""),
        date: date,
        topik: topik.trim(),
        jam_mapel: jamMapel || null,
        metode: metode || null,
        siswa_tidak_hadir: siswaTidakHadir.trim(),
      };

      if (initialData) {
        data.id = initialData.id;
      }

      await onSubmit(data);
      onClose();
    } catch (err) {
      console.error("Error submitting agenda:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isAdminOrIct = user?.role === "admin" || user?.role === "ict";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:px-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold text-slate-800">
            {initialData ? "Edit Agenda Mengajar" : "Tambah Agenda Mengajar"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Tutup"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 overflow-y-auto px-5 py-5 sm:px-6"
        >
          {isAdminOrIct && (
            <div>
              <label
                htmlFor="kelas_id"
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                Kelas <span className="text-red-500">*</span>
              </label>
              <select
                id="kelas_id"
                value={kelasId}
                onChange={(e) => setKelasId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="" disabled>
                  Pilih Kelas
                </option>
                {listKelas
                  .sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas))
                  .map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama_kelas} (Tingkat {k.tingkat})
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="mapel_id"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Mata Pelajaran <span className="text-red-500">*</span>
            </label>
            <select
              id="mapel_id"
              value={mapelId}
              onChange={(e) => setMapelId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
            >
              <option value="" disabled>
                Pilih Mata Pelajaran
              </option>
              {listMapel.length > 0 ? (
                listMapel.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nama_mapel} ({m.kode_mapel})
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  Tidak ada mapel tersedia
                </option>
              )}
            </select>
          </div>

          <div>
            <label
              htmlFor="topik"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Topik Pembelajaran
            </label>
            <input
              id="topik"
              type="text"
              value={topik}
              onChange={(e) => setTopik(e.target.value)}
              placeholder="Masukkan topik pembelajaran..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="deskripsi"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Deskripsi Kegiatan <span className="text-red-500">*</span>
            </label>
            <textarea
              id="deskripsi"
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              placeholder="Masukkan deskripsi kegiatan pembelajaran..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label
              htmlFor="jam_mapel"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Jam Pelajaran <span className="text-red-500">*</span>
            </label>
            <select
              id="jam_mapel"
              value={jamMapel}
              onChange={(e) => setJamMapel(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
            >
              <option value="" disabled>
                Pilih Jam Pelajaran
              </option>
              {JAM_PELAJARAN.map((jam) => (
                <option key={jam.value} value={jam.value}>
                  {jam.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-slate-400">
              Pilih sesi jam pelajaran (1-2, 3-4, 5-6, atau 7-8)
            </p>
          </div>

          <div>
            <label
              htmlFor="metode"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Metode Pembelajaran
            </label>
            <select
              id="metode"
              value={metode}
              onChange={(e) => setMetode(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Pilih Metode</option>
              {Object.entries(METODE_PEMBELAJARAN)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="siswa_tidak_hadir"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Siswa Tidak Hadir
            </label>
            <input
              id="siswa_tidak_hadir"
              type="text"
              value={siswaTidakHadir}
              onChange={(e) => setSiswaTidakHadir(e.target.value)}
              placeholder="Nama siswa yang tidak hadir (pisahkan dengan koma)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="date"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Tanggal <span className="text-red-500">*</span>
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? "Menyimpan..." : initialData ? "Update" : "Simpan"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================
// Modal Export Agenda
// =========================================================
function ExportAgendaModal({
  isOpen,
  onClose,
  kelas,
  kelasOptions,
  needsKelasPicker,
}) {
  const today = useMemo(() => new Date(), []);
  const firstOfMonth = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today],
  );

  const [startDate, setStartDate] = useState(toISODate(firstOfMonth));
  const [endDate, setEndDate] = useState(toISODate(today));
  const [selectedKelasId, setSelectedKelasId] = useState("semua");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setStartDate(toISODate(firstOfMonth));
    setEndDate(toISODate(today));
    setSelectedKelasId(needsKelasPicker ? "semua" : kelas?.id || "");
  }, [isOpen, kelas, needsKelasPicker, firstOfMonth, today]);

  const handleExport = async (e) => {
    e.preventDefault();
    setError("");

    if (!startDate || !endDate) {
      setError("Tanggal mulai dan akhir wajib diisi.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError(
        "Tanggal mulai harus lebih awal atau sama dengan tanggal akhir.",
      );
      return;
    }
    if (!selectedKelasId) {
      setError("Silakan pilih kelas terlebih dahulu.");
      return;
    }

    setLoading(true);
    try {
      const list = needsKelasPicker ? kelasOptions : kelas ? [kelas] : [];

      await exportAgendaWorkbook({
        kelasList: list,
        kelasId: selectedKelasId,
        startDate,
        endDate,
      });

      onClose();
    } catch (err) {
      console.error("Export gagal:", err);
      setError(err?.message || "Gagal mengexport agenda. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:px-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Export Agenda</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Tutup"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleExport} className="space-y-4">
          {needsKelasPicker && (
            <div>
              <label
                htmlFor="export_kelas"
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                Kelas
              </label>
              <select
                id="export_kelas"
                value={selectedKelasId}
                onChange={(e) => setSelectedKelasId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              >
                <option value="semua">Semua Kelas</option>
                {kelasOptions.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama_kelas} (Tingkat {k.tingkat})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="export_start"
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                Tanggal Mulai
              </label>
              <input
                id="export_start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label
                htmlFor="export_end"
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                Tanggal Akhir
              </label>
              <input
                id="export_end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-400">
            Format Excel: untuk &quot;Semua Kelas&quot; kolom <b>Kelas</b>{" "}
            ditambahkan, untuk kelas spesifik kolom <b>Elemen</b> berisi
            Mapel/Metode/Topik/Detail.
          </p>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? "Mengexport..." : "Export Excel"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================
// Main Page
// =========================================================
export default function AgendaMengajarPage() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);
  const [kelas, setKelas] = useState(null);
  const [kelasOptions, setKelasOptions] = useState([]);
  const [needsKelasPicker, setNeedsKelasPicker] = useState(false);
  const [noKelasAssigned, setNoKelasAssigned] = useState(false);
  const [resolvingKelas, setResolvingKelas] = useState(true);

  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [monthAgenda, setMonthAgenda] = useState({});
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [message, setMessage] = useState(null);

  const [selectedDate, setSelectedDate] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [modalDefaultDate, setModalDefaultDate] = useState(null);

  const [isExportOpen, setIsExportOpen] = useState(false);

  // =========================================================
  // Auth & Kelas Resolution
  // =========================================================
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getCurrentUser());
    setCheckingAuth(false);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function resolve() {
      setResolvingKelas(true);
      setNoKelasAssigned(false);
      const role = user.role;

      if (role === "guru walikelas" || role === "guru pendamping") {
        try {
          const rec = await pb
            .collection("kelas")
            .getFirstListItem(
              `walikelas_id="${user.id}" || pendamping_id="${user.id}"`,
              { requestKey: null },
            );
          if (!cancelled) {
            setKelas(rec);
            setNeedsKelasPicker(false);
          }
        } catch (e) {
          if (!cancelled) setNoKelasAssigned(true);
        }
      } else {
        try {
          const list = await pb.collection("kelas").getFullList({
            sort: "nama_kelas",
            requestKey: null,
          });
          if (!cancelled) {
            const sorted = list.sort((a, b) =>
              a.nama_kelas.localeCompare(b.nama_kelas),
            );
            setKelasOptions(sorted);
            setNeedsKelasPicker(true);
          }
        } catch (e) {
          if (!cancelled)
            setMessage({ type: "error", text: "Gagal memuat daftar kelas." });
        }
      }
      if (!cancelled) setResolvingKelas(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // =========================================================
  // Load Month Agenda
  // =========================================================
  const loadMonth = useCallback(async () => {
    const activeKelas = needsKelasPicker ? kelas : kelas;
    if (!activeKelas) return;

    setLoadingCalendar(true);
    try {
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const startStr = `${toISODate(first)} 00:00:00`;
      const endStr = `${toISODate(last)} 23:59:59`;

      const records = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${activeKelas.id}" && date >= "${startStr}" && date <= "${endStr}"`,
        sort: "date,jam_mapel",
        expand: "mapel_id,kelas_id",
        requestKey: null,
      });

      const grouped = {};
      for (const r of records) {
        const key = toISODate(new Date(r.date));
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      }
      setMonthAgenda(grouped);
    } catch (e) {
      setMessage({
        type: "error",
        text: "Gagal memuat data agenda bulan ini.",
      });
    } finally {
      setLoadingCalendar(false);
    }
  }, [kelas, viewDate, needsKelasPicker]);

  useEffect(() => {
    if (kelas) {
      loadMonth();
    }
  }, [loadMonth, kelas]);

  // =========================================================
  // Day Summary
  // =========================================================
  function daySummary(date) {
    const key = toISODate(date);
    const items = monthAgenda[key] || [];
    return items.length > 0 ? { total: items.length } : null;
  }

  // =========================================================
  // Open Detail
  // =========================================================
  const openDetail = useCallback(
    async (date) => {
      setSelectedDate(date);
      setMessage(null);
      const activeKelas = needsKelasPicker ? kelas : kelas;
      if (!activeKelas) {
        setDetailItems([]);
        return;
      }
      setLoadingDetail(true);
      try {
        const dateStr = toISODate(date);
        const items = monthAgenda[dateStr] || [];

        const refreshedItems = await Promise.all(
          items.map(async (item) => {
            try {
              const fullItem = await pb
                .collection("agenda_mengajar")
                .getOne(item.id, {
                  expand: "mapel_id,kelas_id",
                  requestKey: null,
                });
              return fullItem;
            } catch {
              return item;
            }
          }),
        );

        const jamOrder = ["1 dan 2", "3 dan 4", "5 dan 6", "7 dan 8"];
        const sortedItems = refreshedItems.sort((a, b) => {
          const indexA = jamOrder.indexOf(a.jam_mapel);
          const indexB = jamOrder.indexOf(b.jam_mapel);
          return (
            (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
          );
        });

        setDetailItems(sortedItems);
      } finally {
        setLoadingDetail(false);
      }
    },
    [kelas, monthAgenda, needsKelasPicker],
  );

  // =========================================================
  // CRUD Operations
  // =========================================================
  const handleCreate = async (data) => {
    try {
      const activeKelas = needsKelasPicker
        ? data.kelas_id || kelas?.id
        : kelas?.id;

      const existing = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${activeKelas}" && mapel_id="${data.mapel_id}" && date="${data.date}" && jam_mapel="${data.jam_mapel}"`,
        requestKey: null,
      });

      if (existing.length > 0) {
        setMessage({
          type: "error",
          text: `Mata pelajaran ini sudah memiliki agenda pada ${data.jam_mapel} tanggal ${formatLong(data.date)}.`,
        });
        return;
      }

      const existingJam = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${activeKelas}" && date="${data.date}" && jam_mapel="${data.jam_mapel}"`,
        requestKey: null,
      });

      if (existingJam.length > 0) {
        setMessage({
          type: "error",
          text: `Jam ${data.jam_mapel} sudah digunakan oleh mata pelajaran lain pada tanggal ${formatLong(data.date)}.`,
        });
        return;
      }

      await pb.collection("agenda_mengajar").create(
        {
          deskripsi: data.deskripsi,
          mapel_id: data.mapel_id,
          kelas_id: activeKelas,
          date: data.date,
          topik: data.topik,
          jam_mapel: data.jam_mapel,
          metode: data.metode,
          siswa_tidak_hadir: data.siswa_tidak_hadir,
        },
        { requestKey: null },
      );

      await createSystemLog({
        type: "succes",
        msg: `User '${user.nama_lengkap} (${user.role})' berhasil membuat agenda.`,
        endpoint: `/walikelas/agenda`,
        statusCode: 200,
        payload: {
          deskripsi: data.deskripsi,
          mapel_id: data.mapel_id,
          kelas_id: activeKelas,
          date: data.date,
          topik: data.topik,
          jam_mapel: data.jam_mapel,
          metode: data.metode,
          siswa_tidak_hadir: data.siswa_tidak_hadir,
        },
      });

      setMessage({ type: "success", text: "Agenda berhasil ditambahkan!" });
      await loadMonth();
      if (selectedDate) {
        await openDetail(selectedDate);
      }
      location.reload();
    } catch (err) {
      console.error("Error creating agenda:", err);
      setMessage({ type: "error", text: "Gagal menambahkan agenda." });
      await createSystemLog({
        type: "warning",
        msg: `User '${user.nama_lengkap} (${user.role})' gagal membuat agenda.`,
        endpoint: `/walikelas/agenda`,
        statusCode: 200,
        payload: {
          deskripsi: data.deskripsi,
          mapel_id: data.mapel_id,
          kelas_id: activeKelas,
          date: data.date,
          topik: data.topik,
          jam_mapel: data.jam_mapel,
          metode: data.metode,
          siswa_tidak_hadir: data.siswa_tidak_hadir,
        },
      });
      throw err;
    }
  };

  const handleUpdate = async (data) => {
    if (!editingItem) return;
    try {
      const activeKelas = needsKelasPicker
        ? data.kelas_id || kelas?.id
        : kelas?.id;

      const existing = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${activeKelas}" && mapel_id="${data.mapel_id}" && date="${data.date}" && jam_mapel="${data.jam_mapel}" && id != "${editingItem.id}"`,
        requestKey: null,
      });

      if (existing.length > 0) {
        setMessage({
          type: "error",
          text: `Mata pelajaran ini sudah memiliki agenda pada ${data.jam_mapel} tanggal ${formatLong(data.date)}.`,
        });
        return;
      }

      const existingJam = await pb.collection("agenda_mengajar").getFullList({
        filter: `kelas_id="${activeKelas}" && date="${data.date}" && jam_mapel="${data.jam_mapel}" && id != "${editingItem.id}"`,
        requestKey: null,
      });

      if (existingJam.length > 0) {
        setMessage({
          type: "error",
          text: `Jam ${data.jam_mapel} sudah digunakan oleh mata pelajaran lain pada tanggal ${formatLong(data.date)}.`,
        });
        return;
      }

      await pb.collection("agenda_mengajar").update(
        editingItem.id,
        {
          deskripsi: data.deskripsi,
          mapel_id: data.mapel_id,
          kelas_id: data.kelas_id || editingItem.kelas_id,
          date: data.date || editingItem.date,
          topik: data.topik,
          jam_mapel: data.jam_mapel,
          metode: data.metode,
          siswa_tidak_hadir: data.siswa_tidak_hadir,
        },
        { requestKey: null },
      );

      await createSystemLog({
        type: "succes",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' berhasil update agenda.`,
        endpoint: "/walikelas/agenda",
        statusCode: 400,
        payload: {
          deskripsi: data.deskripsi,
          topik: data.topik,
          jam_mapel: data.jam_mapel,
          metode: data.metode,
          siswa_tidak_hadir: data.siswa_tidak_hadir,
          date: data.date,
          kelas_id: data.kelas_id || editingItem.kelas_id,
          mapel_id: data.mapel_id,
        },
      });

      setMessage({ type: "success", text: "Agenda berhasil diperbarui!" });
      await loadMonth();
      if (selectedDate) {
        await openDetail(selectedDate);
      }
      location.reload();
    } catch (err) {
      console.error("Error updating agenda:", err);
      setMessage({ type: "error", text: "Gagal memperbarui agenda." });
      await createSystemLog({
        type: "warning",
        msg: `User '${user?.nama_lengkap || "User"} ( ${user?.role} )' gagal update/membuat agenda.`,
        endpoint: "/walikelas/agenda",
        statusCode: err.status || 401,
        payload: {
          deskripsi: data.deskripsi,
          mapel_id: data.mapel_id,
          kelas_id: data.kelas_id || editingItem.kelas_id,
          date: data.date || editingItem.date,
          topik: data.topik,
          jam_mapel: data.jam_mapel,
          metode: data.metode,
          siswa_tidak_hadir: data.siswa_tidak_hadir,
        },
      });
      throw err;
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Yakin ingin menghapus agenda ini?")) return;

    try {
      await pb.collection("agenda_mengajar").delete(id, { requestKey: null });
      setMessage({ type: "success", text: "Agenda berhasil dihapus!" });
      await loadMonth();
      if (selectedDate) {
        await openDetail(selectedDate);
      }
      location.reload();
    } catch (err) {
      console.error("Error deleting agenda:", err);
      setMessage({ type: "error", text: "Gagal menghapus agenda." });
    }
  };

  // =========================================================
  // Navigation
  // =========================================================
  function goToMonth(offset) {
    setViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    openDetail(today);
  }

  const openAddModal = (date) => {
    setEditingItem(null);
    setModalDefaultDate(date ? toISODate(date) : toISODate(new Date()));
    setIsModalOpen(true);
  };

  // =========================================================
  // Build Calendar Grid
  // =========================================================
  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = (firstOfMonth.getDay() + 6) % 7;

    const arr = [];
    for (let i = 0; i < leading; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewDate]);

  // =========================================================
  // Render
  // =========================================================
  if (checkingAuth || resolvingKelas) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Memuat...</p>
      </div>
    );
  }

  if (noKelasAssigned) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="font-medium text-rose-700">
            Anda belum ditugaskan ke kelas manapun.
          </p>
          <p className="mt-1 text-sm text-rose-600">
            Hubungi admin atau ICT untuk mengatur kelas sebagai wali kelas /
            guru pendamping.
          </p>
        </div>
      </div>
    );
  }

  const activeKelas = needsKelasPicker ? kelas : kelas;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Toast toast={message} onClose={() => setMessage(null)} />

      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        {needsKelasPicker && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Pilih Kelas
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={kelas?.id || ""}
              onChange={(e) => {
                const found = kelasOptions.find((k) => k.id === e.target.value);
                setKelas(found || null);
                setSelectedDate(null);
                setDetailItems([]);
              }}
            >
              <option value="" disabled>
                -- Pilih kelas --
              </option>
              {kelasOptions
                .sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas))
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama_kelas} (Tingkat {k.tingkat})
                  </option>
                ))}
            </select>
          </div>
        )}

        {activeKelas && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              {/* Judul bulan + badge kelas */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-bold leading-tight text-slate-900 sm:text-xl">
                    {BULAN[viewDate.getMonth()]} {viewDate.getFullYear()}
                  </h1>
                  {!needsKelasPicker && kelas?.nama_kelas && (
                    <span className="mt-1.5 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {kelas.nama_kelas}
                    </span>
                  )}
                </div>
              </div>

              {/* Navigasi bulan: prev / hari ini / next */}
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => goToMonth(-1)}
                  aria-label="Bulan sebelumnya"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={goToToday}
                  className="flex-1 rounded-lg bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-[0.98]"
                >
                  Hari ini
                </button>
                <button
                  onClick={() => goToMonth(1)}
                  aria-label="Bulan berikutnya"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                >
                  <svg
                    className="h-4 w-4"
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
                </button>
              </div>

              {/* Aksi utama: export & tambah */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setIsExportOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 py-2.5 text-sm font-medium text-sky-700 transition hover:bg-sky-100 active:scale-[0.98]"
                >
                  <svg
                    className="h-4 w-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  <span className="truncate">Export</span>
                </button>
                <button
                  onClick={() => openAddModal(selectedDate || today)}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
                >
                  <svg
                    className="h-4 w-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span className="truncate">Tambah Agenda</span>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-500 sm:gap-1.5 sm:text-xs">
                {HARI_PENDEK.map((h) => (
                  <div key={h} className="py-1">
                    {h}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
                {loadingCalendar &&
                  Array.from({ length: 35 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square animate-pulse rounded-lg bg-slate-100"
                    />
                  ))}

                {!loadingCalendar &&
                  cells.map((date, i) => {
                    if (!date) return <div key={i} className="aspect-square" />;

                    const isFuture = date > today;
                    const isToday = isSameDate(date, today);
                    const isSelected =
                      selectedDate && isSameDate(date, selectedDate);
                    const summary = daySummary(date);

                    return (
                      <button
                        key={i}
                        disabled={isFuture}
                        onClick={() => openDetail(date)}
                        className={`relative flex aspect-square min-w-0 flex-col items-center justify-start overflow-hidden rounded-md border p-0.5 text-left transition sm:rounded-lg sm:p-1
                          ${
                            isFuture
                              ? "cursor-not-allowed border-transparent text-slate-300"
                              : "cursor-pointer border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 active:scale-95"
                          }
                          ${
                            isSelected
                              ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                              : ""
                          }
                        `}
                      >
                        <span
                          className={`mt-0.5 text-[10px] font-medium sm:text-xs ${
                            isToday
                              ? "flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white sm:h-5 sm:w-5"
                              : "text-slate-700"
                          }`}
                        >
                          {date.getDate()}
                        </span>

                        {summary && summary.total > 0 && (
                          <>
                            <span className="mt-0.5 hidden text-[9px] font-medium text-blue-600 sm:inline">
                              {summary.total} agenda
                            </span>
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-blue-500 sm:hidden" />
                          </>
                        )}
                      </button>
                    );
                  })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 sm:gap-3 sm:text-xs">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Ada agenda
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full border border-slate-300" />
                  Tidak ada agenda
                </span>
              </div>
            </div>

            {selectedDate && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-900">
                      Agenda Mengajar
                    </h2>
                    <p className="truncate text-sm text-slate-500">
                      {formatLong(selectedDate)}
                    </p>
                  </div>
                  {!loadingDetail && (
                    <button
                      onClick={() => openAddModal(selectedDate)}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98]"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Tambah Agenda
                    </button>
                  )}
                </div>

                {loadingDetail ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    Memuat agenda...
                  </p>
                ) : detailItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <p className="text-sm text-slate-400">
                      Belum ada agenda untuk tanggal ini
                    </p>
                    <button
                      onClick={() => openAddModal(selectedDate)}
                      className="mt-2 text-sm font-semibold text-blue-600 hover:underline"
                    >
                      Tambah agenda sekarang
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detailItems.map((item, index) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-slate-100 p-4 transition hover:border-slate-200"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                                {index + 1}
                              </span>
                              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                                {item.expand?.mapel_id?.nama_mapel ||
                                  item.nama_mapel ||
                                  "Tanpa Mapel"}
                              </span>
                              {item.expand?.mapel_id?.kode_mapel && (
                                <span className="text-xs text-slate-400">
                                  {item.expand.mapel_id.kode_mapel}
                                </span>
                              )}
                              {item.jam_mapel && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                                  {item.jam_mapel}
                                </span>
                              )}
                            </div>

                            {item.topik && (
                              <p className="text-sm font-semibold text-slate-800">
                                📚 {item.topik}
                              </p>
                            )}

                            <p className="text-sm text-slate-700">
                              {item.deskripsi}
                            </p>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              {item.metode && (
                                <span className="flex items-center gap-1">
                                  <span className="text-slate-400">
                                    Metode:
                                  </span>
                                  <span className="font-medium text-slate-700">
                                    {METODE_PEMBELAJARAN[item.metode] ||
                                      item.metode}
                                  </span>
                                </span>
                              )}

                              {item.siswa_tidak_hadir && (
                                <span className="flex items-center gap-1">
                                  <span className="text-slate-400">
                                    Tidak Hadir:
                                  </span>
                                  <span className="font-medium text-rose-600">
                                    {item.siswa_tidak_hadir}
                                  </span>
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                              <span>
                                Dibuat:{" "}
                                {new Date(item.created).toLocaleString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                              {item.updated &&
                                item.updated !== item.created && (
                                  <span>
                                    Diperbarui:{" "}
                                    {new Date(item.updated).toLocaleString(
                                      "id-ID",
                                      {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      },
                                    )}
                                  </span>
                                )}
                            </div>
                          </div>

                          <div className="flex flex-shrink-0 items-center gap-1 self-end sm:self-start">
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setModalDefaultDate(null);
                                setIsModalOpen(true);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 active:scale-95"
                              title="Edit"
                              aria-label="Edit agenda"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 active:scale-95"
                              title="Hapus"
                              aria-label="Hapus agenda"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!loadingDetail && detailItems.length > 0 && (
                  <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
                    >
                      Tutup
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <AgendaModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
          setModalDefaultDate(null);
        }}
        onSubmit={editingItem ? handleUpdate : handleCreate}
        initialData={editingItem}
        defaultDate={modalDefaultDate || toISODate(today)}
      />

      <ExportAgendaModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        kelas={kelas}
        kelasOptions={kelasOptions}
        needsKelasPicker={needsKelasPicker}
      />
    </div>
  );
}
