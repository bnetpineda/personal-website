"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

interface MarqueeProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  direction?: "left" | "right";
  pauseOnHover?: boolean;
  speed?: number;
}

export function Marquee({
  children,
  direction = "left",
  pauseOnHover = true,
  speed = 20,
  className,
  ...props
}: MarqueeProps) {
  return (
    <div
      className={cn("w-full overflow-hidden whitespace-nowrap", className)}
      {...props}
    >
      <motion.div
        className="inline-flex gap-4 w-max"
        animate={{
          x: direction === "left" ? ["0%", "-50%"] : ["-50%", "0%"],
        }}
        transition={{
          duration: speed,
          ease: "linear",
          repeat: Infinity,
        }}
        whileHover={pauseOnHover ? { animationPlayState: "paused" } : undefined}
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}
