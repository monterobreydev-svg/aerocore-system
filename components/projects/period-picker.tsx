"use client"

import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// One control for the period
// ---------------------------------------------------------------------------
//
// Modelled on the reports page's range picker, and for the same reason: the
// year and the date range were three separate mechanisms sharing a row — a
// select, two naked date inputs, and no statement anywhere of what you were
// actually looking at.
//
// It is one control now. The button *is* the answer, the years are rows you
// pick in a single click, and the range that narrows a year sits behind a
// hairline in the footer, where whoever needs it will find it.

export type Period = { year: number; from: string; to: string }

/** The bounds a year can be stepped to. Beyond these it's a typo, not a year. */
const FIRST_YEAR = 2000
const LAST_YEAR = 2100

/** "1 Jan" — the range label is read next to the year, which supplies the rest. */
function shortDay(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

function rangeLabel(from: string, to: string) {
  if (from && to) return `${shortDay(from)} – ${shortDay(to)}`
  if (from) return `from ${shortDay(from)}`
  if (to) return `until ${shortDay(to)}`
  return null
}

export function PeriodPicker({
  year,
  years,
  from,
  to,
  onChange,
}: {
  year: number
  /** The years that have projects in them, newest first. */
  years: number[]
  from: string
  to: string
  onChange: (period: Partial<Period>) => void
}) {
  const [open, setOpen] = useState(false)

  const choose = (period: Partial<Period>) => {
    setOpen(false)
    onChange(period)
  }

  const narrowed = rangeLabel(from, to)

  return (
    <div className="flex items-center gap-1">
      <StepButton
        label="Previous year"
        onClick={() => choose({ year: year - 1 })}
        disabled={year <= FIRST_YEAR}
      >
        <ChevronLeft className="size-4" />
      </StepButton>

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          className={cn(
            "flex h-9 min-w-0 items-center gap-2 rounded-lg border bg-background px-3",
            "text-sm transition-colors hover:bg-accent",
            "data-popup-open:bg-accent"
          )}
        >
          <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium tabular-nums">{year}</span>
          {/* What the year has been narrowed to, if anything — the same slot
              the reports picker uses for its preset name. */}
          <span
            className={cn(
              "truncate text-xs",
              narrowed
                ? "text-foreground"
                : "hidden text-muted-foreground sm:inline"
            )}
          >
            {narrowed ?? "whole year"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="start"
            sideOffset={6}
            className="z-50"
          >
            <Popover.Popup
              className={cn(
                "w-64 rounded-xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10",
                "origin-(--transform-origin) outline-none",
                "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
                "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
              )}
            >
              <ul className="flex max-h-56 flex-col overflow-y-auto">
                {years.map((option) => {
                  const active = option === year
                  return (
                    <li key={option}>
                      <button
                        type="button"
                        onClick={() => choose({ year: option })}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5",
                          "text-left text-sm tabular-nums transition-colors hover:bg-accent",
                          active && "font-medium"
                        )}
                      >
                        {option}
                        {/* Selection is a check, not a filled row — hover stays
                            a ghost wash so the two never compete. */}
                        {active && (
                          <Check className="size-4 shrink-0" strokeWidth={3} />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>

              {/* Keyed on the applied period so the draft in the boxes is
                  reset by a change made anywhere else — picking another year,
                  or Clear filters — rather than holding dates that no longer
                  describe what is on screen. */}
              <CustomRange
                key={`${year}:${from}:${to}`}
                year={year}
                from={from}
                to={to}
                onApply={choose}
                onClear={() => choose({ from: "", to: "" })}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <StepButton
        label="Next year"
        onClick={() => choose({ year: year + 1 })}
        disabled={year >= LAST_YEAR}
      >
        <ChevronRight className="size-4" />
      </StepButton>
    </div>
  )
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background",
        "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40"
      )}
    >
      {children}
    </button>
  )
}

/** The escape hatch, kept below a hairline where it stays out of the way. */
function CustomRange({
  year,
  from,
  to,
  onApply,
  onClear,
}: {
  year: number
  from: string
  to: string
  onApply: (period: Partial<Period>) => void
  onClear: () => void
}) {
  const [draft, setDraft] = useState({ from, to })

  // The range narrows a year, so it can't usefully leave one.
  const firstDay = `${year}-01-01`
  const lastDay = `${year}-12-31`

  return (
    <form
      className="mt-1 border-t pt-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!draft.from && !draft.to) return onClear()
        // A backwards range is a typed mistake, not a request for nothing.
        const ordered =
          !draft.from || !draft.to || draft.from <= draft.to
            ? draft
            : { from: draft.to, to: draft.from }
        onApply(ordered)
      }}
    >
      <div className="flex items-baseline justify-between gap-2 px-2.5 pb-1.5">
        <p className="text-xs text-muted-foreground">Start date between</p>
        {(from || to) && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Whole year
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-2.5">
        <input
          type="date"
          value={draft.from}
          min={firstDay}
          max={draft.to || lastDay}
          onChange={(event) =>
            setDraft((current) => ({ ...current, from: event.target.value }))
          }
          aria-label="From"
          className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={draft.to}
          min={draft.from || firstDay}
          max={lastDay}
          onChange={(event) =>
            setDraft((current) => ({ ...current, to: event.target.value }))
          }
          aria-label="To"
          className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs"
        />
      </div>

      <div className="px-2.5 pt-2 pb-1">
        <button
          type="submit"
          className={cn(
            "h-8 w-full rounded-lg bg-primary text-xs font-medium text-primary-foreground",
            "transition-opacity hover:opacity-90"
          )}
        >
          Apply range
        </button>
      </div>
    </form>
  )
}
