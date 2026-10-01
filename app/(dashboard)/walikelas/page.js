"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { pb, getCurrentUser, isAuthenticated } from "@/lib/pocketbase";

const ALLOWED_ROLES = ["guru walikelas", "guru pendamping", "admin", "ict"];

// ---------------------------------------------------------------------------
// Helper tanggal
// ---------------------------------------------------------------------------
const HARI_KEY = [
  "minggu",
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
];
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
const HARI_PANJANG = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

function pad(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}
function isHoliday(date, hariLiburList) {
  if (!hariLiburList || hariLiburList.length === 0) return false;
  const dateStr = toISODate(date);
  const dayKey = HARI_KEY[date.getDay()];
  for (const h of hariLiburList) {
    if (h.tanggal) {
      const liburDateStr = toISODate(new Date(h.tanggal));
      if (liburDateStr === dateStr) return true;
    }
    if (h.hari && h.hari === dayKey) return true;
  }
  return false;
}
function countEffectiveDays(startStr, endStr, hariLiburList) {
  if (!startStr || !endStr) return 0;
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (!isWeekend(cur) && !isHoliday(cur, hariLiburList)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
function hariIndo(date = new Date()) {
  return `${HARI_PANJANG[date.getDay()]}, ${date.getDate()} ${
    BULAN[date.getMonth()]
  } ${date.getFullYear()}`;
}
function formatShort(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}
function dayRangeISO(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    start: `${toISODate(d)} 00:00:00`,
    end: `${toISODate(d)} 23:59:59`,
  };
}
function monthRangeISO(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: `${toISODate(start)} 00:00:00`,
    end: `${toISODate(end)} 23:59:59`,
  };
}

