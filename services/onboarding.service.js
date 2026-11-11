import { describeError } from "@/lib/app-error";
import * as onboardingRepository from "@/repositories/onboarding.repository";
import { writeLog } from "@/services/systemLog.service";

const firstOf = (v) => (Array.isArray(v) ? v[0] : v);
const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const num = (v) => (typeof v === "number" && !isNaN(v) && v !== -1 ? v : null);
const average = (arr) => {
  const vals = arr.filter((v) => typeof v === "number" && !isNaN(v) && v !== -1);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};
const toISO = (d) => {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

/* ============================ LANGKAH 1: BACKUP ============================ */

export async function backupDatabase() {
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const res = await onboardingRepository.createDatabaseBackup(
      `gt-${stamp}.zip`,
    );
    return { url: res.url, key: res.key, error: null };
  } catch (error) {
    console.error("[backupDatabase]", error);
    return { error: describeError(error) };
  }
}

/* ============================ LANGKAH 2: SISWA + KELAS ============================ */

export async function getExportSiswaKelas() {
  try {
    const [siswaList, kelasList] = await Promise.all([
      onboardingRepository.findAll("siswa", { expand: "kelas_id", sort: "nama_siswa" }),
      onboardingRepository.findAll("kelas", { sort: "tingkat,nama_kelas" }),
    ]);
    const sortedSiswa = [...siswaList].sort((a, b) => {
      const ta = Number(a.expand?.kelas_id?.tingkat) || 999;
      const tb = Number(b.expand?.kelas_id?.tingkat) || 999;
      if (ta !== tb) return ta - tb;
      const ka = a.expand?.kelas_id?.nama_kelas || "";
      const kb = b.expand?.kelas_id?.nama_kelas || "";
      if (ka !== kb) return ka.localeCompare(kb, "id", { numeric: true });
      return (a.nama_siswa || "").localeCompare(b.nama_siswa || "", "id");
    });
    const siswa = sortedSiswa.map((s) => ({
      nama_siswa: s.nama_siswa || "",
      nis: s.nis || "",
      nisn: s.nisn || "",
      jenis_kelamin: s.jenis_kelamin || "",
      kelas: s.expand?.kelas_id?.nama_kelas || "",
      tingkat: s.expand?.kelas_id?.tingkat || "",
    }));
    const sortedKelas = [...kelasList].sort(
      (a, b) =>
        (Number(a.tingkat) || 999) - (Number(b.tingkat) || 999) ||
        String(a.nama_kelas || "").localeCompare(
          String(b.nama_kelas || ""),
          "id",
          { numeric: true },
        ),
    );
    return {
      siswa,
      kelasNames: sortedKelas.map((k) => k.nama_kelas || ""),
      error: null,
    };
  } catch (error) {
    console.error("[getExportSiswaKelas]", error);
    return { siswa: [], kelasNames: [], error: describeError(error) };
  }
}

/* ============================ LANGKAH 3: WALI KELAS & PENDAMPING ============================ */

export async function getExportWaliPendamping() {
  try {
    const [kelasList, userList] = await Promise.all([
      onboardingRepository.findAll("kelas", {
        expand: "walikelas_id,pendamping_id",
        sort: "tingkat,nama_kelas",
      }),
      onboardingRepository.findAllAsAdmin("users", { sort: "nama_lengkap" }),
    ]);
    const rows = kelasList.map((k) => ({
      kelas: k.nama_kelas || "",
      tingkat: k.tingkat || "",
      walikelas: k.expand?.walikelas_id?.nama_lengkap || "",
      pendamping: k.expand?.pendamping_id?.nama_lengkap || "",
    }));

    const toGuru = (u) => ({
      username: u.username || "",
      nama_lengkap: u.nama_lengkap || "",
      no_whatsapp: u.no_whatsapp || "",
      role: u.role || "",
    });
    const walikelas = userList
      .filter((u) => u.role === "guru walikelas")
      .map(toGuru);
    const guruMapel = userList
      .filter((u) => u.role === "guru mapel")
      .map(toGuru);

    return { rows, walikelas, guruMapel, error: null };
  } catch (error) {
    console.error("[getExportWaliPendamping]", error);
    return { rows: [], walikelas: [], guruMapel: [], error: describeError(error) };
  }
}

/* ============================ LANGKAH 4: ABSENSI PER SEMESTER ============================ */

