"use client";


import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion";
import { NeoCard, NeoCardImageWrapper } from "@/components/ui/neo-card";
import { DecorativeBackground } from "@/components/ui/decorative-background";
import Image from "next/image";

export function About() {


  return (
    <section id="about" className="min-h-screen py-24 px-4 bg-secondary-background border-y-4 border-border relative overflow-hidden flex flex-col justify-center bg-pattern">
      <DecorativeBackground />
      <div className="max-w-6xl mx-auto relative z-10">
        <FadeIn className="text-center mb-16">
          <div className="inline-block">
            <NeoCard className="bg-main px-8 py-4 mb-6 rotate-[1deg] shadow-[6px_6px_0px_0px_var(--border)]">
               <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight text-main-foreground">
                About Me
              </h2>
            </NeoCard>
          </div>
        </FadeIn>

        {/* Bento Grid Layout */}
        <StaggerContainer staggerDelay={0.1} className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-auto">
          
          {/* Item 1: Intro Text + The Beginning (Span 2) */}
          <StaggerItem className="md:col-span-2 h-full">
            <div className="h-full transition-all duration-300 hover:-translate-y-2 hover:shadow-[8px_8px_0px_0px_var(--border)]">
              <NeoCard className="p-6 md:p-8 h-full flex flex-col justify-center bg-main hoverEffect">
                <h3 className="text-2xl font-heading font-bold mb-4">
                  More than just lines of code.
                </h3>
                <p className="text-main-foreground/80 mb-4 font-medium">
                  I believe in <span className="font-black bg-white/20 px-1">endurance</span>—whether it&apos;s debugging a complex race condition or pushing through the last mile of a marathon.
                </p>
                <p className="text-main-foreground/80 mb-4 font-medium">
                  Discipline is my superpower. From the gym to the IDE, I love the process of tearing things down and building them back up, stronger and better than before.
                </p>

                {/* The Beginning Section */}
                  <div className="mt-6 pt-6 border-t-2 border-white/20">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                      <div className="relative group w-24 md:w-32 flex-shrink-0">
                        <div className="absolute inset-0 bg-white/10 border-2 border-white/30 translate-x-1.5 translate-y-1.5 group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-all" />
                        <NeoCardImageWrapper className="aspect-[3/4] rotate-[-2deg] group-hover:rotate-0 transition-transform duration-300 relative">
                          <Image
                            src="/about-me/myoldself-fullbody.webp"
                            alt="My old self"
                            width={300}
                            height={400}
                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 sepia-[.3]"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <span className="text-white text-xs font-heading font-black text-center px-2">
                              2022<br/>Before
                            </span>
                          </div>
                        </NeoCardImageWrapper>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-xl font-heading font-black uppercase">The Beginning</h4>
                          <span className="inline-block bg-white/20 border-2 border-white/30 px-2 py-0.5 font-heading font-bold text-xs uppercase">
                            2022
                          </span>
                        </div>
                        <p className="text-sm text-main-foreground/80 font-medium leading-relaxed">
                          The year I decided to change everything. Lost weight, hit the gym daily, and fell in love with programming. Every day, I got better—1% at a time.
                        </p>
                      </div>
                    </div>
                  </div>
              </NeoCard>
            </div>
          </StaggerItem>

          <StaggerItem className="md:col-span-1 h-full">
             <div className="relative group h-full w-full transition-all duration-300 hover:-translate-y-2 hover:shadow-[8px_8px_0px_0px_var(--border)]">
                <div className="absolute inset-0 bg-background border-4 border-border translate-x-2 translate-y-2 group-hover:translate-x-1 group-hover:translate-y-1 transition-all" />
                   <NeoCardImageWrapper className="h-full w-full rotate-2 group-hover:rotate-1 transition-transform duration-300">
                    <Image
                     src="/about-me/Full-Marathon.webp"
                     alt="Finishing marathon"
                     width={500}
                     height={500}
                     className="w-full h-full object-cover object-center grayscale group-hover:grayscale-0 transition-all duration-500"
                     loading="lazy"
                   />
                </NeoCardImageWrapper>
             </div>
          </StaggerItem>

           <StaggerItem className="h-full">
             <div className="group h-full transition-all duration-300 hover:-translate-y-2 hover:shadow-[8px_8px_0px_0px_var(--border)]">
                <NeoCard className="p-4 h-full flex flex-col">
                   <NeoCardImageWrapper className="w-full bg-black mb-4 h-80 md:h-96">
                      <video
                        src="/about-me/myweightlifting.webm"
                        autoPlay
                        loop
                        muted
                        playsInline
                        aria-label="Weightlifting workout video"
                        className="w-full h-full object-cover object-[50%_0%] grayscale group-hover:grayscale-0 transition-all duration-500"
                      />
                 </NeoCardImageWrapper>
                 <h4 className="font-heading font-bold text-lg text-center uppercase mt-auto">Iron Discipline</h4>
               </NeoCard>
             </div>
           </StaggerItem>

           <StaggerItem className="h-full">
               <div className="group h-full transition-all duration-300 hover:-translate-y-2 hover:shadow-[8px_8px_0px_0px_var(--border)]">
                <NeoCard className="p-4 h-full flex flex-col">
                   <NeoCardImageWrapper className="w-full bg-black mb-4 h-48 md:h-96">
                      <video
                        src="/about-me/valorant-highlight.webm"
                        autoPlay
                        loop
                        muted
                        playsInline
                        aria-label="Valorant gameplay highlights"
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                      />
                 </NeoCardImageWrapper>
                 <h4 className="font-heading font-bold text-lg text-center uppercase mt-auto">Clutch Moments</h4>
               </NeoCard>
             </div>
           </StaggerItem>

           <StaggerItem className="h-full">
             <div className="group h-full transition-all duration-300 hover:-translate-y-2 hover:shadow-[8px_8px_0px_0px_var(--border)]">
               <NeoCard className="p-4 h-full flex flex-col items-center justify-center text-center">
                   <NeoCardImageWrapper className="w-full h-48 md:h-96 bg-main/10 mb-4">
                    <Image
                     src="/about-me/mycat.webp"
                     alt="My Cat"
                     width={400}
                     height={500}
                     className="w-full h-full object-cover object-top grayscale group-hover:grayscale-0 transition-all duration-500"
                     loading="lazy"
                   />
                  </NeoCardImageWrapper>
                    <p className="font-heading font-bold text-lg mt-auto">Chief Morale Officer</p>
               </NeoCard>
               </div>
             </StaggerItem>

        </StaggerContainer>
      </div>
    </section>
  );
}
