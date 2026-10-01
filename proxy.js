// Nama file:
//   - Next < 15.5  → middleware.js   , export function middleware
//   - Next >= 15.5 → proxy.js        , export function proxy
import { NextResponse } from "next/server";

// ---------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------
const ROLE_REDIRECTS = {
  "guru walikelas": "/walikelas",
  "guru pendamping": "/walikelas",
  "guru mapel": "/guru-mapel",
  ict: "/ict",
  admin: "/admin",
  "wali murid": "/wali-murid",
};

const ROUTE_ACCESS = {
  "/admin": ["admin", "ict"],
  "/ict": ["ict", "admin"],
  "/walikelas": ["guru walikelas", "guru pendamping", "admin", "ict"],
  "/guru-mapel": ["guru mapel", "admin", "ict"],
  "/wali-murid": ["wali murid"],
};

const LOGIN_PATHS = ["/login", "/login-wali-murid"];

// ---------------------------------------------------------------
// Helper: baca cookie pb_auth dengan aman
// ---------------------------------------------------------------
function readAuth(request) {
  const raw = request.cookies.get("pb_auth")?.value;
  if (!raw) return { isAuthenticated: false, userRole: "", invalid: false };

  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    // SDK >= 0.22 pakai key `record`, SDK lama pakai `model`.
    const record = parsed && (parsed.record || parsed.model);

    if (!parsed || !parsed.token || !record) {
      return { isAuthenticated: false, userRole: "", invalid: true };
    }

    const userRole =
      record.collectionName === "wali_murid" ? "wali murid" : record.role || "";

    return { isAuthenticated: true, userRole, invalid: false };
  } catch (e) {
    console.error("Gagal membaca cookie auth middleware:", e);
    return { isAuthenticated: false, userRole: "", invalid: true };
  }
}

// ---------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------
export function proxy(request) {
  // ⚠️ Kalau Next < 15.5, ubah jadi: export function middleware(request) {
  const { pathname } = request.nextUrl;
  const { isAuthenticated, userRole, invalid } = readAuth(request);

  // Cari prefix route terproteksi
  const protectedPrefix = Object.keys(ROUTE_ACCESS).find((prefix) =>
    pathname.startsWith(prefix),
  );

  // ---------- BENTENG 1: belum login, akses route terproteksi ----------
  if (!isAuthenticated && protectedPrefix) {
    const loginPath =
      protectedPrefix === "/wali-murid" ? "/login-wali-murid" : "/login";
    const res = NextResponse.redirect(new URL(loginPath, request.url));
    if (invalid) res.cookies.delete("pb_auth");
    return res;
  }

  // ---------- BENTENG 2: sudah login, buka halaman login ----------
  if (isAuthenticated && LOGIN_PATHS.includes(pathname)) {
    const dest = ROLE_REDIRECTS[userRole];
    if (!dest || dest === pathname) return NextResponse.next();
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // ---------- BENTENG 3: sudah login, tapi role tidak berhak ----------
  if (isAuthenticated && protectedPrefix) {
    const allowed = ROUTE_ACCESS[protectedPrefix];
    if (!allowed.includes(userRole)) {
      const dest = ROLE_REDIRECTS[userRole];
      if (!dest || dest === pathname) return NextResponse.next();
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  return NextResponse.next();
}

// ---------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------
export const config = {
  matcher: [
    "/login",
    "/login-wali-murid",
    "/admin/:path*",
    "/walikelas/:path*",
    "/ict/:path*",
    "/guru-mapel/:path*",
    "/wali-murid/:path*",
  ],
};
