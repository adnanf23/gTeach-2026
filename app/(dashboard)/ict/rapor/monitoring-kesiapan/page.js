"use client";

import { useEffect, useMemo, useState } from "react";
import { pb, getCurrentUser } from "@/lib/pocketbase";

/* ------------------------------------------------------------------ */
/* Konfigurasi                                                         */
/* ------------------------------------------------------------------ */

const MAPEL_KATEGORI_DIPAKAI = ["umum"];
const KOLOM_FORMATIF = ["k1", "k2", "k3", "k4"];
const FORMATIF_SKIP = -1;
const ROLE_ADMIN = new Set(["admin", "ict"]);

const TONE = {
  ok: {
    bar: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    soft: "bg-emerald-50 text-emerald-600",
    label: "Siap cetak",
  },
  partial: {
    bar: "bg-slate-900",
    pill: "bg-slate-900 text-white ring-slate-900/20",
    soft: "bg-slate-900 text-white",
    label: "Belum lengkap",
  },
  empty: {
    bar: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 ring-rose-600/20",
    soft: "bg-rose-50 text-rose-600",
    label: "Belum mulai",
  },
  na: {
    bar: "bg-slate-300",
    pill: "bg-slate-100 text-slate-600 ring-slate-500/20",
    soft: "bg-slate-100 text-slate-400",
    label: "Tidak ada data",
  },
};

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

const full = (collection, options = {}) =>
  pb
    .collection(collection)
    .getFullList({ batch: 500, requestKey: null, ...options });

const ids = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const hasText = (v) => typeof v === "string" && v.trim().length > 0;
const terisi = (v) =>
  v !== null && v !== undefined && v !== "" && Number(v) > 0;

const stateOf = (done, total) =>
  total === 0 ? "na" : done >= total ? "ok" : done === 0 ? "empty" : "partial";
const pct = (done, total) => (total ? Math.floor((done / total) * 100) : 0);

const ujianLabel = (u) =>
  u.jenis_ujian
    ? `${u.nama_ujian} (${u.jenis_ujian.toUpperCase()})`
    : u.nama_ujian;
const tahunLabel = (t) => `${t.tahun} semester ${t.semester}`;
const mapelTitle = (m) =>
  (m?.Label && String(m.Label).trim()) || m?.nama_mapel || "(tanpa nama)";

function ujianBerlaku(ujian, kelas) {
  const tingkatOk =
    !kelas.tingkat ||
    ids(ujian.target_tingkat).map(String).includes(String(kelas.tingkat));
  const targetKelas = ids(ujian.target_kelas_id);
  const kelasOk = targetKelas.length === 0 || targetKelas.includes(kelas.id);
  return tingkatOk && kelasOk;
}

/* ------------------------------------------------------------------ */
/* Hitung kelengkapan (logika sama dengan halaman per kelas)           */
/* ------------------------------------------------------------------ */

