import { NextResponse } from "next/server";

export function proxy(request) {
  const currentPath = request.nextUrl.pathname;

  //ambil cookie
  const authCookie = request.cookies.get("pb_auth")?.value;

  let isAuthenticated = false;
  let userRole = "";

  //uraikan data cookie
  if (authCookie) {
    try {
      const parsedAuth = JSON.parse(decodeURIComponent(authCookie));
      if (parsedAuth && parsedAuth.token) {
        isAuthenticated = true;
        userRole = parsedAuth.model?.role || "";
      }
    } catch (e) {
      console.error("Gagal membaca cookie auth middleware:", e);
    }
  }

  if (
    !isAuthenticated &&
    (currentPath.startsWith("/admin") ||
      currentPath.startsWith("/walikelas") ||
      currentPath.startsWith("/ict"))
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // BENTENG 2: Jika SUDAH login tapi malah membuka halaman /login lagi
  if (isAuthenticated && currentPath === "/login") {
    if (userRole === "guru walikelas" || userRole === "guru pendamping") {
      return NextResponse.redirect(new URL("/walikelas", request.url));
    }
    if (userRole === "ict") {
      return NextResponse.redirect(new URL("/ict", request.url));
    }
    return NextResponse.redirect(new URL("/walikelas", request.url));
  }

  // BENTENG 3: Hak Akses Spesifik (Mencegah Guru iseng masuk ke URL Admin)
  if (
    isAuthenticated &&
    currentPath.startsWith("/admin") &&
    userRole !== "admin" &&
    userRole !== "ict"
  ) {
    return NextResponse.redirect(new URL("/walikelas", request.url));
  }

  return NextResponse.next();
}

// Konfigurasi halaman mana saja yang diproteksi oleh middleware ini
export const config = {
  matcher: ["/login", "/admin/:path*", "/walikelas/:path*", "/ict/:path*"],
};
