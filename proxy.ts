import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

/*
 * Optimistic gate for /admin. The authoritative check is requireAdmin() in every
 * data read and Server Action; this only saves a render for logged-out visitors.
 */
export async function proxy(request: NextRequest) {
  // Server Actions (POST) must reach their handler so requireAdmin() can answer with a
  // proper action redirect; a 307 here would be re-POSTed to the login page and break.
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const authed = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/admin/login") {
    return authed ? NextResponse.redirect(new URL("/admin", request.url)) : NextResponse.next();
  }

  if (!authed) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
