"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn, StaggerContainer, StaggerItem, motion } from "@/components/ui/motion";
import { ExternalLink, Github, Plus, RotateCcw, X, ZoomIn } from "lucide-react";
import { AnimatePresence } from "motion/react";

const projects = [
  {
    title: "E-Commerce Platform",
    description: "A full-stack e-commerce solution with real-time inventory management, payment processing, and admin dashboard.",
    tech: ["Next.js", "PostgreSQL", "Stripe", "Tailwind CSS"],
    image: "/projects/ecommerce.png",
    github: "https://github.com/bnetpineda",
    demo: "https://example.com",
  },
  {
    title: "Task Management App",
    description: "A collaborative project management tool with real-time updates, team workspaces, and integrations.",
    tech: ["React", "Node.js", "MongoDB", "Socket.io"],
    image: "/projects/taskmanager.png",
    github: "https://github.com/bnetpineda",
    demo: "https://example.com",
  },
  {
    title: "AI Content Generator",
    description: "An AI-powered application for generating marketing copy, blog posts, and social media content.",
    tech: ["Next.js", "OpenAI API", "Prisma", "TypeScript"],
    image: "/projects/aicontent.png",
    github: "https://github.com/bnetpineda",
    demo: "https://example.com",
  },
];

function ImageViewer({ src, isOpen, onClose }: { src: string | null; isOpen: boolean; onClose: () => void }) {
  if (!src) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-5xl bg-background border-2 border-border shadow-[8px_8px_0px_0px_var(--border)] max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b-2 border-border bg-main">
              <h3 className="text-lg font-heading text-main-foreground">Image Viewer</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="rounded-none border-2 border-border bg-background hover:bg-red-500 hover:text-white transition-all shadow-[2px_2px_0px_0px_var(--border)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close viewer</span>
              </Button>
            </div>
            <div className="flex-1 relative p-2 md:p-8 bg-secondary-background flex items-center justify-center overflow-hidden min-h-[300px]">
              <div className="relative w-full h-full min-h-[300px]">
                <Image
                  src={src}
                  alt="Project preview"
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ProjectCard({ 
  project, 
  onImageClick 
}: { 
  project: typeof projects[number];
  onImageClick: (src: string) => void;
}) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="h-full" style={{ perspective: "1000px" }}>
      <motion.div
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        whileHover={{ x: isFlipped ? 0 : 4, y: isFlipped ? 0 : 4, boxShadow: isFlipped ? undefined : "0px 0px 0px 0px var(--border)" }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative h-full w-full border-2 border-border shadow-shadow bg-secondary-background"
      >
        {/* Front Face */}
        <div className="h-full w-full bg-secondary-background" style={{ backfaceVisibility: "hidden" }}>
          <div className="flex flex-col h-full overflow-hidden">
            <div 
              className="relative h-48 w-full border-b-2 border-border bg-background group cursor-pointer overflow-hidden"
              onClick={() => onImageClick(project.image)}
            >
              <Image
                src={project.image}
                alt={project.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="bg-background text-foreground border-2 border-border px-3 py-1 font-bold shadow-[4px_4px_0px_0px_var(--border)] flex items-center gap-2">
                  <ZoomIn className="w-4 h-4" /> View
                </div>
              </div>
            </div>
            <CardHeader className="border-b-2 border-border p-4">
              <CardTitle className="text-xl font-heading">{project.title}</CardTitle>
              <CardDescription className="text-foreground font-base mt-2">{project.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-4 border-b-2 border-border">
              <div className="flex flex-wrap gap-2">
                {project.tech.map((tech) => (
                  <span
                    key={tech}
                    className="bg-main text-main-foreground px-3 py-1 text-sm font-bold border-2 border-border shadow-[2px_2px_0px_0px_var(--border)]"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </CardContent>
            <CardFooter className="gap-2 p-4 bg-background">
              <Button 
                variant="outline" 
                size="sm" 
                asChild
                className="bg-secondary-background hover:bg-main hover:text-main-foreground border-2 border-border shadow-[4px_4px_0px_0px_var(--border)] hover:shadow-[2px_2px_0px_0px_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all rounded-none"
              >
                <a href={project.github} target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4 mr-2" />
                  Code
                </a>
              </Button>
              <Button 
                size="sm" 
                asChild
                className="bg-main text-main-foreground hover:bg-secondary-background hover:text-foreground border-2 border-border shadow-[4px_4px_0px_0px_var(--border)] hover:shadow-[2px_2px_0px_0px_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all rounded-none"
              >
                <a href={project.demo} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Demo
                </a>
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => { e.stopPropagation(); setIsFlipped(true); }} 
                className="ml-auto rounded-none hover:bg-transparent hover:text-main font-bold"
              >
                More <Plus className="h-4 w-4 ml-1" />
              </Button>
            </CardFooter>
          </div>
        </div>

        {/* Back Face */}
        <div
          className="absolute inset-0 h-full w-full bg-secondary-background"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex flex-row items-center justify-between p-4 border-b-2 border-border bg-main">
              <CardTitle className="text-lg font-heading text-main-foreground">Project Gallery</CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={(e) => { e.stopPropagation(); setIsFlipped(false); }}
                className="rounded-none border-2 border-border bg-background text-foreground hover:bg-secondary-background hover:translate-x-[2px] hover:translate-y-[2px] shadow-[4px_4px_0px_0px_var(--border)] hover:shadow-[2px_2px_0px_0px_var(--border)] transition-all"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="sr-only">Flip back</span>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-background">
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div 
                    key={i} 
                    className="relative aspect-square bg-secondary-background border-2 border-border shadow-[4px_4px_0px_0px_var(--border)] overflow-hidden cursor-pointer group hover:shadow-[2px_2px_0px_0px_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    onClick={() => onImageClick(project.image)}
                  >
                    <Image
                      src={project.image}
                      alt={`${project.title} gallery image ${i}`}
                      fill
                      className="object-cover grayscale group-hover:grayscale-0 transition-all duration-300"
                    />
                    <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <ZoomIn className="text-white w-6 h-6 drop-shadow-md" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function Projects() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  return (
    <section id="projects" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <FadeIn className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading mb-4">Featured Projects</h2>
          <div className="w-20 h-1 bg-main mx-auto"></div>
        </FadeIn>
        
        <StaggerContainer staggerDelay={0.15} className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project) => (
            <StaggerItem key={project.title}>
              <ProjectCard 
                project={project} 
                onImageClick={(src) => setSelectedImage(src)} 
              />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>

      <ImageViewer 
        src={selectedImage} 
        isOpen={!!selectedImage} 
        onClose={() => setSelectedImage(null)} 
      />
    </section>
  );
}
