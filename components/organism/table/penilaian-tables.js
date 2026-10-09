"use client";

// ================================================================
// TABEL PENILAIAN
// Simpan di folder yang sama dengan page.jsx, lalu import:
//   import { FormatifTable, SumatifTable, UjianTable, RaporTable }
//     from "./penilaian-tables";
//
// Prinsip layout:
// - Satu set style bersama (TH, TD, bayangan sticky) untuk semua tabel.
// - Kolom kiri (No + Siswa) dan kolom kanan (Nilai akhir) sticky,
//   dengan bayangan tipis supaya terlihat saat tabel digeser.
// - Tinggi baris seragam di desktop (nama dipotong, lengkap di tooltip).
// - Zebra + highlight saat hover, termasuk di kolom sticky.
// - Nilai akhir tampil sebagai badge merah/hijau, bukan teks polos.
// ================================================================

// ---------- util ----------
export function formatGrade(value) {
  if (value === null || value === undefined || value === -1) return "-";
  const num = Number(value);
  if (isNaN(num) || num < 0) return "-";
  const clamped = Math.min(num, 99.99);
  const [whole, decimal] = clamped.toFixed(2).split(".");
  return `${whole.padStart(2, "0")}.${decimal}`;
}

function gradeTone(value) {
  if (
    value === null ||
    value === undefined ||
    value === -1 ||
    isNaN(Number(value))
  )
    return "empty";
  return Number(value) < 70 ? "low" : "ok";
}

const BADGE_TONE = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  low: "bg-red-50 text-red-700 ring-red-100",
  empty: "bg-slate-100 text-slate-400 ring-slate-100",
};

export function GradeBadge({ value, className = "" }) {
  return (
    <span
      className={`inline-flex min-w-[64px] items-center justify-center rounded-md px-2 py-1 font-mono text-[13px] font-bold tabular-nums ring-1 ring-inset ${BADGE_TONE[gradeTone(value)]} ${className}`}
    >
      {formatGrade(value)}
    </span>
  );
}

// ---------- style bersama ----------
const TH =
  "border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500";
const TD = "border-b border-slate-100 transition-colors";
const GROUP_EDGE = "border-l border-l-slate-300";
const SHADOW_L = "shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)]";
// Kolom kanan hanya sticky di layar >= sm; di mobile ikut di-scroll
const SHADOW_R = "sm:shadow-[-4px_0_6px_-4px_rgba(15,23,42,0.18)]";

function rowBg(idx) {
  return `${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} group-hover:bg-blue-50`;
}

function Scroller({ children }) {
  return (
    <div className="max-h-[72vh] overflow-auto overscroll-contain">
      {children}
    </div>
  );
}

function TrashButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  );
}

// ---------- input nilai ----------
export function NilaiInput({
  value,
  status,
  disabled,
  onSave,
  width = "w-16",
  col,
}) {
  const empty = value === -1 || value === null || value === undefined;
  const tone = !empty && Number(value) < 70 ? "text-red-600" : "text-slate-800";

  const state =
    status === "error"
      ? "border-red-400 bg-red-50"
      : status === "saving"
        ? "border-blue-300 bg-blue-50"
        : status === "saved"
          ? "border-emerald-400 bg-emerald-50"
          : "border-slate-200 bg-white hover:border-slate-300";

  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      data-col={col}
      max={100}
      step="0.1"
      disabled={disabled}
      defaultValue={empty ? "" : value}
      placeholder="–"
      onFocus={(e) => e.target.select()}
      onBlur={(e) => onSave(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`${width} h-8 rounded-md border px-1 text-center text-[13px] font-semibold tabular-nums ${tone} placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-100 disabled:text-slate-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${state}`}
    />
  );
}

// ---------- kolom siswa (sticky kiri) ----------
function SiswaHead({ rowSpan = 1 }) {
  return (
    <>
      <th
        rowSpan={rowSpan}
        className={`${TH} sticky left-0 top-0 z-30 hidden h-11 w-12 min-w-[48px] border-r px-2 text-center sm:table-cell`}
      >
        No
      </th>
      <th
        rowSpan={rowSpan}
        className={`${TH} sticky left-0 top-0 z-30 h-11 w-[120px] min-w-[120px] border-r px-3 text-left sm:left-12 sm:w-[220px] sm:min-w-[220px] sm:px-4 ${SHADOW_L}`}
      >
        Siswa
      </th>
    </>
  );
}

