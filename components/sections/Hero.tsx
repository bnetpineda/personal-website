"use client";

import { Github, Linkedin, Mail, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn, StaggerContainer, StaggerItem, TextReveal } from "@/components/ui/motion";
import { Typewriter } from "@/components/ui/typewriter";
import { ArrowDown, FileDown } from "lucide-react";
import { SOCIAL_LINKS } from "@/lib/constants";

const iconMap = {
  github: Github,
  linkedin: Linkedin,
  twitter: Twitter,
  email: Mail,
};

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
              text="Building clean, performant code."
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
          {SOCIAL_LINKS.slice(0, 3).map((link) => {
            const Icon = iconMap[link.platform];
            return (
              <StaggerItem key={link.platform}>
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={link.href}
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    aria-label={link.ariaLabel}
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                </Button>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        <FadeIn delay={1.2}>
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