// ---------------------------------------------------------------------------
// Helper nilai (identik Leger)
// ---------------------------------------------------------------------------
function average(arr) {
  const nums = arr.filter(
    (v) => typeof v === "number" && !isNaN(v) && v !== -1,
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function buildLegerSiswaStats({ pb, kelasData, siswaData, absensiData }) {
  const [mapelKhusus, mapelTingkat, presentaseData, ujianData] =
    await Promise.all([
      pb.collection("mata_pelajaran").getFullList({
        filter: `spesifik_kelas_id ~ "${kelasData.id}"`,
        requestKey: null,
      }),
      pb.collection("mata_pelajaran").getFullList({
        filter: `target_tingkat ~ "${String(kelasData.tingkat)}"`,
        requestKey: null,
      }),
      pb.collection("presentase_penilaian").getFullList({
        requestKey: null,
      }),
      pb.collection("pengaturan_ujian").getFullList({
        filter: `status_akses = "buka" && (target_kelas_id ~ "${kelasData.id}" || target_tingkat ~ "${String(kelasData.tingkat)}")`,
        requestKey: null,
      }),
    ]);

  const combined = [...mapelKhusus, ...mapelTingkat];
  const uniqueMapelRaw = Array.from(
    new Map(combined.map((m) => [m.id, m])).values(),
  );
  const uniqueMapel = uniqueMapelRaw.filter((m) => {
    if ((m.kategori || "").toLowerCase() !== "umum") return false;
    const spesifik = m.spesifik_kelas_id;
    const punyaRestriksi = Array.isArray(spesifik) && spesifik.length > 0;
    if (!punyaRestriksi) return true;
    return spesifik.includes(kelasData.id);
  });

  const mapelByName = new Map();
  uniqueMapel.forEach((m) => {
    const key = (m.nama_mapel || m.nama || "").trim();
    if (!mapelByName.has(key)) mapelByName.set(key, m);
  });
  const sortedMapel = Array.from(mapelByName.values());

  if (sortedMapel.length === 0 || siswaData.length === 0) {
    return { listRata: [] };
  }

  function getBobot(nama) {
    const found = presentaseData.find(
      (p) =>
        (p.nama_presentase || "").trim().toLowerCase() === nama.toLowerCase(),
    );
    return found ? Number(found.angka_presentase) || 0 : 0;
  }
  const bobotFormatif = getBobot("Formatif");
  const bobotSumatif = getBobot("Sumatif");
  const bobotUts = getBobot("UTS");
  const bobotUas = getBobot("UAS");
  const bobotKehadiran = getBobot("Kehadiran");

  const kehadiranMap = {};
  siswaData.forEach((s) => {
    const records = absensiData.filter((a) => a.siswa_id === s.id);
    if (records.length === 0) {
      kehadiranMap[s.id] = null;
      return;
    }
    const hadir = records.filter((a) => a.status === "hadir").length;
    kehadiranMap[s.id] = (hadir / records.length) * 100;
  });

  const utsIds = ujianData
    .filter((u) => u.jenis_ujian === "ahb")
    .map((u) => u.id);
  const uasIds = ujianData
    .filter((u) => u.jenis_ujian === "asas")
    .map((u) => u.id);

  let nilaiUjianData = [];
  if (ujianData.length > 0) {
    const ujianFilter = ujianData
      .map((u) => `pengaturan_ujian_id = "${u.id}"`)
      .join(" || ");
    nilaiUjianData = await pb.collection("nilai_ujian").getFullList({
      filter: ujianFilter,
      requestKey: null,
    });
  }
  const ujianMap = {};
  nilaiUjianData.forEach((n) => {
    if (!ujianMap[n.pengaturan_ujian_id]) ujianMap[n.pengaturan_ujian_id] = {};
    ujianMap[n.pengaturan_ujian_id][n.siswa_id] = n.nilai;
  });
  function avgUjian(ids, siswaId) {
    const vals = ids
      .map((uid) => ujianMap[uid]?.[siswaId])
      .filter((v) => typeof v === "number" && !isNaN(v) && v !== -1);
    return average(vals);
  }
  const utsAvgMap = {};
  const uasAvgMap = {};
  siswaData.forEach((s) => {
    utsAvgMap[s.id] = avgUjian(utsIds, s.id);
    uasAvgMap[s.id] = avgUjian(uasIds, s.id);
  });

  const mapelFilter = sortedMapel
    .map((m) => `mapel_id ~ "${m.id}"`)
    .join(" || ");
  const [tpAll, lpAll] = await Promise.all([
    pb.collection("tujuan_pembelajaran").getFullList({
      filter: mapelFilter,
      requestKey: null,
    }),
    pb.collection("lingkup_materi").getFullList({
      filter: mapelFilter,
      requestKey: null,
    }),
  ]);
  const tpToMapel = {};
  tpAll.forEach((tp) => {
    tpToMapel[tp.id] = tp.mapel_id;
  });
  const lpToMapel = {};
  lpAll.forEach((lp) => {
    lpToMapel[lp.id] = lp.mapel_id;
  });

  const [nfData, nsData] = await Promise.all([
    pb.collection("nilai_formatif").getFullList({
      filter: `kelas_id = "${kelasData.id}"`,
      requestKey: null,
    }),
    pb.collection("nilai_sumatif").getFullList({
      filter: `kelas_id = "${kelasData.id}"`,
      requestKey: null,
    }),
  ]);

  const formatifValues = {};
  nfData.forEach((n) => {
    const mapelId = tpToMapel[n.tp_id];
    if (!mapelId) return;
    if (!formatifValues[mapelId]) formatifValues[mapelId] = {};
    if (!formatifValues[mapelId][n.siswa_id])
      formatifValues[mapelId][n.siswa_id] = [];
    ["k1", "k2", "k3", "k4"].forEach((k) => {
      const val = n[k];
      if (typeof val === "number" && !isNaN(val) && val !== -1) {
        formatifValues[mapelId][n.siswa_id].push(val);
      }
    });
  });

  const sumatifValues = {};
  nsData.forEach((n) => {
    const mapelId = lpToMapel[n.lm_id];
    if (!mapelId) return;
    if (!sumatifValues[mapelId]) sumatifValues[mapelId] = {};
    if (!sumatifValues[mapelId][n.siswa_id])
      sumatifValues[mapelId][n.siswa_id] = [];
    if (typeof n.nilai === "number" && !isNaN(n.nilai) && n.nilai !== -1) {
      sumatifValues[mapelId][n.siswa_id].push(n.nilai);
    }
  });

  const nilaiAkhirMap = {};
  sortedMapel.forEach((m) => {
    nilaiAkhirMap[m.id] = {};
    siswaData.forEach((s) => {
      const formatifAvg = average(formatifValues[m.id]?.[s.id] || []);
      const sumatifAvg = average(sumatifValues[m.id]?.[s.id] || []);
      const utsVal = utsAvgMap[s.id];
      const uasVal = uasAvgMap[s.id];
      const kehadiranVal = kehadiranMap[s.id];

      const otherComponents = [
        { value: formatifAvg, bobot: bobotFormatif },
        { value: sumatifAvg, bobot: bobotSumatif },
        { value: utsVal, bobot: bobotUts },
        { value: uasVal, bobot: bobotUas },
      ].filter(
        (k) =>
          k.value !== null &&
          k.value !== undefined &&
          !isNaN(k.value) &&
          k.bobot > 0,
      );

      let komponen = [...otherComponents];
      if (otherComponents.length > 0) {
        if (
          kehadiranVal !== null &&
          kehadiranVal !== undefined &&
          !isNaN(kehadiranVal) &&
          bobotKehadiran > 0
        ) {
          komponen.push({ value: kehadiranVal, bobot: bobotKehadiran });
        }
      }

      const totalBobot = komponen.reduce((a, k) => a + k.bobot, 0);
      if (totalBobot === 0) {
        nilaiAkhirMap[m.id][s.id] = null;
        return;
      }
      const weightedSum = komponen.reduce((a, k) => a + k.value * k.bobot, 0);
      nilaiAkhirMap[m.id][s.id] = weightedSum / totalBobot;
    });
  });

  const listRataPerSiswa = siswaData
    .map((s) => {
      const vals = sortedMapel
        .map((m) => nilaiAkhirMap[m.id][s.id])
        .filter((v) => typeof v === "number" && !isNaN(v));
      const rataRata = vals.length
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : null;
      return {
        siswa: s,
        rataRata,
        jumlahMapel: vals.length,
      };
    })
    .filter((r) => r.rataRata !== null);

  return { listRata: listRataPerSiswa };
}

// ---------------------------------------------------------------------------
// Komponen kecil UI
// ---------------------------------------------------------------------------
function StatusPill({ ok, yesLabel, noLabel, neutral, neutralLabel }) {
  if (neutral) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600 ring-1 ring-slate-200">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {neutralLabel}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        ok
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          ok ? "bg-emerald-500" : "bg-rose-500"
        }`}
      />
      {ok ? yesLabel : noLabel}
    </span>
  );
}

function Card({ title, subtitle, children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function Avatar({ name }) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Halaman utama
// ---------------------------------------------------------------------------
export default function OverviewWaliKelasPage() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);

  const [authChecked, setAuthChecked] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [guru, setGuru] = useState(null);
  const [kelas, setKelas] = useState(null);
  const [totalSiswa, setTotalSiswa] = useState(0);

  const [hariLiburList, setHariLiburList] = useState([]);

  const [absensiHariIni, setAbsensiHariIni] = useState([]);
  const [agendaHariIni, setAgendaHariIni] = useState([]);

  // ✅ Periode: dari Mulai tahun ajaran sampai hari ini
  const [periodeMulai, setPeriodeMulai] = useState(null);
  const [periodeLabel, setPeriodeLabel] = useState("");
  const [incompleteDaysPeriode, setIncompleteDaysPeriode] = useState([]);
  const [totalHariKerjaPeriode, setTotalHariKerjaPeriode] = useState(0);

  const [rankingSiswa, setRankingSiswa] = useState([]);
  const [rankingKelas, setRankingKelas] = useState([]);
  const [posisiKelasSaya, setPosisiKelasSaya] = useState(null);

  const [nilaiTertinggi, setNilaiTertinggi] = useState(null);
  const [nilaiTerendah, setNilaiTerendah] = useState(null);

  // Cek auth
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!isAuthenticated() || !currentUser) {
      router.push("/login");
      return;
    }
    if (!ALLOWED_ROLES.includes(currentUser.role)) {
      setUnauthorized(true);
      setAuthChecked(true);
      setLoading(false);
      return;
    }
    setGuru(currentUser);
    setAuthChecked(true);
  }, [router]);

  // Load hari_libur
  useEffect(() => {
    if (!authChecked || unauthorized) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await pb.collection("hari_libur").getFullList({
          requestKey: null,
        });
        if (!cancelled) setHariLiburList(list);
      } catch (e) {
        if (!cancelled) setHariLiburList([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authChecked, unauthorized]);

  // Load dashboard
  useEffect(() => {
    if (!authChecked || unauthorized || !guru) return;
    let isMounted = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setErrorMsg("");

        const user = guru;

        const kelasSaya = await pb
          .collection("kelas")
          .getFirstListItem(
            `walikelas_id="${user.id}" || pendamping_id="${user.id}"`,
            { requestKey: null },
          )
          .catch(() => null);

        if (!kelasSaya) {
          setErrorMsg(
            "Anda belum terdaftar sebagai wali kelas pada kelas manapun.",
          );
          setLoading(false);
          return;
        }
        if (isMounted) setKelas(kelasSaya);

        const siswaKelasSaya = await pb.collection("siswa").getFullList({
          filter: `kelas_id="${kelasSaya.id}"`,
          requestKey: null,
        });
        if (isMounted) setTotalSiswa(siswaKelasSaya.length);

        const { start: todayStart, end: todayEnd } = dayRangeISO(today);
        const { start: monthStart, end: monthEnd } = monthRangeISO(today);

        // Absensi hari ini
        const absensiToday = await pb.collection("absensi").getFullList({
          filter: `kelas_id="${kelasSaya.id}" && tanggal>="${todayStart}" && tanggal<="${todayEnd}"`,
          requestKey: null,
        });
        if (isMounted) setAbsensiHariIni(absensiToday);

        // Agenda hari ini
        const agendaToday = await pb.collection("agenda_mengajar").getFullList({
          filter: `kelas_id="${kelasSaya.id}" && date>="${todayStart}" && date<="${todayEnd}"`,
          requestKey: null,
        });
        if (isMounted) setAgendaHariIni(agendaToday);

        // =========================================================
        // Tentukan periode: dari tahun_ajaran.Mulai sampai hari ini
        // =========================================================
        const todayStr = toISODate(today);
        let periodeMulaiStr = toISODate(
          new Date(today.getFullYear(), today.getMonth(), 1),
        );
        let label = "bulan ini";

        try {
          let ta = null;
          if (kelasSaya.tahun_ajaran_id) {
            ta = await pb
              .collection("tahun_ajaran")
              .getOne(kelasSaya.tahun_ajaran_id, { requestKey: null })
              .catch(() => null);
          }
          if (!ta) {
            const list = await pb.collection("tahun_ajaran").getFullList({
              filter: `is_aktif = true`,
              requestKey: null,
            });
            ta = list[0] || null;
          }
          if (ta?.Mulai) {
            periodeMulaiStr = toISODate(new Date(ta.Mulai));
            const parts = [];
            if (ta.tahun) parts.push(`TA ${ta.tahun}`);
            if (ta.semester) parts.push(`Semester ${ta.semester}`);
            label = parts.join(" · ") || "periode berjalan";
          }
        } catch (e) {
          console.warn("Gagal ambil tahun_ajaran:", e);
        }
        if (isMounted) {
          setPeriodeMulai(periodeMulaiStr);
          setPeriodeLabel(label);
        }

        // Absensi bulan ini (untuk ranking)
        const absensiBulanIni = await pb.collection("absensi").getFullList({
          filter: `kelas_id="${kelasSaya.id}" && tanggal>="${monthStart}" && tanggal<="${monthEnd}"`,
          requestKey: null,
        });

        // Absensi seluruh periode (untuk bubble)
        const absensiPeriode = await pb.collection("absensi").getFullList({
          filter: `kelas_id="${kelasSaya.id}" && tanggal>="${periodeMulaiStr} 00:00:00" && tanggal<="${todayStr} 23:59:59"`,
          requestKey: null,
        });

        // =========================================================
        // Hari kerja efektif bulan ini (untuk ranking)
        // =========================================================
        const monthStartStr = toISODate(
          new Date(today.getFullYear(), today.getMonth(), 1),
        );
        const hariEfektifBulanIni = countEffectiveDays(
          monthStartStr,
          todayStr,
          hariLiburList,
        );

        // =========================================================
        // ✨ Bubble: hari kerja yang BELUM LENGKAP dari periode mulai
        // =========================================================
        const absensiPeriodeByDate = {};
        for (const a of absensiPeriode) {
          const key = toISODate(new Date(a.tanggal));
          absensiPeriodeByDate[key] = (absensiPeriodeByDate[key] || 0) + 1;
        }

        const incomplete = [];
        let totalKerja = 0;
        const [psy, psm, psd] = periodeMulaiStr.split("-").map(Number);
        const [ey, em, ed] = todayStr.split("-").map(Number);
        const cursor = new Date(psy, psm - 1, psd);
        const endCursor = new Date(ey, em - 1, ed);
        while (cursor <= endCursor) {
          if (!isWeekend(cursor) && !isHoliday(cursor, hariLiburList)) {
            totalKerja += 1;
            const key = toISODate(cursor);
            const filled = absensiPeriodeByDate[key] || 0;
            if (filled < siswaKelasSaya.length) {
              incomplete.push({ date: new Date(cursor), filled });
            }
          }
          cursor.setDate(cursor.getDate() + 1);
        }
        if (isMounted) {
          setIncompleteDaysPeriode(incomplete);
          setTotalHariKerjaPeriode(totalKerja);
        }

        // =========================================================
        // Ranking siswa (bulan ini)
        // =========================================================
        const rekapPerSiswa = {};
        siswaKelasSaya.forEach((s) => {
          rekapPerSiswa[s.id] = { siswa: s, hadir: 0, total: 0 };
        });
        absensiBulanIni.forEach((a) => {
          if (!rekapPerSiswa[a.siswa_id]) return;
          rekapPerSiswa[a.siswa_id].total += 1;
          if (a.status === "hadir") rekapPerSiswa[a.siswa_id].hadir += 1;
        });
        const denomSiswa = hariEfektifBulanIni > 0 ? hariEfektifBulanIni : 1;
        const rankingSiswaHitung = Object.values(rekapPerSiswa)
          .map((r) => ({
            ...r,
            persen:
              hariEfektifBulanIni > 0
                ? Math.round((r.hadir / denomSiswa) * 100)
                : 0,
          }))
          .sort((a, b) => b.persen - a.persen || b.hadir - a.hadir);
        if (isMounted) setRankingSiswa(rankingSiswaHitung);

        // =========================================================
        // Ranking kelas
        // =========================================================
        const semuaKelas = await pb.collection("kelas").getFullList({
          requestKey: null,
        });
        const semuaSiswa = await pb.collection("siswa").getFullList({
          requestKey: null,
        });
        const jumlahSiswaPerKelas = {};
        semuaSiswa.forEach((s) => {
          const kid = Array.isArray(s.kelas_id) ? s.kelas_id[0] : s.kelas_id;
          if (!kid) return;
          jumlahSiswaPerKelas[kid] = (jumlahSiswaPerKelas[kid] || 0) + 1;
        });

        const absensiSemuaKelas = await pb.collection("absensi").getFullList({
          filter: `tanggal>="${monthStart}" && tanggal<="${monthEnd}"`,
          requestKey: null,
        });

        const rekapPerKelas = {};
        semuaKelas.forEach((k) => {
          rekapPerKelas[k.id] = {
            kelas: k,
            hadir: 0,
            totalSiswa: jumlahSiswaPerKelas[k.id] || 0,
          };
        });
        absensiSemuaKelas.forEach((a) => {
          const kid = Array.isArray(a.kelas_id) ? a.kelas_id[0] : a.kelas_id;
          if (!rekapPerKelas[kid]) return;
          if (a.status === "hadir") rekapPerKelas[kid].hadir += 1;
        });

        const rankingKelasHitung = Object.values(rekapPerKelas)
          .map((r) => {
            const denom = hariEfektifBulanIni * r.totalSiswa;
            return {
              ...r,
              persen: denom > 0 ? Math.round((r.hadir / denom) * 100) : 0,
            };
          })
          .sort((a, b) => b.persen - a.persen);

        if (isMounted) {
          setRankingKelas(rankingKelasHitung);
          const idx = rankingKelasHitung.findIndex(
            (r) => r.kelas.id === kelasSaya.id,
          );
          setPosisiKelasSaya(idx >= 0 ? idx + 1 : null);
        }

        // =========================================================
        // Rata-rata NILAI AKHIR per SISWA (logika sama Leger)
        // =========================================================
        try {
          const absensiAllKelas = await pb.collection("absensi").getFullList({
            filter: `kelas_id ~ "${kelasSaya.id}"`,
            requestKey: null,
          });

          const { listRata } = await buildLegerSiswaStats({
            pb,
            kelasData: kelasSaya,
            siswaData: siswaKelasSaya,
            absensiData: absensiAllKelas,
          });

          if (isMounted) {
            if (listRata.length === 0) {
              setNilaiTertinggi(null);
              setNilaiTerendah(null);
            } else {
              const tertinggi = listRata.reduce((max, m) =>
                m.rataRata > max.rataRata ? m : max,
              );
              const terendah = listRata.reduce((min, m) =>
                m.rataRata < min.rataRata ? m : min,
              );
              setNilaiTertinggi(tertinggi);
              setNilaiTerendah(terendah);
            }
          }
        } catch (e) {
          console.error("Gagal menghitung rata-rata nilai siswa:", e);
          if (isMounted) {
            setNilaiTertinggi(null);
            setNilaiTerendah(null);
          }
        }

        if (isMounted) setLoading(false);
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setErrorMsg(
            "Terjadi kesalahan saat memuat data dashboard. Coba muat ulang halaman.",
          );
          setLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, unauthorized, guru, hariLiburList]);

  const todayIsWorkday = useMemo(() => {
    if (isWeekend(today)) return false;
    if (isHoliday(today, hariLiburList)) return false;
    return true;
  }, [today, hariLiburList]);

  const totalSiswaDiabsen = absensiHariIni.length;
  const absensiHariIniLengkap =
    !todayIsWorkday || (totalSiswa > 0 && totalSiswaDiabsen >= totalSiswa);
  const sudahAgendaHariIni = agendaHariIni.length > 0;

  function getGreetingByTime() {
    const hours = new Date().getHours();
    if (hours >= 4 && hours < 11) return "Selamat Pagi";
    if (hours >= 11 && hours < 15) return "Selamat Siang";
    if (hours >= 15 && hours < 18) return "Selamat Sore";
    return "Selamat Malam";
  }

  const top5Rajin = rankingSiswa.slice(0, 5);
  const bottom5 = [...rankingSiswa]
    .sort((a, b) => a.persen - b.persen || b.total - a.total)
    .filter((r) => r.total > 0)
    .slice(0, 5);

  // ---------------------------------------------------------------------
  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-medium text-amber-700">
            Anda tidak memiliki akses ke halaman ini.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-slate-500">Memuat data kelas...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-medium text-rose-700">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">
            {hariIndo()}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {getGreetingByTime()}, {guru?.nama_lengkap || "Guru"} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {guru?.role}{" "}
            <span className="font-semibold text-slate-700">
              {kelas?.nama_kelas || "-"}
            </span>{" "}
            &middot; {totalSiswa} siswa
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Peringatan: hari kerja belum lengkap (periode tahun ajaran) */}
        {totalSiswa > 0 && incompleteDaysPeriode.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
              !
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-800">
                Ada {incompleteDaysPeriode.length} hari pembelajaran yang belum
                diabsen lengkap
              </p>
              <p className="mt-0.5 text-xs text-rose-700">
                Periode {periodeLabel} · {formatShort(periodeMulai)} –{" "}
                {formatShort(toISODate(today))}. Sabtu, Minggu, dan hari libur
                tidak dihitung. Segera lengkapi di halaman{" "}
                <span className="font-semibold">Absensi</span>.
              </p>
            </div>
          </div>
        )}

        {/* Kalau semua sudah lengkap, tampil notif hijau */}
        {totalSiswa > 0 &&
          totalHariKerjaPeriode > 0 &&
          incompleteDaysPeriode.length === 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                ✓
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">
                  Semua absensi sudah lengkap 🎉
                </p>
                <p className="mt-0.5 text-xs text-emerald-700">
                  Periode {periodeLabel} · {formatShort(periodeMulai)} –{" "}
                  {formatShort(toISODate(today))}.
                </p>
              </div>
            </div>
          )}

        {/* Notif hijau kalau semua lengkap */}
        {totalSiswa > 0 &&
          totalHariKerjaPeriode > 0 &&
          incompleteDaysPeriode.length === 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                ✓
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">
                  Semua {totalHariKerjaPeriode} hari kerja sudah diabsen lengkap
                  🎉
                </p>
                <p className="mt-0.5 text-xs text-emerald-700">
                  Periode {periodeLabel} · {formatShort(periodeMulai)} –{" "}
                  {formatShort(toISODate(today))}.
                </p>
              </div>
            </div>
          )}

        {/* Ringkasan */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-xs font-medium text-slate-400">Total Siswa</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalSiswa}
            </p>
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Absensi Hari Ini
            </p>
            <div className="mt-2">
              {!todayIsWorkday ? (
                <StatusPill
                  neutral
                  neutralLabel={isWeekend(today) ? "Akhir pekan" : "Hari libur"}
                />
              ) : (
                <StatusPill
                  ok={absensiHariIniLengkap}
                  yesLabel="Lengkap"
                  noLabel={
                    totalSiswaDiabsen > 0 ? "Belum lengkap" : "Belum diisi"
                  }
                />
              )}
            </div>
            {todayIsWorkday && totalSiswaDiabsen > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                {totalSiswaDiabsen} dari {totalSiswa} siswa tercatat
              </p>
            )}
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Agenda Mengajar Hari Ini
            </p>
            <div className="mt-2">
              <StatusPill
                ok={sudahAgendaHariIni}
                yesLabel="Sudah diisi"
                noLabel="Belum diisi"
              />
            </div>
            {sudahAgendaHariIni && (
              <p className="mt-2 text-xs text-slate-400">
                {agendaHariIni.length} entri agenda tercatat
              </p>
            )}
          </Card>

          <Card>
            <p className="text-xs font-medium text-slate-400">
              Peringkat Kehadiran Kelas
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {posisiKelasSaya ? `#${posisiKelasSaya}` : "-"}
              <span className="ml-1 text-sm font-normal text-slate-400">
                / {rankingKelas.length || 0} kelas
              </span>
            </p>
            {rankingKelas.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                Bulan ini · berbasis hari efektif
              </p>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title="Siswa Paling Rajin"
            subtitle="Persentase kehadiran bulan ini (berbasis hari efektif)"
          >
            {top5Rajin.length === 0 ? (
              <p className="text-sm text-slate-400">
                Belum ada data absensi bulan ini.
              </p>
            ) : (
              <ul className="space-y-3">
                {top5Rajin.map((r, i) => (
                  <li key={r.siswa.id} className="flex items-center gap-3">
                    <span className="w-5 text-center text-xs font-semibold text-slate-400">
                      {i + 1}
                    </span>
                    <Avatar name={r.siswa.nama_siswa} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {r.siswa.nama_siswa}
                      </p>
                      <p className="text-xs text-slate-400">
                        {r.hadir} hari hadir
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {r.persen}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Perlu Perhatian"
            subtitle="Persentase kehadiran terendah bulan ini"
          >
            {bottom5.length === 0 ? (
              <p className="text-sm text-slate-400">
                Belum ada data absensi bulan ini.
              </p>
            ) : (
              <ul className="space-y-3">
                {bottom5.map((r) => (
                  <li key={r.siswa.id} className="flex items-center gap-3">
                    <Avatar name={r.siswa.nama_siswa} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {r.siswa.nama_siswa}
                      </p>
                      <p className="text-xs text-slate-400">
                        {r.hadir} hari hadir
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                      {r.persen}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title="Peringkat Kehadiran Antar Kelas"
            subtitle="Rata-rata kehadiran bulan ini vs seluruh kelas"
          >
            {rankingKelas.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada data absensi.</p>
            ) : (
              (() => {
                const dataKelasSaya = rankingKelas.find(
                  (r) => r.kelas.id === kelas?.id,
                );
                const persenKelasSaya = dataKelasSaya?.persen ?? 0;
                return (
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-4xl font-bold text-indigo-600">
                        #{posisiKelasSaya ?? "-"}
                      </p>
                      <p className="text-xs text-slate-400">
                        dari {rankingKelas.length} kelas
                      </p>
                    </div>
                    <div className="h-10 w-px bg-slate-200" />
                    <div className="flex-1">
                      <p className="text-2xl font-bold text-slate-800">
                        {persenKelasSaya}%
                      </p>
                      <p className="text-xs text-slate-400">
                        rata-rata kehadiran kelas
                      </p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${persenKelasSaya}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </Card>

          <Card
            title="Rata-rata Nilai Akhir Siswa"
            subtitle="Berdasarkan rata-rata nilai akhir rapor seluruh mapel — sama dengan halaman Leger"
          >
            <div className="space-y-4">
              {/* Tertinggi */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] font-medium text-emerald-600">
                  Siswa Rata-rata Tertinggi
                </p>
                {nilaiTertinggi ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Avatar name={nilaiTertinggi.siswa?.nama_siswa} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs font-semibold leading-tight text-slate-800">
                        {nilaiTertinggi.siswa?.nama_siswa || "-"}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Dari {nilaiTertinggi.jumlahMapel} mapel
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-emerald-600">
                      {nilaiTertinggi.rataRata.toFixed(1)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">Belum ada data</p>
                )}
              </div>

              {/* Terendah */}
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-[11px] font-medium text-rose-600">
                  Siswa Rata-rata Terendah
                </p>
                {nilaiTerendah ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Avatar name={nilaiTerendah.siswa?.nama_siswa} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs font-semibold leading-tight text-slate-800">
                        {nilaiTerendah.siswa?.nama_siswa || "-"}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Dari {nilaiTerendah.jumlahMapel} mapel
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-rose-600">
                      {nilaiTerendah.rataRata.toFixed(1)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">Belum ada data</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
