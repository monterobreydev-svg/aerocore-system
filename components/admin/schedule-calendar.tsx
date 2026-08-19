"use client"

import { useMemo } from "react"
import {
  SCHEDULE_STATUS_LABELS,
  WORK_TYPE_LABELS,
  WORK_TYPE_SOLID,
  addDays,
  formatTime,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "@/lib/schedule"
import {
  HOLIDAY_CELL,
  HOLIDAY_CELL_MUTED,
  HOLIDAY_PAY_NOTE,
  HOLIDAY_TEXT,
  holidayOn,
} from "@/lib/payroll/holidays"
import { cn } from "@/lib/utils"
import type { ScheduleRecord } from "@/components/admin/schedule-types"

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MAX_VISIBLE_PER_DAY = 3

export function ScheduleMonthView({
  cursor,
  schedules,
  onSelect,
  onOpenDay,
  onCreateAt,
}: {
  cursor: Date
  schedules: ScheduleRecord[]
  onSelect: (schedule: ScheduleRecord) => void
  // Clicking a day number (or the "+N more" overflow) drops into the day view
  // for that date — the month grid can't show everything on a busy day.
  onOpenDay: (day: Date) => void
  // Clicking the empty part of a cell creates a schedule that day, the way
  // every calendar app works. Omitted on the employee side (read-only).
  onCreateAt?: (day: Date) => void
}) {
  const today = new Date()

  const startOfToday = +startOfDay(today)

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor))
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursor])

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const inMonth = day.getMonth() === cursor.getMonth()
          const dayIsToday = isSameDay(day, today)
          const isPast = +startOfDay(day) < startOfToday
          const holiday = holidayOn(day)
          const daySchedules = schedules
            .filter((schedule) => isSameDay(new Date(schedule.date), day))
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
          const visible = daySchedules.slice(0, MAX_VISIBLE_PER_DAY)
          const overflow = daySchedules.length - visible.length

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex min-h-[4.5rem] flex-col gap-0.5 border-b border-l p-1 sm:min-h-[7rem] sm:gap-1 sm:p-1.5",
                index % 7 === 0 && "border-l-0",
                index >= 35 && "border-b-0",
                // One background per cell, chosen rather than layered: two
                // competing `bg-` utilities resolve by stylesheet order, which
                // is not something to leave to chance.
                holiday
                  ? inMonth
                    ? HOLIDAY_CELL
                    : HOLIDAY_CELL_MUTED
                  : !inMonth && "bg-muted/20"
              )}
            >
              {/* The date and the holiday's name on one line. Stacked, the
                  name sat where the job chips sit and read as something
                  scheduled that day; beside the number it reads as a label on
                  the date itself, which is what it is. What the day is worth —
                  200% for the first eight hours — is stated once in the key
                  above the grid rather than in all forty-two cells. */}
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium outline-none hover:bg-muted",
                    !inMonth && "text-muted-foreground/50",
                    holiday && inMonth && !dayIsToday && HOLIDAY_TEXT,
                    dayIsToday && "bg-sky-600 text-white hover:bg-sky-600"
                  )}
                >
                  {day.getDate()}
                </button>

                {holiday && (
                  <p
                    title={`${holiday} — regular holiday. ${HOLIDAY_PAY_NOTE}.`}
                    className={cn(
                      "min-w-0 truncate text-[10px] leading-tight font-medium sm:text-[11px]",
                      HOLIDAY_TEXT,
                      !inMonth && "opacity-60"
                    )}
                  >
                    {holiday}
                  </p>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-0.5 sm:gap-1">
                {visible.map((schedule) => {
                  const primaryType = schedule.workTypes[0]
                  return (
                    <button
                      key={schedule.id}
                      type="button"
                      onClick={() => onSelect(schedule)}
                      title={`${schedule.client.name}${
                        schedule.branch ? ` · ${schedule.branch.name}` : ""
                      }\n${formatTime(schedule.startTime)}\n${schedule.workTypes
                        .map((t) => WORK_TYPE_LABELS[t])
                        .join(", ")} · ${SCHEDULE_STATUS_LABELS[schedule.status]}`}
                      className={cn(
                        // Solid fill across the whole chip, Google-Calendar
                        // style — colour is the primary signal, so it can't be
                        // a hairline on the edge.
                        "flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80 sm:px-1.5 sm:py-1 sm:text-xs",
                        primaryType
                          ? WORK_TYPE_SOLID[primaryType]
                          : "bg-muted text-muted-foreground",
                        // A cancelled job stays visible but reads as struck off
                        // rather than competing with live work.
                        schedule.status === "CANCELLED" &&
                          "line-through opacity-50"
                      )}
                    >
                      <span className="hidden shrink-0 font-medium sm:inline">
                        {formatTime(schedule.startTime)}
                      </span>
                      <span className="truncate">
                        {schedule.branch?.name ?? schedule.client.name}
                      </span>
                    </button>
                  )
                })}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className="px-1 text-left text-[11px] text-muted-foreground outline-none hover:text-foreground sm:px-1.5 sm:text-xs"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>

              {/* Fills the leftover space so the whole empty area of the cell
                  is the "create here" target, without sitting on top of the
                  chips above it.

                  A day that has gone keeps the filler but loses the button:
                  nobody can be sent to work last Tuesday, and a cell that
                  lights up under the cursor and then refuses the form is a
                  worse answer than one that was never offered. The day number
                  above still opens the day, so past work stays readable. */}
              {onCreateAt &&
                (isPast ? (
                  <div className="min-h-4 flex-1" />
                ) : (
                  <button
                    type="button"
                    onClick={() => onCreateAt(day)}
                    aria-label={`Create a schedule on ${day.toDateString()}`}
                    className="min-h-4 flex-1 rounded outline-none hover:bg-sky-600/5 focus-visible:bg-sky-600/5"
                  />
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
