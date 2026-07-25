"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink, LayoutGrid, ArrowRight } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SectionHead } from "@/components/ui/section-head";
import { GithubIcon } from "@/components/ui/brand-icons";
import { ImageViewer, type ViewerData } from "@/components/ui/image-viewer";
import { PROJECTS } from "@/lib/data/projects";
import type { Project } from "@/lib/types";

function ProjectMedia({ p, onOpen }: { p: Project; onOpen: (p: Project, index: number) => void }) {
  if (p.isMobile) {
    return (
      <div className="proj__media">
        <span className="proj__num">{p.num}</span>
        <div className="phone-stack">
          <div className="phone-frame">
            <Image src={p.image} alt={`${p.title} screen`} fill sizes="196px" />
          </div>
          <div className="phone-frame">
            <Image src={p.coverAlt || p.image} alt={`${p.title} screen`} fill sizes="196px" />
          </div>
        </div>
        <button className="btn btn--sm gallery-btn" onClick={() => onOpen(p, 0)}>
          <LayoutGrid size={17} /> Gallery
        </button>
      </div>
    );
  }
  const url = p.demo?.replace(/^https?:\/\//, "") ?? "";
  return (
    <div className="proj__media">
      <span className="proj__num">{p.num}</span>
      <div className="web-frame">
        <div className="bar">
          <i />
          <i />
          <i />
          <span className="url">{url}</span>
        </div>
        <div className="web-frame__shot">
          <Image src={p.image} alt={`${p.title} screenshot`} fill sizes="(max-width: 820px) 100vw, 460px" />
        </div>
      </div>
      <button className="btn btn--sm gallery-btn" onClick={() => onOpen(p, 0)}>
        <LayoutGrid size={17} /> Gallery
      </button>
    </div>
  );
}

export function Projects() {
  const [viewer, setViewer] = useState<ViewerData | null>(null);

  const openViewer = (p: Project, index: number) =>
    setViewer({ title: p.title, images: p.gallery ?? [p.image], index, isMobile: p.isMobile });

  return (
    <section className="section bg-pat" id="work">
      <div className="wrap">
        <SectionHead
          idx="02"
          kicker="Things I've shipped"
          title="Selected Work"
          lead="Three products taken from idea to running code — AI, ops platforms, real-time marketplaces. Tap any gallery to scrub through the real screens."
        />
        <div className="proj-grid">
          {PROJECTS.map((p, i) => (
            <Reveal key={p.title} className="proj" delay={i * 60}>
              <ProjectMedia p={p} onOpen={openViewer} />
              <div className="proj__body">
                <div className="proj__meta">
                  <span className="role">{p.role}</span>
                  <span className="pill">{p.type}</span>
                  <span
                    className="pill"
                    style={{ background: "transparent", color: "var(--ink-soft)", border: "2px solid var(--ink)" }}
                  >
                    {p.year}
                  </span>
                </div>
                <h3>{p.title}</h3>
                <p className="proj__desc">{p.description}</p>
                <div className="proj__tech">
                  {p.tech.map((t) => (
                    <span className="techtag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="proj__links">
                  {p.demo && (
                    <a className="btn btn--accent btn--sm" href={p.demo} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={17} /> Live demo
                    </a>
                  )}
                  {p.github && (
                    <a className="btn btn--sm" href={p.github} target="_blank" rel="noopener noreferrer">
                      <GithubIcon width={17} height={17} /> Code
                    </a>
                  )}
                  <button className="btn btn--ghost btn--sm" onClick={() => openViewer(p, 0)}>
                    Screens <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <ImageViewer data={viewer} onClose={() => setViewer(null)} />
    </section>
  );
}