export async function getExportAbsensiSemester() {
  try {
    const [semesterList, siswaList, kelasList] = await Promise.all([
      onboardingRepository.findAll("tahun_ajaran", { sort: "-tahun,-semester" }),
      onboardingRepository.findAll("siswa", { sort: "nama_siswa" }),
      onboardingRepository.findAll("kelas"),
    ]);
    const kelasById = new Map(kelasList.map((k) => [k.id, k]));
    const siswaById = new Map(siswaList.map((s) => [s.id, s]));

    // Ambil maksimal 2 semester (biasanya semester 1 & 2 tahun yang sama).
    const semesters = semesterList.slice(0, 2);

    const result = [];
    for (const ta of semesters) {
      if (!ta.Mulai || !ta.Akhir) {
        result.push({
          label: `${ta.tahun} · Semester ${ta.semester}`,
          rows: [],
        });
        continue;
      }
      const mulai = `${toISO(ta.Mulai)} 00:00:00`;
      const akhir = `${toISO(ta.Akhir)} 23:59:59`;
      const absensi = await onboardingRepository.findAllAsAdmin("absensi", {
        filter: `tanggal >= "${mulai}" && tanggal <= "${akhir}"`,
        fields: "id,siswa_id,kelas_id,status",
      });

      const perSiswa = new Map();
      for (const a of absensi) {
        const sid = firstOf(a.siswa_id);
        if (!sid) continue;
        if (!perSiswa.has(sid)) {
          perSiswa.set(sid, { hadir: 0, sakit: 0, izin: 0, alpha: 0 });
        }
        const rec = perSiswa.get(sid);
        if (a.status === "hadir") rec.hadir++;
        else if (a.status === "sakit") rec.sakit++;
        else if (a.status === "izin") rec.izin++;
        else if (a.status === "alpha") rec.alpha++;
      }

      const rows = Array.from(perSiswa.entries()).map(([sid, r]) => {
        const s = siswaById.get(sid);
        const kid = s ? firstOf(s.kelas_id) : null;
        return {
          nama_siswa: s?.nama_siswa || sid,
          kelas: kelasById.get(kid)?.nama_kelas || "",
          tingkat: kelasById.get(kid)?.tingkat || "",
          hadir: r.hadir,
          sakit: r.sakit,
          izin: r.izin,
          alpha: r.alpha,
        };
      });
      rows.sort((a, b) => {
        const ta = Number(a.tingkat) || 999;
        const tb = Number(b.tingkat) || 999;
        if (ta !== tb) return ta - tb;
        const ka = a.kelas || "";
        const kb = b.kelas || "";
        if (ka !== kb) return ka.localeCompare(kb, "id", { numeric: true });
        return (a.nama_siswa || "").localeCompare(b.nama_siswa || "", "id");
      });

      result.push({
        label: `${ta.tahun} · Semester ${ta.semester}`,
        rows,
      });
    }

    return { semesters: result, error: null };
  } catch (error) {
    console.error("[getExportAbsensiSemester]", error);
    return { semesters: [], error: describeError(error) };
  }
}

/* ============================ LANGKAH 5: NILAI PER KELAS ============================ */

