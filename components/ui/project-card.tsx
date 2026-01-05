"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "./button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { motion } from "./motion";
import { ExternalLink, Github, Plus, RotateCcw, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
  onImageClick: (src: string, index: number) => void;
}

export function ProjectCard({ project, onImageClick }: ProjectCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="h-full" style={{ perspective: "1000px" }}>
      <motion.div
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        whileHover={{
          x: isFlipped ? 0 : 4,
          y: isFlipped ? 0 : 4,
          boxShadow: isFlipped ? undefined : "0px 0px 0px 0px var(--border)",
        }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative h-full w-full border-2 border-border shadow-shadow bg-secondary-background"
      >
        <div
          className="h-full w-full bg-secondary-background"
          style={{ backfaceVisibility: "hidden" }}
          aria-hidden={isFlipped}
        >
          <div
            className={cn(
              "flex flex-col h-full overflow-hidden",
              isFlipped ? "pointer-events-none" : "pointer-events-auto"
            )}
          >
            <div
              className={cn(
                "relative h-48 w-full border-b-2 border-border bg-background group cursor-pointer overflow-hidden",
                project.isMobile && "bg-pattern bg-secondary-background"
              )}
              onClick={() => onImageClick(project.image, 0)}
            >
              {project.isMobile ? (
                <div className="absolute inset-0 flex items-center justify-center gap-2 p-4 mt-2">
                  <div className="relative h-full aspect-[9/19] transition-transform duration-500 group-hover:-translate-y-2 group-hover:-rotate-6 z-10">
                    <Image
                      src={project.gallery?.[0] || project.image}
                      alt={`${project.title} screen 1`}
                      fill
                      className="object-cover border-2 border-border rounded-[12px] shadow-[4px_4px_0px_0px_var(--border)] bg-white"
                    />
                  </div>
                  {project.gallery?.[1] && (
                    <div className="relative h-full aspect-[9/19] transition-transform duration-500 group-hover:-translate-y-4 z-20">
                      <Image
                        src={project.gallery[1]}
                        alt={`${project.title} screen 2`}
                        fill
                        className="object-cover border-2 border-border rounded-[12px] shadow-[4px_4px_0px_0px_var(--border)] bg-white"
                      />
                    </div>
                  )}
                  {project.gallery?.[2] && (
                    <div className="relative h-full aspect-[9/19] transition-transform duration-500 group-hover:-translate-y-2 group-hover:rotate-6 z-10">
                      <Image
                        src={project.gallery[2]}
                        alt={`${project.title} screen 3`}
                        fill
                        className="object-cover border-2 border-border rounded-[12px] shadow-[4px_4px_0px_0px_var(--border)] bg-white"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <Image
                  src={project.image}
                  alt={project.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100 z-20">
                <div className="bg-background text-foreground border-2 border-border px-3 py-1 font-bold shadow-[4px_4px_0px_0px_var(--border)] flex items-center gap-2">
                  <ZoomIn className="w-4 h-4" /> View
                </div>
              </div>
            </div>
            <CardHeader className="border-b-2 border-border p-4">
              <CardTitle className="text-xl font-heading">{project.title}</CardTitle>
              <CardDescription className="text-foreground font-base mt-2">
                {project.description}
              </CardDescription>
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
              {project.demo && (
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
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlipped(true);
                }}
                className="ml-auto rounded-none hover:bg-transparent hover:text-main font-bold"
              >
                More <Plus className="h-4 w-4 ml-1" />
              </Button>
            </CardFooter>
          </div>
        </div>

        <div
          className="absolute inset-0 h-full w-full bg-secondary-background"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          aria-hidden={!isFlipped}
        >
          <div
            className={cn(
              "flex flex-col h-full overflow-hidden",
              !isFlipped ? "pointer-events-none" : "pointer-events-auto"
            )}
          >
            <div className="flex flex-row items-center justify-between p-4 border-b-2 border-border bg-main">
              <CardTitle className="text-lg font-heading text-main-foreground">
                Project Gallery
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlipped(false);
                }}
                className="rounded-none border-2 border-border bg-background text-foreground hover:bg-secondary-background hover:translate-x-[2px] hover:translate-y-[2px] shadow-[4px_4px_0px_0px_var(--border)] hover:shadow-[2px_2px_0px_0px_var(--border)] transition-all"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="sr-only">Flip back</span>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-background">
              <div className="grid grid-cols-2 gap-4">
                {(project.gallery || [project.image]).map((img, i) => (
                  <div
                    key={i}
                    className={cn(
                      "relative cursor-pointer group transition-all hover:scale-105",
                      project.isMobile ? "aspect-[9/16]" : "aspect-video"
                    )}
                    onClick={() => onImageClick(img, i)}
                  >
                    <div
                      className={cn(
                        "absolute inset-0 overflow-hidden border-2 border-border shadow-[4px_4px_0px_0px_var(--border)] group-hover:shadow-[2px_2px_0px_0px_var(--border)] group-hover:translate-x-[2px] group-hover:translate-y-[2px] transition-all bg-secondary-background",
                        project.isMobile ? "rounded-[12px]" : ""
                      )}
                    >
                      <Image
                        src={img}
                        alt={`${project.title} gallery image ${i}`}
                        fill
                        className="object-cover grayscale group-hover:grayscale-0 transition-all duration-300"
                      />
                      <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <ZoomIn className="text-white w-6 h-6 drop-shadow-md" />
                      </div>
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
