import Image from "next/image";
import { Reveal } from "@/components/ui/reveal";
import { SectionHead } from "@/components/ui/section-head";

export function About() {
  return (
    <section className="section section--alt bg-pat" id="about">
      <div className="wrap">
        <SectionHead
          idx="01"
          kicker="Who's behind the keyboard"
          title="About"
          lead="Discipline is the throughline — from the gym to the IDE. I like tearing things down and building them back stronger."
        />

        <div className="bento">
          <Reveal className="cardx about-intro" style={{ gridColumn: "1 / -1" }}>
            <h3>More than just lines of code.</h3>
            <p>
              I believe in <span className="mark">endurance</span> — whether it&apos;s debugging a nasty race
              condition at 2am or grinding through the last 10km of a marathon.
            </p>
            <p>
              From a heavier, slower 2022 version of myself to shipping production apps and running full
              marathons — the process is the same: tear it down, rebuild it stronger,{" "}
              <span className="mark">1% better every day</span>.
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
                <h4>The Beginning</h4>
                <p>
                  The year I decided to change everything. Lost the weight, hit the gym daily, and fell in
                  love with programming. Same engine, two outputs.
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
