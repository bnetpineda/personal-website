"use client";

import { useEffect, useRef, useState } from "react";

interface TypewriterProps {
  lines: readonly string[];
}

/** Cycles through `lines`, typing then deleting each, with a blinking caret. */
export function Typewriter({ lines }: TypewriterProps) {
  const [txt, setTxt] = useState("");
  const state = useRef({ line: 0, char: 0, del: false });

  useEffect(() => {
    if (!lines.length) return;
    let to: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = state.current;
      const full = lines[s.line];
      if (!s.del) {
        s.char++;
        setTxt(full.slice(0, s.char));
        if (s.char === full.length) {
          s.del = true;
          to = setTimeout(tick, 1700);
          return;
        }
        to = setTimeout(tick, 42 + Math.random() * 40);
      } else {
        s.char--;
        setTxt(full.slice(0, s.char));
        if (s.char === 0) {
          s.del = false;
          s.line = (s.line + 1) % lines.length;
          to = setTimeout(tick, 240);
          return;
        }
        to = setTimeout(tick, 22);
      }
    };
    to = setTimeout(tick, 500);
    return () => clearTimeout(to);
  }, [lines]);

  return (
    <span>
      {txt}
      <span className="caret">.</span>
    </span>
  );
}
