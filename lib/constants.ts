import type { ContactInfo, SocialLink } from "@/lib/types";

export const SITE = {
  name: "Mark Bennett Pineda",
  role: "Full-Stack Developer",
  location: "Angeles City, Pampanga · PH",
  email: "markbennettpineda@gmail.com",
  resume: "/resume.pdf",
  tagline: "Building clean, performant code that endures and scales.",
} as const;

export const NAV_LINKS = [
  { href: "#work", label: "Work" },
  { href: "#about", label: "About" },
  { href: "#stack", label: "Stack" },
  { href: "#usage", label: "Usage" },
  { href: "#contact", label: "Contact" },
] as const;

export const SECTION_IDS = NAV_LINKS.map((link) => link.href.slice(1));

export const MARQUEE_ITEMS = [
  "TypeScript",
  "React",
  "Next.js",
  "Electron",
  "Cloudflare Workers",
  "PostgreSQL",
  "1% Better",
  "Built to Endure",
] as const;

export const CONTACT_FORM_ENDPOINT = "https://formspree.io/f/mojvqdge";

export const CONTACT_INFO: readonly ContactInfo[] = [
  {
    type: "email",
    label: "Email",
    value: "markbennettpineda@gmail.com",
    href: "mailto:markbennettpineda@gmail.com",
  },
  {
    type: "location",
    label: "Location",
    value: "Angeles City, Pampanga",
  },
] as const;

export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    platform: "github",
    href: "https://github.com/bnetpineda",
    ariaLabel: "GitHub",
  },
  {
    platform: "linkedin",
    href: "https://www.linkedin.com/in/mark-bennett-pineda-2b413927b/",
    ariaLabel: "LinkedIn",
  },
  {
    platform: "twitter",
    href: "https://twitter.com/its_pandesal",
    ariaLabel: "Twitter",
  },
  {
    platform: "email",
    href: "mailto:markbennettpineda@gmail.com",
    ariaLabel: "Email",
  },
] as const;
