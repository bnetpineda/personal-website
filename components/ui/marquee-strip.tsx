interface MarqueeStripProps {
  items: readonly string[];
}

/**
 * Infinite scrolling brutalist strip. The track holds an even number of
 * identical copies and animates `translateX(-50%)`, so the back half is always
 * a pixel-perfect continuation of the front half (seamless loop). Enough copies
 * are rendered that the track overflows the viewport even with short content,
 * so there's never a visible gap.
 */
export function MarqueeStrip({ items }: MarqueeStripProps) {
  const COPIES = 6;
  return (
    <div className="marquee" role="presentation">
      <div className="marquee__track">
        {Array.from({ length: COPIES }, (_, k) => (
          <div className="marquee__item" aria-hidden="true" key={k}>
            {items.map((t, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 26 }}>
                <span>{t}</span>
                <span className="dot" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
