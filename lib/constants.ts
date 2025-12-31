export const NAV_LINKS = [
  { href: "#projects", label: "Projects" },
  { href: "#skills", label: "Skills" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
] as const;

export const SECTION_IDS = NAV_LINKS.map((link) => link.href.slice(1));

export const CONTACT_FORM_ENDPOINT = "https://formspree.io/f/mojvqdge";
