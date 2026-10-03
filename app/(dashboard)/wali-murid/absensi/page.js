// "use client";

// import { useCallback, useEffect, useMemo, useState } from "react";
// import { useRouter } from "next/navigation";
// import { pb, isAuthenticated, getCurrentUser } from "@/lib/pocketbase";

// app/(dashboard)/wali-murid/absensi/page.tsx
export default function AbsensiPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Halaman Absensi</h1>
      <p className="text-gray-500">Halaman ini belum tersedia.</p>
    </div>
  );
}

// // =========================================================
// // Konfigurasi status
// // =========================================================
// const STATUS_CONFIG = {
//   hadir: {
//     label: "Hadir",
//     dot: "bg-emerald-500",
//     chip: "bg-emerald-50 text-emerald-700 border border-emerald-200",
//     softBg: "bg-emerald-50",
//     ring: "ring-emerald-200",
//     bar: "bg-gradient-to-t from-emerald-600 to-emerald-400",
//     emoji: "✓",
//   },
//   izin: {
//     label: "Izin",
//     dot: "bg-sky-500",
//     chip: "bg-sky-50 text-sky-700 border border-sky-200",
//     softBg: "bg-sky-50",
//     ring: "ring-sky-200",
//     bar: "bg-gradient-to-t from-sky-600 to-sky-400",
//     emoji: "📝",
//   },
//   sakit: {
//     label: "Sakit",
//     dot: "bg-amber-500",
//     chip: "bg-amber-50 text-amber-700 border border-amber-200",
//     softBg: "bg-amber-50",
//     ring: "ring-amber-200",
//     bar: "bg-gradient-to-t from-amber-600 to-amber-400",
//     emoji: "🤒",
//   },
//   alpha: {
//     label: "Alpha",
//     dot: "bg-rose-500",
//     chip: "bg-rose-50 text-rose-700 border border-rose-200",
//     softBg: "bg-rose-50",
//     ring: "ring-rose-200",
//     bar: "bg-gradient-to-t from-rose-600 to-rose-400",
//     emoji: "✕",
//   },
// };
// const STATUS_ORDER = ["hadir", "izin", "sakit", "alpha"];

// const HARI_PANJANG = [
//   "Minggu",
//   "Senin",
//   "Selasa",
//   "Rabu",
//   "Kamis",
//   "Jumat",
//   "Sabtu",
// ];
// const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
// const BULAN = [
//   "Januari",
//   "Februari",
//   "Maret",
//   "April",
//   "Mei",
//   "Juni",
//   "Juli",
//   "Agustus",
//   "September",
//   "Oktober",
//   "November",
//   "Desember",
// ];
// const BULAN_SHORT = [
//   "Jan",
//   "Feb",
//   "Mar",
//   "Apr",
//   "Mei",
//   "Jun",
//   "Jul",
//   "Agu",
//   "Sep",
//   "Okt",
//   "Nov",
//   "Des",
// ];

// // =========================================================
// // Helper
// // =========================================================
// function pad(n) {
//   return String(n).padStart(2, "0");
// }
// function toISODate(d) {
//   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// }
// function startOfDay(d) {
//   const x = new Date(d);
//   x.setHours(0, 0, 0, 0);
//   return x;
// }
// function formatShort(dateStr) {
//   const [y, m, d] = dateStr.split("-").map(Number);
//   return `${d} ${BULAN[m - 1]} ${y}`;
// }
// function isWeekend(date) {
//   const d = date.getDay();
//   return d === 0 || d === 6;
// }

// // =========================================================
// // Card (shared)
// // =========================================================
// function Card({ title, subtitle, action, children, className = "" }) {
//   return (
//     <div
//       className={`rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(99,120,200,0.10)] ${className}`}
//     >
//       {(title || action) && (
//         <div className="mb-4 flex items-start justify-between gap-3">
//           <div className="min-w-0">
//             {title && (
//               <h2 className="text-[15px] font-bold leading-tight text-gray-900">
//                 {title}
//               </h2>
//             )}
//             {subtitle && (
//               <p className="mt-1 text-[12px] text-gray-400">{subtitle}</p>
//             )}
//           </div>
//           {action && <div className="flex-shrink-0">{action}</div>}
//         </div>
//       )}
//       {children}
//     </div>
//   );
// }

