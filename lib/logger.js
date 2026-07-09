import { pb } from "./pocketbase"; // 💡 Pastikan penulisan import sesuai dengan file pocketbase.js Anda

/**
 * Mengirimkan log aktivitas ke koleksi system_logs secara otomatis
 * @param {Object} params
 * @param {string} params.type - Nilai: 'info', 'succes', atau 'warning'
 * @param {string} params.msg - Pesan log
 * @param {string} [params.endpoint] - Rute API atau URL halaman
 * @param {number} [params.statusCode] - HTTP Status Code (200, 401, dll)
 * @param {Object} [params.payload] - Data tambahan berupa Object/JSON murni
 */
export async function createSystemLog({ type = "info", msg, endpoint = "", statusCode = 200, payload = null }) {
  try {
    if (!pb) {
      console.error("Logger Error: Instansi PocketBase tidak ditemukan.");
      return;
    }

    // 1. Ambil ID user terlebih dahulu
    let currentUserId = pb.authStore?.model?.id || pb.authStore?.record?.id || null;
    if (currentUserId === "") {
      currentUserId = null;
    }

    // 2. Bersihkan data payload JSON
    let safePayload = {};
    if (payload) {
      try {
        safePayload = JSON.parse(JSON.stringify(payload));
      } catch (e) {
        safePayload = { error: "Gagal memproses data payload asli" };
      }
    }

    // 3. Susun data dengan nama field yang SESUAI database PocketBase ("aktivitas")
    const logData = {
      type: type,
      aktivitas: msg || "Aktivitas tanpa deskripsi", // 💡 DIUBAH DI SINI (dari msg menjadi aktivitas)
      endpoint: endpoint || "-",
      status_code: Number(statusCode) || 200,
      payload_json: safePayload,
      msg: msg || "Aktivitas tanpa deskripsi"
    };

    // 4. Masukkan user_id ke dalam logData jika tersedia
    if (currentUserId) {
      logData.user_id = currentUserId;
    }

    // 5. Kirim data ke PocketBase
    await pb.collection("system_logs").create(logData, {
      requestKey: null
    });

  } catch (error) {
    console.error("❌ Detail Gagal Kirim Log:");
    console.error("Pesan Error:", error.message);
    
    if (error.data) {
      console.log("Detail Validasi Field dari PocketBase:", JSON.stringify(error.data, null, 2));
    }
  }
}   