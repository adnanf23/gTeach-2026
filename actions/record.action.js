"use server";

import * as recordService from "@/services/record.service";

export async function dbGetFullList(collection, options) {
  return recordService.getFullList(collection, options);
}

export async function dbGetList(collection, page, perPage, options) {
  return recordService.getList(collection, page, perPage, options);
}

export async function dbGetOne(collection, id, options) {
  return recordService.getOne(collection, id, options);
}

export async function dbGetFirstListItem(collection, filter, options) {
  return recordService.getFirstListItem(collection, filter, options);
}

export async function dbCreate(collection, data, options) {
  return recordService.create(collection, data, options);
}

export async function dbUpdate(collection, id, data, options) {
  return recordService.update(collection, id, data, options);
}

export async function dbDelete(collection, id) {
  return recordService.remove(collection, id);
}
