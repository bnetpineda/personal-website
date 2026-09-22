import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, SESSION_REFRESH_AFTER, sessionIssuedAt, signSessionToken } from "@/lib/auth/token";

/*
 * Optimistic gate for /admin. The authoritative check is requireAdmin() in every
 * data read and Server Action; this only saves a render for logged-out visitors.
 * It also slides the session: a token older than a day is re-issued, so the home-screen
 * app only asks for the password after SESSION_MAX_AGE of not being opened.
 */
export async function proxy(request: NextRequest) {
  // Server Actions (POST) must reach their handler so requireAdmin() can answer with a
  // proper action redirect; a 307 here would be re-POSTed to the login page and break.
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const issuedAt = await sessionIssuedAt(request.cookies.get(SESSION_COOKIE)?.value);
  const authed = issuedAt != null;

  if (pathname === "/admin/login") {
    return authed ? NextResponse.redirect(new URL("/admin", request.url)) : NextResponse.next();
  }

  if (!authed) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  if (Date.now() / 1000 - issuedAt > SESSION_REFRESH_AFTER) {
    response.cookies.set({ name: SESSION_COOKIE, value: await signSessionToken(), ...SESSION_COOKIE_OPTIONS });
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
