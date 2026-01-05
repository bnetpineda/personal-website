"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Button } from "./button";
import { motion } from "./motion";
import { AnimatePresence } from "motion/react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageViewerProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  isMobile?: boolean;
}

export function ImageViewer({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  isMobile,
}: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const prevIsOpenRef = useRef(isOpen);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setTimeout(() => setCurrentIndex(initialIndex), 0);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialIndex]);

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
    enter: (dir: number) => ({
      x: dir > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      zIndex: 0,
      x: dir < 0 ? 1000 : -1000,
      opacity: 0,
    }),
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

            <div className="relative w-full h-[60vh] bg-secondary-background overflow-hidden group">
              {images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrev();
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-30 rounded-full border-2 border-border bg-background/80 backdrop-blur-sm shadow-[4px_4px_0px_0px_var(--border)] hover:translate-x-[-2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--border)] transition-all opacity-0 group-hover:opacity-100"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNext();
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-30 rounded-full border-2 border-border bg-background/80 backdrop-blur-sm shadow-[4px_4px_0px_0px_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--border)] transition-all opacity-0 group-hover:opacity-100"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}

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
              <div className="absolute inset-0 z-0 bg-black/10" />

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
                      opacity: { duration: 0.2 },
                    }}
                    className="relative w-full h-full flex items-center justify-center"
                  >
                    <div
                      className={cn(
                        "relative",
                        isMobile ? "h-full aspect-[9/19]" : "w-full h-full"
                      )}
                    >
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
