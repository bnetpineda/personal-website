export interface Project {
  title: string;
  description: string;
  tech: string[];
  image: string;
  isMobile?: boolean;
  gallery?: string[];
  github?: string;
  demo?: string;
}

export interface Skill {
  category: "frontend" | "backend" | "tools";
  name: string;
}

export interface ContactInfo {
  type: "email" | "location";
  label: string;
  value: string;
  href?: string;
}

export interface SocialLink {
  platform: "github" | "linkedin" | "twitter" | "email";
  href: string;
  ariaLabel: string;
}
