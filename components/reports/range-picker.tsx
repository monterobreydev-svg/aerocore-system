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

import type { Preset } from "@/lib/reports/range"
import { stepRange } from "@/lib/reports/range"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// One control for the period
// ---------------------------------------------------------------------------
//
// The period was three separate mechanisms sharing a row: preset buttons, a
// pair of naked date inputs, and an Apply. Three things to understand, and the
// range you were actually looking at was written somewhere else entirely.
//
// It is one control now. The button *is* the answer to "what am I looking at",
// presets are rows you pick in a single click, and the custom range sits behind
// a hairline in the footer — where the people who need it will find it and the
// people who don't will never have to look at it.

type Range = { from: string; to: string }

export function RangePicker({
  from,
  to,
  label,
  presetLabel,
  presets,
  today,
  onSelect,
  pending,
}: {
  from: string
  to: string
  /** "1 Aug – 17 Aug 2026", already formatted by the server. */
  label: string
  /** The name of the preset this range matches, if it matches one. */
  presetLabel: string | null
  presets: Preset[]
  today: string
  onSelect: (range: Range) => void
  pending: boolean
}) {
  const [open, setOpen] = useState(false)

  const choose = (range: Range) => {
    setOpen(false)
    onSelect(range)
  }

  const step = (direction: -1 | 1) => choose(stepRange(from, to, direction))

  // Stepping forward into a window that hasn't happened yet is a dead end, so
  // the control stops at the one containing today.
  const atPresent = to >= today

  return (
    <div className="flex items-center gap-1">
      <StepButton
        label="Previous period"
        onClick={() => step(-1)}
        disabled={pending}
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
          <span className="truncate font-medium">{label}</span>
          {presetLabel && (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {presetLabel}
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
            <Popover.Popup
              className={cn(
                "w-64 rounded-xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10",
                "origin-(--transform-origin) outline-none",
                "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
                "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
              )}
            >
              <ul className="flex flex-col">
                {presets.map((preset) => {
                  const active = preset.from === from && preset.to === to
                  return (
                    <li key={preset.key}>
                      <button
                        type="button"
                        onClick={() => choose(preset)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5",
                          "text-left text-sm transition-colors hover:bg-accent",
                          active && "font-medium"
                        )}
                      >
                        {preset.label}
                        {/* Selection is a check, not a filled row — hover stays
                            a ghost wash so the two never compete. */}
                        {active && <Check className="size-4 shrink-0" strokeWidth={3} />}
                      </button>
                    </li>
                  )
                })}
              </ul>

              <CustomRange from={from} to={to} today={today} onApply={choose} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <StepButton
        label="Next period"
        onClick={() => step(1)}
        disabled={pending || atPresent}
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
  from,
  to,
  today,
  onApply,
}: {
  from: string
  to: string
  today: string
  onApply: (range: Range) => void
}) {
  const [draft, setDraft] = useState({ from, to })

  return (
    <form
      className="mt-1 border-t pt-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!draft.from || !draft.to) return
        // A backwards range is a typed mistake, not a request for nothing.
        const ordered =
          draft.from <= draft.to
            ? draft
            : { from: draft.to, to: draft.from }
        onApply(ordered)
      }}
    >
      <p className="px-2.5 pb-1.5 text-xs text-muted-foreground">Custom range</p>
      <div className="flex items-center gap-1.5 px-2.5">
        <input
          type="date"
          value={draft.from}
          max={today}
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
          max={today}
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
