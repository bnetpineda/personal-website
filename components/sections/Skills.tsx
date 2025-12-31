"use client";

import { Marquee } from "@/components/ui/marquee";
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

function SkillTag({ skill }: { skill: string }) {
  return (
    <div className="bg-main text-main-foreground px-6 py-3 text-lg font-heading border-2 border-border shadow-shadow mx-4">
      {skill}
    </div>
  );
}

export function Skills() {
  return (
    <section
      id="skills"
      className="py-24 overflow-hidden bg-secondary-background border-y-2 border-border"
    >
      <div className="mb-16 px-4">
        <FadeIn className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading mb-4">
            Featured Projects
          </h2>
          <div className="w-20 h-1 bg-main mx-auto"></div>
        </FadeIn>
      </div>

      <div className="flex flex-col gap-12">
        <div className="rotate-1 bg-background py-4 border-y-2 border-border">
          <Marquee speed={30} direction="left" className="py-2">
            {skills.frontend.map((skill, i) => (
              <SkillTag key={`fe-${i}`} skill={skill} />
            ))}
          </Marquee>
        </div>

        <div className="-rotate-1 bg-background py-4 border-y-2 border-border">
          <Marquee speed={30} direction="right" className="py-2">
            {skills.backend.map((skill, i) => (
              <SkillTag key={`be-${i}`} skill={skill} />
            ))}
          </Marquee>
        </div>

        <div className="rotate-1 bg-background py-4 border-y-2 border-border">
          <Marquee speed={30} direction="left" className="py-2">
            {skills.tools.map((skill, i) => (
              <SkillTag key={`tools-${i}`} skill={skill} />
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}
