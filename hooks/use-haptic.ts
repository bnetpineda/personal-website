"use client";

import { useCallback } from "react";

type HapticPattern = "light" | "medium" | "heavy" | "success" | "error" | "warning";

const hapticPatterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 10],
  error: [50, 100, 50],
  warning: [25, 50, 25],
};

export function useHaptic() {
  const vibrate = useCallback((pattern: HapticPattern = "light") => {
    // Check if the Vibration API is supported
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      const vibrationPattern = hapticPatterns[pattern];
      navigator.vibrate(vibrationPattern);
    }
  }, []);

  const lightTap = useCallback(() => vibrate("light"), [vibrate]);
  const mediumTap = useCallback(() => vibrate("medium"), [vibrate]);
  const heavyTap = useCallback(() => vibrate("heavy"), [vibrate]);
  const success = useCallback(() => vibrate("success"), [vibrate]);
  const error = useCallback(() => vibrate("error"), [vibrate]);
  const warning = useCallback(() => vibrate("warning"), [vibrate]);

  return {
    vibrate,
    lightTap,
    mediumTap,
    heavyTap,
    success,
    error,
    warning,
  };
}