export async function getExportNilaiPerKelas() {
  try {
    const [kelasList, mapelList, tpList, lmList] = await Promise.all([
      onboardingRepository.findAll("kelas", { sort: "tingkat,nama_kelas" }),
      onboardingRepository.findAll("mata_pelajaran"),
      onboardingRepository.findAll("tujuan_pembelajaran"),
      onboardingRepository.findAll("lingkup_materi"),
    ]);

    const tpToMapel = new Map(tpList.map((t) => [t.id, firstOf(t.mapel_id)]));
    const lmToMapel = new Map(lmList.map((l) => [l.id, firstOf(l.mapel_id)]));

    const kelasSorted = [...kelasList].sort(
      (a, b) =>
        (Number(a.tingkat) || 999) - (Number(b.tingkat) || 999) ||
        String(a.nama_kelas || "").localeCompare(
          String(b.nama_kelas || ""),
          "id",
          { numeric: true },
        ),
    );

    const perKelas = [];
    for (const kelas of kelasSorted) {
      const [siswa, nf, ns, nu] = await Promise.all([
        onboardingRepository.findAllAsAdmin("siswa", {
          filter: `kelas_id = "${kelas.id}"`,
          sort: "nama_siswa",
        }),
        onboardingRepository.findAllAsAdmin("nilai_formatif", {
          filter: `kelas_id = "${kelas.id}"`,
          fields: "id,siswa_id,tp_id,k1,k2,k3,k4",
        }),
        onboardingRepository.findAllAsAdmin("nilai_sumatif", {
          filter: `kelas_id = "${kelas.id}"`,
          fields: "id,siswa_id,lm_id,nilai",
        }),
        onboardingRepository.findAllAsAdmin("nilai_ujian", {
          filter: `kelas_id = "${kelas.id}"`,
          fields: "id,siswa_id,mapel_id,nilai",
        }),
      ]);

      // Mapel yang relevan: spesifik kelas + target tingkat (umum).
      const tingkat = String(kelas.tingkat);
      const mapelRelevan = mapelList.filter((m) => {
        const spesifik = toArray(m.spesifik_kelas_id);
        if (spesifik.length > 0) return spesifik.includes(kelas.id);
        return toArray(m.target_tingkat).map(String).includes(tingkat);
      });
      const mapelByName = new Map();
      mapelRelevan.forEach((m) => {
        const key = (m.nama_mapel || m.Label || "").trim();
        if (key && !mapelByName.has(key)) mapelByName.set(key, m);
      });
      const mapel = Array.from(mapelByName.values()).sort((a, b) =>
        (a.nama_mapel || "").localeCompare(b.nama_mapel || ""),
      );
      const mapelIdSet = new Set(mapel.map((m) => m.id));

      const values = {};
      mapel.forEach((m) => (values[m.id] = {}));
      const push = (mapelId, siswaId, v) => {
        if (!mapelId || !values[mapelId]) return;
        if (num(v) === null) return;
        if (!values[mapelId][siswaId]) values[mapelId][siswaId] = [];
        values[mapelId][siswaId].push(v);
      };
      nf.forEach((n) => {
        const mid = tpToMapel.get(firstOf(n.tp_id));
        ["k1", "k2", "k3", "k4"].forEach((k) =>
          push(mid, firstOf(n.siswa_id), n[k]),
        );
      });
      ns.forEach((n) =>
        push(lmToMapel.get(firstOf(n.lm_id)), firstOf(n.siswa_id), n.nilai),
      );
      nu.forEach((n) =>
        push(firstOf(n.mapel_id), firstOf(n.siswa_id), n.nilai),
      );

      const rows = siswa.map((s) => {
        const row = { nama_siswa: s.nama_siswa || "", nis: s.nis || "" };
        mapel.forEach((m) => {
          const avg = average(values[m.id]?.[s.id] || []);
          row[m.nama_mapel || m.Label] =
            avg === null ? "" : Math.round(avg * 10) / 10;
        });
        return row;
      });

      perKelas.push({
        kelas: kelas.nama_kelas || "",
        mapel: mapel.map((m) => m.nama_mapel || m.Label || ""),
        siswa: rows,
      });
    }

    return { perKelas, error: null };
  } catch (error) {
    console.error("[getExportNilaiPerKelas]", error);
    return { perKelas: [], error: describeError(error) };
  }
}

/* ============================ LANGKAH 6: HAPUS NILAI/AGENDA/ABSENSI ============================ */

const DATA_COLLECTIONS = [
  "nilai_formatif",
  "nilai_sumatif",
  "nilai_ujian",
  "nilai_harian",
  "nilai_ekskul",
  "agenda_mengajar",
  "absensi",
];

export async function deleteNilaiAgendaAbsensi() {
  try {
    for (const c of DATA_COLLECTIONS) {
      await onboardingRepository.truncateCollection(c);
    }
    await writeLog({
      type: "warning",
      msg: "Menghapus seluruh data nilai, agenda, dan absensi.",
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: "truncate", collections: DATA_COLLECTIONS },
    });
    return { error: null };
  } catch (error) {
    console.error("[deleteNilaiAgendaAbsensi]", error);
    return { error: describeError(error) };
  }
}

/* ============================ LANGKAH 7: RESET SEMESTER ============================ */

