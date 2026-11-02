import { describeError } from "@/lib/app-error";
import * as ictDashboardRepository from "@/repositories/ict-dashboard.repository";

// ---------------------------------------------------------------------------
// Helper murni (disalin apa adanya dari halaman dashboard ICT) — dipakai untuk
// menyusun entri log yang sudah siap ditampilkan.
// ---------------------------------------------------------------------------
function parseCreated(created) {
  return new Date(String(created).replace(" ", "T"));
}

function getUserInfo(userRecord) {
  if (!userRecord) {
    return { name: "System / Guest", role: "SYSTEM" };
  }
  const name =
    userRecord.nama_lengkap ||
    userRecord.name ||
    userRecord.nama ||
    userRecord.username ||
    userRecord.email ||
    "Unknown User";
  const role = userRecord.role || "USER";
  return { name, role };
}

function formatPayload(payload) {
  if (payload === null || payload === undefined) return "-";
  if (typeof payload === "string") return payload || "-";
  try {
    const str = JSON.stringify(payload);
    return str === "{}" || str === "[]" ? "-" : str;
  } catch {
    return "-";
  }
}

function getLevel(statusCode, type) {
  const code = Number(statusCode);
  if (!Number.isNaN(code) && code >= 500) return "error";
  if ((!Number.isNaN(code) && code >= 400) || type === "warning")
    return "warning";
  return "ok";
}

function buildLogEntry(record) {
  const { name, role } = getUserInfo(record.expand?.user_id);
  const created = parseCreated(record.created);
  const statusCode =
    record.status_code ??
    (record.type === "succes" ? 200 : record.type === "warning" ? 400 : 200);

  return {
    id: record.id,
    userName: name,
    userRole: role,
    aktivitas: record.aktivitas || record.msg || "Tidak ada aktivitas tercatat",
    endpoint: record.endpoint || "-",
    payload: formatPayload(record.payload_json),
    payloadRaw: record.payload_json ?? null,
    fullTime: created.toLocaleString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    statusCode,
    type: record.type || "info",
    level: getLevel(statusCode, record.type),
    time: created.toLocaleTimeString("id-ID"),
    date: created.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  };
}

// Deteksi log "login berhasil" (dipindah apa adanya dari halaman).
function isSuccessfulLogin(rec) {
  const text = String(rec.aktivitas || rec.msg || "").toLowerCase();
  const endpoint = String(rec.endpoint || "").toLowerCase();
  const looksLikeLogin = text.includes("login") || endpoint.endsWith("/login");
  if (!looksLikeLogin) return false;
  if (text.includes("gagal")) return false;
  if (rec.type === "warning" || rec.type === "error") return false;
  const code = Number(rec.status_code);
  if (!Number.isNaN(code) && code >= 400) return false;
  return true;
}

function slimLogin(rec) {
  const payload =
    rec.payload_json && typeof rec.payload_json === "object"
      ? rec.payload_json
      : null;
  return {
    id: rec.id,
    created: rec.created,
    userKey: rec.user_id || payload?.username || "",
  };
}

// ---------------------------------------------------------------------------
// Statistik kartu dashboard (jumlah user, guru, admin)
// ---------------------------------------------------------------------------
export async function getIctStats() {
  try {
    const [allUsers, activeTeachers, activeAdmins] = await Promise.all([
      ictDashboardRepository.countUsers("is_aktif = true"),
      // "guru" (bukan "guru_") supaya cocok dengan role berspasi
      // seperti "guru walikelas" / "guru mapel" / "guru pendamping"
      ictDashboardRepository.countUsers("is_aktif = true && role ~ 'guru'"),
      ictDashboardRepository.countUsers("is_aktif = true && role = 'admin'"),
    ]);

    return {
      totalUsers: allUsers.totalItems,
      activeTeachers: activeTeachers.totalItems,
      activeAdmins: activeAdmins.totalItems,
      error: null,
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}

// ---------------------------------------------------------------------------
// Log aktivitas terbaru (15 entri terakhir) siap ditampilkan
// ---------------------------------------------------------------------------
export async function getRecentLogs() {
  try {
    const records = await ictDashboardRepository.findRecentLogs({
      page: 1,
      perPage: 15,
      sort: "-created",
      expand: "user_id",
    });

    // Dedup berdasarkan id (jaga-jaga bila ada realtime event yang
    // datang lebih dulu sebelum fetch selesai).
    const seen = new Set();
    const items = [];
    for (const r of records.items) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      items.push(buildLogEntry(r));
    }

    return { logs: items, error: null };
  } catch (error) {
    return { logs: [], error: describeError(error) };
  }
}

// ---------------------------------------------------------------------------
// Login berhasil sejak tanggal tertentu (untuk grafik tren)
// ---------------------------------------------------------------------------
export async function getLoginLogs({ createdSince }) {
  try {
    const records = await ictDashboardRepository.findLogsSince({
      filter: `created >= "${createdSince}"`,
      fields:
        "id,created,user_id,aktivitas,msg,type,endpoint,status_code,payload_json",
      sort: "-created",
    });

    // Dedup berdasarkan id, lalu saring hanya login yang berhasil.
    const seen = new Set();
    const logins = [];
    for (const r of records) {
      if (!isSuccessfulLogin(r)) continue;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      logins.push(slimLogin(r));
    }

    return { logs: logins, error: null };
  } catch (error) {
    return { logs: [], error: describeError(error) };
  }
}
