import type { SocialLink } from "@/lib/types";
import { SOCIAL_ICONS } from "@/components/ui/brand-icons";

interface SocialRowProps {
  items: readonly SocialLink[];
  className?: string;
}

/** Row of brutalist icon-button social links (the `.iconbtn` style). */
export function SocialRow({ items, className = "" }: SocialRowProps) {
  return (
    <div className={className} style={{ display: "flex", gap: 12 }}>
      {items.map((s) => {
        const Icon = SOCIAL_ICONS[s.platform];
        const ext = s.href.startsWith("http");
        return (
          <a
            key={s.platform}
            className="iconbtn"
            href={s.href}
            aria-label={s.ariaLabel}
            target={ext ? "_blank" : undefined}
            rel={ext ? "noopener noreferrer" : undefined}
          >
            <Icon />
          </a>
        );
      })}
    </div>
  );
}
