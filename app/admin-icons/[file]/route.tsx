import { ImageResponse } from "next/og";

/*
 * Home-screen icons for the /admin app: an ink peso sign on the brand lime, full-bleed so
 * Android masks and iOS rounded corners never clip it (the glyph sits inside the 80% safe zone).
 * Outside /admin on purpose: browsers fetch icons without the session cookie.
 */

const ICONS = {
  "icon-192.png": 192,
  "icon-512.png": 512,
  "maskable-512.png": 512,
  "apple-touch-icon.png": 180,
} as const;

// Palette literals (globals.css --accent / --ink); CSS variables don't exist in an image.
const LIME = "#b6f23a";
const INK = "#15140F";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const size = ICONS[file as keyof typeof ICONS];
  if (!size) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: LIME }}>
        <svg width={size} height={size} viewBox="0 0 512 512">
          <g fill="none" stroke={INK} strokeLinejoin="miter" strokeLinecap="butt">
            <path d="M196 120 V392 M176 140 H282 A70 70 0 0 1 282 280 H196" strokeWidth={40} />
            <path d="M136 180 H376 M136 236 H376" strokeWidth={26} />
          </g>
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
