import { NextResponse, type NextRequest } from "next/server";
import { adminContentSecurityPolicy } from "@/lib/auth/csp";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_OPTIONS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_REFRESH_AFTER,
  isEndedSessionProof,
  readSessionToken,
  signDeviceToken,
  signSessionToken,
  verifyDeviceToken,
} from "@/lib/auth/token";

/*
 * Optimistic gate for /admin. The authoritative check is requireAdmin() in every
 * data read and Server Action; this only saves a render for logged-out visitors.
 * It also slides the session: a token older than a day is re-issued, so the home-screen
 * app only asks for the password after SESSION_MAX_AGE of not being opened (and always
 * after SESSION_ABSOLUTE_MAX_AGE from the sign-in).
 * It never touches the database, so it can't see "Sign out everywhere": requireAdmin
 * sends revoked devices to /admin/login?session=ended&proof=…, where their cookie is cleared.
 * Every /admin response gets a per-request nonce CSP; Next.js reads the nonce from the request header and puts it on its scripts.
 */
export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = adminContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const next = () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };
  const redirectTo = (url: URL) => {
    const response = NextResponse.redirect(url);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  // Server Actions (POST) must reach their handler so requireAdmin() can answer with a
  // proper action redirect; a 307 here would be re-POSTed to the login page and break.
  if (request.method !== "GET" && request.method !== "HEAD") return next();

  const { pathname, search, searchParams } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);

  if (pathname === "/admin/login") {
    if (searchParams.get("session") === "ended" && token) {
      // Clear only a cookie that's useless anyway, or one requireAdmin proved revoked. A bare link from
      // another site can't make a proof, so it can't sign a working session out.
      if (!session || (await isEndedSessionProof(searchParams.get("proof"), session))) {
        const response = next();
        response.cookies.delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_OPTIONS.path });
        return response;
      }
    }
    return session ? redirectTo(new URL("/admin", request.url)) : next();
  }

  if (!session) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", pathname + search);
    return redirectTo(login);
  }

  const response = next();
  if (Date.now() / 1000 - session.issuedAt > SESSION_REFRESH_AFTER) {
    // Same epoch and sign-in time as the token it replaces: a refresh never revives a revoked session
    // or stretches the absolute lifetime.
    try {
      const refreshed = await signSessionToken(undefined, undefined, session.epoch, session.authTime);
      response.cookies.set({ name: SESSION_COOKIE, value: refreshed, ...SESSION_COOKIE_OPTIONS });
    } catch {
      // Too close to the absolute lifetime to issue a new token: the current one runs out on its own.
    }
  }
  // Browsers signed in before device cookies existed get one, so they stay exempt from the global login limit.
  if (!(await verifyDeviceToken(request.cookies.get(DEVICE_COOKIE)?.value))) {
    response.cookies.set({ name: DEVICE_COOKIE, value: await signDeviceToken(), ...DEVICE_COOKIE_OPTIONS });
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
