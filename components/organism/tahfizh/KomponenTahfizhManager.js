"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { getTahunAjaranList } from "@/actions/tahun-ajaran.action";
import {
  getMapelTahfizh,
  getKomponenTingkat,
  addKomponenTingkat,
  removeKomponenTingkat,
} from "@/actions/tahfizh.action";

const KATEGORI = [
  { key: "hafalan", label: "Hafalan Al-Qur'an" },
  { key: "jaritmatika", label: "Jaritmatika Al-Qur'an" },
  { key: "gesture", label: "Gesture" },
  { key: "hadits", label: "Hadits" },
  { key: "doa", label: "Doa" },
  { key: "wudhu", label: "Doa Berwudhu" },
];
const TINGKAT = ["1", "2", "3", "4", "5", "6"];
const sheetName = (label) => label.slice(0, 31);

/* ---------- Ikon kecil (tanpa dependensi) ---------- */
function Icon({ children, className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const IconPlus = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
const IconTrash = (p) => (
  <Icon {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);
const IconDownload = (p) => (
  <Icon {...p}>
    <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
);
const IconUpload = (p) => (
  <Icon {...p}>
    <path d="M12 15V3m0 0L8 7m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
);
const IconBook = (p) => (
  <Icon {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
    <path d="M4 19a2 2 0 0 0 2 2h13" />
  </Icon>
);
const IconCheck = (p) => (
  <Icon {...p}>
    <path d="m5 12 5 5 9-10" />
  </Icon>
);
const IconX = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
const IconSpinner = ({ className = "h-4 w-4" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={`${className} animate-spin motion-reduce:animate-none`}
    aria-hidden="true"
  >
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeOpacity=".25"
      strokeWidth="3"
    />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

const fieldCls =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-gray-900 focus:ring-4 focus:ring-gray-900/15";
const ghostBtnCls =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-900/20 disabled:cursor-not-allowed disabled:opacity-50";

export default function KomponenTahfizhManager() {
  const [taList, setTaList] = useState([]);
  const [taId, setTaId] = useState("");
  const [tingkat, setTingkat] = useState("1");
  const [kategori, setKategori] = useState("hafalan");
  const [mapel, setMapel] = useState(null);
  const [kelas, setKelas] = useState([]);
  const [komponen, setKomponen] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nama, setNama] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const [taRes, mpRes] = await Promise.all([
          getTahunAjaranList(),
          getMapelTahfizh(),
        ]);
        const list = taRes?.list || (Array.isArray(taRes) ? taRes : []);
        setTaList(list);
        setTaId((prev) => prev || taRes?.defaultId || list[0]?.id || "");
        setMapel(mpRes?.mapel || null);
      } catch (e) {
        setError(e?.message || "Gagal memuat data.");
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!taId || !mapel?.id) return;
    setLoading(true);
    setError("");
    try {
      const res = await getKomponenTingkat({
        tingkat,
        tahunAjaranId: taId,
        mapelId: mapel.id,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setKelas(res.kelas || []);
      setKomponen(res.komponen || []);
    } catch (e) {
      setError(e?.message || "Gagal memuat komponen.");
    } finally {
      setLoading(false);
    }
  }, [taId, tingkat, mapel]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const komponenKategori = komponen.filter((k) => k.kategori === kategori);
  const kategoriAktif = KATEGORI.find((k) => k.key === kategori);
  const countOf = (key) => komponen.filter((k) => k.kategori === key).length;

  async function handleAdd(e) {
    e.preventDefault();
    if (!nama.trim() || !mapel?.id) return;
    setBusy(true);
    setError("");
    try {
      const res = await addKomponenTingkat({
        tingkat,
        tahunAjaranId: taId,
        mapelId: mapel.id,
        komponen: nama.trim(),
        kategori,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setNama("");
      await load();
      setToast(`Komponen ditambahkan ke tingkat ${tingkat}.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(k) {
    if (
      !window.confirm(
        `Hapus komponen "${k.komponen}" dari semua kelas tingkat ${tingkat}?`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await removeKomponenTingkat({
        tingkat,
        tahunAjaranId: taId,
        mapelId: mapel.id,
        komponen: k.komponen,
        kategori: k.kategori,
      });
      if (res.error) setError(res.error);
      else await load();
    } finally {
      setBusy(false);
    }
  }

  function handleTemplate() {
    const wb = XLSX.utils.book_new();
    KATEGORI.forEach((kat) => {
      const rows = komponen
        .filter((k) => k.kategori === kat.key)
        .map((k) => [k.komponen]);
      const ws = XLSX.utils.aoa_to_sheet([["komponen"], ...rows]);
      ws["!cols"] = [{ wch: 40 }];
      XLSX.utils.book_append_sheet(wb, ws, sheetName(kat.label));
    });
    XLSX.writeFile(wb, `template-komponen-tahfizh-tingkat-${tingkat}.xlsx`);
    setToast("Template diunduh (1 sheet per kategori).");
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !mapel?.id) return;
    (async () => {
      setBusy(true);
      setError("");
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        let total = 0;
        for (const kat of KATEGORI) {
          const sheet = wb.Sheets[sheetName(kat.label)];
          if (!sheet) continue;
          const rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
          });
          for (let i = 1; i < rows.length; i++) {
            const val = String(rows[i][0] ?? "").trim();
            if (!val) continue;
            const res = await addKomponenTingkat({
              tingkat,
              tahunAjaranId: taId,
              mapelId: mapel.id,
              komponen: val,
              kategori: kat.key,
            });
            if (!res.error) total += 1;
          }
        }
        await load();
        setToast(`Import selesai: ${total} komponen ditambahkan.`);
      } catch (err) {
        setError(err?.message || "Gagal membaca file.");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 sm:space-y-5 sm:py-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gray-900 text-white shadow-sm">
            <IconBook className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Komponen Tahfizh
            </h1>
            <p className="mt-0.5 max-w-md text-sm leading-relaxed text-slate-500">
              Komponen yang ditambahkan otomatis berlaku untuk semua kelas pada
              tingkat yang sama.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={handleTemplate}
            disabled={!mapel?.id}
            className={ghostBtnCls}
          >
            <IconDownload />
            Template
          </button>
          <label
            className={`${ghostBtnCls} cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50`}
          >
            {busy ? <IconSpinner /> : <IconUpload />}
            {busy ? "Memproses" : "Import"}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={handleImport}
              disabled={busy || !mapel?.id}
            />
          </label>
        </div>
      </header>

      {/* Notifikasi */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            className="-m-1 rounded-md p-1 text-rose-500 hover:bg-rose-100"
            aria-label="Tutup pesan"
          >
            <IconX />
          </button>
        </div>
      )}
      {!mapel && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Mapel TAHFIZH belum ada di Mata Pelajaran (kategori tahfizh).
        </div>
      )}

      {/* Filter */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">
              Tahun ajaran
            </span>
            <select
              value={taId}
              onChange={(e) => setTaId(e.target.value)}
              className={fieldCls}
            >
              {taList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tahun} · Semester {t.semester}
                  {t.is_aktif ? " (aktif)" : ""}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600">
              Tingkat
              <span className="font-normal text-slate-400 md:hidden">
                {kelas.length} kelas
              </span>
            </span>
            <div
              role="radiogroup"
              aria-label="Tingkat"
              className="grid grid-cols-6 gap-1 rounded-xl bg-slate-100 p-1 md:w-72"
            >
              {TINGKAT.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tingkat === t}
                  onClick={() => setTingkat(t)}
                  className={`h-9 rounded-lg text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-900/25 ${
                    tingkat === t
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 hidden text-xs text-slate-500 md:block">
          {kelas.length} kelas pada tingkat {tingkat}
        </p>
      </section>

      {/* Kategori + daftar */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Tab kategori */}
        <div
          role="tablist"
          aria-label="Kategori komponen"
          className="flex overflow-x-auto border-b border-slate-200 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-3"
        >
          {KATEGORI.map((k) => {
            const active = kategori === k.key;
            return (
              <button
                key={k.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKategori(k.key)}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-gray-900/20 sm:px-4 ${
                  active
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {k.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    active
                      ? "bg-gray-200 text-gray-900"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {countOf(k.key)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Form tambah */}
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/60 p-4 sm:flex-row sm:p-5"
        >
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Nama komponen (mis. Al-Faatihaah)"
            aria-label={`Nama komponen ${kategoriAktif?.label}`}
            className={`${fieldCls} sm:flex-1`}
          />
          <button
            type="submit"
            disabled={busy || !nama.trim() || !mapel?.id}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-900/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <IconSpinner /> : <IconPlus />}
            Tambah ke tingkat {tingkat}
          </button>
        </form>

        {/* Daftar */}
        <div role="tabpanel" aria-busy={loading}>
          {loading ? (
            <ul className="divide-y divide-slate-100" aria-label="Memuat">
              {[0, 1, 2, 3].map((i) => (
                <li
                  key={i}
                  className="flex animate-pulse items-center gap-3 px-4 py-3.5 motion-reduce:animate-none sm:px-5"
                >
                  <div className="h-7 w-7 rounded-lg bg-slate-100" />
                  <div
                    className="h-4 rounded bg-slate-100"
                    style={{ width: `${55 - i * 8}%` }}
                  />
                </li>
              ))}
            </ul>
          ) : komponenKategori.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                <IconBook className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">
                Belum ada komponen {kategoriAktif?.label}
              </p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Tambahkan lewat kolom di atas, atau import dari file Excel.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {komponenKategori.map((k, i) => (
                <li
                  key={k.key}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-5"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold tabular-nums text-slate-500">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-800">
                    {k.komponen}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(k)}
                    disabled={busy}
                    title="Hapus dari semua kelas"
                    aria-label={`Hapus ${k.komponen}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/20 disabled:opacity-50"
                  >
                    <IconTrash />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!loading && komponenKategori.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500 sm:px-5">
            {komponenKategori.length} komponen · berlaku untuk {kelas.length}{" "}
            kelas
          </div>
        )}
      </section>

      {/* Toast */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-5 z-50 flex justify-center"
      >
        {toast && (
          <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full bg-slate-900 py-2.5 pl-3 pr-5 text-sm font-medium text-white shadow-lg">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500">
              <IconCheck className="h-3 w-3" />
            </span>
            <span className="truncate">{toast}</span>
          </div>
        )}
      </div>
    </div>
  );
}
