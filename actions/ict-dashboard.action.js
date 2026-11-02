"use server";

import * as ictDashboardService from "@/services/ict-dashboard.service";

export async function getIctStats() {
  return ictDashboardService.getIctStats();
}

export async function getRecentLogs() {
  return ictDashboardService.getRecentLogs();
}

export async function getLoginLogs({ createdSince } = {}) {
  return ictDashboardService.getLoginLogs({ createdSince });
}
