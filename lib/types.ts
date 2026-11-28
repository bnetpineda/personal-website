export interface Project {
  title: string;
  num: string;
  role: string;
  year: string;
  type: string;
  description: string;
  tech: string[];
  image: string;
  coverAlt?: string;
  isMobile?: boolean;
  gallery?: string[];
  github?: string;
  demo?: string;
}

export type SkillCategory = "frontend" | "backend" | "ai" | "infra";

export interface Skill {
  category: SkillCategory;
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
