import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, SESSION_REFRESH_AFTER, readSessionToken, signSessionToken } from "@/lib/auth/token";

/*
 * Optimistic gate for /admin. The authoritative check is requireAdmin() in every
 * data read and Server Action; this only saves a render for logged-out visitors.
 * It also slides the session: a token older than a day is re-issued, so the home-screen
 * app only asks for the password after SESSION_MAX_AGE of not being opened.
 * It never touches the database, so it can't see "Sign out everywhere": requireAdmin
 * sends revoked devices to /admin/login?session=ended, where their cookie is cleared.
 */
export async function proxy(request: NextRequest) {
  // Server Actions (POST) must reach their handler so requireAdmin() can answer with a
  // proper action redirect; a 307 here would be re-POSTed to the login page and break.
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

  const { pathname, search, searchParams } = request.nextUrl;
  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/admin/login") {
    if (searchParams.get("session") === "ended") {
      const response = NextResponse.next();
      response.cookies.delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_OPTIONS.path });
      return response;
    }
    return session ? NextResponse.redirect(new URL("/admin", request.url)) : NextResponse.next();
  }

  if (!session) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  if (Date.now() / 1000 - session.issuedAt > SESSION_REFRESH_AFTER) {
    // Same epoch as the token it replaces: a refresh never revives a revoked session.
    const token = await signSessionToken(undefined, undefined, session.epoch);
    response.cookies.set({ name: SESSION_COOKIE, value: token, ...SESSION_COOKIE_OPTIONS });
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
