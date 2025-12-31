"use client";

import { Button } from "@/components/ui/button";
import { FadeIn, StaggerContainer, StaggerItem, TextReveal } from "@/components/ui/motion";
import { ArrowDown, Github, Linkedin, Mail } from "lucide-react";

export function Hero() {
  return (
    <section className="min-h-screen flex items-center justify-center pt-24 pb-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <FadeIn variant="fadeInDown" delay={0.1}>
          <div className="mb-6">
            <span className="inline-block bg-main text-main-foreground px-4 py-2 border-2 border-border text-sm font-heading">
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
          <p className="text-lg md:text-xl text-foreground/80 mb-8 max-w-2xl mx-auto font-sans">
            I build modern web applications with a focus on user experience, 
            performance, and clean code. Passionate about turning ideas into reality.
          </p>
        </FadeIn>
        
        <FadeIn delay={0.5}>
          <div className="flex flex-wrap gap-4 justify-center mb-12">
            <Button size="lg" asChild>
              <a href="#contact">Get in Touch</a>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="#projects">View Projects</a>
            </Button>
          </div>
        </FadeIn>
        
        <StaggerContainer delay={0.6} className="flex gap-4 justify-center mb-16">
          <StaggerItem>
            <Button variant="ghost" size="icon" asChild>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                <Github className="h-5 w-5" />
              </a>
            </Button>
          </StaggerItem>
          <StaggerItem>
            <Button variant="ghost" size="icon" asChild>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
            </Button>
          </StaggerItem>
          <StaggerItem>
            <Button variant="ghost" size="icon" asChild>
              <a href="mailto:hello@example.com" aria-label="Email">
                <Mail className="h-5 w-5" />
              </a>
            </Button>
          </StaggerItem>
        </StaggerContainer>
        
        <FadeIn delay={0.8}>
          <a 
            href="#about" 
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
