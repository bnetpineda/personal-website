"use client";

import { createContext, useContext } from "react";

/**
 * Whether amounts are hidden. Blurring alone leaves the digits in the page text (copy, find,
 * screen readers), so hidden amounts also swap their digits for dots. Context reaches portals,
 * so sheets and menus follow it without a wrapper. Outside the Shell nothing is hidden.
 */
export const PrivacyHiddenContext = createContext(false);

/** Same length, so hiding amounts doesn't move anything. */
export function maskDigits(text: string): string {
  return text.replace(/\d/g, "•");
}

/** A private figure's text: as-is, or dotted out while amounts are hidden. */
export function Masked({ text }: { text: string }) {
  const hidden = useContext(PrivacyHiddenContext);
  // Screen readers hear "Hidden amount", not a run of bullets (aria-label is ignored on a plain span).
  return hidden ? <span><span aria-hidden>{maskDigits(text)}</span><span className="sr-only">Hidden amount</span></span> : text;
}