// // =========================================================
// // Toast
// // =========================================================
// function Toast({ toast, onClose }) {
//   useEffect(() => {
//     if (!toast) return;
//     const t = setTimeout(onClose, 4000);
//     return () => clearTimeout(t);
//   }, [toast, onClose]);
//   if (!toast) return null;
//   const ok = toast.type === "success";
//   return (
//     <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
//       <div
//         className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
//           ok
//             ? "border-emerald-200 bg-emerald-50 text-emerald-800"
//             : "border-rose-200 bg-rose-50 text-rose-800"
//         }`}
//       >
//         <span
//           className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${ok ? "bg-emerald-500" : "bg-rose-500"}`}
//         >
//           {ok ? "✓" : "!"}
//         </span>
//         <p className="flex-1 text-sm font-medium">{toast.text}</p>
//         <button
//           onClick={onClose}
//           className="text-lg leading-none opacity-50 hover:opacity-100"
//         >
//           ×
//         </button>
//       </div>
//     </div>
//   );
// }

// // =========================================================
// // Chart Trend Per-Hari (style admin)
// // =========================================================
// function AttendanceTrendChart({
//   weeklyData,
//   monthlyData,
//   viewMode,
//   onViewChange,
// }) {
//   const data = viewMode === "weekly" ? weeklyData : monthlyData;
//   const isMonthly = viewMode === "monthly";
//   const BAR_HEIGHT = 180;

//   if (!data || data.length === 0) {
//     return <p className="text-sm text-slate-400">Belum ada data absensi.</p>;
//   }

//   // Tinggi batang berdasarkan status (visual grading)
//   const getHeight = (status) => {
//     switch (status) {
//       case "hadir":
//         return BAR_HEIGHT;
//       case "sakit":
//         return BAR_HEIGHT * 0.55;
//       case "izin":
//         return BAR_HEIGHT * 0.55;
//       case "alpha":
//         return BAR_HEIGHT * 0.25;
//       default:
//         return 10;
//     }
//   };

//   const getBarClass = (status) =>
//     status ? STATUS_CONFIG[status].bar : "bg-slate-200";

//   const barMinWidth = isMonthly ? 32 : 48;

//   const TAB = [
//     { id: "weekly", label: "Minggu Ini" },
//     { id: "monthly", label: "Bulan Ini" },
//   ];

//   return (
//     <div>
//       {/* Legend + Toggle */}
//       <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
//         <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
//           {STATUS_ORDER.map((s) => (
//             <span key={s} className="flex items-center gap-1.5">
//               <span
//                 className={`h-2.5 w-2.5 rounded-sm ${STATUS_CONFIG[s].dot}`}
//               />
//               {STATUS_CONFIG[s].label}
//             </span>
//           ))}
//           <span className="flex items-center gap-1.5">
//             <span className="h-2.5 w-2.5 rounded-sm bg-slate-200" />
//             Belum ada data
//           </span>
//         </div>
//         <div className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-0.5">
//           {TAB.map((t) => (
//             <button
//               key={t.id}
//               type="button"
//               onClick={() => onViewChange(t.id)}
//               className={`rounded-md px-3 py-1 text-xs font-medium transition ${
//                 viewMode === t.id
//                   ? "bg-indigo-500 text-white"
//                   : "text-slate-600 hover:bg-slate-50"
//               }`}
//             >
//               {t.label}
//             </button>
//           ))}
//         </div>
//       </div>