export async function resetSemester({ tahun, semester, mulai, akhir }) {
  try {
    if (!tahun || !semester || !mulai || !akhir) {
      return { error: "Tahun, semester, tanggal mulai, dan tanggal akhir wajib diisi." };
    }
    await onboardingRepository.deleteAllTahunAjaran();
    const created = await onboardingRepository.createTahunAjaran({
      tahun,
      semester,
      Mulai: mulai,
      Akhir: akhir,
      is_aktif: true,
    });
    await writeLog({
      type: "info",
      msg: `Reset semester: ${tahun} semester ${semester}.`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: "reset_semester", tahun, semester, id: created.id },
    });
    return { id: created.id, error: null };
  } catch (error) {
    console.error("[resetSemester]", error);
    return { error: describeError(error) };
  }
}

/* ============================ LANGKAH 8: IMPORT SISWA ============================ */

export async function importSiswa(rows) {
  try {
    const [siswaList, kelasList] = await Promise.all([
      onboardingRepository.findAllAsAdmin("siswa"),
      onboardingRepository.findAllAsAdmin("kelas"),
    ]);
    const siswaByNis = new Map(
      siswaList.filter((s) => s.nis).map((s) => [String(s.nis).trim(), s]),
    );
    const kelasByName = new Map(
      kelasList.map((k) => [String(k.nama_kelas || "").trim(), k.id]),
    );

    let updated = 0;
    let created = 0;
    let deleted = 0;
    const seenNis = new Set();

    for (const row of rows) {
      const nis = String(row.nis ?? "").trim();
      if (!nis) continue;
      seenNis.add(nis);
      const kelasId = kelasByName.get(String(row.kelas ?? "").trim()) || "";
      const data = {
        nama_siswa: String(row.nama_siswa ?? "").trim(),
        nisn: String(row.nisn ?? "").trim(),
        jenis_kelamin: String(row.jenis_kelamin ?? "").trim(),
      };
      if (kelasId) data.kelas_id = kelasId;

      const existing = siswaByNis.get(nis);
      if (existing) {
        await onboardingRepository.updateSiswa(existing.id, data);
        updated++;
      } else {
        await onboardingRepository.createSiswa({ ...data, nis });
        created++;
      }
    }

    for (const s of siswaList) {
      const nis = String(s.nis ?? "").trim();
      if (nis && !seenNis.has(nis)) {
        await onboardingRepository.deleteSiswa(s.id);
        deleted++;
      }
    }

    await writeLog({
      type: "info",
      msg: `Import siswa: update ${updated}, tambah ${created}, hapus ${deleted}.`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: "import_siswa", updated, created, deleted },
    });
    return { updated, created, deleted, error: null };
  } catch (error) {
    console.error("[importSiswa]", error);
    return { error: describeError(error) };
  }
}

/* ============================ LANGKAH 9: IMPORT GURU ============================ */

const GURU_ROLES = [
  "guru walikelas",
  "guru pendamping",
  "guru mapel",
  "ict",
  "admin",
];

export async function importGuru(rows) {
  try {
    const users = await onboardingRepository.findAllAsAdmin("users");
    const byUsername = new Map(
      users.map((u) => [String(u.username || "").trim(), u]),
    );

    let updated = 0;
    let skipped = 0;
    let nonaktif = 0;
    const seen = new Set();

    for (const row of rows) {
      const username = String(row.username ?? "").trim();
      if (!username) continue;
      seen.add(username);
      const existing = byUsername.get(username);
      if (!existing) {
        // Akun baru butuh password; dilewati agar aman.
        skipped++;
        continue;
      }
      const data = {
        nama_lengkap: String(row.nama_lengkap ?? "").trim(),
        no_whatsapp: String(row.no_whatsapp ?? "").trim(),
        is_aktif: true,
      };
      const role = String(row.role ?? "").trim();
      if (GURU_ROLES.includes(role)) data.role = role;
      await onboardingRepository.updateUser(existing.id, data);
      updated++;
    }

    for (const u of users) {
      const username = String(u.username || "").trim();
      if (u.is_aktif && username && !seen.has(username)) {
        await onboardingRepository.updateUser(u.id, { is_aktif: false });
        nonaktif++;
      }
    }

    await writeLog({
      type: "info",
      msg: `Import guru: update ${updated}, dilewati ${skipped}, nonaktif ${nonaktif}.`,
      endpoint: "-",
      statusCode: 200,
      payload: { aksi: "import_guru", updated, skipped, nonaktif },
    });
    return { updated, skipped, nonaktif, error: null };
  } catch (error) {
    console.error("[importGuru]", error);
    return { error: describeError(error) };
  }
}
