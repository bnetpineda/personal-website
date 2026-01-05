"use client";

import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion";
import { DecorativeBackground } from "@/components/ui/decorative-background";
import { SKILLS_BY_CATEGORY } from "@/lib/data/skills";
import { cn } from "@/lib/utils";

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
      className={cn(
        rotation,
        "bg-main text-main-foreground",
        "px-5 py-3 md:px-7 md:py-4",
        "text-base md:text-lg font-heading font-bold uppercase tracking-wide",
        "border-4 border-border",
        "shadow-[4px_4px_0px_0px_var(--border)]",
        "hover:translate-x-[3px] hover:-translate-y-[3px]",
        "hover:shadow-[8px_8px_0px_0px_var(--border)]",
        "active:translate-x-0 active:translate-y-0",
        "active:shadow-[2px_2px_0px_0px_var(--border)]",
        "transition-all duration-150 cursor-default",
        "select-none"
      )}
    >
      {skill}
    </div>
  );
}

function CategoryLabel({ children, rotation }: { children: React.ReactNode; rotation: string }) {
  return (
    <div
      className={cn(
        rotation,
        "w-fit mx-auto",
        "bg-background px-8 py-3",
        "border-4 border-border",
        "shadow-[6px_6px_0px_0px_var(--border)]"
      )}
    >
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
      <DecorativeBackground />

      <div className="container mx-auto px-4 relative z-10">
        <FadeIn className="text-center mb-20">
          <div className="inline-block rotate-[-1deg] bg-main px-8 py-4 border-4 border-border shadow-[6px_6px_0px_0px_var(--border)] mb-6">
            <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight text-main-foreground">
              Technical Skills
            </h2>
          </div>
        </FadeIn>

        <div className="flex flex-col gap-16 md:gap-20">
          <StaggerContainer className="space-y-16 md:space-y-20">
            {Object.entries(SKILLS_BY_CATEGORY).map(([category, skills]) => (
              <StaggerItem key={category}>
                <FadeIn className="space-y-8" delay={0.1}>
                  <CategoryLabel rotation={`rotate-${category === "frontend" ? "[-2deg]" : category === "backend" ? "[1.5deg]" : "[-1deg]"}`}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </CategoryLabel>
                  <div className="flex flex-wrap justify-center gap-4 md:gap-5 max-w-4xl mx-auto">
                    {skills.map((skill, i) => (
                      <SkillTag key={skill.name} skill={skill.name} index={i} />
                    ))}
                  </div>
                </FadeIn>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </div>
    </section>
  );
}
