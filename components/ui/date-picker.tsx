"use client"

import * as React from "react"
import { format, isValid, parseISO } from "date-fns"
import { cn } from "cn"
import { CalendarIcon } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** "YYYY-MM-DD" → local midnight (`new Date(value)` would parse it as UTC and can shift the day). */
function parseDay(value: string | undefined) {
  if (!value) return undefined
  const date = parseISO(value)
  return isValid(date) ? date : undefined
}

/**
 * Date field: Popover + Calendar. Holds the day as "YYYY-MM-DD" and submits it
 * under `name` through a hidden input, so it works in plain FormData forms.
 */
function DatePicker({
  name,
  defaultValue,
  today,
  placeholder = "Pick a date",
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "defaultValue" | "value" | "children"> & {
  name?: string
  /** Initial day, "YYYY-MM-DD". */
  defaultValue?: string
  /** Day marked as today, "YYYY-MM-DD" (defaults to the browser's date). */
  today?: string
  placeholder?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(defaultValue ?? "")
  const selected = parseDay(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="date-picker"
          data-empty={!selected}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border-2 border-input bg-background px-3 py-2 text-left text-sm whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:bg-card focus-visible:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[empty=true]:text-muted-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
            className
          )}
          {...props}
        >
          <CalendarIcon />
          <span className="truncate">
            {selected ? format(selected, "EEE, MMM d, yyyy") : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          required
          selected={selected}
          defaultMonth={selected}
          today={parseDay(today)}
          autoFocus
          onSelect={(date) => {
            setValue(format(date, "yyyy-MM-dd"))
            setOpen(false)
          }}
        />
      </PopoverContent>
      {name && <input type="hidden" name={name} value={value} />}
    </Popover>
  )
}

export { DatePicker }
