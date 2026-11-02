// Normalisasi pesan error PocketBase menjadi string yang ramah ditampilkan.
export function describeError(error) {
  if (!error) return "Terjadi kesalahan tidak diketahui.";
  const fieldErrors = error?.response?.data;
  if (fieldErrors && typeof fieldErrors === "object") {
    const firstKey = Object.keys(fieldErrors)[0];
    const message = fieldErrors[firstKey]?.message;
    if (message) return message;
  }
  return error?.message || "Terjadi kesalahan.";
}
