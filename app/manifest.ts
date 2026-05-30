import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mark Bennett Pineda — Full-Stack Developer",
    short_name: "Mark Pineda",
    description:
      "Full-Stack Developer in Angeles City, PH — React, Next.js, Node, TypeScript. Building clean, performant code that endures.",
    start_url: "/",
    display: "standalone",
    background_color: "#F2EFE4",
    theme_color: "#b6f23a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
