"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
}

/**
 * Scroll-reveal wrapper. Content is visible by default; the entrance is
 * additive (the `.in` class triggers a one-shot CSS keyframe), so nothing
 * ever gets stuck hidden if the observer misfires.
 */
export function Reveal({ children, className = "", style = {}, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The observer fires immediately on observe with the element's current
    // intersection state, so elements already in view reveal on mount and the
    // rest reveal on scroll — all via the (external-event) callback, never a
    // synchronous setState in the effect body.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px 12% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${seen ? "in" : ""} ${className}`.trim()}
      style={{ ...style, animationDelay: seen ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
}
