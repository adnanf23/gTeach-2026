"use client";

// Cache in-memory untuk log sistem yang masuk lewat realtime.
// Tujuan: log yang sudah diterima tidak perlu di-query ulang ke PocketBase,
// dan hitungan tetap ada saat berpindah halaman (modul hidup di bundle client).

const MAX_ENTRIES = 300;

const store = {
  entries: [],
  totalAll: null,
  typeCounts: null,
  bucketCounts: {},
  updatedAt: 0,
};

const listeners = new Set();

function emit() {
  store.updatedAt = Date.now();
  for (const fn of listeners) fn(store);
}

export function subscribeCache(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCache() {
  return store;
}

// Isi awal dari server (sekali per halaman / saat refresh manual).
export function seedCache({ totalAll, typeCounts, bucketCounts } = {}) {
  if (typeof totalAll === "number") store.totalAll = totalAll;
  if (typeCounts) store.typeCounts = { ...typeCounts };
  if (bucketCounts) store.bucketCounts = { ...bucketCounts };
  emit();
}

// Simpan satu log baru ke cache, sekaligus menaikkan counter terkait.
// `bucketKey` diisi pemanggil (mis. "week:d3") agar tiap halaman memakai
// bucket waktunya sendiri.
export function cacheIncomingLog(record, { bucketKey, keys } = {}) {
  if (!record?.id) return;

  if (store.entries.some((e) => e.id === record.id)) return;

  store.entries.unshift(record);
  if (store.entries.length > MAX_ENTRIES) store.entries.length = MAX_ENTRIES;

  if (typeof store.totalAll === "number") store.totalAll += 1;

  const type = record.type;
  if (type && store.typeCounts && type in store.typeCounts) {
    store.typeCounts[type] += 1;
  }

  if (bucketKey) {
    store.bucketCounts[bucketKey] = (store.bucketCounts[bucketKey] || 0) + 1;
  }

  if (keys?.length) {
    for (const k of keys) {
      store.bucketCounts[k] = (store.bucketCounts[k] || 0) + 1;
    }
  }

  emit();
}

export function getCachedBucketCounts() {
  return store.bucketCounts;
}

export function recentCachedLogs(limit = 15) {
  return store.entries.slice(0, limit);
}