//       {/* Chart */}
//       <div className="overflow-x-auto pb-2">
//         <div
//           className="flex items-end gap-1.5 sm:gap-3"
//           style={{ minWidth: `${data.length * barMinWidth}px` }}
//         >
//           {data.map((d) => {
//             const s = d.status;
//             const meta = s ? STATUS_CONFIG[s] : null;
//             const tooltip = s
//               ? `${d.dayLabel} ${d.dateLabel} • ${meta.label}`
//               : `${d.dayLabel} ${d.dateLabel} • belum ada data`;
//             return (
//               <div
//                 key={d.key}
//                 className="flex flex-1 flex-col items-center gap-2"
//               >
//                 <div
//                   className="flex w-full items-end justify-center"
//                   style={{ height: `${BAR_HEIGHT}px` }}
//                 >
//                   <div
//                     className={`w-full max-w-[28px] rounded-t-md transition-all duration-300 ${getBarClass(s)} ${
//                       s ? "opacity-100" : "opacity-60"
//                     }`}
//                     style={{ height: `${getHeight(s)}px` }}
//                     title={tooltip}
//                   />
//                 </div>
//                 <div className="text-center leading-tight">
//                   <p className="text-[10px] font-medium text-slate-600">
//                     {d.dayLabel}
//                   </p>
//                   {isMonthly && (
//                     <p className="text-[9px] text-slate-400">{d.dateLabel}</p>
//                   )}
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       </div>
//     </div>
//   );
// }

// // =========================================================
// // Halaman Utama
// // =========================================================
// export default function AbsensiSiswaPage() {
//   const router = useRouter();
//   const today = useMemo(() => startOfDay(new Date()), []);

//   // ---------------- Auth ----------------
//   const [checkingAuth, setCheckingAuth] = useState(true);
//   const [user, setUser] = useState(null);
//   const [message, setMessage] = useState(null);

//   useEffect(() => {
//     if (!isAuthenticated()) {
//       router.replace("/login");
//       return;
//     }
//     setUser(getCurrentUser());
//     setCheckingAuth(false);
//   }, [router]);

//   // ---------------- Resolusi siswa ----------------
//   const [siswa, setSiswa] = useState(null);
//   const [kelas, setKelas] = useState(null);
//   const [resolvingSiswa, setResolvingSiswa] = useState(true);
//   const [noSiswaAssigned, setNoSiswaAssigned] = useState(false);

//   useEffect(() => {
//     if (!user) return;
//     let cancelled = false;

//     async function resolve() {
//       setResolvingSiswa(true);
//       setNoSiswaAssigned(false);
//       try {
//         let siswaId =
//           user.siswa_id != null
//             ? Array.isArray(user.siswa_id)
//               ? user.siswa_id[0]
//               : user.siswa_id
//             : null;

//         if (!siswaId) {
//           try {
//             const rec = await pb
//               .collection("siswa")
//               .getOne(user.id, { requestKey: null });
//             if (!cancelled) {
//               setSiswa(rec);
//               const kid = Array.isArray(rec.kelas_id)
//                 ? rec.kelas_id[0]
//                 : rec.kelas_id;
//               if (kid) {
//                 try {
//                   const k = await pb
//                     .collection("kelas")
//                     .getOne(kid, { requestKey: null });
//                   if (!cancelled) setKelas(k);
//                 } catch {}
//               }
//             }
//             if (!cancelled) setResolvingSiswa(false);
//             return;
//           } catch {
//             if (!cancelled) setNoSiswaAssigned(true);
//             if (!cancelled) setResolvingSiswa(false);
//             return;
//           }
//         }

//         const rec = await pb
//           .collection("siswa")
//           .getOne(siswaId, { requestKey: null });
//         if (cancelled) return;
//         setSiswa(rec);

//         const kid = Array.isArray(rec.kelas_id)
//           ? rec.kelas_id[0]
//           : rec.kelas_id;
//         if (kid) {
//           try {
//             const k = await pb
//               .collection("kelas")
//               .getOne(kid, { requestKey: null });
//             if (!cancelled) setKelas(k);
//           } catch {}
//         }
//       } catch {
//         if (!cancelled) setNoSiswaAssigned(true);
//       } finally {
//         if (!cancelled) setResolvingSiswa(false);
//       }
//     }

