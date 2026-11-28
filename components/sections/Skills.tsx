import { Reveal } from "@/components/ui/reveal";
import { SectionHead } from "@/components/ui/section-head";
import { SKILLS_BY_CATEGORY } from "@/lib/data/skills";

const GROUPS = [
  { key: "frontend", n: "01", label: "Frontend & Desktop" },
  { key: "backend", n: "02", label: "Backend & Data" },
  { key: "ai", n: "03", label: "AI & Agents" },
  { key: "infra", n: "04", label: "Infra & Quality" },
] as const;

export function Skills() {
  return (
    <section className="section section--alt bg-pat" id="stack">
      <div className="wrap">
        <SectionHead
          idx="03"
          kicker="The toolbox"
          title="Stack"
          lead="Core languages, runtimes, and AI tooling in my daily loop."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {GROUPS.map((g, gi) => (
            <Reveal className="cardx p-6" key={g.key} delay={gi * 60}>
              <div className="mb-4 flex items-baseline gap-3">
                <span className="font-mono text-xs tracking-wider text-muted-foreground">{g.n}</span>
                <h3 className="text-xl uppercase">{g.label}</h3>
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
      </div>
    </section>
  );
}
