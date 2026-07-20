"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  SCHEDULE_STATUS_DOT,
  WORK_TYPE_BORDER,
  WORK_TYPE_LABELS,
  formatTime,
} from "@/lib/schedule"
import type { ScheduleRecord } from "@/components/admin/schedule-types"

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const MAX_VISIBLE_PER_DAY = 3

export function ScheduleCalendar({
  schedules,
  onSelect,
}: {
  schedules: ScheduleRecord[]
  onSelect: (schedule: ScheduleRecord) => void
}) {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const today = useMemo(() => new Date(), [])

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(monthCursor))
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [monthCursor])

  const monthLabel = monthCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{monthLabel}</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setMonthCursor((d) => addMonths(d, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMonthCursor(startOfMonth(new Date()))}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setMonthCursor((d) => addMonths(d, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-muted/40 px-2 py-1.5 text-center">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {days.map((day) => {
          const inMonth = day.getMonth() === monthCursor.getMonth()
          const dayIsToday = isSameDate(day, today)
          const daySchedules = schedules
            .filter((schedule) => isSameDate(new Date(schedule.date), day))
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
          const visible = daySchedules.slice(0, MAX_VISIBLE_PER_DAY)
          const overflow = daySchedules.length - visible.length

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex min-h-[6.5rem] flex-col gap-1 bg-background p-1.5",
                !inMonth && "bg-muted/20"
              )}
            >
              <span
                className={cn(
                  "self-start rounded-full px-1.5 text-xs font-medium",
                  !inMonth && "text-muted-foreground/50",
                  dayIsToday && "bg-sky-600 text-white dark:text-white"
                )}
              >
                {day.getDate()}
              </span>

              <div className="flex flex-col gap-1">
                {visible.map((schedule) => {
                  const primaryType = schedule.workTypes[0]
                  return (
                    <button
                      key={schedule.id}
                      type="button"
                      onClick={() => onSelect(schedule)}
                      title={`${schedule.workTypes
                        .map((t) => WORK_TYPE_LABELS[t])
                        .join(", ")} · ${schedule.client.name}`}
                      className={cn(
                        "flex items-center gap-1 rounded-md border-l-2 bg-muted/50 px-1.5 py-1 text-left text-xs leading-snug hover:bg-muted",
                        primaryType
                          ? WORK_TYPE_BORDER[primaryType]
                          : "border-l-muted-foreground/30"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          SCHEDULE_STATUS_DOT[schedule.status]
                        )}
                      />
                      <span className="shrink-0 font-medium">
                        {formatTime(schedule.startTime)}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {schedule.client.name}
                      </span>
                    </button>
                  )
                })}
                {overflow > 0 && (
                  <span className="px-1.5 text-xs text-muted-foreground">
                    +{overflow} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