function buildReport({ base, kelasList, ujian, nilaiUjian }) {
  const {
    siswa,
    ploting,
    tp,
    lm,
    formatif,
    sumatif,
    capaian,
    catatan,
    mapelAll,
  } = base;

  const siswaByKelas = {};
  siswa.forEach((s) => {
    const k = ids(s.kelas_id)[0];
    if (k) (siswaByKelas[k] ||= []).push(s);
  });

  const groupBy = (list) => {
    const out = {};
    list.forEach((x) =>
      ids(x.kelas_id).forEach((k) =>
        ids(x.mapel_id).forEach((m) => (out[`${k}|${m}`] ||= []).push(x)),
      ),
    );
    return out;
  };
  const tpByKey = groupBy(tp);
  const lmByKey = groupBy(lm);

  const plotByKelas = {};
  ploting.forEach((p) =>
    ids(p.kelas_id).forEach((k) => (plotByKelas[k] ||= []).push(p)),
  );

  const formatifKosong = {};
  formatif.forEach((f) => {
    const kosong = KOLOM_FORMATIF.filter(
      (c) => Number(f[c]) !== FORMATIF_SKIP && !terisi(f[c]),
    ).length;
    const key = `${ids(f.siswa_id)[0]}|${ids(f.tp_id)[0]}`;
    formatifKosong[key] = Math.min(formatifKosong[key] ?? Infinity, kosong);
  });

  const sumatifSet = new Set();
  sumatif.forEach((n) => {
    if (terisi(n.nilai))
      sumatifSet.add(`${ids(n.siswa_id)[0]}|${ids(n.lm_id)[0]}`);
  });

  const ujianPloting = new Set();
  const ujianMapel = new Set();
  nilaiUjian.forEach((n) => {
    if (!terisi(n.nilai)) return;
    const s = ids(n.siswa_id)[0];
    const p = ids(n.ploting_guru_id);
    if (p.length) p.forEach((x) => ujianPloting.add(`${s}|${x}`));
    else ids(n.mapel_id).forEach((m) => ujianMapel.add(`${s}|${m}`));
  });

  const capMap = {};
  capaian.forEach((c) =>
    ids(c.kelas_id).forEach((k) =>
      ids(c.mapel_id).forEach((m) => {
        const cur = (capMap[`${k}|${m}`] ||= { tinggi: false, rendah: false });
        if (hasText(c.capaian_tinggi)) cur.tinggi = true;
        if (hasText(c.capaian_rendah)) cur.rendah = true;
      }),
    ),
  );

  const catSet = new Set();
  catatan.forEach((c) => {
    if (!hasText(c.catatan)) return;
    const s = ids(c.siswa_id)[0];
    const k = ids(c.kelas_id);
    if (!k.length) catSet.add(`${s}|*`);
    else k.forEach((x) => catSet.add(`${s}|${x}`));
  });

  return kelasList.map((k) => {
    const students = siswaByKelas[k.id] || [];
    const uApplies = !!ujian && ujianBerlaku(ujian, k);

    const fallbackGuru =
      k.expand?.walikelas_id?.nama_lengkap ||
      k.expand?.pendamping_id?.nama_lengkap ||
      null;

    const plotByMapel = new Map();
    (plotByKelas[k.id] || []).forEach((p) => {
      const mid = ids(p.mapel_id)[0];
      if (mid && !plotByMapel.has(mid)) plotByMapel.set(mid, p);
    });

    const seenMapel = new Set();
    const relevantMapels = [];
    (mapelAll || []).forEach((m) => {
      if (seenMapel.has(m.id)) return;
      if (!MAPEL_KATEGORI_DIPAKAI.includes(m.kategori)) return;
      const spesifik = ids(m.spesifik_kelas_id);
      if (spesifik.length && !spesifik.includes(k.id)) return;
      const tingkatOk = k.tingkat
        ? ids(m.target_tingkat).map(String).includes(String(k.tingkat))
        : false;
      if (!tingkatOk && !plotByMapel.has(m.id)) return;
      seenMapel.add(m.id);
      relevantMapels.push(m);
    });

    const rows = relevantMapels
      .map((m) => {
        const p = plotByMapel.get(m.id);
        const mapelId = m.id;
        const tps = tpByKey[`${k.id}|${mapelId}`] || [];
        const lms = lmByKey[`${k.id}|${mapelId}`] || [];
        const noTp = tps.length === 0;
        const noLm = lms.length === 0;
        const noPlot = !p;
        const n = students.length;

        const plottedGuru = p?.expand?.guru_id?.nama_lengkap || null;
        const isFallback = !plottedGuru && !!fallbackGuru;
        const guru = plottedGuru || fallbackGuru || "Belum diploting";

        const fExpected = noTp ? n : n * tps.length;
        const sExpected = noLm ? n : n * lms.length;
        const uExpected = uApplies ? n : 0;
        let fDone = 0;
        let sDone = 0;
        let uDone = 0;

        students.forEach((s) => {
          tps.forEach((t) => {
            if (formatifKosong[`${s.id}|${t.id}`] === 0) fDone++;
          });
          lms.forEach((l) => {
            if (sumatifSet.has(`${s.id}|${l.id}`)) sDone++;
          });
          if (uApplies) {
            const ok = p
              ? ujianPloting.has(`${s.id}|${p.id}`) ||
                ujianMapel.has(`${s.id}|${mapelId}`)
              : ujianMapel.has(`${s.id}|${mapelId}`);
            if (ok) uDone++;
          }
        });

        const state = noPlot
          ? "empty"
          : stateOf(fDone + sDone + uDone, fExpected + sExpected + uExpected);

        const todo = [];
        if (noTp) todo.push("TP belum dibuat");
        else if (fDone < fExpected) todo.push(`${fExpected - fDone} formatif`);
        if (noLm) todo.push("lingkup materi belum dibuat");
        else if (sDone < sExpected) todo.push(`${sExpected - sDone} sumatif`);
        if (uApplies && uDone < uExpected)
          todo.push(`${uExpected - uDone} ujian`);

        return {
          id: mapelId,
          mapel: mapelTitle(m),
          guru,
          isFallback,
          noPlot,
          todo,
          fDone,
          sDone,
          uDone,
          fExpected,
          sExpected,
          uExpected,
          state,
        };
      })
      .sort((a, b) => a.mapel.localeCompare(b.mapel, "id"));

    const pDone = rows.reduce((a, r) => a + r.fDone + r.sDone + r.uDone, 0);
    const pTotal = rows.reduce(
      (a, r) => a + r.fExpected + r.sExpected + r.uExpected,
      0,
    );
    const penilaian = {
      rows,
      done: pDone,
      total: pTotal,
      percent: pct(pDone, pTotal),
      state: rows.length ? stateOf(pDone, pTotal) : "empty",
      issues: rows.filter((r) => r.state !== "ok").length,
    };

    const items = rows.map((r) => {
      const c = capMap[`${k.id}|${r.id}`] || {};
      return {
        id: r.id,
        mapel: r.mapel,
        state:
          c.tinggi && c.rendah
            ? "ok"
            : c.tinggi || c.rendah
              ? "partial"
              : "empty",
      };
    });
    const cDone = items.filter((i) => i.state === "ok").length;
    const cap = {
      items,
      done: cDone,
      total: items.length,
      percent: pct(cDone, items.length),
      state: items.length ? stateOf(cDone, items.length) : "empty",
      issues: items.length - cDone,
    };

    const missingCat = students.filter(
      (s) => !(catSet.has(`${s.id}|${k.id}`) || catSet.has(`${s.id}|*`)),
    );
    const catDone = students.length - missingCat.length;
    const cat = {
      missing: missingCat,
      done: catDone,
      total: students.length,
      percent: pct(catDone, students.length),
      state: stateOf(catDone, students.length),
      issues: missingCat.length,
    };

    const ready = [penilaian, cap, cat].every((s) => s.state === "ok");
    const anyDone = penilaian.done + cap.done + cat.done > 0;

    return {
      id: k.id,
      nama: k.nama_kelas || "(tanpa nama)",
      tingkat: k.tingkat,
      tahun: k.expand?.tahun_ajaran_id
        ? tahunLabel(k.expand.tahun_ajaran_id)
        : "Tanpa tahun ajaran",
      walikelas: k.expand?.walikelas_id?.nama_lengkap || "-",
      siswaCount: students.length,
      penilaian,
      cap,
      cat,
      ready,
      overall: Math.floor((penilaian.percent + cap.percent + cat.percent) / 3),
      state: ready ? "ok" : anyDone ? "partial" : "empty",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Komponen dasar                                                      */
/* ------------------------------------------------------------------ */

const svgProps = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const IconChevron = ({ className = "h-4 w-4" }) => (
  <svg {...svgProps} className={className}>
    <path d="M5 8l5 5 5-5" />
  </svg>
);
const IconCheck = ({ className = "h-4 w-4" }) => (
  <svg {...svgProps} className={className}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);
const IconAlert = ({ className = "h-4 w-4" }) => (
  <svg {...svgProps} className={className}>
    <path d="M10 6v5M10 14.2v.1" />
  </svg>
);
const IconRefresh = ({ className = "h-4 w-4" }) => (
  <svg {...svgProps} className={className}>
    <path d="M16 10a6 6 0 10-1.8 4.3M16 4.5V8h-3.5" />
  </svg>
);

function Bar({ percent, state }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all duration-500 ${TONE[state].bar}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function Pill({ state, children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONE[state].pill}`}
    >
      {children ?? TONE[state].label}
    </span>
  );
}

function StateBadge({ state, className = "h-8 w-8" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${TONE[state].soft} ${className}`}
    >
      {state === "ok" ? <IconCheck /> : <IconAlert />}
    </span>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
            value === o.value
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const fieldCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition hover:border-slate-300 focus:outline-none focus-visible:border-slate-900 focus-visible:ring-4 focus-visible:ring-slate-900/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  className = "",
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!options.length}
        className={fieldCls}
      >
        {!options.length && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Notice({ children, tone = "default" }) {
  const tones = {
    default: "border-slate-300 text-slate-500",
    warn: "border-slate-300 bg-slate-50 text-slate-800",
  };
  return (
    <div
      className={`rounded-2xl border border-dashed bg-white p-6 text-center text-sm sm:p-10 ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="h-24 rounded-2xl bg-slate-100" />
        ))}
      </div>
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="h-20 rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Baris kelas                                                         */
/* ------------------------------------------------------------------ */

function Meter({ label, text, percent, state }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-slate-500">{label}</span>
        <span className="tabular-nums text-slate-700">{text}</span>
      </div>
      <div className="mt-1.5">
        <Bar percent={percent} state={state} />
      </div>
    </div>
  );
}

function DetailList({ title, empty, children, count }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {count === 0 ? (
        <p className="mt-2 text-sm text-emerald-600">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">{children}</ul>
      )}
    </div>
  );
}

function KelasRow({ r, open, onToggle, showTahun }) {
  const mapelIssues = r.penilaian.rows.filter((x) => x.state !== "ok");
  const capIssues = r.cap.items.filter((x) => x.state !== "ok");
  const CAT_MAX = 12;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full items-center gap-4 rounded-2xl p-4 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_auto]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <StateBadge state={r.state} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{r.nama}</p>
            <p className="truncate text-xs text-slate-500">
              {r.walikelas} · {r.siswaCount} siswa
              {showTahun ? ` · ${r.tahun}` : ""}
            </p>
          </div>
        </div>
        <Meter
          label="Penilaian"
          text={r.penilaian.total ? `${r.penilaian.percent}%` : "-"}
          percent={r.penilaian.percent}
          state={r.penilaian.state}
        />
        <Meter
          label="Capaian"
          text={r.cap.total ? `${r.cap.done}/${r.cap.total}` : "-"}
          percent={r.cap.percent}
          state={r.cap.state}
        />
        <Meter
          label="Catatan"
          text={r.cat.total ? `${r.cat.done}/${r.cat.total}` : "-"}
          percent={r.cat.percent}
          state={r.cat.state}
        />
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <Pill state={r.state} />
          <IconChevron
            className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="grid gap-6 border-t border-slate-100 p-4 md:grid-cols-3">
          <DetailList
            title="Penilaian"
            count={mapelIssues.length}
            empty={
              r.penilaian.rows.length
                ? "Semua mapel lengkap"
                : "Belum ada mapel untuk kelas ini"
            }
          >
            {mapelIssues.map((m) => (
              <li key={m.id} className="text-sm">
                <p className="font-medium text-slate-900">{m.mapel}</p>
                <p
                  className={`text-xs ${m.noPlot && !m.isFallback ? "text-rose-600" : "text-slate-500"}`}
                >
                  {m.guru}
                  {m.noPlot && m.isFallback ? " · belum diploting" : ""}
                </p>
                {m.todo.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Kurang: {m.todo.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </DetailList>

          <DetailList
            title="Capaian kompetensi"
            count={capIssues.length}
            empty="Semua capaian lengkap"
          >
            {capIssues.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate text-slate-700">{i.mapel}</span>
                <Pill state={i.state}>
                  {i.state === "partial" ? "Sebagian" : "Kosong"}
                </Pill>
              </li>
            ))}
          </DetailList>

          <DetailList
            title="Catatan siswa"
            count={r.cat.missing.length}
            empty="Semua siswa sudah punya catatan"
          >
            {r.cat.missing.slice(0, CAT_MAX).map((s) => (
              <li key={s.id} className="truncate text-sm text-slate-700">
                {s.nama_siswa}
              </li>
            ))}
            {r.cat.missing.length > CAT_MAX && (
              <li className="text-xs text-slate-400">
                +{r.cat.missing.length - CAT_MAX} siswa lainnya
              </li>
            )}
          </DetailList>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman                                                             */
/* ------------------------------------------------------------------ */

export default function MonitoringKesiapanRaporAdminPage() {
  const [me, setMe] = useState(undefined);
  const [tahunList, setTahunList] = useState([]);
  const [kelasAll, setKelasAll] = useState([]);
  const [ujianAll, setUjianAll] = useState([]);
  const [scope, setScope] = useState(""); // "" = belum dimuat, "all" = semua tahun, selain itu id tahun ajaran
  const [ujianId, setUjianId] = useState("");
  const [base, setBase] = useState(null);
  const [nilaiUjian, setNilaiUjian] = useState([]);
  const [initLoading, setInitLoading] = useState(true);
  const [baseLoading, setBaseLoading] = useState(false);
  const [ujianLoading, setUjianLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState("semua");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState("");

  const isAdmin = !!me && ROLE_ADMIN.has(me.role);

  /* 0. Auth */
  useEffect(() => {
    const read = () => {
      try {
        return getCurrentUser() ?? pb?.authStore?.record ?? null;
      } catch {
        return pb?.authStore?.record ?? null;
      }
    };
    setMe(read());
    const unsub = pb.authStore.onChange(() => setMe(read()));
    return () => unsub?.();
  }, []);

  /* 1. tahun_ajaran + kelas + pengaturan_ujian */
  useEffect(() => {
    if (!isAdmin) {
      if (me !== undefined) setInitLoading(false);
      return;
    }
    let off = false;
    (async () => {
      setInitLoading(true);
      setError("");
      try {
        const [tahunAll, kelas, ujian] = await Promise.all([
          full("tahun_ajaran", { sort: "-tahun,-semester" }),
          full("kelas", {
            expand: "walikelas_id,pendamping_id,tahun_ajaran_id",
            sort: "nama_kelas",
          }),
          full("pengaturan_ujian"),
        ]);
        if (off) return;
        const aktif = tahunAll.find((x) => x.is_aktif) || tahunAll[0] || null;
        setTahunList(tahunAll);
        setKelasAll(kelas);
        setUjianAll(ujian);
        setScope((prev) => {
          if (prev === "all" || tahunAll.some((t) => t.id === prev))
            return prev;
          const adaKelas =
            aktif && kelas.some((k) => ids(k.tahun_ajaran_id)[0] === aktif.id);
          return adaKelas ? aktif.id : "all";
        });
      } catch (e) {
        if (!off) setError(e?.message || "Gagal memuat data kelas");
      } finally {
        if (!off) setInitLoading(false);
      }
    })();
    return () => {
      off = true;
    };
  }, [me, isAdmin, reloadKey]);

  const aktifId = (tahunList.find((t) => t.is_aktif) || tahunList[0])?.id;

  const kelasList = useMemo(
    () =>
      kelasAll
        .filter((k) => scope === "all" || ids(k.tahun_ajaran_id)[0] === scope)
        .sort((a, b) => {
          const aA = ids(a.tahun_ajaran_id)[0] === aktifId ? 0 : 1;
          const bA = ids(b.tahun_ajaran_id)[0] === aktifId ? 0 : 1;
          if (aA !== bA) return aA - bA;
          if ((a.tingkat || 0) !== (b.tingkat || 0))
            return (a.tingkat || 0) - (b.tingkat || 0);
          return (a.nama_kelas || "").localeCompare(b.nama_kelas || "", "id", {
            numeric: true,
          });
        }),
    [kelasAll, scope, aktifId],
  );

  const ujianList = useMemo(
    () =>
      scope === "all"
        ? ujianAll
        : ujianAll.filter((u) => ids(u.tahun_ajaran_id)[0] === scope),
    [ujianAll, scope],
  );

  useEffect(() => {
    setUjianId((prev) =>
      ujianList.some((u) => u.id === prev)
        ? prev
        : (ujianList.find((u) => u.status_akses === "buka") || ujianList[0])
            ?.id || "",
    );
  }, [ujianList]);

  const kelasKey = kelasList.map((k) => k.id).join(",");

  /* 2. Data penilaian semua kelas terpilih */
  useEffect(() => {
    if (!isAdmin || !kelasKey) {
      setBase(null);
      return;
    }
    let off = false;
    (async () => {
      setBaseLoading(true);
      try {
        const kIds = kelasKey.split(",");
        const anyOf = (field, op) =>
          kIds.map((id) => `${field} ${op} "${id}"`).join(" || ");
        const bySiswa = anyOf("siswa_id.kelas_id", "=");
        const byKelas = anyOf("kelas_id", "~");
        const [
          siswa,
          ploting,
          tp,
          lm,
          formatif,
          sumatif,
          capaian,
          catatan,
          mapelAll,
        ] = await Promise.all([
          full("siswa", {
            filter: anyOf("kelas_id", "="),
            sort: "nama_siswa",
            fields: "id,nama_siswa,kelas_id",
          }),
          full("ploting_guru", { filter: byKelas, expand: "guru_id,mapel_id" }),
          full("tujuan_pembelajaran", {
            filter: byKelas,
            fields: "id,no_tp,mapel_id,kelas_id",
          }),
          full("lingkup_materi", {
            filter: byKelas,
            fields: "id,nama,mapel_id,kelas_id",
          }),
          full("nilai_formatif", {
            filter: bySiswa,
            fields: "id,tp_id,siswa_id,k1,k2,k3,k4",
          }),
          full("nilai_sumatif", {
            filter: bySiswa,
            fields: "id,lm_id,siswa_id,nilai",
          }),
          full("capaian_kompetensi", {
            filter: byKelas,
            fields: "id,mapel_id,kelas_id,capaian_tinggi,capaian_rendah",
          }),
          full("catatan_siswa", {
            filter: bySiswa,
            fields: "id,siswa_id,kelas_id,catatan",
          }),
          full("mata_pelajaran", {
            sort: "nama_mapel",
            fields:
              "id,nama_mapel,Label,kategori,target_tingkat,spesifik_kelas_id",
          }),
        ]);
        if (off) return;
        setBase({
          key: kelasKey,
          siswa,
          ploting,
          tp,
          lm,
          formatif,
          sumatif,
          capaian,
          catatan,
          mapelAll,
        });
      } catch (e) {
        if (!off) setError(e?.message || "Gagal memuat data penilaian");
      } finally {
        if (!off) setBaseLoading(false);
      }
    })();
    return () => {
      off = true;
    };
  }, [isAdmin, kelasKey, reloadKey]);

  /* 3. nilai_ujian untuk ujian terpilih */
  useEffect(() => {
    if (!isAdmin || !ujianId) {
      setNilaiUjian([]);
      return;
    }
    let off = false;
    setUjianLoading(true);
    full("nilai_ujian", {
      filter: `pengaturan_ujian_id ~ "${ujianId}"`,
      fields: "id,siswa_id,ploting_guru_id,mapel_id,nilai",
    })
      .then((r) => !off && setNilaiUjian(r))
      .catch((e) => !off && setError(e?.message || "Gagal memuat nilai ujian"))
      .finally(() => !off && setUjianLoading(false));
    return () => {
      off = true;
    };
  }, [isAdmin, ujianId, reloadKey]);

  const reports = useMemo(() => {
    if (initLoading) return null;
    if (!kelasList.length) return [];
    if (!base || base.key !== kelasKey) return null;
    const ujian = ujianList.find((u) => u.id === ujianId);
    return buildReport({ base, kelasList, ujian, nilaiUjian });
  }, [initLoading, base, kelasKey, kelasList, ujianList, ujianId, nilaiUjian]);

  const summary = useMemo(() => {
    if (!reports) return null;
    const count = (s) => reports.filter((r) => r.state === s).length;
    return {
      total: reports.length,
      ready: count("ok"),
      partial: count("partial"),
      empty: count("empty"),
      siswa: reports.reduce((a, r) => a + r.siswaCount, 0),
      overall: reports.length
        ? Math.floor(
            reports.reduce((a, r) => a + r.overall, 0) / reports.length,
          )
        : 0,
    };
  }, [reports]);

  const shown = useMemo(() => {
    if (!reports) return [];
    const needle = q.trim().toLowerCase();
    return reports.filter((r) => {
      if (filter === "belum" && r.ready) return false;
      if (filter === "siap" && !r.ready) return false;
      if (!needle) return true;
      return (
        r.nama.toLowerCase().includes(needle) ||
        r.walikelas.toLowerCase().includes(needle)
      );
    });
  }, [reports, filter, q]);

  const tahun = tahunList.find((t) => t.id === scope);
  const loading =
    isAdmin && (initLoading || (!!kelasKey && !reports && !error));
  const refreshing = baseLoading || ujianLoading;

  const scopeOptions = [
    { value: "all", label: `Semua tahun (${kelasAll.length} kelas)` },
    ...tahunList.map((t) => ({
      value: t.id,
      label: `${tahunLabel(t)}${t.is_aktif ? " · aktif" : ""} (${
        kelasAll.filter((k) => ids(k.tahun_ajaran_id)[0] === t.id).length
      } kelas)`,
    })),
  ];

  const cards = summary
    ? [
        {
          label: "Total kelas",
          value: summary.total,
          sub: `${summary.siswa} siswa`,
          state: "na",
        },
        {
          label: "Siap cetak",
          value: summary.ready,
          sub: "kelas lengkap",
          state: "ok",
        },
        {
          label: "Belum lengkap",
          value: summary.partial,
          sub: "kelas sedang berjalan",
          state: "partial",
        },
        {
          label: "Belum mulai",
          value: summary.empty,
          sub: "kelas belum ada data",
          state: "empty",
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="mt-1.5 text-sm text-slate-500">
            {scope === "all"
              ? "Semua tahun ajaran"
              : tahun
                ? `Tahun ajaran ${tahunLabel(tahun)}${tahun.is_aktif ? " (aktif)" : ""}`
                : "Pantau kelengkapan penilaian, capaian kompetensi, dan catatan siswa."}
          </p>
        </div>

        {isAdmin && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
            <SelectField
              label="Tahun ajaran"
              className="w-full sm:w-64"
              value={scope}
              onChange={setScope}
              placeholder="Belum ada kelas"
              options={kelasAll.length || tahunList.length ? scopeOptions : []}
            />
            <div className="flex items-end gap-2">
              <SelectField
                label="Ujian"
                className="min-w-0 flex-1 sm:w-60 sm:flex-none"
                value={ujianId}
                onChange={setUjianId}
                placeholder="Belum ada ujian"
                options={ujianList.map((u) => ({
                  value: u.id,
                  label: ujianLabel(u),
                }))}
              />
              <button
                type="button"
                onClick={() => setReloadKey((n) => n + 1)}
                disabled={initLoading || refreshing}
                aria-label="Muat ulang data"
                title="Muat ulang"
                className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15 disabled:opacity-50"
              >
                <IconRefresh
                  className={`h-4 w-4 ${initLoading || refreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 font-medium underline"
            onClick={() => {
              setError("");
              setReloadKey((n) => n + 1);
            }}
          >
            Coba lagi
          </button>
        </div>
      )}

      {me === null && <Notice>Silakan login terlebih dahulu.</Notice>}
      {me && !isAdmin && <Notice>Halaman ini khusus admin dan ICT.</Notice>}
      {loading && <Skeleton />}

      {summary && (
        <div
          className={`space-y-6 transition-opacity ${refreshing ? "opacity-60" : ""}`}
        >
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div
                key={c.label}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-600">
                    {c.label}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${TONE[c.state].bar}`}
                  />
                </div>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
                  {c.value}
                </p>
                <p className="text-xs text-slate-500">{c.sub}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-slate-600">
                Rata-rata kelengkapan seluruh kelas
              </h2>
              <span className="text-xl font-semibold tabular-nums text-slate-900">
                {summary.overall}%
              </span>
            </div>
            <div className="mt-3">
              <Bar
                percent={summary.overall}
                state={
                  summary.total && summary.ready === summary.total
                    ? "ok"
                    : summary.overall === 0
                      ? "empty"
                      : "partial"
                }
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "semua", label: `Semua (${summary.total})` },
                  {
                    value: "belum",
                    label: `Belum siap (${summary.total - summary.ready})`,
                  },
                  { value: "siap", label: `Siap (${summary.ready})` },
                ]}
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari kelas atau wali kelas"
                aria-label="Cari kelas atau wali kelas"
                className={`${fieldCls} sm:w-64`}
              />
            </div>

            {reports.length === 0 && (
              <Notice>
                {kelasAll.length
                  ? "Belum ada kelas pada tahun ajaran ini. Coba pilih tahun lain atau Semua tahun."
                  : "Koleksi kelas masih kosong."}
              </Notice>
            )}
            {reports.length > 0 && shown.length === 0 && (
              <Notice>Tidak ada kelas yang cocok dengan filter.</Notice>
            )}

            <div className="space-y-3">
              {shown.map((r) => (
                <KelasRow
                  key={r.id}
                  r={r}
                  showTahun={scope === "all"}
                  open={openId === r.id}
                  onToggle={() =>
                    setOpenId((cur) => (cur === r.id ? "" : r.id))
                  }
                />
              ))}
            </div>
          </section>

          <p className="text-xs leading-relaxed text-slate-500">
            Perhitungan sama dengan halaman kelengkapan rapor per kelas: hanya
            mapel kategori <code>umum</code> yang sesuai{" "}
            <code>target_tingkat</code> dan <code>spesifik_kelas_id</code>.
            Ujian hanya dihitung untuk kelas yang menjadi target ujian terpilih.
            Kelas dinyatakan siap cetak jika penilaian, capaian kompetensi, dan
            catatan siswa semuanya lengkap.
          </p>
        </div>
      )}
    </div>
  );
}
