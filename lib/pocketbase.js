// lib/pocketbase.js
import PocketBase from "pocketbase";

const url = "http://127.0.0.1:8090";
export const pb = new PocketBase(url);

pb.autoCancellation(false);

// Sync authStore → cookie setiap kali berubah
pb.authStore.onChange(() => {
  pb.authStore.exportToCookie({
    httpOnly: false,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
});

export function isAuthenticated() {
  return pb.authStore.isValid;
}

export function getCurrentUser() {
  return pb.authStore.record;
}

export function logout() {
  pb.authStore.clear();
  if (typeof window !== "undefined") {
    document.cookie =
      "pb_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  }
}
