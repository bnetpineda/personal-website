import { Header } from "@/components/ui/header";
import { BackToTop } from "@/components/ui/back-to-top";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/* Skip to content link for keyboard accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-main focus:text-main-foreground focus:border-2 focus:border-border focus:shadow-shadow focus:rounded-base focus:font-medium"
      >
        Skip to content
      </a>
      <Header />
      <main id="main-content">{children}</main>
      <BackToTop />
    </>
  );
}
