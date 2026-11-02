"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  Database,
  FileSpreadsheet,
  Users2,
  CalendarRange,
  Table2,
  Trash2,
  RefreshCcw,
  FileUp,
  GraduationCap,
  Check,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Info,
  TriangleAlert,
  X,
  Download,
} from "lucide-react";
import {
  backupDatabase,
  getExportSiswaKelas,
  getExportWaliPendamping,
  getExportAbsensiSemester,
  getExportNilaiPerKelas,
  deleteNilaiAgendaAbsensi,
  resetSemester,
  importSiswa,
  importGuru,
} from "@/actions/onboarding.action";

/* ───────────────────────── Excel helpers ───────────────────────── */

function safeSheetName(raw, wb) {
  let base = String(raw || "Sheet")
    .replace(/[\\/?*[\]:]/g, " ")
    .trim();
  if (!base) base = "Sheet";
  base = base.slice(0, 28);
  let name = base;
  let i = 2;
  while (wb.getWorksheet(name)) name = `${base.slice(0, 26)}_${i++}`;
  return name;
}

const HEADER_LABELS = {
  nama_siswa: "Nama Siswa",
  nis: "NIS",
  nisn: "NISN",
  jenis_kelamin: "Jenis Kelamin",
  kelas: "Kelas",
  tingkat: "Tingkat",
  walikelas: "Wali Kelas",
  pendamping: "Guru Pendamping",
  hadir: "Hadir",
  sakit: "Sakit",
  izin: "Izin",
  alpha: "Alpha",
  nama_kelas: "Nama Kelas",
  username: "Username",
  nama_lengkap: "Nama Lengkap",
  no_whatsapp: "No WhatsApp",
  role: "Role",
};

const NUMERIC_KEYS = new Set(["hadir", "sakit", "izin", "alpha", "tingkat"]);

function addSheet(wb, name, headers, rows) {
  const ws = wb.addWorksheet(safeSheetName(name, wb));
  const labels = headers.map((h) => HEADER_LABELS[h] || h);

  const headRow = ws.addRow(labels);
  headRow.font = { bold: true, color: { argb: "FF334155" } };
  headRow.height = 20;
  headRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  rows.forEach((r) => ws.addRow(headers.map((h) => r[h] ?? "")));

  const thin = { style: "thin", color: { argb: "FFE2E8F0" } };
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
  });

  headers.forEach((h, idx) => {
    const col = ws.getColumn(idx + 1);
    const maxLen = Math.max(
      labels[idx].length,
      ...rows.map((r) => String(r[h] ?? "").length),
      1,
    );
    col.width = Math.min(42, Math.max(10, maxLen + 2));
    if (NUMERIC_KEYS.has(h)) {
      col.alignment = { horizontal: "center" };
    }
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

async function saveWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}

async function readExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function applyListValidation(ws, colIndex, options, maxRows = 200) {
  const formulae = [`"${options.join(",")}"`];
  for (let r = 2; r <= maxRows; r++) {
    ws.getCell(r, colIndex).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae,
    };
  }
}

async function downloadSiswaTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = addSheet(
    wb,
    "Template Siswa",
    ["nis", "nama_siswa", "nisn", "jenis_kelamin", "kelas"],
    [
      {
        nis: "12345",
        nama_siswa: "Contoh Nama Siswa",
        nisn: "0012345678",
        jenis_kelamin: "L",
        kelas: "1A",
      },
    ],
  );
  applyListValidation(ws, 4, ["L", "P"]);
  await saveWorkbook(wb, "template-import-siswa.xlsx");
}

async function downloadGuruTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = addSheet(
    wb,
    "Template Guru",
    ["username", "nama_lengkap", "no_whatsapp", "role"],
    [
      {
        username: "gurumapel1",
        nama_lengkap: "Contoh Guru",
        no_whatsapp: "081234567890",
        role: "guru mapel",
      },
    ],
  );
  applyListValidation(ws, 4, [
    "guru walikelas",
    "guru pendamping",
    "guru mapel",
    "ict",
    "admin",
  ]);
  await saveWorkbook(wb, "template-import-guru.xlsx");
}

/* ───────────────────────── Data langkah ───────────────────────── */

const GROUPS = [
  { id: "backup", label: "Backup & export" },
  { id: "reset", label: "Hapus & reset" },
  { id: "import", label: "Import data baru" },
];

