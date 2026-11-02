import { describeError } from "@/lib/app-error";
import * as recordRepository from "@/repositories/record.repository";

// Service generik: membungkus tiap operasi agar mengembalikan { data, error }
// (objek polos), sehingga action cukup meneruskan hasilnya.
async function run(operation) {
  try {
    return { data: await operation(), error: null };
  } catch (error) {
    return { data: null, error: describeError(error) };
  }
}

export async function getFullList(collection, options) {
  return run(() => recordRepository.findFullList(collection, options));
}

export async function getList(collection, page, perPage, options) {
  return run(() =>
    recordRepository.findList(collection, page, perPage, options),
  );
}

export async function getOne(collection, id, options) {
  return run(() => recordRepository.findOne(collection, id, options));
}

export async function getFirstListItem(collection, filter, options) {
  return run(() => recordRepository.findFirst(collection, filter, options));
}

export async function create(collection, data, options) {
  return run(() => recordRepository.insert(collection, data, options));
}

export async function update(collection, id, data, options) {
  return run(() => recordRepository.modify(collection, id, data, options));
}

export async function remove(collection, id) {
  return run(() => recordRepository.remove(collection, id));
}
