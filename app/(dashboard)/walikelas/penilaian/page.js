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
      <div className="p-10 text-center font-semibold text-gray-500">
        Memuat data kelas & mata pelajaran...
      </div>
    );
  }

  if (!currentKelas) {
    return (
      <div className="p-10 text-center font-semibold text-red-500">
        Anda belum terdaftar sebagai wali kelas atau pendamping di kelas
        manapun.
      </div>
    );
  }

  return (
    <section className="py-10 lg:p-10 space-y-6">
      {/* Banner */}
      <div className="w-full">
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white rounded-3xl p-6 md:p-8 shadow-lg h-auto flex flex-col justify-between">
          <div className="absolute right-0 bottom-0 w-80 h-80 bg-white/5 rounded-full translate-x-10 translate-y-20 pointer-events-none" />
          <div className="absolute right-20 bottom-[-40px] w-64 h-64 bg-white/5 rounded-full pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 z-10">
            <div className="flex items-start space-x-4">
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-widest text-blue-200 font-semibold block">
                  Tingkat {currentKelas.tingkat}
                </span>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide uppercase">
                  {currentKelas.nama_kelas}
                </h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Mapel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
        {mapel.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-400 font-medium">
            Belum ada mata pelajaran untuk kelas ini.
          </div>
        ) : (
          mapel.map((item) => (
            <div
              key={item.id}
              onClick={() => router.push(`/walikelas/penilaian/${item.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/penilaian/${item.id}`);
              }}
              className="w-full p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 active:scale-[0.98] transition-all duration-200 flex flex-col justify-between cursor-pointer"
            >
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 block mb-1">
                    Mata Pelajaran
                  </span>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-wide uppercase">
                    {item.nama_mapel || item.nama}
                  </h2>
                </div>

                <hr className="border-gray-100" />

                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 border border-blue-100 text-blue-600 font-bold text-sm">
                    {item.guru_pengampu !== "Belum ditentukan"
                      ? item.guru_pengampu.substring(0, 2).toUpperCase()
                      : "G"}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block">
                      Guru Pengampu
                    </span>
                    <p className="text-sm font-bold text-gray-800 tracking-wide mt-0.5">
                      {item.guru_pengampu}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