const STEPS = [
  {
    id: 1,
    group: "backup",
    icon: Database,
    title: "Backup file database",
    desc: "Membuat file backup .zip dari PocketBase lalu mengunduhnya.",
    detail:
      "File backup .zip dibuat di server PocketBase lalu diunduh. Tidak ada data yang diubah pada langkah ini.",
  },
  {
    id: 2,
    group: "backup",
    icon: FileSpreadsheet,
    title: "Export siswa + kelas",
    desc: "Sheet siswa (dengan kelas) + sheet berisi nama kelas saja.",
    detail:
      "Menghasilkan satu file Excel berisi 2 sheet: data siswa (beserta kelas) dan daftar nama kelas.",
  },
  {
    id: 3,
    group: "backup",
    icon: Users2,
    title: "Export guru & wali kelas",
    desc: "Pemetaan per kelas + sheet Walikelas + sheet Guru Mapel.",
    detail:
      "Menghasilkan Excel berisi: pemetaan wali kelas & pendamping per kelas, daftar guru walikelas, dan daftar guru mapel.",
  },
  {
    id: 4,
    group: "backup",
    icon: CalendarRange,
    title: "Export absensi per semester",
    desc: "Dua sheet: satu untuk tiap semester.",
    detail:
      "Menghasilkan Excel dengan 2 sheet (satu sheet per semester) berisi rekap kehadiran siswa.",
  },
  {
    id: 5,
    group: "backup",
    icon: Table2,
    title: "Export nilai per kelas",
    desc: "Satu sheet per kelas (siswa × mapel).",
    detail:
      "Menghasilkan Excel dengan 1 sheet per kelas (baris = siswa, kolom = mata pelajaran).",
  },
  {
    id: 6,
    group: "reset",
    icon: Trash2,
    title: "Hapus nilai, agenda, absensi",
    desc: "Menghapus SELURUH data nilai, agenda mengajar, dan absensi.",
    detail:
      "Menghapus PERMANEN seluruh data nilai, agenda mengajar, dan absensi. Pastikan backup sudah dibuat.",
    danger: true,
  },
  {
    id: 7,
    group: "reset",
    icon: RefreshCcw,
    title: "Reset semester & tahun ajaran",
    desc: "Menghapus semua tahun ajaran lalu menambah yang baru.",
    detail:
      "Menghapus PERMANEN semua tahun ajaran lama, lalu membuat tahun ajaran/semester baru.",
    danger: true,
  },
  {
    id: 8,
    group: "import",
    icon: FileUp,
    title: "Update siswa (import Excel)",
    desc: "Cocokkan via NIS. Siswa lama yang tidak ada di Excel dihapus.",
    detail:
      "Mengimpor Excel siswa (kunci NIS). Siswa lama yang NIS-nya tidak ada di Excel akan DIHAPUS.",
  },
  {
    id: 9,
    group: "import",
    icon: GraduationCap,
    title: "Update guru (import Excel)",
    desc: "Cocokkan via username. Guru yang tidak ada di Excel dinonaktifkan.",
    detail:
      "Mengimpor Excel guru (kunci username). Guru yang tidak ada di Excel akan dinonaktifkan.",
  },
];

/* ───────────────────────── Komponen kecil ───────────────────────── */

const inputCls =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10";

function ProgressRing({ value, total }) {
  const pct = total > 0 ? value / total : 0;
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative h-12 w-12 flex-shrink-0"
      role="img"
      aria-label={`${value} dari ${total} langkah selesai`}
    >
      <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="3"
        />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="#10b981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - pct * c}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-slate-700">
        {value}/{total}
      </span>
    </div>
  );
}

