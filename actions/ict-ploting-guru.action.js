"use server";

import * as ictPlotingGuruService from "@/services/ict-ploting-guru.service";

export async function getIctPlotingGuru() {
  return ictPlotingGuruService.getIctPlotingGuru();
}

export async function getIctPlotingGuruUsage(plotingId) {
  return ictPlotingGuruService.getIctPlotingGuruUsage(plotingId);
}

export async function getIctNilaiHarianIdsByLingkup(lingkupIds) {
  return ictPlotingGuruService.getIctNilaiHarianIdsByLingkup(lingkupIds);
}
