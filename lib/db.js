import {
  dbGetFullList,
  dbGetList,
  dbGetOne,
  dbGetFirstListItem,
  dbCreate,
  dbUpdate,
  dbDelete,
} from "@/actions/record.action";

// Server action mengembalikan { data, error } supaya pesan error tetap
// sampai ke client. Wrapper ini membuka hasilnya agar pemakaian di komponen
// tetap seperti sebelumnya (nilai balik langsung, error dilempar).
async function unwrap(resultPromise) {
  const result = await resultPromise;
  if (result?.error) throw new Error(result.error);
  return result?.data;
}

export const db = {
  getFullList: (collection, options) =>
    unwrap(dbGetFullList(collection, options)),
  getList: (collection, page, perPage, options) =>
    unwrap(dbGetList(collection, page, perPage, options)),
  getOne: (collection, id, options) => unwrap(dbGetOne(collection, id, options)),
  getFirstListItem: (collection, filter, options) =>
    unwrap(dbGetFirstListItem(collection, filter, options)),
  create: (collection, data, options) =>
    unwrap(dbCreate(collection, data, options)),
  update: (collection, id, data, options) =>
    unwrap(dbUpdate(collection, id, data, options)),
  remove: (collection, id) => unwrap(dbDelete(collection, id)),
};
