"use client"

import type { WorkType } from "@/app/generated/prisma/client"
import { WORK_TYPES, WORK_TYPE_LABELS, WORK_TYPE_SOLID } from "@/lib/schedule"
import { cn } from "@/lib/utils"

// Controlled by the form so the employee picker downstream can promote whoever
// holds the matching skill — the selection has to be readable from outside.
export function ScheduleWorkTypePicker({
  selected,
  onChange,
  disabled,
  name = "workTypes",
}: {
  selected: WorkType[]
  onChange: (next: WorkType[]) => void
  disabled?: boolean
  /**
   * Left unset by the batch form, which has one of these per row and carries
   * the whole list in a JSON field instead. An unnamed input is not submitted,
   * so twenty rows of these add nothing to the request rather than twenty
   * indistinguishable `workTypes` keys the server could not tell apart.
   */
  name?: string
}) {
  function toggle(type: WorkType) {
    onChange(
      selected.includes(type)
        ? selected.filter((value) => value !== type)
        : [...selected, type]
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {WORK_TYPES.map((type) => {
        const checked = selected.includes(type)
        return (
          // `relative` keeps the sr-only input below anchored to its own chip.
          // Absolutely positioned with no positioned ancestor it would attach
          // to the dialog panel instead and drag its scroll area with it —
          // see the same note in schedule-employee-picker.
          <label
            key={type}
            className={cn(
              "relative inline-flex cursor-pointer items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              checked
                ? WORK_TYPE_SOLID[type]
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <input
              type="checkbox"
              name={name || undefined}
              value={type}
              checked={checked}
              onChange={() => toggle(type)}
              disabled={disabled}
              className="sr-only"
            />
            {WORK_TYPE_LABELS[type]}
          </label>
        )
      })}
    </div>
  )
}
