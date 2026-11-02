import "server-only";

import { getAdminPb } from "@/lib/pocketbase.server";

// Update record user memakai hak superuser (bypass rules PocketBase).
export async function updateUserAsAdmin(userId, data) {
  const pb = await getAdminPb();
  return pb.collection("users").update(userId, data);
}
