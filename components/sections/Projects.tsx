"use client";

import { useState } from "react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion";
import { ImageViewer } from "@/components/ui/image-viewer";
import { ProjectCard } from "@/components/ui/project-card";
import { PROJECTS } from "@/lib/data/projects";

export function Projects() {
  const [selectedProject, setSelectedProject] = useState<{
    images: string[];
    index: number;
    isMobile?: boolean;
  } | null>(null);

  const handleImageClick = (project: typeof PROJECTS[number], index: number) => {
    setSelectedProject({
      images: project.gallery || [project.image],
      index,
      isMobile: project.isMobile,
    });
  };

  return (
    <section id="projects" className="min-h-screen py-24 px-4 bg-pattern relative overflow-hidden flex flex-col justify-center">

      <div className="max-w-6xl mx-auto relative z-10">
        <FadeIn className="text-center mb-16">
          <div className="inline-block rotate-[-1deg] bg-main px-8 py-4 border-4 border-border shadow-[6px_6px_0px_0px_var(--border)] mb-6">
            <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight text-main-foreground">
              Featured Projects
            </h2>
          </div>
        </FadeIn>

        <StaggerContainer staggerDelay={0.15} className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {PROJECTS.map((project) => (
            <StaggerItem key={project.title}>
              <ProjectCard
                project={project}
                onImageClick={(src, index) => handleImageClick(project, index)}
              />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>

      <ImageViewer
        images={selectedProject?.images || []}
        initialIndex={selectedProject?.index || 0}
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        isMobile={selectedProject?.isMobile}
      />
    </section>
  );
}
