"use server";

import * as agendaService from "@/services/guru-mapel-harian-agenda.service";

export async function getPlotingGuru(params) {
  return agendaService.getPlotingGuru(params);
}

export async function getKelasOptions(params) {
  return agendaService.getKelasOptions(params);
}

export async function getAgendaBulan(params) {
  return agendaService.getAgendaBulan(params);
}

export async function getAgendaDetail(params) {
  return agendaService.getAgendaDetail(params);
}

export async function getAgendaById(params) {
  return agendaService.getAgendaById(params);
}

export async function checkAgendaConflict(params) {
  return agendaService.checkAgendaConflict(params);
}
