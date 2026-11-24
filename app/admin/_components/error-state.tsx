"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, House, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

/**
 * What a page shows when it fails to load: a plain sentence, a way to try again and a way out. The
 * error code (Next's digest, which matches the server log) sits behind a copy button, not on screen.
 */
export function ErrorState({
  error,
  retry,
  home = { href: "/admin", label: "Go to Overview" },
}: {
  error: Error & { digest?: string };
  retry: () => void;
  home?: { href: string; label: string };
}) {
  const [copied, setCopied] = useState(false);
  const code = error.digest;
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Empty role="alert">
      <EmptyHeader>
        <EmptyTitle>This page couldn&apos;t load</EmptyTitle>
        <EmptyDescription>
          Something went wrong while loading it. Try again, or go somewhere else and come back later.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={retry}>
            <RotateCcw /> Try again
          </Button>
          <Button asChild variant="outline">
            <Link href={home.href}>
              <House /> {home.label}
            </Link>
          </Button>
          {code && (
            <Button variant="ghost" onClick={copy} aria-label={copied ? "Error code copied" : "Copy error code"}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy error code"}
            </Button>
          )}
        </div>
        <span role="status" className="sr-only">{copied ? "Error code copied" : ""}</span>
      </EmptyContent>
    </Empty>
  );
}
