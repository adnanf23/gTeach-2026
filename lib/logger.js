import { createSystemLogAction } from "@/actions/systemLog.action";

/**
 * Mengirimkan log aktivitas ke koleksi system_log lewat server action.
 * @param {Object} params
 * @param {string} params.type - Nilai: 'info', 'succes', 'warning', 'error'
 * @param {string} params.msg - Pesan log
 * @param {string} [params.endpoint] - Rute API atau URL halaman
 * @param {number} [params.statusCode] - HTTP Status Code (200, 401, dll)
 * @param {Object} [params.payload] - Data tambahan berupa Object/JSON murni
 */
export async function createSystemLog({
  type = "info",
  msg,
  endpoint = "",
  statusCode = 200,
  payload = null,
}) {
  // Pastikan payload berupa JSON murni sebelum melintasi batas server action.
  let safePayload = {};
  if (payload) {
    try {
      safePayload = JSON.parse(JSON.stringify(payload));
    } catch {
      safePayload = { error: "Gagal memproses data payload asli" };
    }
  }

  const result = await createSystemLogAction({
    type,
    msg,
    endpoint,
    statusCode,
    payload: safePayload,
  });

  if (result?.error) {
    console.error("❌ Gagal mengirim log sistem:", result.error);
  }
}
