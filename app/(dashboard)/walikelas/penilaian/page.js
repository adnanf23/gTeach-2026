"use client";

import { getCurrentUser, pb } from "@/lib/pocketbase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PilihMapelPenilaian() {
  const [currentKelas, setCurrentKelas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapel, setMapel] = useState([]);

  const user = getCurrentUser();
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. Ambil data kelas
        const kelas = await pb
          .collection("kelas")
          .getFirstListItem(
            `walikelas_id = "${user.id}" || pendamping_id = "${user.id}"`,
            { requestKey: null },
          );

        setCurrentKelas(kelas);

        if (kelas) {
          // 2. Fetch Mapel Khusus & Tingkat
          const fetchKhusus = pb.collection("mata_pelajaran").getFullList({
            filter: `spesifik_kelas_id ~ "${kelas.id}"`,
            requestKey: null,
          });

          const fetchTingkat = pb.collection("mata_pelajaran").getFullList({
            filter: `target_tingkat ~ "${String(kelas.tingkat)}"`,
            requestKey: null,
          });

          // 3. Fetch Ploting Guru dengan expand guru_id
          const fetchPloting = pb.collection("ploting_guru").getFullList({
            filter: `kelas_id ~ "${kelas.id}"`,
            expand: "guru_id",
            requestKey: null,
          });

          const [mapelKhusus, mapelTingkat, plotingData] = await Promise.all([
            fetchKhusus,
            fetchTingkat,
            fetchPloting,
          ]);

          // DEBUG: Cek data ploting yang berhasil ditarik dari PocketBase
          console.log("Data Ploting Raw:", plotingData);

          // 4. Gabungkan mapel & hapus duplikat
          const combinedMapel = [...mapelKhusus, ...mapelTingkat];
          const uniqueMapel = Array.from(
            new Map(combinedMapel.map((item) => [item.id, item])).values(),
          );

          // 5. Buat Mapping Guru secara Fleksibel
          const guruMap = new Map();

          plotingData.forEach((plot) => {
            if (plot.mapel_id && plot.expand?.guru_id) {
              const guruObj = Array.isArray(plot.expand.guru_id)
                ? plot.expand.guru_id[0]
                : plot.expand.guru_id;

              // Ambil nama dari properti yang tersedia (nama / name / username)
              const namaGuru =
                guruObj?.nama_lengkap || guruObj?.name || guruObj?.username;

              if (namaGuru) {
                // Jika mapel_id bertipe array/relation
                if (Array.isArray(plot.mapel_id)) {
                  plot.mapel_id.forEach((mId) => guruMap.set(mId, namaGuru));
                } else {
                  guruMap.set(plot.mapel_id, namaGuru);
                }
              }
            }
          });

          console.log("Hasil Guru Map:", Object.fromEntries(guruMap));

          // 6. Set ke state
          const mapelWithGuru = uniqueMapel.map((m) => ({
            ...m,
            guru_pengampu: guruMap.get(m.id) || "Walikelas",
          }));

          setMapel(mapelWithGuru);
          console.log(mapelWithGuru);
        }
      } catch (error) {
        if (!error?.isAbort) {
          console.error("Error fetching data:", error);
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="mt-3 text-sm">Memuat data kelas & mata pelajaran...</p>
        </div>
      </div>
    );
  }

  if (!currentKelas) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-700">Akses Ditolak</h1>
        <p className="mt-2 text-sm text-red-600">
          Anda belum terdaftar sebagai wali kelas atau pendamping di kelas
          manapun.
        </p>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      {/* Banner */}
      <div className="w-full mb-6">
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="absolute right-0 bottom-0 w-80 h-80 bg-white/5 rounded-full translate-x-10 translate-y-20 pointer-events-none" />
          <div className="absolute right-20 bottom-[-40px] w-64 h-64 bg-white/5 rounded-full pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 z-10 relative">
            <div>
              <span className="text-xs uppercase tracking-widest text-blue-200 font-semibold block">
                Tingkat {currentKelas.tingkat}
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide mt-1">
                {currentKelas.nama_kelas}
              </h1>
              <p className="text-sm text-blue-100 mt-1">
                Pilih mata pelajaran untuk mengelola penilaian
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Mapel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mapel.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <p className="text-sm text-slate-400">
              Belum ada mata pelajaran untuk kelas ini.
            </p>
          </div>
        ) : (
          mapel.map((item) => (
            <button
              key={item.id}
              onClick={() => router.push(`/walikelas/penilaian/${item.id}`)}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-200 hover:bg-blue-600 active:scale-[0.98]"
            >
              {/* Kode Mapel - Badge */}
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 group-hover:text-blue-200 transition-colors duration-300">
                  {item.kode_mapel || "MPL"}
                </span>
                <span className="text-[10px] font-medium text-slate-400 group-hover:text-blue-200 transition-colors duration-300">
                  {currentKelas.nama_kelas?.split(" ")[0] || "Kelas"}
                </span>
              </div>

              {/* Nama Mapel - putih saat hover */}
              <h2 className="text-lg font-extrabold text-slate-900 group-hover:text-white transition-colors duration-300 mt-2 tracking-wide">
                {item.nama_mapel || item.nama}
              </h2>

              <hr className="border-slate-100 group-hover:border-blue-500/30 my-3 transition-colors duration-300" />

              {/* Guru Pengampu */}
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 border border-blue-100 text-blue-600 font-bold text-xs group-hover:bg-white/20 group-hover:border-white/30 group-hover:text-white transition-colors duration-300">
                  {item.guru_pengampu !== "Belum ditentukan" &&
                  item.guru_pengampu !== "Walikelas"
                    ? item.guru_pengampu.substring(0, 2).toUpperCase()
                    : "G"}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-blue-200 transition-colors duration-300 block">
                    Guru Pengampu
                  </span>
                  <p className="text-sm font-semibold text-slate-700 group-hover:text-white transition-colors duration-300 truncate">
                    {item.guru_pengampu}
                  </p>
                </div>
              </div>

              {/* Arrow indicator - putih saat hover */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-white group-hover:translate-x-1.5 transition-all duration-300">
                <svg
                  className="w-5 h-5"
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
              </div>

              {/* Efek shimmer/kilau saat hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />

              {/* Border bottom gradient on hover */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-blue-400 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
            </button>
          ))
        )}
      </div>
    </section>
  );
}
