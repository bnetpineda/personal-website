import Image from "next/image";
import { Reveal } from "@/components/ui/reveal";
import { SectionHead } from "@/components/ui/section-head";

export function About() {
  return (
    <section className="section section--alt bg-pat" id="about">
      <div className="wrap">
        <SectionHead
          idx="02"
          kicker="Behind the keyboard"
          title="About"
          lead="Same engine in the gym and the IDE — show up daily, compound quietly."
        />

        <div className="bento">
          <Reveal className="cardx about-intro" style={{ gridColumn: "1 / -1" }}>
            <h3>Built on endurance.</h3>
            <p>
              Whether debugging a gnarly race condition or grinding through kilometer 35 of a marathon, the formula is
              the same: strip away the noise, rebuild stronger, and get <span className="mark">1% better every day</span>.
            </p>
            <div className="transform">
              <div className="transform__img">
                <Image
                  src="/about-me/myoldself-fullbody.webp"
                  alt="Mark in 2022, before"
                  fill
                  sizes="104px"
                />
                <span className="yr">2022 · BEFORE</span>
              </div>
              <div>
                <h4>2022 → Now</h4>
                <p>
                  Rebuilt my health from scratch, ran a full marathon, and fell in love with shipping software.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal className="cardx about-video" delay={60}>
            <video
              src="/about-me/myweightlifting.webm"
              autoPlay
              loop
              muted
              playsInline
              aria-label="Mark weightlifting in the gym"
              style={{ objectPosition: "50% 0%" }}
            />
            <div className="cap">Iron Discipline</div>
          </Reveal>

          <Reveal className="cardx about-video" delay={90}>
            <video
              src="/about-me/valorant-highlight.webm"
              autoPlay
              loop
              muted
              playsInline
              aria-label="Valorant gameplay highlights"
            />
            <div className="cap">Clutch Moments</div>
          </Reveal>

          <Reveal className="cardx about-cat" delay={120}>
            <Image
              src="/about-me/mycat.webp"
              alt="Mark's cat"
              fill
              sizes="(max-width: 860px) 50vw, 33vw"
            />
            <div className="cap">Chief Morale Officer</div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
