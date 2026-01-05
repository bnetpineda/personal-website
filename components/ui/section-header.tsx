import { FadeIn } from "./motion";

export function SectionHeader({
  title,
  subtitle,
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  delay?: number;
}) {
  return (
    <FadeIn className="text-center mb-16" delay={delay}>
      <div className="inline-block bg-main px-8 py-4 border-2 border-border shadow-[6px_6px_0px_0px_var(--border)] mb-6">
        <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight text-main-foreground">
          {title}
        </h2>
      </div>
      {subtitle && <p className="text-foreground/80 max-w-xl mx-auto text-lg">{subtitle}</p>}
    </FadeIn>
  );
}
