"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FadeIn, StaggerContainer, StaggerItem, motion } from "@/components/ui/motion";

const skills = {
  frontend: [
    "React",
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "HTML/CSS",
    "JavaScript",
  ],
  backend: [
    "Node.js",
    "Express",
    "PostgreSQL",
    "MongoDB",
    "REST APIs",
    "GraphQL",
  ],
  tools: [
    "Git",
    "Docker",
    "AWS",
    "Vercel",
    "Figma",
    "VS Code",
  ],
};

function SkillBadge({ skill, index }: { skill: string; index: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ scale: 1.1, y: -2 }}
      className="bg-main text-main-foreground px-3 py-1 text-sm border-2 border-border cursor-default"
    >
      {skill}
    </motion.span>
  );
}

export function Skills() {
  return (
    <section id="skills" className="py-20 px-4 bg-secondary-background">
      <div className="max-w-6xl mx-auto">
        <FadeIn className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading mb-4">Skills & Technologies</h2>
          <div className="w-20 h-1 bg-main mx-auto"></div>
        </FadeIn>
        
        <StaggerContainer className="grid md:grid-cols-3 gap-8">
          <StaggerItem>
            <Card>
              <CardContent className="p-6">
                <h3 className="font-heading text-xl mb-4 text-center">Frontend</h3>
                <div className="flex flex-wrap gap-2 justify-center">
                  {skills.frontend.map((skill, index) => (
                    <SkillBadge key={skill} skill={skill} index={index} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
          
          <StaggerItem>
            <Card>
              <CardContent className="p-6">
                <h3 className="font-heading text-xl mb-4 text-center">Backend</h3>
                <div className="flex flex-wrap gap-2 justify-center">
                  {skills.backend.map((skill, index) => (
                    <SkillBadge key={skill} skill={skill} index={index} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
          
          <StaggerItem>
            <Card>
              <CardContent className="p-6">
                <h3 className="font-heading text-xl mb-4 text-center">Tools</h3>
                <div className="flex flex-wrap gap-2 justify-center">
                  {skills.tools.map((skill, index) => (
                    <SkillBadge key={skill} skill={skill} index={index} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        </StaggerContainer>
      </div>
    </section>
  );
}
