import type { NextConfig } from "next";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { SITE_SECURITY_HEADERS } from "./lib/auth/csp";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  /* Pin the Turbopack workspace root to this project so CSS/module
     resolution doesn't walk up to the parent directory. */
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
  /* The private finance dashboard must never be framed, indexed, or leak its URL. */
  async headers() {
    return [
      // The admin's Content-Security-Policy is per request (a nonce), so proxy.ts sets it.
      { source: "/:path*", headers: SITE_SECURITY_HEADERS },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
