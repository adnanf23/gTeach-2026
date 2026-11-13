"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { fetchAiAnalysis } from "@/actions/ai-analysis.action";

const GRADIENT =
  "conic-gradient(from 0deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #10b981, #3b82f6)";

// Box dengan border gradient berputar. Dipakai saat loading.
function GradientLoadingBox() {
  return (
    <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl p-[3px]">
      <div
        className="absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 animate-spin [animation-duration:2.5s]"
        style={{ background: GRADIENT }}
        aria-hidden
      />
      <div className="relative rounded-[13px] bg-white p-8">
        <p className="mb-6 text-sm font-medium text-gray-700">
          Menyusun laporan bulanan…
        </p>
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-2/3 rounded bg-gray-200" />
          <div className="h-3 w-full rounded bg-gray-100" />
          <div className="h-3 w-11/12 rounded bg-gray-100" />
          <div className="h-3 w-4/5 rounded bg-gray-100" />
          <div className="mt-6 h-5 w-1/2 rounded bg-gray-200" />
          <div className="h-3 w-full rounded bg-gray-100" />
          <div className="h-3 w-3/4 rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="mb-3 border-b border-gray-200 pb-2 text-lg font-semibold text-gray-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-gray-600">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-100">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Laporan({ data, onRegenerate }) {
  const { ringkasan: r } = data;
  const tanggal = new Date(data.dibuatPada).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <article className="w-full max-w-4xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
      <div className="mb-6 flex items-center justify-end gap-2 print:hidden">
        <button
          onClick={onRegenerate}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Buat ulang
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          Cetak / PDF
        </button>
      </div>

      <header className="border-b-2 border-gray-900 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Laporan Bulanan Performa Sekolah
        </h1>
        <p className="mt-1 text-gray-600">Periode {data.periode}</p>
        <p className="text-sm text-gray-500">Dibuat pada {tanggal}</p>
      </header>

      <Section title="1. Ringkasan Umum">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Jumlah kelas" value={r.totalKelas} />
          <Stat label="Jumlah siswa" value={r.totalSiswa} />
          <Stat label="Hari efektif" value={r.hariEfektif} />
          <Stat label="Rata-rata kehadiran" value={`${r.rataKehadiran}%`} />
        </div>
      </Section>

      <Section title="2. Kehadiran Siswa per Kelas">
        <Table
          head={["Peringkat", "Kelas", "Siswa", "Hadir", "Kehadiran"]}
          rows={data.kehadiranKelas.map((k, i) => [
            i + 1,
            k.nama,
            k.totalSiswa,
            k.hadir,
            <strong key="p">{k.persenHadir}%</strong>,
          ])}
        />
      </Section>

      <Section title="3. Konsistensi Guru Mengisi Absensi">
        <Table
          head={["Peringkat", "Guru", "Kelas", "Hari terisi", "Konsistensi"]}
          rows={data.konsistensiGuru.map((k, i) => [
            i + 1,
            k.walikelas,
            k.nama,
            `${k.hariTerisi}/${r.hariEfektif}`,
            <strong key="p">{k.persenKonsistensi}%</strong>,
          ])}
        />
      </Section>

      <Section title="4. Siswa dengan Rata-rata Nilai Tertinggi per Tingkat">
        {data.siswaTerbaik.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada data nilai.</p>
        ) : (
          <Table
            head={["Tingkat", "Nama siswa", "Kelas", "Rata-rata"]}
            rows={data.siswaTerbaik.map((s) => [
              `Kelas ${s.tingkat}`,
              s.nama,
              s.kelas,
              <strong key="p">{s.rata}</strong>,
            ])}
          />
        )}
        <p className="mt-2 text-xs text-gray-500">
          Dihitung dari rata-rata nilai formatif (K1–K4) yang sudah tercatat.
        </p>
      </Section>

      <Section title="5. Catatan & Kesimpulan">
        {data.catatan.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada catatan.</p>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-800">
            {data.catatan.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
      </Section>
    </article>
  );
}

export default function AiAnalisisPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await fetchAiAnalysis();
      setResult(data);
    } catch (err) {
      console.error("Error fetching AI analysis:", err);
      setResult({ error: "Gagal mengambil data analisis AI." });
    }
    setLoading(false);
  };

  const showReport = result && !result.error;

  return (
    <div
      className={`flex flex-col items-center p-6 ${
        showReport ? "" : "min-h-[80vh] justify-center"
      }`}
    >
      {/* Awal / error: tombol di tengah */}
      {!loading && !showReport && (
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-semibold">Laporan Bulanan AI</h1>
          <p className="mb-6 text-sm text-gray-500">
            Buat ringkasan kehadiran, konsistensi guru, dan nilai siswa bulan
            ini.
          </p>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700"
          >
            <Icon name="info" /> Generate Laporan
          </button>
          {result?.error && (
            <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {result.error}
            </div>
          )}
        </div>
      )}

      {/* Loading: box dengan border gradient berputar */}
      {loading && <GradientLoadingBox />}

      {/* Laporan */}
      {showReport && <Laporan data={result} onRegenerate={handleGenerate} />}
    </div>
  );
}
