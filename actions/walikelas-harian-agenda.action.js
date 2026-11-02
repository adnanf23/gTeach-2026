"use server";

import * as agendaService from "@/services/walikelas-harian-agenda.service";

export async function resolveWalikelasKelas(params) {
  return agendaService.resolveWalikelasKelas(params);
}

export async function getAgendaBulan(params) {
  return agendaService.getAgendaBulan(params);
}

export async function getAgendaDetail(params) {
  return agendaService.getAgendaDetail(params);
}

export async function getAgendaFormData(params) {
  return agendaService.getAgendaFormData(params);
}

export async function getAgendaExportRows(params) {
  return agendaService.getAgendaExportRows(params);
}
