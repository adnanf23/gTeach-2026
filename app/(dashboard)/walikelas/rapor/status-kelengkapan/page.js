"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pb, getCurrentUser } from "@/lib/pocketbase";

/* ------------------------------------------------------------------ */
/* Konfigurasi                                                         */
/* ------------------------------------------------------------------ */

const MAPEL_KATEGORI_DIPAKAI = ["umum"];

const KOLOM_FORMATIF = ["k1", "k2", "k3", "k4"];
const FORMATIF_SKIP = -1;

const TONE = {
  ok: {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    label: "Lengkap",
  },
  partial: {
    bar: "bg-blue-500",
    dot: "bg-blue-500",
    pill: "bg-blue-50 text-blue-700 ring-blue-600/20",
    label: "Belum lengkap",
  },
  empty: {
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 ring-rose-600/20",
    label: "Kosong",
  },
  na: {
    bar: "bg-slate-300",
    dot: "bg-slate-300",
    pill: "bg-slate-100 text-slate-600 ring-slate-500/20",
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

function ujianBerlaku(ujian, kelas) {
  const tingkatOk =
    !kelas.tingkat ||
    ids(ujian.target_tingkat).map(String).includes(String(kelas.tingkat));
  const targetKelas = ids(ujian.target_kelas_id);
  const kelasOk = targetKelas.length === 0 || targetKelas.includes(kelas.id);
  return tingkatOk && kelasOk;
}

const ROLE_ADMIN = new Set(["admin", "ict"]);

const mapelTitle = (m) =>
  (m?.Label && String(m.Label).trim()) || m?.nama_mapel || "(tanpa nama)";

/* ------------------------------------------------------------------ */
/* Hitung kelengkapan                                                  */
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
    const fallbackLabel = k.expand?.walikelas_id?.nama_lengkap
      ? "walikelas"
      : k.expand?.pendamping_id?.nama_lengkap
        ? "pendamping"
        : null;

    const plotByMapel = new Map();
    ploting
      .filter((p) => ids(p.kelas_id).includes(k.id))
      .forEach((p) => {
        const mid = ids(p.mapel_id)[0];
        if (mid && !plotByMapel.has(mid)) plotByMapel.set(mid, p);
      });

    const seenMapel = new Set();
    const relevantMapels = [];
    (mapelAll || []).forEach((m) => {
      if (seenMapel.has(m.id)) return;
      if (!MAPEL_KATEGORI_DIPAKAI.includes(m.kategori)) return;

      const spesifik = ids(m.spesifik_kelas_id);
      const kelasOk = spesifik.length === 0 || spesifik.includes(k.id);
      if (!kelasOk) return;

      const tingkatOk = k.tingkat
        ? ids(m.target_tingkat).map(String).includes(String(k.tingkat))
        : false;
      const isPlotted = plotByMapel.has(m.id);

      if (!tingkatOk && !isPlotted) return;

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
        const guruLabel = plottedGuru || fallbackGuru || "Belum diploting";

        const fExpected = noTp ? n : n * tps.length;
        const sExpected = noLm ? n : n * lms.length;
        const uExpected = uApplies ? n : 0;
        let fDone = 0;
        let sDone = 0;
        let uDone = 0;
        const missing = [];

        students.forEach((s) => {
          let fMiss = 0;
          let sMiss = 0;
          let uMiss = false;
          tps.forEach((t) => {
            if (formatifKosong[`${s.id}|${t.id}`] === 0) fDone++;
            else fMiss++;
          });
          lms.forEach((l) => {
            if (sumatifSet.has(`${s.id}|${l.id}`)) sDone++;
            else sMiss++;
          });
          if (uApplies) {
            const ok = p
              ? ujianPloting.has(`${s.id}|${p.id}`) ||
                ujianMapel.has(`${s.id}|${mapelId}`)
              : ujianMapel.has(`${s.id}|${mapelId}`);
            if (ok) uDone++;
            else uMiss = true;
          }
          if (fMiss || sMiss || uMiss) {
            const parts = [];
            if (fMiss) parts.push(`${fMiss} formatif`);
            if (sMiss) parts.push(`${sMiss} sumatif`);
            if (uMiss) parts.push("ujian");
            missing.push({
              id: s.id,
              nama: s.nama_siswa,
              detail: `(${parts.join(", ")})`,
            });
          }
        });

        const state = noPlot
          ? "empty"
          : stateOf(fDone + sDone + uDone, fExpected + sExpected + uExpected);

        return {
          id: mapelId,
          plotingId: p?.id || null,
          mapelId,
          mapel: mapelTitle(m),
          guru: guruLabel,
          isFallback,
          fallbackLabel,
          noPlot,
          noTp,
          tpCount: tps.length,
          fDone,
          fExpected,
          noLm,
          lmCount: lms.length,
          sDone,
          sExpected,
          uApplies,
          uDone,
          uExpected,
          missing,
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

    const seen = new Set();
    const items = [];
    rows.forEach((r) => {
      if (!r.mapelId || seen.has(r.mapelId)) return;
      seen.add(r.mapelId);
      const c = capMap[`${k.id}|${r.mapelId}`] || {};
      const tinggi = !!c.tinggi;
      const rendah = !!c.rendah;
      items.push({
        id: r.mapelId,
        mapel: r.mapel,
        tinggi,
        rendah,
        state: tinggi && rendah ? "ok" : tinggi || rendah ? "partial" : "empty",
      });
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
    const cat = {
      missing: missingCat,
      done: students.length - missingCat.length,
      total: students.length,
      percent: pct(students.length - missingCat.length, students.length),
      state: stateOf(students.length - missingCat.length, students.length),
      issues: missingCat.length,
    };

    const ready = [penilaian, cap, cat].every((s) => s.state === "ok");
    const anyDone = penilaian.done + cap.done + cat.done > 0;

    return {
      id: k.id,
      nama: k.nama_kelas || "(tanpa nama)",
      walikelas: k.expand?.walikelas_id?.nama_lengkap || "-",
      siswaCount: students.length,
      penilaian,
      cap,
      cat,
      ready,
      state: ready ? "ok" : anyDone ? "partial" : "empty",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Ikon                                                                */
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

/* ------------------------------------------------------------------ */
/* Komponen dasar                                                      */
/* ------------------------------------------------------------------ */

const STROKE = {
  ok: "stroke-emerald-500",
  partial: "stroke-blue-500",
  empty: "stroke-rose-500",
  na: "stroke-slate-300",
};

const SOFT = {
  ok: "bg-emerald-50 text-emerald-600",
  partial: "bg-blue-50 text-blue-600",
  empty: "bg-rose-50 text-rose-600",
  na: "bg-slate-100 text-slate-400",
};

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

function Dot({ state }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${TONE[state].dot}`} />
  );
}

function StateBadge({ state, className = "h-9 w-9" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${SOFT[state]} ${className}`}
    >
      {state === "ok" ? <IconCheck /> : <IconAlert />}
    </span>
  );
}

function Ring({ percent, state, size = 104, stroke = 10, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (percent / 100) * c}
          className={`transition-all duration-700 ${STROKE[state]}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
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
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            value === o.value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Select kustom                                                       */
/* ------------------------------------------------------------------ */

function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "Pilih",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openMenu = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };
  const pick = (o) => {
    onChange(o.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[active]) pick(options[active]);
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {label && (
        <span className="mb-1.5 block text-xs font-medium text-slate-500">
          {label}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm shadow-sm transition hover:border-slate-300 focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span
          className={`truncate ${selected ? "text-slate-900" : "text-slate-400"}`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <IconChevron
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 sm:min-w-[15rem]"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              ref={(el) => {
                if (el && active === i) el.scrollIntoView({ block: "nearest" });
              }}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                active === i ? "bg-slate-100" : ""
              } ${
                o.value === value
                  ? "font-medium text-indigo-700"
                  : "text-slate-700"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.hint && (
                  <span className="block truncate text-xs font-normal text-slate-400">
                    {o.hint}
                  </span>
                )}
              </span>
              {o.value === value && <IconCheck className="h-4 w-4 shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel detail                                                        */
/* ------------------------------------------------------------------ */

function Stat({
  label,
  done,
  expected,
  note,
  emptyText,
  emptyTone = "text-slate-400",
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {emptyText ? (
        <p className={`mt-2 text-xs font-medium ${emptyTone}`}>{emptyText}</p>
      ) : (
        <>
          <div className="mt-2">
            <Bar
              percent={pct(done, expected)}
              state={stateOf(done, expected)}
            />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-slate-600">
            {done}/{expected} nilai{note ? `, ${note}` : ""}
          </p>
        </>
      )}
    </div>
  );
}

function MapelRow({ r, ujianId }) {
  const [open, setOpen] = useState(false);

  const guruTone = r.noPlot
    ? r.isFallback
      ? "text-blue-600"
      : "text-rose-600"
    : "text-slate-500";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StateBadge state={r.state} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-blue-600">{r.mapel}</p>
            <p className={`truncate text-xs ${guruTone}`}>
              {r.guru}
              {r.isFallback && (
                <span className="text-slate-400"> · {r.fallbackLabel}</span>
              )}
            </p>
          </div>
        </div>
        <Pill state={r.state} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Formatif"
          done={r.fDone}
          expected={r.fExpected}
          note={`${r.tpCount} TP`}
          emptyText={r.noTp ? "TP belum dibuat" : ""}
          emptyTone="text-rose-600"
        />
        <Stat
          label="Sumatif"
          done={r.sDone}
          expected={r.sExpected}
          note={`${r.lmCount} LM`}
          emptyText={r.noLm ? "Lingkup materi belum dibuat" : ""}
          emptyTone="text-rose-600"
        />
        <Stat
          label="Ujian"
          done={r.uDone}
          expected={r.uExpected}
          emptyText={
            r.uApplies
              ? ""
              : ujianId
                ? "Tidak berlaku untuk kelas ini"
                : "Belum ada ujian dipilih"
          }
        />
      </div>

      {r.missing.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {r.missing.length} siswa perlu dilengkapi
            <IconChevron
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
          {open && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {r.missing.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-200"
                >
                  {m.nama}
                  <span className="text-slate-400"> {m.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CapaianCard({ i }) {
  const row = (label, ok) => (
    <p className="flex items-center gap-2 text-sm text-slate-700">
      <Dot state={ok ? "ok" : "empty"} />
      <span>{label}</span>
      <span
        className={`ml-auto text-xs ${ok ? "text-emerald-600" : "text-rose-600"}`}
      >
        {ok ? "Terisi" : "Belum diisi"}
      </span>
    </p>
  );
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StateBadge state={i.state} />
          <p className="truncate font-semibold text-blue-600">{i.mapel}</p>
        </div>
        <Pill state={i.state} />
      </div>
      <div className="mt-4 space-y-2">
        {row("Capaian tinggi", i.tinggi)}
        {row("Capaian rendah", i.rendah)}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-40 rounded-3xl bg-slate-100" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-28 rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="h-48 rounded-2xl bg-slate-100" />
    </div>
  );
}

function Notice({ children, tone = "default" }) {
  const tones = {
    default: "border-slate-300 text-slate-500",
    info: "border-indigo-200 bg-indigo-50/60 text-indigo-800",
    warn: "border-blue-200 bg-blue-50/60 text-blue-800",
  };
  return (
    <div
      className={`rounded-2xl border border-dashed bg-white p-6 text-center text-sm sm:p-10 ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman                                                             */
/* ------------------------------------------------------------------ */

export default function StatusKelengkapanRaporPage() {
  const [me, setMe] = useState(undefined);
  const [tahun, setTahun] = useState(null);
  const [kelasList, setKelasList] = useState([]);
  const [kelasId, setKelasId] = useState("");
  const [ujianList, setUjianList] = useState([]);
  const [ujianId, setUjianId] = useState("");
  const [base, setBase] = useState(null);
  const [nilaiUjian, setNilaiUjian] = useState([]);
  const [initLoading, setInitLoading] = useState(true);
  const [baseLoading, setBaseLoading] = useState(false);
  const [ujianLoading, setUjianLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState("penilaian");
  const [filter, setFilter] = useState("semua");

  /* 0. Auth store subscription */
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

  /* 1. Tahun ajaran + kelas + ujian */
  useEffect(() => {
    if (!me) {
      if (me === null) setInitLoading(false);
      return;
    }
    let off = false;
    (async () => {
      setInitLoading(true);
      setError("");
      try {
        const tahunAll = await full("tahun_ajaran", {
          sort: "-tahun,-semester",
        });
        if (off) return;
        const t = tahunAll.find((x) => x.is_aktif) || tahunAll[0] || null;
        setTahun(t);

        const isAdmin = ROLE_ADMIN.has(me.role);
        const relFilter = `walikelas_id = "${me.id}" || pendamping_id = "${me.id}"`;
        const kelasFilter = isAdmin
          ? t
            ? `tahun_ajaran_id = "${t.id}"`
            : ""
          : relFilter;

        const [kelas, ujian] = await Promise.all([
          kelasFilter
            ? full("kelas", {
                filter: kelasFilter,
                expand: "walikelas_id,pendamping_id,tahun_ajaran_id",
              })
            : Promise.resolve([]),
          t
            ? full("pengaturan_ujian", {
                filter: `tahun_ajaran_id = "${t.id}"`,
              })
            : Promise.resolve([]),
        ]);
        if (off) return;

        const tId = t?.id;
        const sorted = [...kelas].sort((a, b) => {
          const aAktif = tId && ids(a.tahun_ajaran_id)[0] === tId ? 0 : 1;
          const bAktif = tId && ids(b.tahun_ajaran_id)[0] === tId ? 0 : 1;
          if (aAktif !== bAktif) return aAktif - bAktif;
          return (a.nama_kelas || "").localeCompare(b.nama_kelas || "", "id");
        });

        setKelasList(sorted);
        setUjianList(ujian);
        setKelasId((prev) =>
          sorted.some((k) => k.id === prev) ? prev : sorted[0]?.id || "",
        );
      } catch (e) {
        if (!off) setError(e?.message || "Gagal memuat data kelas");
      } finally {
        if (!off) setInitLoading(false);
      }
    })();
    return () => {
      off = true;
    };
  }, [me, reloadKey]);

  /* 2. Data penilaian + mata_pelajaran untuk kelas terpilih */
  useEffect(() => {
    if (!kelasId) {
      setBase(null);
      return;
    }
    let off = false;
    (async () => {
      setBaseLoading(true);
      try {
        const bySiswa = `siswa_id.kelas_id = "${kelasId}"`;
        const byKelas = `kelas_id ~ "${kelasId}"`;
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
            filter: `kelas_id = "${kelasId}"`,
            sort: "nama_siswa",
            fields: "id,nama_siswa,kelas_id",
          }),
          full("ploting_guru", {
            filter: byKelas,
            expand: "guru_id,mapel_id",
          }),
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
          kelasId,
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
  }, [kelasId, reloadKey]);

  const kelas = kelasList.find((k) => k.id === kelasId) || null;
  const kelasTahun = kelas?.expand?.tahun_ajaran_id || null;
  const kelasDiTahunAktif =
    !!tahun && !!kelas && ids(kelas.tahun_ajaran_id)[0] === tahun.id;

  const ujianOptions = useMemo(
    () =>
      kelas
        ? ujianList
            .filter((u) => ujianBerlaku(u, kelas))
            .map((u) => ({
              value: u.id,
              label: ujianLabel(u),
              hint:
                u.status_akses === "buka" ? "Akses dibuka" : "Akses ditutup",
            }))
        : [],
    [ujianList, kelas],
  );

  useEffect(() => {
    setUjianId((prev) => {
      if (ujianOptions.some((o) => o.value === prev)) return prev;
      const buka = ujianList.find(
        (u) =>
          u.status_akses === "buka" &&
          ujianOptions.some((o) => o.value === u.id),
      );
      return buka?.id || ujianOptions[0]?.value || "";
    });
  }, [ujianOptions, ujianList]);

  /* 3. Nilai ujian */
  useEffect(() => {
    if (!ujianId || !kelasId) {
      setNilaiUjian([]);
      return;
    }
    let off = false;
    setUjianLoading(true);
    full("nilai_ujian", {
      filter: `pengaturan_ujian_id ~ "${ujianId}" && siswa_id.kelas_id = "${kelasId}"`,
      fields: "id,siswa_id,ploting_guru_id,mapel_id,nilai",
    })
      .then((r) => !off && setNilaiUjian(r))
      .catch((e) => !off && setError(e?.message || "Gagal memuat nilai ujian"))
      .finally(() => !off && setUjianLoading(false));
    return () => {
      off = true;
    };
  }, [ujianId, kelasId, reloadKey]);

  const report = useMemo(() => {
    if (!base || !kelas || base.kelasId !== kelas.id) return null;
    const ujian = ujianList.find((u) => u.id === ujianId);
    return buildReport({ base, kelasList: [kelas], ujian, nilaiUjian })[0];
  }, [base, kelas, ujianList, ujianId, nilaiUjian]);

  const loadingKelas = initLoading || (!!kelasId && !report && !error);
  const refreshing = baseLoading || ujianLoading;

  const sections = report
    ? [
        {
          key: "penilaian",
          title: "Penilaian",
          sec: report.penilaian,
          big: report.penilaian.total ? `${report.penilaian.percent}%` : "-",
          sub: report.penilaian.total
            ? `${report.penilaian.done} dari ${report.penilaian.total} nilai`
            : "Belum ada data",
          todo: `${report.penilaian.issues} mapel perlu dilengkapi`,
        },
        {
          key: "cap",
          title: "Capaian kompetensi",
          sec: report.cap,
          big: report.cap.total
            ? `${report.cap.done}/${report.cap.total}`
            : "-",
          sub: "mapel sudah lengkap",
          todo: `${report.cap.issues} mapel belum lengkap`,
        },
        {
          key: "cat",
          title: "Catatan siswa",
          sec: report.cat,
          big: report.cat.total
            ? `${report.cat.done}/${report.cat.total}`
            : "-",
          sub: "siswa sudah punya catatan",
          todo: `${report.cat.issues} siswa belum punya`,
        },
      ]
    : [];

  const overall = report
    ? Math.floor(
        sections.reduce((a, s) => a + s.sec.percent, 0) / sections.length,
      )
    : 0;

  const todoList = report
    ? [
        report.penilaian.rows.length === 0 && "belum ada mapel untuk kelas ini",
        report.penilaian.issues > 0 &&
          `${report.penilaian.issues} mapel penilaian`,
        report.cap.issues > 0 &&
          `${report.cap.issues} mapel capaian kompetensi`,
        report.cat.issues > 0 && `${report.cat.issues} catatan siswa`,
      ].filter(Boolean)
    : [];

  const onlyIssues = filter === "belum";
  const rowsShown = report
    ? report.penilaian.rows.filter((r) => !onlyIssues || r.state !== "ok")
    : [];
  const capShown = report
    ? report.cap.items.filter((i) => !onlyIssues || i.state !== "ok")
    : [];
  const catShown = report ? (onlyIssues ? report.cat.missing : base.siswa) : [];
  const missingIds = new Set((report?.cat.missing || []).map((s) => s.id));

  const notice = (() => {
    if (!me || initLoading || kelasId || error) return null;
    if (!tahun) {
      return (
        <Notice tone="warn">
          <p className="font-medium text-blue-900">
            Belum ada tahun ajaran aktif.
          </p>
          <p className="mt-1 text-blue-800">
            Minta admin/ICT menandai salah satu tahun ajaran dengan{" "}
            <code className="rounded bg-blue-100 px-1">is_aktif = true</code>.
          </p>
        </Notice>
      );
    }
    return (
      <Notice>
        Kamu belum terdaftar sebagai walikelas atau pendamping di kelas mana
        pun.
      </Notice>
    );
  })();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Kelengkapan rapor{kelas ? ` ${kelas.nama_kelas}` : ""}
          </h1>
          {kelas && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              <span className="break-words">
                {kelas.expand?.walikelas_id?.nama_lengkap
                  ? `Wali kelas ${kelas.expand.walikelas_id.nama_lengkap}`
                  : "Wali kelas belum diatur"}
                {report ? `, ${report.siswaCount} siswa` : ""}
                {kelasTahun ? `, tahun ajaran ${tahunLabel(kelasTahun)}` : ""}
              </span>
              {!kelasDiTahunAktif && tahun && (
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                  Bukan tahun aktif
                </span>
              )}
            </div>
          )}
        </div>

        {kelas && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
            {kelasList.length > 1 && (
              <Select
                label="Kelas"
                className="w-full sm:w-56"
                value={kelasId}
                onChange={setKelasId}
                options={kelasList.map((k) => {
                  const t = k.expand?.tahun_ajaran_id;
                  const aktif = tahun && t?.id === tahun.id;
                  return {
                    value: k.id,
                    label: k.nama_kelas || "(tanpa nama)",
                    hint: t
                      ? `${tahunLabel(t)}${aktif ? " · aktif" : ""}`
                      : undefined,
                  };
                })}
              />
            )}
            <div className="flex items-end gap-2">
              <Select
                label="Ujian"
                className="min-w-0 flex-1 sm:w-60 sm:flex-none"
                value={ujianId}
                onChange={setUjianId}
                options={ujianOptions}
                disabled={!ujianOptions.length}
                placeholder="Belum ada ujian"
              />
              <button
                type="button"
                onClick={() => setReloadKey((n) => n + 1)}
                disabled={initLoading || refreshing}
                aria-label="Muat ulang data"
                title="Muat ulang"
                className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:opacity-50"
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

      {me && loadingKelas && <Skeleton />}

      {notice}

      {report && (
        <div
          className={`space-y-6 transition-opacity ${refreshing ? "opacity-60" : ""}`}
        >
          <section className="flex flex-col items-center gap-5 rounded-3xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-6">
            <Ring percent={overall} state={report.state}>
              <span className="text-2xl font-semibold tabular-nums text-slate-900">
                {overall}%
              </span>
            </Ring>
            <div className="w-full min-w-0 text-center sm:flex-1 sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:justify-start">
                <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
                  {report.ready
                    ? "Rapor siap dicetak"
                    : "Rapor belum siap dicetak"}
                </h2>
                <Pill state={report.state} />
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {report.ready
                  ? "Semua penilaian, capaian kompetensi, dan catatan siswa sudah lengkap."
                  : `Yang perlu dilengkapi: ${todoList.join(", ")}.`}
              </p>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            {sections.map((s) => {
              const active = tab === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setTab(s.key)}
                  aria-pressed={active}
                  className={`rounded-2xl border bg-white p-4 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 ${
                    active
                      ? "border-indigo-500 ring-4 ring-indigo-500/10"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-600">
                      {s.title}
                    </span>
                    <StateBadge state={s.sec.state} className="h-6 w-6" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
                    {s.big}
                  </p>
                  <p className="text-xs text-slate-500">{s.sub}</p>
                  <div className="mt-3">
                    <Bar percent={s.sec.percent} state={s.sec.state} />
                  </div>
                  <p
                    className={`mt-2 text-xs ${
                      s.sec.state === "ok"
                        ? "text-emerald-600"
                        : "text-slate-500"
                    }`}
                  >
                    {s.sec.state === "ok" ? "Sudah lengkap" : s.todo}
                  </p>
                </button>
              );
            })}
          </div>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {tab === "penilaian"
                  ? "Penilaian per mapel"
                  : tab === "cap"
                    ? "Capaian kompetensi per mapel"
                    : "Catatan per siswa"}
              </h2>
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "semua", label: "Semua" },
                  { value: "belum", label: "Perlu dilengkapi" },
                ]}
              />
            </div>

            {tab === "penilaian" && (
              <div className="space-y-3">
                {report.penilaian.rows.length === 0 && (
                  <Notice>
                    Tidak ada mapel yang cocok untuk tingkat kelas ini.
                  </Notice>
                )}
                {report.penilaian.rows.length > 0 && rowsShown.length === 0 && (
                  <Notice>Semua mapel sudah lengkap.</Notice>
                )}
                {rowsShown.map((r) => (
                  <MapelRow
                    key={`${r.id}-${ujianId}`}
                    r={r}
                    ujianId={ujianId}
                  />
                ))}
              </div>
            )}

            {tab === "cap" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {report.cap.items.length === 0 && (
                  <div className="sm:col-span-2">
                    <Notice>
                      Tidak ada mapel yang cocok untuk tingkat kelas ini.
                    </Notice>
                  </div>
                )}
                {report.cap.items.length > 0 && capShown.length === 0 && (
                  <div className="sm:col-span-2">
                    <Notice>Semua capaian kompetensi sudah lengkap.</Notice>
                  </div>
                )}
                {capShown.map((i) => (
                  <CapaianCard key={i.id} i={i} />
                ))}
              </div>
            )}

            {tab === "cat" && (
              <>
                {base.siswa.length === 0 && (
                  <Notice>Belum ada siswa di kelas ini.</Notice>
                )}
                {base.siswa.length > 0 && catShown.length === 0 && (
                  <Notice>Semua siswa sudah punya catatan.</Notice>
                )}
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {catShown.map((s) => {
                    const missing = missingIds.has(s.id);
                    return (
                      <li
                        key={s.id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                      >
                        <StateBadge state={missing ? "empty" : "ok"} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {s.nama_siswa}
                          </p>
                          <p
                            className={`text-xs ${
                              missing ? "text-rose-600" : "text-emerald-600"
                            }`}
                          >
                            {missing
                              ? "Belum ada catatan"
                              : "Sudah ada catatan"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <p className="text-xs leading-relaxed text-slate-500">
            Daftar mapel mengikuti <code>target_tingkat</code> dan{" "}
            <code>spesifik_kelas_id</code> pada koleksi mata pelajaran, dan
            hanya kategori <code>umum</code> yang dihitung. Nama mapel diambil
            dari field <code>Label</code> (fallback ke <code>nama_mapel</code>).
            Formatif dihitung per siswa x TP; kolom bernilai -1 dilewati.
            Sumatif dihitung per siswa x lingkup materi. Nilai ujian dihitung
            dari ujian yang dipilih. Capaian kompetensi lengkap jika capaian
            tinggi dan rendah sama-sama terisi. Mapel yang belum diploting
            menampilkan walikelas/pendamping sebagai penanggung jawab.
          </p>
        </div>
      )}
    </div>
  );
}
