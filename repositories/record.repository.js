import "server-only";

import { getServerPb, assertAllowedCollection } from "@/lib/pocketbase.server";

// Opsi khusus browser (requestKey) tidak relevan di server.
export function sanitizeOptions(options) {
  if (!options || typeof options !== "object") return {};
  const { requestKey, ...rest } = options;
  return rest;
}

export async function findFullList(collection, options) {
  assertAllowedCollection(collection);
  const pb = await getServerPb();
  return pb.collection(collection).getFullList(sanitizeOptions(options));
}

export async function findList(collection, page, perPage, options) {
  assertAllowedCollection(collection);
  const pb = await getServerPb();
  return pb
    .collection(collection)
    .getList(page, perPage, sanitizeOptions(options));
}

export async function findOne(collection, id, options) {
  assertAllowedCollection(collection);
  const pb = await getServerPb();
  return pb.collection(collection).getOne(id, sanitizeOptions(options));
}

export async function findFirst(collection, filter, options) {
  assertAllowedCollection(collection);
  const pb = await getServerPb();
  return pb
    .collection(collection)
    .getFirstListItem(filter, sanitizeOptions(options));
}

export async function insert(collection, data, options) {
  assertAllowedCollection(collection);
  const pb = await getServerPb();
  return pb.collection(collection).create(data, sanitizeOptions(options));
}

export async function modify(collection, id, data, options) {
  assertAllowedCollection(collection);
  const pb = await getServerPb();
  return pb.collection(collection).update(id, data, sanitizeOptions(options));
}

export async function remove(collection, id) {
  assertAllowedCollection(collection);
  const pb = await getServerPb();
  return pb.collection(collection).delete(id);
}
