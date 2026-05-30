"use client";

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface ViewerData {
  title: string;
  images: string[];
  index: number;
  isMobile?: boolean;
}

interface ImageViewerProps {
  data: ViewerData | null;
  onClose: () => void;
}

/** Full-screen lightbox with keyboard nav (Esc / ← / →) and a count chip. */
export function ImageViewer({ data, onClose }: ImageViewerProps) {
  const open = !!data;
  const [idx, setIdx] = useState(0);

  // Reset the active index when a new gallery is opened — the React-blessed
  // "adjust state during render" pattern, so no synchronous setState in effect.
  const [prevData, setPrevData] = useState<ViewerData | null>(null);
  if (data !== prevData) {
    setPrevData(data);
    setIdx(data?.index ?? 0);
  }

  useEffect(() => {
    if (!open || !data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % data.images.length);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + data.images.length) % data.images.length);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, data, onClose]);

  if (!data) return null;

  const total = data.images.length;
  const go = (d: number) => setIdx((i) => (i + d + total) % total);

  return (
    <div className={`viewer ${open ? "open" : ""}`} onClick={onClose}>
      <button className="iconbtn viewer__close" aria-label="Close" onClick={onClose}>
        <X />
      </button>
      {total > 1 && (
        <button
          className="iconbtn viewer__nav prev"
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
        >
          <ChevronLeft />
        </button>
      )}
      {total > 1 && (
        <button
          className="iconbtn viewer__nav next"
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
        >
          <ChevronRight />
        </button>
      )}
      <div className="viewer__stage" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- contain-fit lightbox needs intrinsic sizing */}
        <img
          className={`viewer__img ${data.isMobile ? "mobile" : ""}`}
          src={data.images[idx]}
          alt={`${data.title} screenshot ${idx + 1}`}
        />
      </div>
      <div className="viewer__count">
        {data.title} · {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>
    </div>
  );
}
