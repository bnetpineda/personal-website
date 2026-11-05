"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Progress as ProgressPrimitive } from "radix-ui"

const progressIndicatorVariants = cva(
  "h-full w-full flex-1 border-r-2 border-border transition-all",
  {
    variants: {
      variant: {
        default: "bg-primary",
        success: "bg-success",
        warning: "bg-warning",
        destructive: "bg-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Progress({
  className,
  value,
  variant = "default",
  indicatorColor,
  thin = false,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  VariantProps<typeof progressIndicatorVariants> & {
    /** Data-driven fill (e.g. a category color). Overrides the variant color. */
    indicatorColor?: string
    /** A hairline for dense lists. */
    thin?: boolean
  }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-variant={variant}
      className={cn(
        "relative w-full overflow-hidden rounded-full",
        thin ? "h-1 bg-muted" : "h-3 border-2 border-border bg-background",
        className
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(progressIndicatorVariants({ variant }), thin && "border-r-0")}
        style={{
          transform: `translateX(-${100 - Math.min(Math.max(value || 0, 0), 100)}%)`,
          ...(indicatorColor ? { backgroundColor: indicatorColor } : {}),
        }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress, progressIndicatorVariants }
