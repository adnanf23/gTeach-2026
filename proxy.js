import { NextResponse } from "next/server";

export function proxy(request) {
  const currentPath = request.nextUrl.pathname;

  // Ambil cookie
  const authCookie = request.cookies.get("pb_auth")?.value;

  let isAuthenticated = false;
  let userRole = "";

  // Uraikan data cookie
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

  // BENTENG 1: Redirect ke login jika belum login
  if (
    !isAuthenticated &&
    (currentPath.startsWith("/admin") ||
      currentPath.startsWith("/walikelas") ||
      currentPath.startsWith("/ict") ||
      currentPath.startsWith("/guru-mapel"))
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // BENTENG 2: Jika SUDAH login tapi membuka /login
  if (isAuthenticated && currentPath === "/login") {
    // Redirect berdasarkan role
    const roleRedirects = {
      "guru walikelas": "/walikelas",
      "guru pendamping": "/walikelas",
      "guru mapel": "/guru-mapel",
      ict: "/ict",
      admin: "/admin",
    };

    const redirectPath = roleRedirects[userRole] || "/login";
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  // BENTENG 3: Hak Akses Spesifik
  if (isAuthenticated) {
    // Route /admin: hanya untuk admin dan ict
    if (
      currentPath.startsWith("/admin") &&
      userRole !== "admin" &&
      userRole !== "ict"
    ) {
      const roleRedirects = {
        "guru walikelas": "/walikelas",
        "guru pendamping": "/walikelas",
        "guru mapel": "/guru-mapel",
        ict: "/ict",
        admin: "/admin",
      };
      const redirectPath = roleRedirects[userRole] || "/login";
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    // Route /ict: hanya untuk ict dan admin
    if (
      currentPath.startsWith("/ict") &&
      userRole !== "ict" &&
      userRole !== "admin"
    ) {
      const roleRedirects = {
        "guru walikelas": "/walikelas",
        "guru pendamping": "/walikelas",
        "guru mapel": "/guru-mapel",
        ict: "/ict",
        admin: "/admin",
      };
      const redirectPath = roleRedirects[userRole] || "/login";
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    // Route /walikelas: untuk guru walikelas, guru pendamping, admin, dan ict
    if (
      currentPath.startsWith("/walikelas") &&
      userRole !== "guru walikelas" &&
      userRole !== "guru pendamping" &&
      userRole !== "admin" &&
      userRole !== "ict"
    ) {
      const roleRedirects = {
        "guru walikelas": "/walikelas",
        "guru pendamping": "/walikelas",
        "guru mapel": "/guru-mapel",
        ict: "/ict",
        admin: "/admin",
      };
      const redirectPath = roleRedirects[userRole] || "/login";
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    // Route /guru-mapel: untuk guru mapel, admin, dan ict
    if (
      currentPath.startsWith("/guru-mapel") &&
      userRole !== "guru mapel" &&
      userRole !== "admin" &&
      userRole !== "ict"
    ) {
      const roleRedirects = {
        "guru walikelas": "/walikelas",
        "guru pendamping": "/walikelas",
        "guru mapel": "/guru-mapel",
        ict: "/ict",
        admin: "/admin",
      };
      const redirectPath = roleRedirects[userRole] || "/login";
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }
  }

  return NextResponse.next();
}

// Konfigurasi matcher
export const config = {
  matcher: [
    "/login",
    "/admin/:path*",
    "/walikelas/:path*",
    "/ict/:path*",
    "/guru-mapel/:path*",
  ],
};
