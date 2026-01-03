"use client";

import { FadeIn } from "@/components/ui/motion";

const skills = {
  frontend: [
    "React",
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "HTML/CSS",
    "JavaScript",
    "Redux",
    "Framer Motion",
    "Shadcn UI",
    "Zustand",
  ],
  backend: [
    "Node.js",
    "Express",
    "PostgreSQL",
    "MongoDB",
    "REST APIs",
    "GraphQL",
    "Prisma",
    "Supabase",
    "Firebase",
    "JWT",
  ],
  tools: [
    "Git",
    "Docker",
    "AWS",
    "Vercel",
    "Figma",
    "VS Code",
    "Postman",
    "Jest",
    "CI/CD",
    "Linux",
  ],
};

// Rotate classes for playful neobrutalism effect
const rotations = [
  "rotate-[-2deg]",
  "rotate-[1deg]",
  "rotate-[-1deg]",
  "rotate-[2deg]",
  "rotate-[-1.5deg]",
  "rotate-[1.5deg]",
  "rotate-[-0.5deg]",
  "rotate-[0.5deg]",
  "rotate-[-2.5deg]",
  "rotate-[2.5deg]",
];

function SkillTag({ skill, index }: { skill: string; index: number }) {
  const rotation = rotations[index % rotations.length];
  
  return (
    <div 
      className={`
        ${rotation}
        bg-main text-main-foreground 
        px-5 py-3 md:px-7 md:py-4 
        text-base md:text-lg font-heading font-bold uppercase tracking-wide
        border-4 border-border 
        shadow-[4px_4px_0px_0px_var(--border)]
        hover:translate-x-[3px] hover:-translate-y-[3px] 
        hover:shadow-[8px_8px_0px_0px_var(--border)]
        active:translate-x-0 active:translate-y-0 
        active:shadow-[2px_2px_0px_0px_var(--border)]
        transition-all duration-150 cursor-default
        select-none
      `}
    >
      {skill}
    </div>
  );
}

function CategoryLabel({ children, rotation }: { children: React.ReactNode; rotation: string }) {
  return (
    <div className={`
      ${rotation} w-fit mx-auto 
      bg-background px-8 py-3 
      border-4 border-border 
      shadow-[6px_6px_0px_0px_var(--border)]
    `}>
      <h3 className="text-xl md:text-2xl font-heading font-bold uppercase tracking-wider">
        {children}
      </h3>
    </div>
  );
}

export function Skills() {
  return (
    <section
      id="skills"
      className="min-h-screen py-28 bg-secondary-background border-y-4 border-border relative overflow-hidden flex flex-col justify-center"
    >
      {/* Decorative background elements */}
      <div className="absolute top-10 left-10 w-20 h-20 bg-main/20 border-4 border-border rotate-12 hidden md:block" />
      <div className="absolute bottom-10 right-10 w-16 h-16 bg-main/30 border-4 border-border -rotate-6 hidden md:block" />
      <div className="absolute top-1/2 right-20 w-8 h-8 bg-main border-4 border-border rotate-45 hidden lg:block" />
      
      <div className="container mx-auto px-4 relative z-10">
        <FadeIn className="text-center mb-20">
          <div className="inline-block rotate-[-1deg] bg-main px-8 py-4 border-4 border-border shadow-[6px_6px_0px_0px_var(--border)] mb-6">
            <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight text-main-foreground">
              Technical Skills
            </h2>
          </div>

        </FadeIn>

        <div className="flex flex-col gap-16 md:gap-20">
          {/* Frontend */}
          <FadeIn className="space-y-8">
            <CategoryLabel rotation="rotate-[-2deg]">
              Frontend
            </CategoryLabel>
            <div className="flex flex-wrap justify-center gap-4 md:gap-5 max-w-4xl mx-auto">
              {skills.frontend.map((skill, i) => (
                <SkillTag key={`fe-${i}`} skill={skill} index={i} />
              ))}
            </div>
          </FadeIn>

          {/* Backend */}
          <FadeIn className="space-y-8">
            <CategoryLabel rotation="rotate-[1.5deg]">
              Backend
            </CategoryLabel>
            <div className="flex flex-wrap justify-center gap-4 md:gap-5 max-w-4xl mx-auto">
              {skills.backend.map((skill, i) => (
                <SkillTag key={`be-${i}`} skill={skill} index={i + 3} />
              ))}
            </div>
          </FadeIn>

          {/* Tools */}
          <FadeIn className="space-y-8">
            <CategoryLabel rotation="rotate-[-1deg]">
              Tools
            </CategoryLabel>
            <div className="flex flex-wrap justify-center gap-4 md:gap-5 max-w-4xl mx-auto">
              {skills.tools.map((skill, i) => (
                <SkillTag key={`tools-${i}`} skill={skill} index={i + 6} />
              ))}
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
