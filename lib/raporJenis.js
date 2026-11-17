// Satu semester punya tepat satu rapor per jenis. Jenis inilah kunci
// pengaturan_rapor, bukan ujian: nilai tahfizh tersimpan per tahun ajaran
// sehingga tidak mungkin dipecah per ujian, sementara AHB dan ASAS memang
// terikat ujian masing-masing.

export const JENIS_RAPOR = ["tahfiz", "ahb", "asas"];

export const LABEL_JENIS_RAPOR = {
  tahfiz: "Tahfizh",
  ahb: "Asesmen Harian Bersama (AHB)",
  asas: "Asesmen Sumatif Akhir Semester (ASAS)",
};

// Ujian Tahfizh dikenali dari template-nya, bukan jenis_ujian, karena
// jenis_ujian-nya "lainnya" untuk semua rapor non-akademik.
export function jenisRaporDariUjian(ujian) {
  if (!ujian) return "";
  if (ujian.template_rapor === "tahfiz") return "tahfiz";
  if (ujian.jenis_ujian === "ahb") return "ahb";
  if (ujian.jenis_ujian === "asas") return "asas";
  return "";
}

export function tahunAjaranIdDariUjian(ujian) {
  if (!ujian) return "";
  const rel = ujian.tahun_ajaran_id;
  const id = Array.isArray(rel) ? rel[0] : rel;
  return id || ujian.expand?.tahun_ajaran_id?.id || "";
}
