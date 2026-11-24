"use client";

import "./globals.css";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ErrorState } from "./admin/_components/error-state";

/**
 * Last resort, when the root layout itself fails. It replaces the whole document, so it brings its
 * own <html>, the global styles and the saved theme (the theme provider isn't running here).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const inAdmin = (usePathname() ?? "").startsWith("/admin");
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const dark = saved === "dark" || ((!saved || saved === "system") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, []);
  return (
    <html lang="en">
      <body>
        <title>Something went wrong</title>
        <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center bg-background px-4 py-8 font-sans text-foreground">
          <ErrorState error={error} retry={retry} home={inAdmin ? undefined : { href: "/", label: "Go to the home page" }} />
        </main>
      </body>
    </html>
  );
}