//     resolve();
//     return () => {
//       cancelled = true;
//     };
//   }, [user]);

//   // =========================================================
//   // Chart data: per-hari
//   // =========================================================
//   const [chartRecords, setChartRecords] = useState([]);
//   const [loadingChart, setLoadingChart] = useState(false);
//   const [chartView, setChartView] = useState("weekly");

//   useEffect(() => {
//     if (!siswa) return;
//     let cancelled = false;

//     async function loadChart() {
//       setLoadingChart(true);
//       try {
//         const t = today;
//         const dow = t.getDay();
//         const offsetToMonday = dow === 0 ? 6 : dow - 1;
//         const monday = new Date(t);
//         monday.setDate(t.getDate() - offsetToMonday);
//         monday.setHours(0, 0, 0, 0);

//         const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
//         const earliest = monday < monthStart ? monday : monthStart;

//         const startStr = `${toISODate(earliest)} 00:00:00`;
//         const endStr = `${toISODate(t)} 23:59:59`;

//         const records = await pb.collection("absensi").getFullList({
//           filter: `siswa_id="${siswa.id}" && tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
//           requestKey: null,
//         });
//         if (!cancelled) setChartRecords(records);
//       } catch {
//         if (!cancelled) setChartRecords([]);
//       } finally {
//         if (!cancelled) setLoadingChart(false);
//       }
//     }

//     loadChart();
//     return () => {
//       cancelled = true;
//     };
//   }, [siswa, today]);

//   // Bangun data per-hari (skip Sabtu & Minggu)
//   const chartDays = useMemo(() => {
//     const t = today;
//     const dow = t.getDay();
//     const offsetToMonday = dow === 0 ? 6 : dow - 1;
//     const monday = new Date(t);
//     monday.setDate(t.getDate() - offsetToMonday);
//     monday.setHours(0, 0, 0, 0);

//     const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
//     monthStart.setHours(0, 0, 0, 0);

//     // Map tanggal → status
//     const byDate = {};
//     for (const r of chartRecords) {
//       const key = (r.tanggal || "").slice(0, 10);
//       if (key) byDate[key] = r.status;
//     }

//     const buildDays = (start, end) => {
//       const arr = [];
//       const cur = new Date(start);
//       while (cur <= end) {
//         if (!isWeekend(cur)) {
//           const key = toISODate(cur);
//           arr.push({
//             key,
//             dayLabel: HARI_PENDEK[cur.getDay()],
//             dateLabel: `${cur.getDate()}/${BULAN_SHORT[cur.getMonth()]}`,
//             status: byDate[key] || null,
//           });
//         }
//         cur.setDate(cur.getDate() + 1);
//       }
//       return arr;
//     };

//     return {
//       weekly: buildDays(monday, t),
//       monthly: buildDays(monthStart, t),
//     };
//   }, [chartRecords, today]);

//   // =========================================================
//   // Rekap (preset)
//   // =========================================================
//   const [rekapStart, setRekapStart] = useState(() =>
//     toISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
//   );
//   const [rekapEnd, setRekapEnd] = useState(() => toISODate(today));
//   const [rekapRecords, setRekapRecords] = useState([]);
//   const [loadingRekap, setLoadingRekap] = useState(false);
//   const [rekapError, setRekapError] = useState(null);
//   const [rekapPreset, setRekapPreset] = useState("bulan_ini");
//   const [rekapLabel, setRekapLabel] = useState("Bulan Ini");

//   const loadRekap = useCallback(async () => {
//     if (!siswa || !rekapStart || !rekapEnd) return;
//     setLoadingRekap(true);
//     setRekapError(null);
//     try {
//       const startStr = `${rekapStart} 00:00:00`;
//       const endStr = `${rekapEnd} 23:59:59`;
//       const records = await pb.collection("absensi").getFullList({
//         filter: `siswa_id="${siswa.id}" && tanggal >= "${startStr}" && tanggal <= "${endStr}"`,
//         sort: "-tanggal",
//         requestKey: null,
//       });
//       setRekapRecords(records);
//     } catch {
//       setRekapError("Gagal memuat data rekap absensi.");
//     } finally {
//       setLoadingRekap(false);
//     }
//   }, [siswa, rekapStart, rekapEnd]);

