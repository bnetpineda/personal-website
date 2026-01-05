"use client";

import { FadeIn } from "@/components/ui/motion";
import { NeoCard, NeoCardImageWrapper } from "@/components/ui/neo-card";
import Image from "next/image";

export function About() {
  return (
    <section id="about" className="min-h-screen py-24 px-4 bg-secondary-background border-y-4 border-border relative overflow-hidden flex flex-col justify-center">
      {/* Decorative background elements */}
      <div className="absolute top-20 right-10 w-16 h-16 bg-main/20 border-4 border-border -rotate-12 hidden md:block" />
      <div className="absolute bottom-20 left-10 w-12 h-12 bg-main/30 border-4 border-border rotate-6 hidden md:block" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        <FadeIn className="text-center mb-16">
          <div className="inline-block rotate-[1deg]">
            <NeoCard className="bg-main px-8 py-4 mb-6 rotate-[1deg]">
               <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight text-main-foreground">
                About Me
              </h2>
            </NeoCard>
          </div>
        </FadeIn>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-auto">
          
          {/* Item 1: Intro Text (Span 2) */}
          <FadeIn variant="fadeInLeft" className="md:col-span-2 h-full">
            <NeoCard className="p-6 md:p-8 h-full flex flex-col justify-center bg-main">
              <h3 className="text-2xl font-heading font-bold mb-4">
                More than just lines of code.
              </h3>
              <p className="text-main-foreground/80 mb-4 font-medium">
                I believe in <span className="font-black bg-white/20 px-1">endurance</span>—whether it's debugging a complex race condition or pushing through the last mile of a marathon.
              </p>
              <p className="text-main-foreground/80 font-medium">
                Discipline is my superpower. From the gym to the IDE, I love the process of tearing things down and building them back up, stronger and better than before.
              </p>
            </NeoCard>
          </FadeIn>

          {/* Item 2: Marathon Image (Span 1) */}
          <FadeIn variant="fadeInRight" className="md:col-span-1 h-full">
             <div className="relative group h-full w-full">
                <div className="absolute inset-0 bg-background border-4 border-border translate-x-2 translate-y-2 group-hover:translate-x-1 group-hover:translate-y-1 transition-transform" />
                <NeoCardImageWrapper className="h-full w-full rotate-2 group-hover:rotate-1 transition-transform duration-300">
                   <Image 
                    src="/about-me/Full-Marathon.webp"
                    alt="Finishing the marathon"
                    width={500}
                    height={500}
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                  />
                </NeoCardImageWrapper>
             </div>
          </FadeIn>

          {/* Item 3: Weightlifting (Span 1) */}
          <FadeIn delay={0.2} className="h-full">
            <NeoCard className="p-4 h-full flex flex-col" hoverEffect>
              <NeoCardImageWrapper className="aspect-video w-full bg-black mb-4">
                <video 
                  src="/about-me/myweightlifting.webm" 
                  autoPlay 
                  loop 
                  muted 
                  playsInline 
                  className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                />
              </NeoCardImageWrapper>
              <h4 className="font-heading font-bold text-lg text-center uppercase mt-auto">Iron Discipline</h4>
            </NeoCard>
          </FadeIn>

          {/* Item 4: Gaming (Span 1) */}
          <FadeIn delay={0.3} className="h-full">
             <NeoCard className="p-4 h-full flex flex-col" hoverEffect>
              <NeoCardImageWrapper className="aspect-video w-full bg-black mb-4">
                <video 
                  src="/about-me/valorant-highlight.webm" 
                  autoPlay 
                  loop 
                  muted 
                  playsInline 
                  className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                />
              </NeoCardImageWrapper>
              <h4 className="font-heading font-bold text-lg text-center uppercase mt-auto">Clutch Moments</h4>
            </NeoCard>
          </FadeIn>

           {/* Item 5: Cat (Span 1) */}
           <FadeIn delay={0.4} className="h-full">
            <NeoCard className="p-4 h-full flex flex-col items-center justify-center text-center" hoverEffect>
               <NeoCardImageWrapper className="w-full aspect-video bg-main/10 mb-4">
                 <Image 
                  src="/about-me/mycat.webp"
                  alt="My Cat"
                  width={400}
                  height={500}
                  className="w-full h-full object-cover object-top grayscale group-hover:grayscale-0 transition-all duration-500"
                />
               </NeoCardImageWrapper>
               <p className="font-heading font-bold text-lg mt-auto">Chief Morale Officer 🐈</p>
            </NeoCard>
          </FadeIn>

          {/* Item 6: The Beginning (Span 3) */}
          <FadeIn delay={0.5} className="md:col-span-3">
            <NeoCard className="p-6 md:px-12 md:py-8 flex flex-col md:flex-row items-center gap-8">
               
               <div className="flex-shrink-0 flex flex-col items-center">
                   <h3 className="text-xl font-heading font-black uppercase text-center md:hidden mb-4">The Beginning</h3>
                   <div className="relative group w-32 md:w-40">
                    <div className="absolute inset-0 bg-red-400/20 border-4 border-border translate-x-2 translate-y-2" />
                    <NeoCardImageWrapper className="aspect-[3/4] rotate-[-2deg] group-hover:rotate-0 transition-transform duration-300">
                      <Image 
                        src="/about-me/myoldself-fullbody.webp"
                        alt="My old self"
                        width={300}
                        height={400}
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 sepia-[.3]"
                      />
                    </NeoCardImageWrapper>
                  </div>
                  <span className="font-heading font-bold text-xs uppercase text-muted-foreground mt-2">Where it started</span>
               </div>

               <div className="text-center md:text-left flex-grow">
                 <h3 className="hidden md:block text-3xl font-heading font-black uppercase mb-4">The Beginning</h3>
                 <p className="text-foreground/80 text-lg italic leading-relaxed">
                   "Change is possible. It takes time, effort, and a lot of failures. But looking back at where I started reminds me that <span className="text-main font-bold not-italic">growth is always worth the pain.</span>"
                 </p>
               </div>
            </NeoCard>
          </FadeIn>

        </div>
      </div>
    </section>
  );
}
