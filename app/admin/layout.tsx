import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  // Installable as its own home-screen app (see app/admin.webmanifest/route.ts).
  applicationName: "Finance",
  manifest: "/admin.webmanifest",
  appleWebApp: { title: "Finance", statusBarStyle: "default" },
  // Next emits only `mobile-web-app-capable`; iOS before 16.4 needs Apple's name for standalone mode.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: "/icon.svg",
    apple: [{ url: "/admin-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Don't let iOS turn long amounts into phone-number links.
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  // Lets pb-safe / pt-safe clear the notch and home indicator in the standalone app.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2EFE4" },
    { media: "(prefers-color-scheme: dark)", color: "#17160f" },
  ],
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TooltipProvider>
      <div className="min-h-svh bg-background font-sans font-normal text-foreground">{children}</div>
    </TooltipProvider>
  );
}