//   useEffect(() => {
//     if (siswa) loadRekap();
//   }, [siswa, loadRekap]);

//   const PRESETS = [
//     { id: "minggu", label: "7 Hari Terakhir" },
//     { id: "bulan", label: "30 Hari Terakhir" },
//     { id: "bulan_ini", label: "Bulan Ini" },
//     { id: "bulan_lalu", label: "Bulan Lalu" },
//     { id: "semester", label: "Semester Ini" },
//   ];

//   function applyPreset(preset) {
//     setRekapPreset(preset);
//     const t = today;
//     if (preset === "minggu") {
//       const s = new Date(t);
//       s.setDate(s.getDate() - 6);
//       setRekapStart(toISODate(s));
//       setRekapEnd(toISODate(t));
//       setRekapLabel("7 Hari Terakhir");
//     } else if (preset === "bulan") {
//       const s = new Date(t);
//       s.setDate(s.getDate() - 29);
//       setRekapStart(toISODate(s));
//       setRekapEnd(toISODate(t));
//       setRekapLabel("30 Hari Terakhir");
//     } else if (preset === "bulan_ini") {
//       setRekapStart(toISODate(new Date(t.getFullYear(), t.getMonth(), 1)));
//       setRekapEnd(toISODate(t));
//       setRekapLabel("Bulan Ini");
//     } else if (preset === "bulan_lalu") {
//       const s = new Date(t.getFullYear(), t.getMonth() - 1, 1);
//       const e = new Date(t.getFullYear(), t.getMonth(), 0);
//       setRekapStart(toISODate(s));
//       setRekapEnd(toISODate(e));
//       setRekapLabel("Bulan Lalu");
//     } else if (preset === "semester") {
//       const m = t.getMonth();
//       if (m >= 6) {
//         setRekapStart(toISODate(new Date(t.getFullYear(), 6, 1)));
//       } else {
//         setRekapStart(toISODate(new Date(t.getFullYear(), 0, 1)));
//       }
//       setRekapEnd(toISODate(t));
//       setRekapLabel("Semester Ini");
//     }
//   }

//   // ---------------- Derivasi rekap ----------------
//   const rekapStats = useMemo(() => {
//     const s = { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0 };
//     for (const r of rekapRecords) {
//       if (s[r.status] !== undefined) s[r.status] += 1;
//       s.total += 1;
//     }
//     s.persenHadir = s.total > 0 ? (s.hadir / s.total) * 100 : 0;
//     s.persenTidakHadir = s.total > 0 ? 100 - s.persenHadir : 0;
//     return s;
//   }, [rekapRecords]);

//   const daftarTidakHadir = useMemo(() => {
//     return rekapRecords
//       .filter((r) => r.status !== "hadir")
//       .map((r) => ({
//         id: r.id,
//         tanggal: (r.tanggal || "").slice(0, 10),
//         status: r.status,
//       }))
//       .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
//   }, [rekapRecords]);

//   const perBulan = useMemo(() => {
//     const map = {};
//     for (const r of rekapRecords) {
//       const key = (r.tanggal || "").slice(0, 7);
//       if (!map[key])
//         map[key] = { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0 };
//       if (map[key][r.status] !== undefined) map[key][r.status] += 1;
//       map[key].total += 1;
//     }
//     return Object.entries(map)
//       .sort(([a], [b]) => b.localeCompare(a))
//       .map(([key, v]) => {
//         const [y, m] = key.split("-").map(Number);
//         return { key, label: `${BULAN[m - 1]} ${y}`, ...v };
//       });
//   }, [rekapRecords]);