function StepMarker({ step, state }) {
  // state: done | error | active | idle
  const cls =
    state === "done"
      ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"
      : state === "error"
        ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200"
        : state === "active"
          ? step.danger
            ? "bg-rose-600 text-white"
            : "bg-slate-900 text-white"
          : "bg-white text-slate-400 ring-1 ring-slate-200";
  return (
    <span
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${cls}`}
    >
      {state === "done" ? (
        <Check className="h-4 w-4" />
      ) : state === "error" ? (
        <X className="h-4 w-4" />
      ) : (
        step.id
      )}
    </span>
  );
}

function FilePicker({ icon: Icon, file, onChange, placeholder, hint }) {
  return (
    <label className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 sm:py-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition group-hover:text-indigo-500">
        <Icon className="h-5 w-5" />
      </span>
      <span className="max-w-full truncate text-sm font-medium text-slate-700">
        {file ? file.name : placeholder}
      </span>
      <span className="max-w-xs text-xs leading-relaxed text-slate-400">
        {hint}
      </span>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="sr-only"
      />
    </label>
  );
}

/* ───────────────────────── Halaman ───────────────────────── */

export default function OnboardingPage() {
  const router = useRouter();
  const [activeId, setActiveId] = useState(1);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState({});
  const [form, setForm] = useState({
    tahun: "",
    semester: "1",
    mulai: "",
    akhir: "",
  });
  const [siswaFile, setSiswaFile] = useState(null);
  const [guruFile, setGuruFile] = useState(null);

  const setStep = (id, type, text) =>
    setStatus((prev) => ({ ...prev, [id]: { type, text } }));

  const doneCount = useMemo(
    () => Object.values(status).filter((s) => s.type === "success").length,
    [status],
  );

  // Pastikan chip langkah aktif terlihat di stepper mobile
  useEffect(() => {
    document
      .getElementById(`chip-${activeId}`)
      ?.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
  }, [activeId]);

  async function run(id, fn) {
    setBusy(id);
    setStep(id, "loading", "Memproses...");
    try {
      const [type, text] = await fn();
      setStep(id, type, text);
      if (type === "success") {
        const idx = STEPS.findIndex((s) => s.id === id);
        const next = STEPS[idx + 1];
        if (next) setTimeout(() => setActiveId(next.id), 900);
      }
    } catch (e) {
      console.error(e);
      setStep(id, "error", e?.message || "Gagal.");
    } finally {
      setBusy(null);
    }
  }

  const handlers = {
    1: () =>
      run(1, async () => {
        const res = await backupDatabase();
        if (res.error) return ["error", res.error];
        if (res.url) {
          const a = document.createElement("a");
          a.href = res.url;
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        return ["success", `Backup dibuat: ${res.key}`];
      }),
    2: () =>
      run(2, async () => {
        const res = await getExportSiswaKelas();
        if (res.error) return ["error", res.error];
        const wb = new ExcelJS.Workbook();
        addSheet(
          wb,
          "Siswa",
          ["nama_siswa", "nis", "nisn", "jenis_kelamin", "kelas", "tingkat"],
          res.siswa,
        );
        addSheet(
          wb,
          "Daftar Kelas",
          ["nama_kelas"],
          res.kelasNames.map((k) => ({ nama_kelas: k })),
        );
        await saveWorkbook(wb, "export-siswa-kelas.xlsx");
        return [
          "success",
          `${res.siswa.length} siswa, ${res.kelasNames.length} kelas.`,
        ];
      }),
    3: () =>
      run(3, async () => {
        const res = await getExportWaliPendamping();
        if (res.error) return ["error", res.error];
        const wb = new ExcelJS.Workbook();
        addSheet(
          wb,
          "Wali & Pendamping",
          ["kelas", "tingkat", "walikelas", "pendamping"],
          res.rows,
        );
        addSheet(
          wb,
          "Walikelas",
          ["username", "nama_lengkap", "no_whatsapp", "role"],
          res.walikelas,
        );
        addSheet(
          wb,
          "Guru Mapel",
          ["username", "nama_lengkap", "no_whatsapp", "role"],
          res.guruMapel,
        );
        await saveWorkbook(wb, "export-guru.xlsx");
        return [
          "success",
          `${res.rows.length} kelas · ${res.walikelas.length} walikelas · ${res.guruMapel.length} guru mapel.`,
        ];
      }),
    4: () =>
      run(4, async () => {
        const res = await getExportAbsensiSemester();
        if (res.error) return ["error", res.error];
        const wb = new ExcelJS.Workbook();
        res.semesters.forEach((sem) => {
          addSheet(
            wb,
            sem.label,
            [
              "nama_siswa",
              "kelas",
              "tingkat",
              "hadir",
              "sakit",
              "izin",
              "alpha",
            ],
            sem.rows,
          );
        });
        if (res.semesters.length === 0)
          addSheet(
            wb,
            "Kosong",
            ["info"],
            [{ info: "Belum ada data semester" }],
          );
        await saveWorkbook(wb, "export-absensi-per-semester.xlsx");
        return ["success", `${res.semesters.length} sheet semester.`];
      }),
    5: () =>
      run(5, async () => {
        const res = await getExportNilaiPerKelas();
        if (res.error) return ["error", res.error];
        const wb = new ExcelJS.Workbook();
        res.perKelas.forEach((k) => {
          addSheet(
            wb,
            k.kelas || "Kelas",
            ["nama_siswa", "nis", ...k.mapel],
            k.siswa,
          );
        });
        if (res.perKelas.length === 0)
          addSheet(wb, "Kosong", ["info"], [{ info: "Belum ada kelas" }]);
        await saveWorkbook(wb, "export-nilai-per-kelas.xlsx");
        return ["success", `${res.perKelas.length} sheet kelas.`];
      }),
    6: () =>
      run(6, async () => {
        if (
          !window.confirm(
            "Hapus SELURUH data nilai, agenda, dan absensi? Tindakan ini tidak bisa dibatalkan.",
          )
        )
          return ["error", "Dibatalkan."];
        const res = await deleteNilaiAgendaAbsensi();
        if (res.error) return ["error", res.error];
        return ["success", "Data nilai, agenda, dan absensi dihapus."];
      }),
    7: () =>
      run(7, async () => {
        if (
          !window.confirm(
            "Hapus SEMUA tahun ajaran lama dan tambah yang baru? Pastikan sudah backup.",
          )
        )
          return ["error", "Dibatalkan."];
        const res = await resetSemester(form);
        if (res.error) return ["error", res.error];
        return ["success", "Semester & tahun ajaran baru dibuat."];
      }),
    8: () =>
      run(8, async () => {
        if (!siswaFile) return ["error", "Pilih file Excel siswa dulu."];
        if (
          !window.confirm(
            "Import siswa? Siswa lama yang NIS-nya tidak ada di Excel akan DIHAPUS.",
          )
        )
          return ["error", "Dibatalkan."];
        const rows = await readExcel(siswaFile);
        const res = await importSiswa(rows);
        if (res.error) return ["error", res.error];
        return [
          "success",
          `Update ${res.updated}, tambah ${res.created}, hapus ${res.deleted}.`,
        ];
      }),
    9: () =>
      run(9, async () => {
        if (!guruFile) return ["error", "Pilih file Excel guru dulu."];
        const rows = await readExcel(guruFile);
        const res = await importGuru(rows);
        if (res.error) return ["error", res.error];
        return [
          "success",
          `Update ${res.updated}, dilewati ${res.skipped}, nonaktif ${res.nonaktif}.`,
        ];
      }),
  };

  const activeIndex = STEPS.findIndex((s) => s.id === activeId);
  const step = STEPS[activeIndex];
  const st = status[step.id];
  const isBusy = busy === step.id;
  const prevStep = STEPS[activeIndex - 1];
  const nextStep = STEPS[activeIndex + 1];
  const StepIcon = step.icon;
  const groupLabel = GROUPS.find((g) => g.id === step.group)?.label;

  const stateOf = (s) => {
    const t = status[s.id]?.type;
    if (t === "success") return "done";
    if (t === "error") return "error";
    if (s.id === activeId) return "active";
    return "idle";
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      {/* Heading */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Onboarding semester baru
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500">
            Ikuti {STEPS.length} langkah berikut secara berurutan untuk
            mengganti semester dan tahun ajaran. Backup dulu sebelum menghapus
            data.
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          <ProgressRing value={doneCount} total={STEPS.length} />
          <button
            type="button"
            onClick={() => router.push("/ict")}
            aria-label="Tutup"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Stepper mobile / tablet */}
      <nav
        aria-label="Daftar langkah"
        className="-mx-4 mt-6 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ol className="flex w-max items-center gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <button
                id={`chip-${s.id}`}
                type="button"
                onClick={() => setActiveId(s.id)}
                aria-label={`Langkah ${s.id}: ${s.title}`}
                aria-current={s.id === activeId ? "step" : undefined}
                className={`rounded-full p-0.5 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 ${
                  s.id === activeId ? "ring-2 ring-slate-300 ring-offset-2" : ""
                }`}
              >
                <StepMarker step={s} state={stateOf(s)} />
              </button>
              {i < STEPS.length - 1 && (
                <span className="h-px w-4 bg-slate-200" />
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* Sidebar desktop */}
        <aside className="hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:block">
          <nav aria-label="Daftar langkah" className="space-y-5">
            {GROUPS.map((g) => (
              <div key={g.id}>
                <p className="px-3 pb-1.5 text-xs font-semibold text-slate-400">
                  {g.label}
                </p>
                <ul className="space-y-0.5">
                  {STEPS.filter((s) => s.group === g.id).map((s) => {
                    const state = stateOf(s);
                    const isActive = s.id === activeId;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setActiveId(s.id)}
                          aria-current={isActive ? "step" : undefined}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 ${
                            isActive ? "bg-slate-100" : "hover:bg-slate-50"
                          }`}
                        >
                          <StepMarker step={s} state={state} />
                          <span
                            className={`flex-1 text-sm leading-snug ${
                              isActive
                                ? "font-semibold text-slate-900"
                                : state === "done"
                                  ? "text-slate-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {s.title}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Konten langkah */}
        <section
          aria-live="polite"
          className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
        >
          <div className="flex items-start gap-4">
            <span
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${
                step.danger
                  ? "bg-rose-50 text-rose-600 ring-1 ring-rose-100"
                  : "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100"
              }`}
            >
              <StepIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>
                  Langkah {step.id} dari {STEPS.length}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                  {groupLabel}
                </span>
                {step.danger && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-600 ring-1 ring-inset ring-rose-100">
                    Berbahaya
                  </span>
                )}
              </div>
              <h2 className="mt-1.5 text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                {step.title}
              </h2>
            </div>
          </div>

          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-600">
            {step.detail}
          </p>

          {step.id === 6 && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <span>
                Data yang dihapus tidak bisa dikembalikan. Selesaikan langkah
                1–5 dulu.
              </span>
            </div>
          )}

          {/* Body per langkah */}
          {step.id === 7 && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tahun ajaran
                </span>
                <input
                  className={inputCls}
                  placeholder="2027/2028"
                  value={form.tahun}
                  onChange={(e) => setForm({ ...form, tahun: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Semester
                </span>
                <select
                  className={inputCls}
                  value={form.semester}
                  onChange={(e) =>
                    setForm({ ...form, semester: e.target.value })
                  }
                >
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tanggal mulai
                </span>
                <input
                  type="date"
                  className={inputCls}
                  value={form.mulai}
                  onChange={(e) => setForm({ ...form, mulai: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tanggal akhir
                </span>
                <input
                  type="date"
                  className={inputCls}
                  value={form.akhir}
                  onChange={(e) => setForm({ ...form, akhir: e.target.value })}
                />
              </label>
            </div>
          )}

          {step.id === 8 && (
            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Belum punya formatnya? Unduh template dulu.
                </p>
                <button
                  type="button"
                  onClick={downloadSiswaTemplate}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 px-4 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh template
                </button>
              </div>
              <FilePicker
                icon={FileUp}
                file={siswaFile}
                onChange={setSiswaFile}
                placeholder="Pilih file Excel siswa (.xlsx)"
                hint="Header: nis, nama_siswa, nisn, jenis_kelamin, kelas"
              />
            </div>
          )}

          {step.id === 9 && (
            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Belum punya formatnya? Unduh template dulu.
                </p>
                <button
                  type="button"
                  onClick={downloadGuruTemplate}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 px-4 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh template
                </button>
              </div>
              <FilePicker
                icon={GraduationCap}
                file={guruFile}
                onChange={setGuruFile}
                placeholder="Pilih file Excel guru (.xlsx)"
                hint="Header: username, nama_lengkap, no_whatsapp, role"
              />
            </div>
          )}

          {/* Status hasil */}
          {st && st.type !== "loading" && (
            <div
              role="status"
              className={`mt-6 flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${
                st.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {st.type === "success" ? (
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
              ) : (
                <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
              )}
              <span className="min-w-0 break-words">{st.text}</span>
            </div>
          )}

          {/* Aksi */}
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() =>
                prevStep ? setActiveId(prevStep.id) : router.push("/ict")
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 px-5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => handlers[step.id]()}
              className={`inline-flex h-11 min-w-[190px] items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${
                step.danger
                  ? "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500/25"
                  : "bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500/25"
              }`}
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : step.danger ? (
                step.id === 7 ? (
                  "Reset semester"
                ) : (
                  "Hapus data"
                )
              ) : nextStep ? (
                <>
                  Jalankan &amp; lanjut
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                "Jalankan"
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
