import Link from "next/link";

/* ───────── Bagian kecil yang dipakai ulang ───────── */

const PILL = {
  amber: "bg-amber-100 text-amber-800",
  green: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800",
  slate: "bg-slate-100 text-slate-600",
};

function Pill({ tone = "slate", children }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${PILL[tone]}`}
    >
      {children}
    </span>
  );
}

function Rows({ rows }) {
  return (
    <ul className="divide-y divide-blue-50">
      {rows.map(([label, value, tone]) => (
        <li
          key={label}
          className="flex items-center justify-between gap-2 py-2.5 text-[12px]"
        >
          <span className="text-slate-600">{label}</span>
          {tone ? (
            <Pill tone={tone}>{value}</Pill>
          ) : (
            <span className="font-semibold text-blue-950">{value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Score({ label, value }) {
  return (
    <div className="py-1.5">
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-blue-950">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-blue-50">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function BarChart() {
  const data = [
    ["X-A", 74],
    ["X-B", 81],
    ["X-C", 68],
    ["XI-A", 88],
    ["XI-B", 79],
    ["XII-A", 92],
    ["XII-B", 85],
  ];
  return (
    <div>
      <div className="flex h-36 items-end gap-2">
        {data.map(([name, h]) => (
          <div
            key={name}
            className={`flex-1 rounded-t-lg ${
              h === 92 ? "bg-blue-600" : "bg-blue-100"
            }`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map(([name]) => (
          <span
            key={name}
            className="flex-1 text-center text-[9.5px] text-slate-400"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function Ring({ value }) {
  const c = 2 * Math.PI * 28;
  return (
    <div className="flex items-center gap-3">
      <svg width="76" height="76" viewBox="0 0 68 68" aria-hidden="true">
        <circle
          cx="34"
          cy="34"
          r="28"
          fill="none"
          stroke="#dbeafe"
          strokeWidth="8"
        />
        <circle
          cx="34"
          cy="34"
          r="28"
          fill="none"
          stroke="#2563eb"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
          transform="rotate(-90 34 34)"
        />
      </svg>
      <div>
        <p className="text-[26px] font-semibold leading-none text-blue-950">
          {value}%
        </p>
        <p className="mt-1 text-[11px] text-blue-500">hadir hari ini</p>
      </div>
    </div>
  );
}

function Line() {
  return (
    <svg viewBox="0 0 160 80" className="h-28 w-full" aria-hidden="true">
      <polygon
        points="0,62 25,54 50,57 75,34 100,41 125,18 160,12 160,80 0,80"
        fill="#dbeafe"
      />
      <polyline
        points="0,62 25,54 50,57 75,34 100,41 125,18 160,12"
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="160" cy="12" r="4" fill="#2563eb" />
    </svg>
  );
}

/* ───────── Isi tiap kartu ───────── */

const CARDS = [
  {
    key: "kasus",
    title: "Catatan kasus",
    sub: "Minggu ini",
    body: (
      <Rows
        rows={[
          ["Terlambat", "3 siswa", "amber"],
          ["Konseling", "1 siswa", "blue"],
          ["Selesai", "8 kasus", "green"],
        ]}
      />
    ),
  },
  {
    key: "rapor",
    title: "Rapor siswa",
    sub: "Semester ganjil",
    body: (
      <div>
        <Score label="Matematika" value={88} />
        <Score label="IPA" value={92} />
        <Score label="B. Indonesia" value={85} />
        <p className="mt-3 flex justify-between border-t border-blue-50 pt-3 text-[12px]">
          <span className="text-slate-500">Rata-rata</span>
          <span className="font-semibold text-blue-950">88,3</span>
        </p>
      </div>
    ),
  },
  {
    key: "agenda",
    title: "Agenda mengajar",
    sub: "Hari ini",
    body: (
      <Rows
        rows={[
          ["07.30 X-A", "IPA"],
          ["09.15 X-C", "IPA"],
          ["11.00 XI-B", "Fisika"],
          ["13.00 XII-A", "Fisika"],
        ]}
      />
    ),
  },
  {
    key: "nilai",
    title: "Rekap nilai kelas",
    sub: "Rata-rata per kelas",
    center: true,
    body: <BarChart />,
  },
  {
    key: "absensi",
    title: "Absensi",
    sub: "Kelas X-A",
    body: (
      <div className="space-y-4">
        <Ring value={96} />
        <Rows
          rows={[
            ["Izin", "1"],
            ["Sakit", "1"],
          ]}
        />
      </div>
    ),
  },
  {
    key: "perkembangan",
    title: "Perkembangan nilai",
    sub: "6 bulan terakhir",
    body: <Line />,
  },
  {
    key: "ujian",
    title: "Ujian",
    sub: "Tahun ajaran ini",
    body: (
      <Rows
        rows={[
          ["PTS Ganjil", "Selesai", "green"],
          ["PAS Ganjil", "Dijadwalkan", "amber"],
          ["PTS Genap", "Belum", "slate"],
        ]}
      />
    ),
  },
];

/* Makin jauh dari tengah, makin turun */
const OFFSETS = ["mt-32", "mt-20", "mt-10", "mt-0", "mt-10", "mt-20", "mt-32"];
/* Dua kartu terluar disembunyikan di layar kecil */
const HIDE = [
  "hidden lg:block",
  "hidden md:block",
  "",
  "",
  "",
  "hidden md:block",
  "hidden lg:block",
];

export default function LandingHero() {
  return (
    <section className="relative min-h-dvh w-full overflow-hidden bg-gradient-to-b from-blue-50 via-[#f3f7ff] to-white font-sans text-blue-950">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-16 text-center sm:pt-24">
        <p className="mb-6 text-[13px] font-semibold uppercase tracking-[0.18em] text-blue-500 sm:mb-8 sm:text-[14px]">
          gTeach Academic
        </p>

        <h1 className="max-w-4xl text-[32px] font-semibold leading-[1.08] tracking-tight text-blue-950 sm:text-[48px] md:text-[60px]">
          Sistem Manajemen Pembelajaran{" "}
          <span className="bg-gradient-to-r from-blue-600 to-sky-400 bg-clip-text text-transparent">
            Terbaru
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-slate-600 sm:mt-6 sm:text-[16px] sm:leading-[1.7]">
          Meningkatkan kemudahan dalam memanajemen pengajaran dan penilaian
          hingga pelaporan, sehingga para guru tidak perlu menjalani proses yang
          kompleks.
        </p>

        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:mt-10 sm:w-auto sm:flex-row">
          <Link
            href="/login"
            className="w-full rounded-full bg-blue-600 px-7 py-3 text-center text-[13px] font-medium text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.6)] transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 active:scale-95 sm:w-auto sm:text-[14px]"
          >
            Dashboard Internal
          </Link>
          <Link
            href="/login-wali-murid"
            className="w-full rounded-full border border-blue-200 bg-white px-7 py-3 text-center text-[13px] font-medium text-blue-700 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 active:scale-95 sm:w-auto sm:text-[14px]"
          >
            Dashboard Wali Murid
          </Link>
        </div>
      </div>

      {/* Deretan kartu putih; bagian bawahnya sengaja terpotong */}
      <div
        id="fitur"
        className="mx-auto mt-14 flex h-[380px] max-w-[1200px] items-start justify-center overflow-hidden px-4 pt-4 sm:mt-20"
      >
        {CARDS.map((card, i) => (
          <article
            key={card.key}
            className={`${HIDE[i]} ${OFFSETS[i]} mx-2 h-[460px] flex-shrink-0 rounded-[28px] bg-white p-5 text-left shadow-[0_10px_30px_-10px_rgba(37,99,235,0.22)] ring-1 ring-blue-100/70 ${
              card.center
                ? "relative z-10 w-[290px] sm:w-[330px]"
                : "w-[200px] sm:w-[220px]"
            }`}
          >
            <h2 className="text-[13px] font-semibold text-blue-950">
              {card.title}
            </h2>
            <p className="mb-4 mt-0.5 text-[11px] text-blue-400">{card.sub}</p>
            {card.body}
          </article>
        ))}
      </div>
    </section>
  );
}