//   const streakHadir = useMemo(() => {
//     const sorted = [...rekapRecords].sort((a, b) =>
//       (b.tanggal || "").localeCompare(a.tanggal || ""),
//     );
//     let streak = 0;
//     for (const r of sorted) {
//       if (r.status === "hadir") streak++;
//       else break;
//     }
//     return streak;
//   }, [rekapRecords]);

//   // =========================================================
//   // Render states
//   // =========================================================
//   if (checkingAuth || resolvingSiswa) {
//     return (
//       <div className="flex min-h-screen items-center justify-center bg-slate-50">
//         <p className="text-slate-500">Memuat...</p>
//       </div>
//     );
//   }

//   if (noSiswaAssigned) {
//     return (
//       <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
//         <div className="max-w-md rounded-3xl bg-white p-6 text-center shadow-[0_8px_30px_rgba(99,120,200,0.10)]">
//           <p className="font-medium text-rose-700">
//             Akun belum ditautkan ke data siswa.
//           </p>
//           <p className="mt-1 text-sm text-rose-600">
//             Silakan hubungi admin atau ICT.
//           </p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-slate-50 pb-16">
//       <Toast toast={message} onClose={() => setMessage(null)} />

//       <div className="mx-auto max-w-4xl px-4 py-6">
//         {/* Shortcut periode */}
//         <Card
//           title="Pilih Periode"
//           subtitle="Rekap kehadiran berdasarkan rentang waktu"
//           className="mb-4"
//         >
//           <div className="flex flex-wrap gap-2">
//             {PRESETS.map((p) => (
//               <button
//                 key={p.id}
//                 onClick={() => applyPreset(p.id)}
//                 className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
//                   rekapPreset === p.id
//                     ? "bg-indigo-600 text-white shadow-sm"
//                     : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
//                 }`}
//               >
//                 {p.label}
//               </button>
//             ))}
//           </div>
//           <p className="mt-3 text-xs text-slate-400">
//             Periode:{" "}
//             <span className="font-medium text-slate-600">{rekapLabel}</span> ·{" "}
//             {formatShort(rekapStart)} – {formatShort(rekapEnd)}
//           </p>
//         </Card>

//         {loadingRekap ? (
//           <Card>
//             <div className="py-3 text-center text-sm text-slate-400">
//               Memuat data rekap...
//             </div>
//           </Card>
//         ) : rekapError ? (
//           <div className="rounded-3xl bg-rose-50 p-6 text-center text-sm text-rose-700 shadow-[0_8px_30px_rgba(99,120,200,0.10)]">
//             {rekapError}
//           </div>
//         ) : (
//           <div className="space-y-6">
//             {/* Stat cards */}
//             <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
//               {STATUS_ORDER.map((s) => (
//                 <Card key={s}>
//                   <div className="flex items-center gap-2">
//                     <span
//                       className={`h-2.5 w-2.5 rounded-full ${STATUS_CONFIG[s].dot}`}
//                     />
//                     <span className="text-xs font-medium text-gray-400">
//                       {STATUS_CONFIG[s].label}
//                     </span>
//                   </div>
//                   <p className="mt-2 text-3xl font-bold leading-none text-gray-900">
//                     {rekapStats[s]}
//                   </p>
//                   <p className="mt-2 text-[11px] font-medium text-gray-400">
//                     {rekapStats.total > 0
//                       ? `${((rekapStats[s] / rekapStats.total) * 100).toFixed(1)}%`
//                       : "0%"}
//                   </p>
//                 </Card>
//               ))}
//             </div>

//             {/* ============ CHART: Trend Kehadiran Per-Hari ============ */}
//             <Card
//               title="Trend Kehadiran"
//               subtitle="Status kehadiran per hari (Senin–Jumat, Sabtu & Minggu dilewati)"
//             >
//               {loadingChart ? (
//                 <div className="flex h-52 items-center justify-center text-sm text-slate-400">
//                   Memuat chart...
//                 </div>
//               ) : (
//                 <AttendanceTrendChart
//                   weeklyData={chartDays.weekly}
//                   monthlyData={chartDays.monthly}
//                   viewMode={chartView}
//                   onViewChange={setChartView}
//                 />
//               )}
//             </Card>

