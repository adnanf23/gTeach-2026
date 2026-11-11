import { describeError } from "@/lib/app-error";
import * as userRepository from "@/repositories/user.repository";
import { writeLog } from "@/services/systemLog.service";

export async function updateProfileAsAdmin(userId, data) {
  if (!userId) return { success: false, error: "User ID tidak valid." };

  try {
    const updated = await userRepository.updateUserAsAdmin(userId, data);
    await writeLog({
      type: "info",
      msg: `Memperbarui profil user [${userId}].`,
      endpoint: "-",
      statusCode: 200,
      payload: { userId },
    });
    return {
      success: true,
      record: {
        id: updated.id,
        nama_lengkap: updated.nama_lengkap,
        username: updated.username,
        email: updated.email,
        no_whatsapp: updated.no_whatsapp,
        role: updated.role,
        is_aktif: updated.is_aktif,
        ttd: updated.ttd,
      },
    };
  } catch (err) {
    console.error("[updateProfileAsAdmin]", err);
    return {
      success: false,
      error: describeError(err) || "Gagal memperbarui profil.",
    };
  }
}

export async function uploadTtdAsAdmin(userId, formData) {
  if (!userId) return { success: false, error: "User ID tidak valid." };

  const file = formData.get("ttd");
  if (!file || !(file instanceof File)) {
    return { success: false, error: "File TTD tidak ditemukan." };
  }

  try {
    const updated = await userRepository.updateUserAsAdmin(userId, formData);
    await writeLog({
      type: "info",
      msg: `Mengunggah TTD user [${userId}].`,
      endpoint: "-",
      statusCode: 200,
      payload: { userId },
    });
    return {
      success: true,
      record: {
        id: updated.id,
        collectionId: updated.collectionId,
        collectionName: updated.collectionName,
        ttd: updated.ttd,
      },
    };
  } catch (err) {
    console.error("[uploadTtdAsAdmin]", err);
    return {
      success: false,
      error: describeError(err) || "Gagal mengunggah TTD.",
    };
  }
}
