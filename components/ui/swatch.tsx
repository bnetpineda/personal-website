"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

/*
 * Data-color primitives. App code never sets colors with inline styles — pass the
 * color (a token like "var(--chart-2)" or a user-chosen hex) to these components.
 */

const swatchVariants = cva(
  "inline-block shrink-0 rounded-full border-2 border-border",
  {
    variants: {
      size: {
        sm: "size-2.5",
        default: "size-3",
        lg: "size-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

/** A color dot for a category, asset class or chart series. */
function Swatch({
  color,
  size,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "color"> &
  VariantProps<typeof swatchVariants> & { color: string }) {
  return (
    <span
      data-slot="swatch"
      aria-hidden
      className={cn(swatchVariants({ size }), className)}
      style={{ backgroundColor: color }}
      {...props}
    />
  )
}

/** Horizontal share bar (e.g. allocation). Segment widths are proportional to value. */
function StackedBar({
  segments,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  segments: { key: string; value: number; color: string; label?: string }[]
}) {
  const visible = segments.filter((s) => s.value > 0)
  const total = visible.reduce((sum, s) => sum + s.value, 0)
  return (
    <div
      data-slot="stacked-bar"
      role="img"
      className={cn(
        "flex h-7 w-full overflow-hidden rounded-full border-2 border-border bg-background",
        className
      )}
      {...props}
    >
      {visible.map((s) => (
        <span
          key={s.key}
          title={s.label}
          className="h-full min-w-1 border-r-2 border-border last:border-r-0"
          style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
        />
      ))}
    </div>
  )
}

/** Radio group of color dots; submits the chosen color under `name` in forms. */
function SwatchPicker({
  colors,
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root> & { colors: readonly string[] }) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="swatch-picker"
      className={cn("flex flex-wrap gap-2", className)}
      {...props}
    >
      {colors.map((color) => (
        <RadioGroupPrimitive.Item
          key={color}
          value={color}
          aria-label={color}
          className="flex size-8 items-center justify-center rounded-full border-2 border-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:shadow-sm"
          style={{ backgroundColor: color }}
        >
          <RadioGroupPrimitive.Indicator className="flex size-5 items-center justify-center rounded-full border-2 border-border bg-background">
            <CheckIcon className="size-3" />
          </RadioGroupPrimitive.Indicator>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

export { Swatch, swatchVariants, StackedBar, SwatchPicker }
