"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FadeIn, StaggerContainer, StaggerItem, TextReveal, motion } from "@/components/ui/motion";
import { ArrowDown, FileDown, Github, Linkedin, Mail } from "lucide-react";
import { useReducedMotion } from "motion/react";

function Typewriter({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayedText, setDisplayedText] = useState("");
  const [started, setStarted] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayedText(text);
      return;
    }

    const timeout = setTimeout(() => {
      setStarted(true);
    }, delay * 1000);
    return () => clearTimeout(timeout);
  }, [delay, shouldReduceMotion, text]);

  useEffect(() => {
    if (shouldReduceMotion) return;
    if (!started) return;

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= text.length) {
        setDisplayedText(text.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [text, started, shouldReduceMotion]);

  return (
    <span>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{displayedText}</span>
    </span>
  );
}

export function Hero() {
  return (
    <section className="min-h-screen flex items-center justify-center pt-24 pb-20 px-4 relative overflow-hidden bg-pattern">
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <FadeIn variant="fadeInDown" delay={0.1}>
          <div className="mb-6">
            <span className="inline-block bg-main text-main-foreground px-4 py-2 border-2 border-border text-sm font-heading shadow-shadow">
              Full Stack Developer
            </span>
          </div>
        </FadeIn>
        
        <TextReveal delay={0.2}>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-heading mb-6 leading-tight">
            Hi, I&apos;m <span className="text-main">Mark Pineda</span>
          </h1>
        </TextReveal>
        
        <FadeIn delay={0.4}>
          <p className="text-lg md:text-xl text-foreground/80 mb-8 max-w-2xl mx-auto font-sans min-h-[3.5rem]">
            <Typewriter 
              text="Full-stack developer building fast, scalable web apps from frontend to backend. Turning complex ideas into clean, performant code." 
              delay={0.6}
            />
          </p>
        </FadeIn>
        
        <FadeIn delay={0.8}>
          <div className="flex flex-wrap gap-4 justify-center mb-12">
            <Button size="lg" asChild>
              <a href="#contact">Get in Touch</a>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="#projects">View Projects</a>
            </Button>
            <Button size="lg" asChild>
              <a href="/resume.pdf" download aria-label="Download Resume">
                <FileDown className="h-4 w-4 mr-2" />
                Resume
              </a>
            </Button>
          </div>
        </FadeIn>
        
        <StaggerContainer delay={1.0} className="flex gap-4 justify-center mb-16">
          <StaggerItem>
            <Button variant="ghost" size="icon" asChild>
              <a href="https://github.com/bnetpineda" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                <Github className="h-5 w-5" />
              </a>
            </Button>
          </StaggerItem>
          <StaggerItem>
            <Button variant="ghost" size="icon" asChild>
              <a href="https://www.linkedin.com/in/mark-bennett-pineda-2b413927b/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
            </Button>
          </StaggerItem>
          <StaggerItem>
            <Button variant="ghost" size="icon" asChild>
              <a href="mailto:markbennettpineda@gmail.com" aria-label="Email">
                <Mail className="h-5 w-5" />
              </a>
            </Button>
          </StaggerItem>
        </StaggerContainer>
        
        <FadeIn delay={1.2}>
          <a 
            href="#projects" 
            className="inline-flex flex-col items-center gap-2 text-foreground/60 hover:text-foreground transition-colors"
          >
            <span className="text-sm">Scroll to explore</span>
            <ArrowDown className="h-5 w-5 animate-bounce" />
          </a>
        </FadeIn>
      </div>
    </section>
  );
}
