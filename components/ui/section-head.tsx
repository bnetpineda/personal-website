import { Reveal } from "@/components/ui/reveal";

interface SectionHeadProps {
  idx: string;
  kicker: string;
  title: string;
  lead?: string;
}

/** Eyebrow index + chip title + optional lead — shared section header. */
export function SectionHead({ idx, kicker, title, lead }: SectionHeadProps) {
  return (
    <Reveal className="section-head">
      <div className="idx">
        {idx} — {kicker}
      </div>
      <h2 className="title-chip">{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </Reveal>
  );
}
