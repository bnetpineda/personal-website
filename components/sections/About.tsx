"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion";
import { Code2, Palette, Rocket } from "lucide-react";

export function About() {
  return (
    <section id="about" className="min-h-screen py-24 px-4 bg-secondary-background border-y-4 border-border relative overflow-hidden flex flex-col justify-center">
      {/* Decorative background elements */}
      <div className="absolute top-20 right-10 w-16 h-16 bg-main/20 border-4 border-border -rotate-12 hidden md:block" />
      <div className="absolute bottom-20 left-10 w-12 h-12 bg-main/30 border-4 border-border rotate-6 hidden md:block" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        <FadeIn className="text-center mb-16">
          <div className="inline-block rotate-[1deg] bg-main px-8 py-4 border-4 border-border shadow-[6px_6px_0px_0px_var(--border)] mb-6">
            <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight text-main-foreground">
              About Me
            </h2>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
          <FadeIn variant="fadeInLeft">
            <div className="bg-background p-6 md:p-8 border-4 border-border shadow-[6px_6px_0px_0px_var(--border)]">
              <h3 className="text-2xl font-heading font-bold mb-4">
                I build smart, beautiful apps that people love using.
              </h3>
              <p className="text-foreground/80 mb-4">
                Final-year CS student obsessed with <span className="text-main font-bold">React Native, TypeScript, AI, and clean design</span>.
              </p>
              <p className="text-foreground/80 mb-4">
                I've built <span className="text-main font-bold">PawScan</span> (AI pet health), <span className="text-main font-bold">G3od</span> (AI geometry tutor), and <span className="text-main font-bold">MealWise</span> (food marketplace).
              </p>
              <p className="text-foreground/80">
                From idea to deployment, I craft fast, intuitive experiences with modern tools. Always learning, always building.
              </p>
            </div>
          </FadeIn>

          <StaggerContainer className="grid gap-4">
            <StaggerItem>
              <Card className="border-4 border-border shadow-[4px_4px_0px_0px_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--border)] transition-all">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-main p-3 border-4 border-border">
                    <Code2 className="h-6 w-6 text-main-foreground" />
                  </div>
                  <div>
                    <h4 className="font-heading font-bold text-lg mb-1">Full-Stack Craft</h4>
                    <p className="text-foreground/70 text-sm">
                      End-to-end apps that scale and perform
                    </p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card className="border-4 border-border shadow-[4px_4px_0px_0px_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--border)] transition-all">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-main p-3 border-4 border-border">
                    <Palette className="h-6 w-6 text-main-foreground" />
                  </div>
                  <div>
                    <h4 className="font-heading font-bold text-lg mb-1">Pixel-Perfect UI</h4>
                    <p className="text-foreground/70 text-sm">
                      Intuitive, modern interfaces that feel great
                    </p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card className="border-4 border-border shadow-[4px_4px_0px_0px_var(--border)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--border)] transition-all">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-main p-3 border-4 border-border">
                    <Rocket className="h-6 w-6 text-main-foreground" />
                  </div>
                  <div>
                    <h4 className="font-heading font-bold text-lg mb-1">AI & Innovation</h4>
                    <p className="text-foreground/70 text-sm">
                      Pushing boundaries with AI, AR, and real-time features
                    </p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </div>
    </section>
  );
}