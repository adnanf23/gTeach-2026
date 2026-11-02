import "server-only";

import { getServerPb } from "@/lib/pocketbase.server";

// ---------------------------------------------------------------------------
// Users (statistik dashboard ICT)
// ---------------------------------------------------------------------------
export async function countUsers(filter) {
  const pb = await getServerPb();
  return pb.collection("users").getList(1, 1, {
    filter,
    requestKey: null,
  });
}

// ---------------------------------------------------------------------------
// System log
// ---------------------------------------------------------------------------
export async function findRecentLogs({ page, perPage, sort, expand }) {
  const pb = await getServerPb();
  return pb.collection("system_log").getList(page, perPage, {
    sort,
    expand,
    requestKey: null,
  });
}

export async function findLogsSince({ filter, fields, sort }) {
  const pb = await getServerPb();
  return pb.collection("system_log").getFullList({
    filter,
    fields,
    sort,
    requestKey: null,
  });
}
