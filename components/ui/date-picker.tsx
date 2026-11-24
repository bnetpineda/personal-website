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

/** The month dropdown's range: Binance history goes back to 2017; goals look years ahead. */
const FIRST_YEAR = 2010
const YEARS_AHEAD = 30

/**
 * Date field: Popover + Calendar. Holds the day as "YYYY-MM-DD" and submits it
 * under `name` through a hidden input, so it works in plain FormData forms.
 */
function DatePicker({
  name,
  defaultValue,
  value: controlledValue,
  onValueChange,
  today,
  placeholder = "Pick a date",
  clearable = false,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "defaultValue" | "value" | "children"> & {
  /** An optional date: offers "Clear date", which submits it empty. */
  clearable?: boolean
  name?: string
  /** Initial day, "YYYY-MM-DD". */
  defaultValue?: string
  /** Controlled day, "YYYY-MM-DD" (use with `onValueChange`). */
  value?: string
  onValueChange?: (value: string) => void
  /** Day marked as today, "YYYY-MM-DD" (defaults to the browser's date). */
  today?: string
  placeholder?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? "")
  const value = controlledValue ?? uncontrolledValue
  const setValue = (next: string) => {
    if (controlledValue === undefined) setUncontrolledValue(next)
    onValueChange?.(next)
  }
  const selected = parseDay(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="date-picker"
          data-empty={!selected}
          className={cn(
            "flex h-9 pointer-coarse:h-11 w-full items-center gap-2 rounded-md border-2 border-input bg-background px-3 py-2 text-left text-sm whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:bg-card focus-visible:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[empty=true]:text-muted-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
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
        {/* Month and year dropdowns: a start date years back shouldn't take dozens of taps. */}
        <Calendar
          mode="single"
          required
          selected={selected}
          defaultMonth={selected}
          today={parseDay(today)}
          captionLayout="dropdown"
          startMonth={new Date(FIRST_YEAR, 0)}
          endMonth={new Date(new Date().getFullYear() + YEARS_AHEAD, 11)}
          autoFocus
          onSelect={(date) => {
            setValue(format(date, "yyyy-MM-dd"))
            setOpen(false)
          }}
        />
        {clearable && selected && (
          <div className="border-t-2 border-border p-2">
            <button
              type="button"
              className="w-full rounded-md px-3 py-1.5 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:min-h-11"
              onClick={() => {
                setValue("")
                setOpen(false)
              }}
            >
              Clear date
            </button>
          </div>
        )}
      </PopoverContent>
      {name && <input type="hidden" name={name} value={value} />}
    </Popover>
  )
}

export { DatePicker }
