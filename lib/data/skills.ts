import type { Skill } from "@/lib/types";

export const SKILLS: readonly Skill[] = [
  // Languages
  { category: "languages", name: "JavaScript" },
  { category: "languages", name: "TypeScript" },
  { category: "languages", name: "SQL" },
  { category: "languages", name: "Python" },
  { category: "languages", name: "Java" },
  { category: "languages", name: "HTML/CSS" },
  { category: "languages", name: "Bash" },
  // Frontend
  { category: "frontend", name: "React" },
  { category: "frontend", name: "Next.js" },
  { category: "frontend", name: "React Native" },
  { category: "frontend", name: "Tailwind CSS" },
  { category: "frontend", name: "Shadcn/UI" },
  { category: "frontend", name: "NativeWind" },
  { category: "frontend", name: "Expo" },
  // Backend
  { category: "backend", name: "Node.js" },
  { category: "backend", name: "Express.js" },
  { category: "backend", name: "REST APIs" },
  // Databases
  { category: "databases", name: "MongoDB" },
  { category: "databases", name: "PostgreSQL" },
  { category: "databases", name: "MySQL" },
  { category: "databases", name: "SQLite" },
  { category: "databases", name: "Redis" },
  // Testing
  { category: "testing", name: "Playwright" },
  { category: "testing", name: "Vitest" },
  // Developer Tools
  { category: "devtools", name: "Git" },
  { category: "devtools", name: "GitHub" },
  { category: "devtools", name: "VS Code" },
  { category: "devtools", name: "Vite" },
  { category: "devtools", name: "Tauri" },
  // Cloud & Services
  { category: "cloud", name: "AWS EC2" },
  { category: "cloud", name: "Supabase" },
  { category: "cloud", name: "Firebase" },
  { category: "cloud", name: "OpenAI API" },
  // AI Tools
  { category: "ai", name: "Claude Code" },
  { category: "ai", name: "Cursor" },
  { category: "ai", name: "GitHub Copilot" },
  { category: "ai", name: "OpenCode" },
  { category: "ai", name: "Codex" },
  { category: "ai", name: "Antigravity" },
] as const;

export const SKILLS_BY_CATEGORY = {
  languages: SKILLS.filter((skill) => skill.category === "languages"),
  frontend: SKILLS.filter((skill) => skill.category === "frontend"),
  backend: SKILLS.filter((skill) => skill.category === "backend"),
  databases: SKILLS.filter((skill) => skill.category === "databases"),
  testing: SKILLS.filter((skill) => skill.category === "testing"),
  devtools: SKILLS.filter((skill) => skill.category === "devtools"),
  cloud: SKILLS.filter((skill) => skill.category === "cloud"),
  ai: SKILLS.filter((skill) => skill.category === "ai"),
} as const;
