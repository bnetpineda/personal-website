import { cn } from "@/lib/utils";
import React from "react";

interface NeoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /**
   * If true, adds a hover animation that translates the card slightly.
   */
  hoverEffect?: boolean;
  /**
   * Additional tailwind classes.
   */
  className?: string;
  /**
   * Rotation in degrees for the card (e.g., "rotate-2", "-rotate-1").
   * Can be passed as a full class string or handled via className.
   * This prop is for explicit rotation classes if needed separately.
   */
  rotation?: string;
}

export function NeoCard({
  children,
  className,
  hoverEffect = false,
  ...props
}: NeoCardProps) {
  return (
    <div
      className={cn(
        "bg-background border-4 border-border shadow-[6px_6px_0px_0px_var(--border)]",
        hoverEffect &&
          "transition-transform duration-300 hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[8px_8px_0px_0px_var(--border)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function NeoCardImageWrapper({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-black border-4 border-border overflow-hidden relative group",
        className
      )}
      {...props}
    >
        {children}
    </div>
  );
}
