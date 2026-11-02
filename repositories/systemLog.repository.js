import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

export async function currentUserId() {
  const pb = await getServerPb();
  return pb.authStore.record?.id || null;
}

export async function insertLog(logData) {
  const pb = await getServerPb();
  await pb.collection("system_log").create(logData);
}
