"use client";

import { useState, useEffect } from "react";
import { useReducedMotion } from "motion/react";

export function Typewriter({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayedText, setDisplayedText] = useState("");
  const [started, setStarted] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayedText(text);
      return;
    }

    const timeout = setTimeout(() => {
      setStarted(true);
    }, delay * 1000);
    return () => clearTimeout(timeout);
  }, [delay, shouldReduceMotion, text]);

  useEffect(() => {
    if (shouldReduceMotion) return;
    if (!started) return;

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= text.length) {
        setDisplayedText(text.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [text, started, shouldReduceMotion]);

  return (
    <span>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{displayedText}</span>
    </span>
  );
}
