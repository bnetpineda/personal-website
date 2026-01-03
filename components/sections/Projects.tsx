"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn, StaggerContainer, StaggerItem, motion } from "@/components/ui/motion";
import { ExternalLink, Github, Plus, RotateCcw, X, ZoomIn, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

const projects = [
  {
    title: "PawScan",
    description: "AI-powered pet health assessment app connecting pet owners with licensed veterinarians for real-time consultation.",
    tech: ["React Native", "Expo", "Supabase", "OpenAI", "Nativewind"],
    image: "/pawscan-images/Screenshot_20260102_021810_com_markbennettpineda_PawScan_MainActivity.jpg",
    isMobile: true,
    gallery: [
      "/pawscan-images/Screenshot_20260102_021810_com_markbennettpineda_PawScan_MainActivity.jpg",
      "/pawscan-images/Screenshot_20260102_021820_com_markbennettpineda_PawScan_MainActivity.jpg",
      "/pawscan-images/Screenshot_20260102_021827_com_markbennettpineda_PawScan_MainActivity.jpg",
      "/pawscan-images/Screenshot_20260102_021833_com_markbennettpineda_PawScan_MainActivity.jpg",
      "/pawscan-images/Screenshot_20260102_021916_com_markbennettpineda_PawScan_MainActivity.jpg",
      "/pawscan-images/Screenshot_20260102_021957_com_markbennettpineda_PawScan_MainActivity.jpg",
      "/pawscan-images/Screenshot_20260102_022008_com_markbennettpineda_PawScan_MainActivity.jpg",
      "/pawscan-images/Screenshot_20260102_022017_com_markbennettpineda_PawScan_MainActivity.jpg",
    ],
    github: "https://github.com/bnetpineda/PawScan",
  },
  {
    title: "G3od",
    description: "Interactive geometry learning platform with voice-assisted AI tutoring and 3D visualizations for students.",
    tech: ["React Native", "Three.js", "OpenAI", "Supabase", "Nativewind"],
    image: "/g3od-images/Screenshot_20260102_023031_com_citycollegeofangeles_g3od_MainActivity.jpg",
    isMobile: true,
    gallery: [
      "/g3od-images/Screenshot_20260102_023031_com_citycollegeofangeles_g3od_MainActivity.jpg",
      "/g3od-images/Screenshot_20260102_023056_com_citycollegeofangeles_g3od_MainActivity.jpg",
      "/g3od-images/Screenshot_20260102_023100_com_citycollegeofangeles_g3od_MainActivity.jpg",
      "/g3od-images/Screenshot_20260102_023118_com_citycollegeofangeles_g3od_MainActivity.jpg",
      "/g3od-images/Screenshot_20260102_023236_com_citycollegeofangeles_g3od_MainActivity.jpg",
      "/g3od-images/Screenshot_20260102_023310_com_citycollegeofangeles_g3od_MainActivity.jpg",
      "/g3od-images/Screenshot_20260102_023350_com_citycollegeofangeles_g3od_MainActivity.jpg",
    ],
    github: "https://github.com/bnetpineda/G3od-app",
  },
  {
    title: "MealWise",
    description: "Multi-vendor food marketplace with real-time order tracking and role-based dashboards for sellers and customers.",
    tech: ["React", "Node.js", "MongoDB", "Socket.io", "AWS EC2", "Tailwind CSS"],
    image: "/mealchoice/mealchoice-cca.vercel.app.png",
    gallery: [
      "/mealchoice/mealchoice-cca.vercel.app.png",
      "/mealchoice/mealchoice-cca.vercel.app_customer (3).png",
      "/mealchoice/mealchoice-cca.vercel.app_customer (4).png",
      "/mealchoice/mealchoice-cca.vercel.app_customer (5).png",
      "/mealchoice/mealchoice-cca.vercel.app_customer_ai-meal-planner (2).png",
      "/mealchoice/mealchoice-cca.vercel.app_customer_ai-meal-planner (4).png",
      "/mealchoice/mealchoice-cca.vercel.app_customer_ai-meal-planner (5).png",
      "/mealchoice/mealchoice-cca.vercel.app_customer_ai-meal-planner (6).png",
      "/mealchoice/mealchoice-cca.vercel.app_customer_ai-meal-planner (7).png",
      "/mealchoice/mealchoice-cca.vercel.app_customer_ai-meal-planner.png",
    ],
    github: "https://github.com/bnetpineda/MealWise",
    demo: "https://mealchoice-cca.vercel.app",
  },
];

function ImageViewer({ 
  images, 
  initialIndex = 0, 
  isOpen, 
  onClose,
  isMobile 
}: { 
  images: string[]; 
  initialIndex?: number;
  isOpen: boolean; 
  onClose: () => void;
  isMobile?: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }

  const handleNext = useCallback(() => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  if (!isOpen || images.length === 0) return null;

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0
    })
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/90 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-6xl bg-background border-2 border-border shadow-[8px_8px_0px_0px_var(--border)] max-h-[95vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b-2 border-border bg-main z-20">
              <h3 className="text-lg font-heading text-main-foreground">
                Image Viewer ({currentIndex + 1} / {images.length})
              </h3>
              <div className="flex gap-2">
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
            </div>
            
            {/* Main Content Area */}
            <div className="relative w-full h-[60vh] bg-secondary-background overflow-hidden group">
              {/* Navigation Buttons (Floating) */}
              {images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-30 rounded-full border-2 border-border bg-background/80 backdrop-blur-sm shadow-[4px_4px_0px_0px_var(--border)] hover:translate-x-[-2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--border)] transition-all opacity-0 group-hover:opacity-100"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); handleNext(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-30 rounded-full border-2 border-border bg-background/80 backdrop-blur-sm shadow-[4px_4px_0px_0px_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--border)] transition-all opacity-0 group-hover:opacity-100"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}

              {/* Blurred Background Layer */}
              <AnimatePresence custom={direction} initial={false}>
                <motion.div 
                  key={currentIndex}
                  custom={direction}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 z-0 bg-cover bg-center blur-2xl opacity-40 scale-110"
                  style={{ backgroundImage: `url(${images[currentIndex]})` }}
                />
              </AnimatePresence>
              <div className="absolute inset-0 z-0 bg-black/10" /> {/* Dark overlay for contrast */}

              {/* Main Image Layer */}
              <div className="absolute inset-0 z-10 flex items-center justify-center p-4 md:p-8 overflow-hidden">
                <AnimatePresence custom={direction} initial={false} mode="popLayout">
                   <motion.div
                     key={currentIndex}
                     custom={direction}
                     variants={variants}
                     initial="enter"
                     animate="center"
                     exit="exit"
                     transition={{
                       x: { type: "spring", stiffness: 300, damping: 30 },
                       opacity: { duration: 0.2 }
                     }}
                     className="relative w-full h-full flex items-center justify-center"
                   >
                      <div className={cn(
                        "relative",
                        isMobile ? "h-full aspect-[9/19]" : "w-full h-full"
                      )}>
                        <Image
                          src={images[currentIndex]}
                          alt={`Project preview ${currentIndex + 1}`}
                          fill
                          className={cn(
                            isMobile ? "object-cover rounded-[24px] border-4 border-black" : "object-contain",
                            isMobile && "drop-shadow-[0_10px_50px_rgba(0,0,0,0.4)]"
                          )}
                          sizes="(max-width: 768px) 100vw, 1200px"
                          priority
                        />
                      </div>
                   </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Thumbnails Footer */}
            {images.length > 1 && (
              <div className="p-4 border-t-2 border-border bg-background overflow-x-auto">
                <div className="flex gap-2 min-w-min mx-auto justify-center px-4">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setDirection(idx > currentIndex ? 1 : -1);
                        setCurrentIndex(idx);
                      }}
                      className={cn(
                        "relative h-16 aspect-square shrink-0 overflow-hidden border-2 transition-all hover:scale-105",
                        isMobile ? "aspect-[9/16] rounded-[8px]" : "aspect-video w-24",
                        currentIndex === idx 
                          ? "border-main shadow-[2px_2px_0px_0px_var(--main)] scale-105" 
                          : "border-border opacity-60 hover:opacity-100"
                      )}
                    >
                      <Image
                        src={img}
                        alt={`Thumbnail ${idx + 1}`}
                        fill
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
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
  onImageClick: (src: string, index: number) => void;
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
        <div className="h-full w-full bg-secondary-background" style={{ backfaceVisibility: "hidden" }} aria-hidden={isFlipped}>
          <div className={cn("flex flex-col h-full overflow-hidden", isFlipped ? "pointer-events-none" : "pointer-events-auto")}>
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
          aria-hidden={!isFlipped}
        >
          <div className={cn("flex flex-col h-full overflow-hidden", !isFlipped ? "pointer-events-none" : "pointer-events-auto")}>
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
                {(project.gallery || [project.image]).map((img, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "relative cursor-pointer group transition-all hover:scale-105",
                      project.isMobile ? "aspect-[9/16]" : "aspect-video"
                    )}
                    onClick={() => onImageClick(img, i)}
                  >
                    <div className={cn(
                      "absolute inset-0 overflow-hidden border-2 border-border shadow-[4px_4px_0px_0px_var(--border)] group-hover:shadow-[2px_2px_0px_0px_var(--border)] group-hover:translate-x-[2px] group-hover:translate-y-[2px] transition-all bg-secondary-background",
                      project.isMobile ? "rounded-[12px]" : ""
                    )}>
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

export function Projects() {
  const [selectedProject, setSelectedProject] = useState<{
    images: string[];
    index: number;
    isMobile?: boolean;
  } | null>(null);

  const handleImageClick = (project: typeof projects[number], index: number) => {
    setSelectedProject({
      images: project.gallery || [project.image],
      index,
      isMobile: project.isMobile
    });
  };

  return (
    <section id="projects" className="min-h-screen py-24 px-4 bg-pattern relative overflow-hidden flex flex-col justify-center">
      {/* Decorative background elements */}
      <div className="absolute top-16 left-8 w-14 h-14 bg-main/20 border-4 border-border rotate-12 hidden md:block" />
      <div className="absolute bottom-16 right-8 w-10 h-10 bg-main/30 border-4 border-border -rotate-6 hidden md:block" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        <FadeIn className="text-center mb-16">
          <div className="inline-block rotate-[-1deg] bg-main px-8 py-4 border-4 border-border shadow-[6px_6px_0px_0px_var(--border)] mb-6">
            <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight text-main-foreground">
              Featured Projects
            </h2>
          </div>
        </FadeIn>
        
        <StaggerContainer staggerDelay={0.15} className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project) => (
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
