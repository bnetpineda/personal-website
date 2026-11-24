/*
 * Content-Security-Policy for /admin (set per request by proxy.ts). Every admin page renders dynamically, so
 * Next.js can stamp the nonce on its own scripts; nothing else may run. Styles stay 'unsafe-inline' because
 * Radix positioning, Recharts and the chart theme write style attributes and a <style> tag, which nonces
 * don't cover; the risk there is far lower than for scripts. No pure module imports here: proxy.ts uses it.
 */
export function adminContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' only in development, where React rebuilds server error stacks with eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // Dev adds the hot-reload websocket.
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Sent on every route: no MIME sniffing, and no powerful browser features the site never uses. */
export const SITE_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), browsing-topics=()" },
];
