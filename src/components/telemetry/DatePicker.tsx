import { CalendarBlank } from "@phosphor-icons/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function parseDateKey(key: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return undefined
  const y = Number(match[1])
  const m = Number(match[2]) - 1
  const d = Number(match[3])
  return new Date(y, m, d)
}

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function formatReadableDate(key: string): string {
  const date = parseDateKey(key)
  if (!date) return "Pick a date"
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" })
  const day = String(date.getDate()).padStart(2, "0")
  const month = date.toLocaleDateString("en-GB", { month: "short" })
  return `${weekday}, ${day} ${month} ${date.getFullYear()}`
}

export function DatePicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string
  /** Canonical YYYY-MM-DD key */
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = parseDateKey(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-11 w-full justify-start px-3 font-arcade-mono text-[14px] font-bold"
          >
            <CalendarBlank
              size={17}
              weight="bold"
              className="shrink-0 text-[var(--rt-accent-ink)]"
            />
            {formatReadableDate(value)}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-1">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? new Date(2026, 10, 24)}
          onSelect={(date) => {
            if (!date) return
            onChange(toDateKey(date))
            setOpen(false)
          }}
        />
        <div className="flex items-center justify-between border-t border-[var(--rt-border-soft)] px-2 pt-2 pb-1">
          <button
            type="button"
            onClick={() => {
              onChange("2026-11-24")
              setOpen(false)
            }}
            className="rt2-focus cursor-pointer rounded px-2 py-1 text-[13px] font-bold text-[var(--rt-accent-ink)] hover:bg-[var(--rt-accent-soft)]"
          >
            Today (Nov 24)
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rt2-focus cursor-pointer rounded px-2 py-1 text-[13px] font-bold text-[var(--rt-muted)] hover:bg-[var(--rt-bg)] hover:text-[var(--rt-ink)]"
          >
            Close
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
