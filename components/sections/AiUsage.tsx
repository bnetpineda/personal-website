import { Reveal } from "@/components/ui/reveal";
import { SectionHead } from "@/components/ui/section-head";
import { getAiUsageSnapshot } from "@/lib/usage/store";
import { AiUsageDashboard } from "./AiUsageDashboard";

export async function AiUsage() {
  const initial = await getAiUsageSnapshot();

  return (
    <section className="section bg-pat" id="usage">
      <div className="wrap">
        <SectionHead
          idx="04"
          kicker="Live telemetry"
          title="AI Usage"
          lead="Live token volume and API-equivalent spend streamed every 5 minutes from my home server."
        />
        <Reveal delay={60}>
          <AiUsageDashboard initial={initial} />
        </Reveal>
      </div>
    </section>
  );
}
