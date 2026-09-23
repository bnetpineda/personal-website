"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useTheme } from "@/components/theme-provider"

/**
 * Toasts (sonner) in the house style. Sits just under the sticky header so it never
 * covers the phone tab bar or the floating add button.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  const offset = { top: "calc(env(safe-area-inset-top) + 72px)" }

  return (
    <Sonner
      theme={resolvedTheme}
      position="top-center"
      offset={offset}
      mobileOffset={{ ...offset, left: "16px", right: "16px" }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-md border-2 border-border bg-popover p-4 font-sans text-sm font-normal text-popover-foreground shadow-md",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "font-semibold",
          description: "text-muted-foreground",
          icon: "shrink-0",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-warning",
          actionButton:
            "shrink-0 cursor-pointer rounded-md border-2 border-border bg-primary px-3 py-1 font-display text-xs tracking-wide text-primary-foreground uppercase shadow-xs active:translate-0.5 active:shadow-none",
          cancelButton:
            "shrink-0 cursor-pointer rounded-md border-2 border-border bg-card px-3 py-1 font-display text-xs tracking-wide text-card-foreground uppercase",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
