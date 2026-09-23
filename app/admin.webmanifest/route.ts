import type { MetadataRoute } from "next";

/*
 * Web app manifest for the private /admin dashboard, so it installs to a phone's home screen
 * as its own app ("Finance") instead of the portfolio (app/manifest.ts only works at the root).
 * Linked from app/admin/layout.tsx. Served at /admin.webmanifest, outside the /admin proxy gate,
 * because browsers fetch manifests without cookies.
 */

export const dynamic = "force-static";

const manifest: MetadataRoute.Manifest = {
  id: "/admin",
  name: "Finance · bnetpineda.dev",
  short_name: "Finance",
  description: "Private personal-finance dashboard.",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  orientation: "portrait",
  // Palette literal (globals.css --paper), matching the status bar color in app/admin/layout.tsx.
  background_color: "#F2EFE4",
  theme_color: "#F2EFE4",
  icons: [
    { src: "/admin-icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/admin-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/admin-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  // Long-press the home-screen icon. `?add=` opens quick add straight away (see QuickAdd).
  shortcuts: [
    { name: "Add expense", short_name: "Expense", url: "/admin?add=expense" },
    { name: "Add income", short_name: "Income", url: "/admin?add=income" },
    { name: "Transactions", url: "/admin/transactions" },
    { name: "Recurring", url: "/admin/recurring" },
  ],
};

export function GET() {
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
