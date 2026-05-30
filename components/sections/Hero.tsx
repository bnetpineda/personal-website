import Image from "next/image";
import { ArrowRight, Download } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { Typewriter } from "@/components/ui/typewriter";
import { SocialRow } from "@/components/ui/social-row";
import { SITE, TYPE_LINES, HERO_STATS, SOCIAL_LINKS } from "@/lib/constants";

export function Hero() {
  return (
    <section className="hero bg-pat" id="top">
      <div className="wrap">
        <div className="hero__grid">
          <div className="hero__left">
            <Reveal className="hero__status" delay={0}>
              <span className="pulse" /> Open to opportunities · {SITE.location}
            </Reveal>
            <Reveal delay={80}>
              <h1>
                I build
                <br />
                things that
                <br />
                <span className="hl">endure</span>.
              </h1>
            </Reveal>
            <Reveal className="hero__type" delay={160}>
              <Typewriter lines={TYPE_LINES} />
            </Reveal>
            <Reveal className="hero__cta" delay={220}>
              <a className="btn btn--accent btn--lg" href="#work">
                View work <ArrowRight size={18} />
              </a>
              <a className="btn btn--lg" href="#contact">
                Get in touch
              </a>
              <a className="btn btn--ink btn--lg" href={SITE.resume} target="_blank" rel="noopener noreferrer">
                <Download size={18} /> Resume
              </a>
            </Reveal>
            <Reveal className="hero__social" delay={280}>
              <SocialRow items={SOCIAL_LINKS.slice(0, 3)} />
            </Reveal>
          </div>

          <Reveal className="hero__visual" delay={180}>
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
                42.01<span style={{ fontSize: 14 }}>km</span>
              </div>
              <div className="l">5h 42m · Leg 3</div>
            </div>
            <div className="portrait__tag">Commit to be fit</div>
          </Reveal>
        </div>

        <Reveal className="hero__stats" delay={120}>
          {HERO_STATS.map((s, i) => {
            const em = (s as { em?: string }).em;
            return (
              <div className="cell" key={i}>
                <div className="v">
                  {s.v}
                  {em && <em> {em}</em>}
                </div>
                <div className="l">{s.l}</div>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