//             {/* Streak + Total */}
//             <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
//               <Card className="bg-emerald-50/70">
//                 <p className="text-xs font-medium text-emerald-700">
//                   🔥 Streak Hadir Terakhir
//                 </p>
//                 <p className="mt-1 text-3xl font-bold text-emerald-800">
//                   {streakHadir}
//                 </p>
//                 <p className="text-xs text-emerald-600">hari berturut-turut</p>
//               </Card>
//               <Card>
//                 <p className="text-xs font-medium text-gray-400">
//                   Total Hari Tercatat
//                 </p>
//                 <p className="mt-1 text-3xl font-bold text-gray-900">
//                   {rekapStats.total}
//                 </p>
//                 <p className="text-xs text-gray-400">hari dalam periode ini</p>
//               </Card>
//             </div>

//             {/* Daftar hari tidak hadir */}
//             <Card title="Rincian Hari Tidak Hadir">
//               {daftarTidakHadir.length === 0 ? (
//                 <div className="rounded-xl border border-emerald-100 bg-emerald-50 py-6 text-center">
//                   <p className="text-sm font-medium text-emerald-700">
//                     🎉 Tidak ada catatan tidak hadir pada periode ini
//                   </p>
//                   <p className="mt-0.5 text-xs text-emerald-600">
//                     Pertahankan kehadiranmu!
//                   </p>
//                 </div>
//               ) : (
//                 <ul className="space-y-2">
//                   {daftarTidakHadir.map((d) => {
//                     const cfg = STATUS_CONFIG[d.status];
//                     const dt = new Date(d.tanggal + "T00:00:00");
//                     return (
//                       <li
//                         key={d.id}
//                         className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md"
//                       >
//                         <div className="flex items-center gap-3">
//                           <div
//                             className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base ring-2 ${cfg.softBg} ${cfg.ring}`}
//                           >
//                             {cfg.emoji}
//                           </div>
//                           <div className="min-w-0">
//                             <p className="text-sm font-medium text-slate-800">
//                               {HARI_PANJANG[dt.getDay()]}
//                             </p>
//                             <p className="text-xs text-slate-400">
//                               {formatShort(d.tanggal)}
//                             </p>
//                           </div>
//                         </div>
//                         <span
//                           className={`rounded-full px-2.5 py-1 text-xs font-medium ${cfg.chip}`}
//                         >
//                           {cfg.label}
//                         </span>
//                       </li>
//                     );
//                   })}
//                 </ul>
//               )}
//             </Card>

//             {/* Ringkasan per bulan */}
//             {perBulan.length > 0 && (
//               <Card title="Ringkasan per Bulan">
//                 <div className="space-y-3">
//                   {perBulan.map((b) => {
//                     const persen = b.total > 0 ? (b.hadir / b.total) * 100 : 0;
//                     return (
//                       <div key={b.key}>
//                         <div className="mb-1 flex items-center justify-between text-xs">
//                           <span className="font-medium text-slate-700">
//                             {b.label}
//                           </span>
//                           <span className="text-slate-500">
//                             {b.hadir}/{b.total} hadir · {persen.toFixed(0)}%
//                           </span>
//                         </div>
//                         <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
//                           <div
//                             className="bg-emerald-500"
//                             style={{ width: `${(b.hadir / b.total) * 100}%` }}
//                           />
//                           <div
//                             className="bg-sky-400"
//                             style={{ width: `${(b.izin / b.total) * 100}%` }}
//                           />
//                           <div
//                             className="bg-amber-400"
//                             style={{ width: `${(b.sakit / b.total) * 100}%` }}
//                           />
//                           <div
//                             className="bg-rose-400"
//                             style={{ width: `${(b.alpha / b.total) * 100}%` }}
//                           />
//                         </div>
//                       </div>
//                     );
//                   })}
//                 </div>
//               </Card>
//             )}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