function SiswaCells({ idx, nama, bg }) {
  return (
    <>
      <td
        className={`${TD} sticky left-0 z-10 hidden w-12 min-w-[48px] border-r px-2 text-center text-xs tabular-nums text-slate-400 sm:table-cell ${bg}`}
      >
        {idx + 1}
      </td>
      <td
        title={nama}
        className={`${TD} sticky left-0 z-10 w-[120px] min-w-[120px] max-w-[120px] border-r px-3 py-1.5 text-[13px] font-medium leading-snug text-slate-800 sm:left-12 sm:w-[220px] sm:min-w-[220px] sm:max-w-[220px] sm:px-4 sm:text-sm ${SHADOW_L} ${bg}`}
      >
        <div className="flex items-start gap-1 sm:items-center">
          <span className="shrink-0 text-xs font-normal text-slate-400 sm:hidden">
            {idx + 1}.
          </span>
          <span className="min-w-0 break-words sm:truncate">{nama}</span>
        </div>
      </td>
    </>
  );
}

// ================================================================
// FORMATIF
// ================================================================
export function FormatifTable({
  siswaList,
  tpList,
  kriteria,
  nilai,
  avgMap,
  cellStatus,
  onSave, // (siswaId, tpId, kField, rawValue)
  onDeleteTp, // (tp)
}) {
  return (
    <Scroller>
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <SiswaHead rowSpan={2} />
            {tpList.map((tp) => (
              <th
                key={tp.id}
                colSpan={kriteria.length}
                className={`${TH} ${GROUP_EDGE} sticky top-0 z-20 h-11 px-2 text-center`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-sm font-bold text-slate-700">
                    {tp.no_tp}
                  </span>
                  <TrashButton
                    label={`Hapus ${tp.no_tp}`}
                    onClick={() => onDeleteTp(tp)}
                  />
                </div>
              </th>
            ))}
            <th
              rowSpan={2}
              className={`${TH} sticky top-0 z-20 sm:right-0 sm:z-30 h-11 min-w-[96px] whitespace-nowrap border-l px-3 text-center sm:min-w-[112px] ${SHADOW_R}`}
            >
              Nilai akhir
            </th>
          </tr>
          <tr>
            {tpList.map((tp) =>
              kriteria.map((k, i) => (
                <th
                  key={`${tp.id}-${k}`}
                  className={`${TH} sticky top-11 z-20 h-8 min-w-[52px] text-center sm:min-w-[64px] ${
                    i === 0 ? GROUP_EDGE : ""
                  }`}
                >
                  {k.toUpperCase()}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {siswaList.map((siswa, idx) => {
            const bg = rowBg(idx);
            return (
              <tr key={siswa.id} className="group">
                <SiswaCells idx={idx} nama={siswa.nama_siswa} bg={bg} />
                {tpList.map((tp) => {
                  const rec = nilai[siswa.id]?.[tp.id];
                  return kriteria.map((k, i) => {
                    const cellKey = `f-${siswa.id}-${tp.id}-${k}`;
                    return (
                      <td
                        key={cellKey}
                        className={`${TD} px-0.5 py-1 text-center sm:px-1 ${bg} ${
                          i === 0 ? GROUP_EDGE : ""
                        }`}
                      >
                        <NilaiInput
                          value={rec?.[k]}
                          status={cellStatus[cellKey]}
                          onSave={(v) => onSave(siswa.id, tp.id, k, v)}
                          width="w-12 sm:w-14"
                        />
                      </td>
                    );
                  });
                })}
                <td
                  className={`${TD} sm:sticky sm:right-0 sm:z-10 whitespace-nowrap border-l border-l-slate-200 px-3 text-center ${SHADOW_R} ${bg}`}
                >
                  <GradeBadge value={avgMap[siswa.id]} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Scroller>
  );
}

// ================================================================
// SUMATIF
// ================================================================
export function SumatifTable({
  siswaList,
  lpList,
  nilai,
  avgMap,
  cellStatus,
  onSave, // (siswaId, lpId, rawValue)
  onDeleteLp, // (lp)
}) {
  return (
    <Scroller>
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <SiswaHead />
            {lpList.map((lp) => (
              <th
                key={lp.id}
                className={`${TH} sticky top-0 z-20 h-11 min-w-[140px] px-3 text-center`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span
                    title={lp.nama}
                    className="max-w-[120px] truncate text-sm font-bold text-slate-700"
                  >
                    {lp.nama}
                  </span>
                  <TrashButton
                    label={`Hapus ${lp.nama}`}
                    onClick={() => onDeleteLp(lp)}
                  />
                </div>
              </th>
            ))}
            <th
              className={`${TH} sticky top-0 z-20 sm:right-0 sm:z-30 h-11 min-w-[96px] whitespace-nowrap border-l px-3 text-center sm:min-w-[112px] ${SHADOW_R}`}
            >
              Nilai akhir
            </th>
          </tr>
        </thead>
        <tbody>
          {siswaList.map((siswa, idx) => {
            const bg = rowBg(idx);
            return (
              <tr key={siswa.id} className="group">
                <SiswaCells idx={idx} nama={siswa.nama_siswa} bg={bg} />
                {lpList.map((lp) => {
                  const cellKey = `s-${siswa.id}-${lp.id}`;
                  return (
                    <td
                      key={lp.id}
                      className={`${TD} px-3 py-1 text-center ${bg}`}
                    >
                      <NilaiInput
                        value={nilai[siswa.id]?.[lp.id]?.nilai}
                        status={cellStatus[cellKey]}
                        onSave={(v) => onSave(siswa.id, lp.id, v)}
                        width="w-20"
                      />
                    </td>
                  );
                })}
                <td
                  className={`${TD} sm:sticky sm:right-0 sm:z-10 whitespace-nowrap border-l border-l-slate-200 px-3 text-center ${SHADOW_R} ${bg}`}
                >
                  <GradeBadge value={avgMap[siswa.id]} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Scroller>
  );
}

// ================================================================
// Navigasi keyboard: Enter / ↓ pindah ke input bawah, ↑ ke atas
// ================================================================
function moveFocus(e) {
  if (e.target.tagName !== "INPUT") return;
  const dir =
    e.key === "Enter" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowUp"
        ? -1
        : 0;
  if (!dir) return;
  e.preventDefault();
  const inputs = Array.from(
    e.currentTarget.querySelectorAll("input:not(:disabled)"),
  );
  const next = inputs[inputs.indexOf(e.target) + dir];
  if (next) next.focus();
}

// ================================================================
// UJIAN
// `nilai` = nilaiUjian[selectedUjianId] (map siswaId -> { nilai })
// ================================================================
// export function UjianTable({
//   siswaList,
//   nilai = {},
//   ujianId,
//   cellStatus,
//   onSave, // (siswaId, rawValue)
// }) {
//   return (
//     <Scroller>
//       <table className="w-full border-separate border-spacing-0 text-sm">
//         <thead>
//           <tr>
//             <th
//               className={`${TH} sticky top-0 z-20 h-11 w-12 border-r px-2 text-center`}
//             >
//               No
//             </th>
//             <th
//               className={`${TH} sticky top-0 z-20 h-11 px-3 text-left sm:px-4`}
//             >
//               Siswa
//             </th>
//             <th
//               className={`${TH} sticky top-0 z-20 h-11 w-32 border-l px-3 text-center sm:w-56 sm:px-4`}
//             >
//               Nilai ujian
//             </th>
//           </tr>
//         </thead>
//         <tbody onKeyDown={moveFocus}>
//           {siswaList.map((siswa, idx) => {
//             const bg = rowBg(idx);
//             const cellKey = `u-${siswa.id}`;
//             return (
//               <tr key={siswa.id} className="group">
//                 <td
//                   className={`${TD} border-r px-2 text-center text-xs tabular-nums text-slate-400 ${bg}`}
//                 >
//                   {idx + 1}
//                 </td>
//                 <td
//                   className={`${TD} px-3 py-1.5 text-[13px] font-medium leading-snug text-slate-800 sm:px-4 sm:text-sm ${bg}`}
//                 >
//                   {siswa.nama_siswa}
//                 </td>
//                 <td
//                   className={`${TD} border-l px-3 py-1 text-center sm:px-4 ${bg}`}
//                 >
//                   <NilaiInput
//                     key={`${siswa.id}-${ujianId}`}
//                     value={nilai[siswa.id]?.nilai}
//                     status={cellStatus[cellKey]}
//                     onSave={(v) => onSave(siswa.id, v)}
//                     width="w-20"
//                   />
//                 </td>
//               </tr>
//             );
//           })}
//         </tbody>
//       </table>
//     </Scroller>
//   );
// }

const JENIS_LABEL = {
  ahb: "UTS",
  asas: "UAS",
  asat: "Akhir Tahun",
  lainnya: "Lainnya",
};

function moveFocusColumn(e) {
  if (e.target.tagName !== "INPUT") return;
  const dir =
    e.key === "Enter" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowUp"
        ? -1
        : 0;
  if (!dir) return;
  e.preventDefault();
  const col = e.target.dataset.col;
  const inputs = Array.from(
    e.currentTarget.querySelectorAll(`input[data-col="${col}"]:not(:disabled)`),
  );
  const next = inputs[inputs.indexOf(e.target) + dir];
  if (next) next.focus();
}

export function UjianTable({
  siswaList,
  ujianList = [],
  nilai = {},
  cellStatus = {},
  onSave, // (siswaId, ujianId, rawValue)
}) {
  const multi = ujianList.length > 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <Scroller>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 h-14 border-b border-r border-slate-100 bg-slate-50 px-6 text-left text-[11px] font-bold uppercase tracking-widest text-slate-400 shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)]">
                Nama Siswa
              </th>
              {ujianList.map((u) => (
                <th
                  key={u.id}
                  className="sticky top-0 z-20 h-14 w-[180px] border-b border-l border-slate-100 bg-blue-50/60 px-6 text-center text-[11px] font-bold uppercase tracking-widest text-blue-600"
                >
                  <div className="truncate" title={u.nama_ujian}>
                    {multi ? u.nama_ujian : "Nilai Ujian"}
                  </div>
                </th>
              ))}
              {ujianList.length === 0 && (
                <th className="sticky top-0 z-20 h-14 w-[180px] border-b border-l border-slate-100 bg-blue-50/60 px-6 text-center text-[11px] font-bold uppercase tracking-widest text-blue-600">
                  Nilai Ujian
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {siswaList.map((siswa) => (
              <tr key={siswa.id} className="group">
                <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-6 py-3 text-sm font-bold uppercase tracking-wide text-slate-700 shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)] transition-colors group-hover:bg-slate-50">
                  {siswa.nama_siswa}
                </td>
                {ujianList.map((u) => {
                  const cellKey = `u-${u.id}-${siswa.id}`;
                  return (
                    <td
                      key={u.id}
                      className="border-b border-l border-slate-100 bg-white px-6 py-2 text-center transition-colors group-hover:bg-blue-50/30"
                    >
                      <div className="flex justify-center">
                        <NilaiInput
                          key={`${u.id}-${siswa.id}`}
                          value={nilai[u.id]?.[siswa.id]?.nilai}
                          status={cellStatus[cellKey]}
                          onSave={(v) => onSave(siswa.id, u.id, v)}
                          width="w-24"
                          col={u.id}
                        />
                      </div>
                    </td>
                  );
                })}
                {ujianList.length === 0 && (
                  <td className="border-b border-l border-slate-100 bg-white px-6 py-2 text-center text-slate-400">
                    —
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
    </div>
  );
}

// ================================================================
// RAPOR
// rows = { formatif, sumatif, uts, uas, akhir } (masing-masing map siswaId -> nilai)
// ================================================================
const RAPOR_KOMPONEN = [
  ["formatif", "Formatif"],
  ["sumatif", "Sumatif"],
  ["uts", "UTS"],
  ["uas", "UAS"],
];

export function RaporTable({ siswaList, rows }) {
  return (
    <Scroller>
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <SiswaHead />
            {RAPOR_KOMPONEN.map(([key, label]) => (
              <th
                key={key}
                className={`${TH} sticky top-0 z-20 h-11 min-w-[96px] px-3 text-center`}
              >
                {label}
              </th>
            ))}
            <th
              className={`${TH} sticky top-0 z-20 sm:right-0 sm:z-30 h-11 min-w-[112px] whitespace-nowrap border-l px-3 text-center ${SHADOW_R}`}
            >
              Nilai akhir
            </th>
          </tr>
        </thead>
        <tbody>
          {siswaList.map((siswa, idx) => {
            const bg = rowBg(idx);
            return (
              <tr key={siswa.id} className="group">
                <SiswaCells idx={idx} nama={siswa.nama_siswa} bg={bg} />
                {RAPOR_KOMPONEN.map(([key]) => (
                  <td
                    key={key}
                    className={`${TD} whitespace-nowrap px-3 py-2 text-center ${bg}`}
                  >
                    <GradeBadge value={rows[key]?.[siswa.id]} />
                  </td>
                ))}
                <td
                  className={`${TD} sm:sticky sm:right-0 sm:z-10 whitespace-nowrap border-l border-l-slate-200 px-3 text-center ${SHADOW_R} ${bg}`}
                >
                  <GradeBadge
                    value={rows.akhir?.[siswa.id]}
                    className="min-w-[72px] !text-sm"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Scroller>
  );
}
