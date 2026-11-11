"use server";

import * as tahfizhService from "@/services/tahfizh.service";

export async function getTahfizhData(params) {
  return tahfizhService.getTahfizhData(params);
}

export async function addTahfizhKomponen(params) {
  return tahfizhService.addKomponen(params);
}

export async function removeTahfizhKomponen(id) {
  return tahfizhService.removeKomponen(id);
}

export async function setTahfizhPredikat(params) {
  return tahfizhService.setPredikat(params);
}

export async function getTahsinData(params) {
  return tahfizhService.getTahsinData(params);
}

export async function setNilaiTahsin(params) {
  return tahfizhService.setNilaiTahsin(params);
}

export async function setCatatanTahsin(params) {
  return tahfizhService.setCatatanTahsin(params);
}

export async function getTahfizhCatatan(params) {
  return tahfizhService.getTahfizhCatatan(params);
}

export async function setCatatanTahfizh(params) {
  return tahfizhService.setCatatanTahfizh(params);
}

export async function getRaporTahfizhContext(params) {
  return tahfizhService.getRaporTahfizhContext(params);
}

export async function getRaporTahfizhSiswa(params) {
  return tahfizhService.getRaporTahfizhSiswa(params);
}

export async function getKomponenTingkat(params) {
  return tahfizhService.getKomponenTingkat(params);
}

export async function getMapelTahfizh() {
  return tahfizhService.getMapelTahfizh();
}

export async function addKomponenTingkat(params) {
  return tahfizhService.addKomponenTingkat(params);
}

export async function removeKomponenTingkat(params) {
  return tahfizhService.removeKomponenTingkat(params);
}
