import type { Metadata } from "next";
import { Archivo_Black, Work_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/ui/header";
import { BackToTop } from "@/components/ui/back-to-top";
import "./globals.css";

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-head",
  display: "swap",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://markbennettpineda.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Mark Bennett Pineda | Full Stack Developer",
    template: "%s | Mark Bennett Pineda",
  },
  description:
    "Full Stack Developer specializing in React, Next.js, and Node.js. Building modern web applications with a focus on user experience and performance.",
  keywords: [
    "Full Stack Developer",
    "React Developer",
    "Next.js Developer",
    "Node.js Developer",
    "Web Developer",
    "Frontend Developer",
    "TypeScript",
    "JavaScript",
    "San Francisco",
    "Angeles City",
    "Pampanga",
    "Philippines",
  ],
  authors: [{ name: "Mark Bennett Pineda", url: siteUrl }],
  creator: "Mark Bennett Pineda",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Mark Bennett Pineda | Full Stack Developer",
    title: "Mark Bennett Pineda | Full Stack Developer",
    description:
      "Full Stack Developer specializing in React, Next.js, and Node.js. Building modern web applications with a focus on user experience and performance.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mark Bennett Pineda | Full Stack Developer",
    description:
      "Full Stack Developer specializing in React, Next.js, and Node.js. Building modern web applications with a focus on user experience and performance.",
    creator: "@markbennettpineda",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/icon.svg",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Mark Bennett Pineda",
  url: siteUrl,
  jobTitle: "Full Stack Developer",
  description:
    "Full Stack Developer specializing in React, Next.js, and Node.js.",
  sameAs: [
    "https://github.com/bnetpineda",
    "https://www.linkedin.com/in/mark-bennett-pineda-2b413927b/",
    "https://twitter.com/its_pandesal",
  ],
  knowsAbout: [
    "React",
    "Next.js",
    "Node.js",
    "TypeScript",
    "JavaScript",
    "Web Development",
  ],
  address: {
    "@type": "PostalAddress",
    addressLocality: "Angeles City",
    addressRegion: "Pampanga",
    addressCountry: "PH",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${archivoBlack.variable} ${workSans.variable}`}>
        <ThemeProvider>
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
        </ThemeProvider>
      </body>
    </html>
  );
}
