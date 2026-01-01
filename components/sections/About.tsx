"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion";
import { Code2, Palette, Rocket } from "lucide-react";

export function About() {
  return (
    <section id="about" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <FadeIn className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading mb-4">
            About Me
          </h2>
          <div className="w-20 h-1 bg-main mx-auto"></div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
          <FadeIn variant="fadeInLeft">
            <h3 className="text-2xl font-heading mb-4">
              I build smart, beautiful apps that people love using.
            </h3>
            <p className="text-foreground/80 mb-4">
              Final-year CS student obsessed with <span className="text-main font-semibold">React Native, TypeScript, AI, and clean design</span>.
            </p>
            <p className="text-foreground/80 mb-4">
              I’ve shipped apps like <span className="text-main font-semibold">PawScan</span> (AI pet health + vet chat), <span className="text-main font-semibold">Smart Space</span> (AR + AI room redesign), and <span className="text-main font-semibold">MealWise</span> (real-time food marketplace).
            </p>
            <p className="text-foreground/80">
              From idea to deployment, I craft fast, intuitive experiences with modern tools. Always learning, always building.
            </p>
          </FadeIn>

          <StaggerContainer className="grid gap-4">
            <StaggerItem>
              <Card>
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-main p-3 border-2 border-border rounded-lg">
                    <Code2 className="h-6 w-6 text-main-foreground" />
                  </div>
                  <div>
                    <h4 className="font-heading text-lg mb-1">Full-Stack Craft</h4>
                    <p className="text-foreground/70 text-sm">
                      End-to-end apps that scale and perform
                    </p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card>
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-main p-3 border-2 border-border rounded-lg">
                    <Palette className="h-6 w-6 text-main-foreground" />
                  </div>
                  <div>
                    <h4 className="font-heading text-lg mb-1">Pixel-Perfect UI</h4>
                    <p className="text-foreground/70 text-sm">
                      Intuitive, modern interfaces that feel great
                    </p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card>
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-main p-3 border-2 border-border rounded-lg">
                    <Rocket className="h-6 w-6 text-main-foreground" />
                  </div>
                  <div>
                    <h4 className="font-heading text-lg mb-1">AI & Innovation</h4>
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