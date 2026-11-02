"use server";

import * as agendaService from "@/services/ict-monitoring-agenda.service";

export async function getAgendaBaseData() {
  return agendaService.getAgendaBaseData();
}

export async function getAgendaTerbaru(params) {
  return agendaService.getAgendaTerbaru(params);
}

export async function getAgendaHarian(params) {
  return agendaService.getAgendaHarian(params);
}

export async function getAgendaExportRows(params) {
  return agendaService.getAgendaExportRows(params);
}
