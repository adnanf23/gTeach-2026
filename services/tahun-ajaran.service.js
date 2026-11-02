import { describeError } from "@/lib/app-error";
import * as tahunAjaranRepository from "@/repositories/tahun-ajaran.repository";

// Mengembalikan daftar semester + id semester default (yang aktif).
export async function getTahunAjaranList() {
  try {
    const list = await tahunAjaranRepository.findAllTahunAjaran();
    const aktif = list.find((t) => t.is_aktif) || list[0] || null;
    return { list, defaultId: aktif?.id || "", error: null };
  } catch (error) {
    return { list: [], defaultId: "", error: describeError(error) };
  }
}

// Batas tanggal satu semester dalam format yang dipakai filter PocketBase.
export function semesterDateBounds(tahunAjaran) {
  if (!tahunAjaran?.Mulai || !tahunAjaran?.Akhir) return null;
  const toISO = (d) => {
    const x = new Date(d);
    const p = (n) => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };
  return {
    mulai: `${toISO(tahunAjaran.Mulai)} 00:00:00`,
    akhir: `${toISO(tahunAjaran.Akhir)} 23:59:59`,
  };
}
