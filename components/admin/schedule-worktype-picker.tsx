"use client"

import { useState } from "react"
import type { WorkType } from "@/app/generated/prisma/client"
import {
  WORK_TYPES,
  WORK_TYPE_LABELS,
  WORK_TYPE_CHIP,
  WORK_TYPE_DOT,
} from "@/lib/schedule"
import { cn } from "@/lib/utils"

export function ScheduleWorkTypePicker({
  defaultSelected = [],
  disabled,
}: {
  defaultSelected?: WorkType[]
  disabled?: boolean
}) {
  const [selected, setSelected] = useState<Set<WorkType>>(
    () => new Set(defaultSelected)
  )

  function toggle(type: WorkType) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {WORK_TYPES.map((type) => {
        const checked = selected.has(type)
        return (
          <label
            key={type}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              checked
                ? cn(WORK_TYPE_CHIP[type], "border-current/20")
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <input
              type="checkbox"
              name="workTypes"
              value={type}
              checked={checked}
              onChange={() => toggle(type)}
              disabled={disabled}
              className="sr-only"
            />
            <span className={cn("size-1.5 rounded-full", WORK_TYPE_DOT[type])} />
            {WORK_TYPE_LABELS[type]}
          </label>
        )
      })}
    </div>
  )
}
