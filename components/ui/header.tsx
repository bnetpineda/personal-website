"use client";

import { useEffect, useState } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SocialRow } from "@/components/ui/social-row";
import { useActiveSection } from "@/hooks/use-active-section";
import { NAV_LINKS, SOCIAL_LINKS } from "@/lib/constants";

export function Header() {
  const [open, setOpen] = useState(false);
  const active = useActiveSection();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="header">
        <div className="wrap header__row">
          <a className="brand" href="#top">
            <span>
              bnetpineda<span className="brand-tld">.dev</span>
            </span>
          </a>
          <nav className="nav">
            {NAV_LINKS.map((n) => (
              <a key={n.href} href={n.href} className={active === n.href.slice(1) ? "active" : ""}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="header__cta">
            <ThemeToggle />
            <a className="btn btn--accent btn--sm" href="#contact">
              Hire me
            </a>
            <button className="btn btn--icon burger" aria-label="Open menu" onClick={() => setOpen(true)}>
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      <div className={`sheet-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sheet ${open ? "open" : ""}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span className="eyebrow">Menu</span>
          <button className="btn btn--icon btn--ghost" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X size={22} />
          </button>
        </div>
        {NAV_LINKS.map((n, i) => (
          <a key={n.href} href={n.href} onClick={() => setOpen(false)}>
            {n.label}
            <span className="n">0{i + 1}</span>
          </a>
        ))}
        <a
          className="btn btn--accent btn--lg"
          href="#contact"
          style={{ marginTop: 18, justifyContent: "center" }}
          onClick={() => setOpen(false)}
        >
          Hire me <ArrowRight size={18} />
        </a>
        <SocialRow items={SOCIAL_LINKS.slice(0, 3)} className="" />
      </aside>
    </>
  );
}
