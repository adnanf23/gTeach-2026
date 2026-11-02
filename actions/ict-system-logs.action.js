"use server";

import * as ictSystemLogsService from "@/services/ict-system-logs.service";

export async function getSystemLogs(params) {
  return ictSystemLogsService.getSystemLogs(params);
}

export async function getSystemLogCounts() {
  return ictSystemLogsService.getSystemLogCounts();
}

export async function getSystemLogUser(userId) {
  return ictSystemLogsService.getSystemLogUser(userId);
}
