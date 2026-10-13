"use server";

import PocketBase from "pocketbase";

export async function uploadTtdAction(userId, formData) {
  if (!userId) return { success: false, error: "User ID tidak valid." };

  const file = formData.get("ttd");
  if (!file || !(file instanceof File)) {
    return { success: false, error: "File TTD tidak ditemukan." };
  }

  const pb = new PocketBase(process.env.POCKETBASE_URL);

  try {
    await pb
      .collection("_superusers")
      .authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD,
      );

    const updated = await pb.collection("users").update(userId, formData);

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
    console.error("[uploadTtdAction]", err);
    let msg = "Gagal mengunggah TTD.";
    if (err?.response?.data) {
      const fieldErrors = err.response.data;
      const firstKey = Object.keys(fieldErrors)[0];
      if (firstKey && fieldErrors[firstKey]?.message) {
        msg = fieldErrors[firstKey].message;
      }
    } else if (err?.message) {
      msg = err.message;
    }
    return { success: false, error: msg };
  }
}

export async function updateProfileAction(userId, data) {
  if (!userId) return { success: false, error: "User ID tidak valid." };

  const pb = new PocketBase(process.env.POCKETBASE_URL);

  try {
    await pb
      .collection("_superusers")
      .authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD,
      );

    const updated = await pb.collection("users").update(userId, data);

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
      },
    };
  } catch (err) {
    console.error("[updateProfileAction]", err);
    let msg = "Gagal memperbarui profil.";
    if (err?.response?.data) {
      const fieldErrors = err.response.data;
      const firstKey = Object.keys(fieldErrors)[0];
      if (firstKey && fieldErrors[firstKey]?.message) {
        msg = fieldErrors[firstKey].message;
      }
    } else if (err?.message) {
      msg = err.message;
    }
    return { success: false, error: msg };
  }
}
