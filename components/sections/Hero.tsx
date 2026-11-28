import Image from "next/image";
import { ArrowRight, Download } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SocialRow } from "@/components/ui/social-row";
import { Button } from "@/components/ui/button";
import { SITE, SOCIAL_LINKS } from "@/lib/constants";

export function Hero() {
  return (
    <section className="hero bg-pat" id="top">
      <div className="wrap">
        <div className="hero__grid">
          <div className="hero__left">
            <Reveal className="hero__status" delay={0}>
              <span className="pulse" /> Open to opportunities · Pampanga, PH
            </Reveal>
            <Reveal delay={80}>
              <h1>
                I build
                <br />
                things that
                <br />
                <span className="hl">endure</span>.
              </h1>
              <p className="mb-6 max-w-xl font-sans text-lg text-foreground">
                Full-stack engineer shipping desktop, web, and mobile apps with TypeScript, React, Next.js, and
                Electron.
              </p>
            </Reveal>
            <Reveal className="mb-6 flex flex-wrap gap-3" delay={140}>
              <Button asChild size="lg">
                <a href="#work">
                  Selected work <ArrowRight />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={SITE.resume} target="_blank" rel="noopener noreferrer">
                  <Download /> Resume
                </a>
              </Button>
            </Reveal>
            <Reveal className="hero__social" delay={200}>
              <SocialRow items={SOCIAL_LINKS} />
            </Reveal>
          </div>

          <Reveal className="hero__visual" delay={160}>
            <div className="portrait">
              <Image
                src="/about-me/Full-Marathon.webp"
                alt="Mark finishing a full marathon"
                fill
                priority
                sizes="(max-width: 860px) 340px, 40vw"
              />
            </div>
            <div className="stat-badge">
              <div className="v">
                42.01<span className="text-sm">km</span>
              </div>
              <div className="l">5h 42m · Leg 3</div>
            </div>
            <div className="portrait__tag">Commit to be fit</div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
