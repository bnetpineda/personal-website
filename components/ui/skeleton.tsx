import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-base bg-foreground/10 border-2 border-transparent", className)}
      {...props}
    />
  )
}

export { Skeleton }
