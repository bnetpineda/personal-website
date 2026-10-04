"use client";

import type { ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui/spinner";

/**
 * Put inside a <Link>: its icon turns into a spinner while that navigation is on its way, so a
 * click that waits for the server (another month) still answers straight away.
 */
export function LinkIcon({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner /> : children;
}
