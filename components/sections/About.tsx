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
            Featured Projects
          </h2>
          <div className="w-20 h-1 bg-main mx-auto"></div>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
          <FadeIn variant="fadeInLeft">
            <h3 className="text-2xl font-heading mb-4">
              Building digital experiences that matter
            </h3>
            <p className="text-foreground/80 mb-4">
              I&apos;m a Full Stack Developer with 5+ years of experience
              creating web applications that are both beautiful and functional.
              I specialize in React, Node.js, and modern web technologies.
            </p>
            <p className="text-foreground/80 mb-4">
              When I&apos;m not coding, you&apos;ll find me exploring new
              technologies, contributing to open source, or sharing knowledge
              with the developer community.
            </p>
            <p className="text-foreground/80">
              I believe in writing clean, maintainable code and creating
              user-centric solutions that solve real problems.
            </p>
          </FadeIn>

          <StaggerContainer className="grid gap-4">
            <StaggerItem>
              <Card>
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-main p-3 border-2 border-border">
                    <Code2 className="h-6 w-6 text-main-foreground" />
                  </div>
                  <div>
                    <h4 className="font-heading text-lg mb-1">Clean Code</h4>
                    <p className="text-foreground/70 text-sm">
                      Writing readable, maintainable, and well-documented code
                    </p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card>
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-main p-3 border-2 border-border">
                    <Palette className="h-6 w-6 text-main-foreground" />
                  </div>
                  <div>
                    <h4 className="font-heading text-lg mb-1">UI/UX Focus</h4>
                    <p className="text-foreground/70 text-sm">
                      Creating intuitive and visually appealing interfaces
                    </p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card>
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="bg-main p-3 border-2 border-border">
                    <Rocket className="h-6 w-6 text-main-foreground" />
                  </div>
                  <div>
                    <h4 className="font-heading text-lg mb-1">Performance</h4>
                    <p className="text-foreground/70 text-sm">
                      Optimizing for speed and excellent user experience
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
