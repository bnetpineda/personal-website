import type { Skill } from "@/lib/types";

export const SKILLS: readonly Skill[] = [
  // Frontend & Desktop
  { category: "frontend", name: "TypeScript" },
  { category: "frontend", name: "React" },
  { category: "frontend", name: "Next.js" },
  { category: "frontend", name: "Electron" },
  { category: "frontend", name: "React Native" },
  { category: "frontend", name: "Expo" },
  { category: "frontend", name: "Tailwind CSS" },
  // Backend & Data
  { category: "backend", name: "Node.js" },
  { category: "backend", name: "Bun" },
  { category: "backend", name: "Cloudflare Workers" },
  { category: "backend", name: "Hono" },
  { category: "backend", name: "PostgreSQL" },
  { category: "backend", name: "SQLite" },
  { category: "backend", name: "Supabase" },
  // AI & Agents
  { category: "ai", name: "Claude Code" },
  { category: "ai", name: "Codex" },
  { category: "ai", name: "Antigravity" },
  { category: "ai", name: "AI SDK" },
  { category: "ai", name: "OpenAI" },
  { category: "ai", name: "Cerebras" },
  // Infra & Quality
  { category: "infra", name: "Playwright" },
  { category: "infra", name: "Vitest" },
  { category: "infra", name: "Docker" },
  { category: "infra", name: "Linux" },
  { category: "infra", name: "GitHub Actions" },
  { category: "infra", name: "AWS" },
] as const;

export const SKILLS_BY_CATEGORY = {
  frontend: SKILLS.filter((skill) => skill.category === "frontend"),
  backend: SKILLS.filter((skill) => skill.category === "backend"),
  ai: SKILLS.filter((skill) => skill.category === "ai"),
  infra: SKILLS.filter((skill) => skill.category === "infra"),
} as const;
