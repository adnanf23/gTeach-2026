import * as capaianKompetensiRepository from "@/repositories/walikelas-capaian-kompetensi.repository";

function pbQuote(str) {
  return String(str).replace(/"/g, '\\"');
}

// Baca + agregasi data halaman Capaian Kompetensi walikelas:
// kelas guru -> mapel yang cocok -> capaian_kompetensi.
export async function getCapaianKompetensiData({ userId }) {
  try {
    const kelasGuru = await capaianKompetensiRepository.findKelasGuru(
      `walikelas_id = "${pbQuote(userId)}" || pendamping_id = "${pbQuote(userId)}"`,
    );

    if (kelasGuru.length === 0) {
      return { guruKelasList: [], myMapelList: [], list: [], error: null };
    }

    const myKelasIds = kelasGuru.map((k) => k.id);
    const myTingkat = Array.from(
      new Set(kelasGuru.map((k) => String(k.tingkat || ""))),
    );

    const orParts = [
      ...myKelasIds.map((id) => `spesifik_kelas_id ~ "${pbQuote(id)}"`),
      ...myTingkat.map((t) => `target_tingkat ~ "${pbQuote(t)}"`),
    ];
    const mapelFilter = orParts.length > 0 ? orParts.join(" || ") : "";

    const mapelRes = await capaianKompetensiRepository.findMapel(mapelFilter);

    const myKelasSet = new Set(myKelasIds);
    const myTingkatSet = new Set(myTingkat);
    const filteredMapel = mapelRes.filter((m) => {
      const spesifik = Array.isArray(m.spesifik_kelas_id)
        ? m.spesifik_kelas_id
        : m.spesifik_kelas_id
          ? [m.spesifik_kelas_id]
          : [];
      if (spesifik.length > 0) {
        return spesifik.some((id) => myKelasSet.has(id));
      }
      const target = Array.isArray(m.target_tingkat)
        ? m.target_tingkat
        : m.target_tingkat
          ? [m.target_tingkat]
          : [];
      if (target.length === 0) return true;
      return target.some((t) => myTingkatSet.has(String(t)));
    });

    const mapelIds = filteredMapel.map((m) => m.id);
    if (mapelIds.length === 0) {
      return {
        guruKelasList: kelasGuru,
        myMapelList: filteredMapel,
        list: [],
        error: null,
      };
    }

    const ckFilter = `(${myKelasIds.map((id) => `kelas_id = "${pbQuote(id)}"`).join(" || ")}) && (${mapelIds.map((id) => `mapel_id = "${pbQuote(id)}"`).join(" || ")})`;

    const ck =
      await capaianKompetensiRepository.findCapaianKompetensi(ckFilter);

    return {
      guruKelasList: kelasGuru,
      myMapelList: filteredMapel,
      list: ck,
      error: null,
    };
  } catch (err) {
    console.error(err);
    return {
      guruKelasList: [],
      myMapelList: [],
      list: [],
      error:
        "Gagal memuat data. Pastikan PocketBase berjalan dan kamu sudah login.",
    };
  }
}
