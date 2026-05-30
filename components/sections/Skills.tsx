import { Reveal } from "@/components/ui/reveal";
import { SectionHead } from "@/components/ui/section-head";
import { SKILLS_BY_CATEGORY } from "@/lib/data/skills";

const GROUPS = [
  { key: "languages", n: "01", label: "Languages" },
  { key: "frontend", n: "02", label: "Frontend" },
  { key: "backend", n: "03", label: "Backend" },
  { key: "databases", n: "04", label: "Databases" },
  { key: "testing", n: "05", label: "Testing" },
  { key: "devtools", n: "06", label: "Developer Tools" },
  { key: "cloud", n: "07", label: "Cloud & Services" },
  { key: "ai", n: "08", label: "AI Tools" },
] as const;

export function Skills() {
  return (
    <section className="section section--alt bg-pat" id="stack">
      <div className="wrap">
        <SectionHead
          idx="03"
          kicker="The toolbox"
          title="Stack"
          lead="Languages and frameworks I ship with, the databases and cloud behind them, and the AI tooling in my daily loop."
        />
        {GROUPS.map((g, gi) => (
          <Reveal className="skills-group" key={g.key} delay={gi * 60}>
            <div className="skills-group__label">
              <span className="n">{g.n}</span>
              <h3>{g.label}</h3>
              <span className="line" />
            </div>
            <div className="skill-tags">
              {SKILLS_BY_CATEGORY[g.key].map((s) => (
                <span className="skilltag" key={s.name}>
                  {s.name}
                </span>
              ))}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
