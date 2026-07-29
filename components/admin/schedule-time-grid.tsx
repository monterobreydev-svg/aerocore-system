"use client"

import { useMemo } from "react"
import {
  SCHEDULE_STATUS_LABELS,
  WORK_TYPE_LABELS,
  WORK_TYPE_SOLID,
  formatTime,
  isSameDay,
  minutesIntoDay,
  packOverlapping,
} from "@/lib/schedule"
import { cn } from "@/lib/utils"
import type { ScheduleRecord } from "@/components/admin/schedule-types"

const HOUR_HEIGHT = 56
// The working day the grid opens on. It stretches automatically when a job
// falls outside, so an early call-out or overtime is never cropped away.
const DEFAULT_START_HOUR = 6
const DEFAULT_END_HOUR = 19

function useGridBounds(schedules: ScheduleRecord[]) {
  return useMemo(() => {
    let first = DEFAULT_START_HOUR
    let last = DEFAULT_END_HOUR

    for (const schedule of schedules) {
      first = Math.min(first, Math.floor(minutesIntoDay(schedule.startTime) / 60))
      last = Math.max(last, Math.ceil(minutesIntoDay(schedule.endTime) / 60))
    }

    return { startHour: Math.max(0, first), endHour: Math.min(24, last) }
  }, [schedules])
}

function JobBlock({
  schedule,
  column,
  columns,
  top,
  height,
  detailed,
  onSelect,
}: {
  schedule: ScheduleRecord
  column: number
  columns: number
  top: number
  height: number
  detailed: boolean
  onSelect: (schedule: ScheduleRecord) => void
}) {
  const primaryType = schedule.workTypes[0]
  const width = 100 / columns
  const site = schedule.branch
    ? `${schedule.client.name} · ${schedule.branch.name}`
    : schedule.client.name

  return (
    <button
      type="button"
      onClick={() => onSelect(schedule)}
      title={`${site}\n${formatTime(schedule.startTime)}–${formatTime(
        schedule.endTime
      )}\n${schedule.workTypes
        .map((t) => WORK_TYPE_LABELS[t])
        .join(", ")} · ${SCHEDULE_STATUS_LABELS[schedule.status]}`}
      style={{
        top,
        height: Math.max(height, 22),
        left: `calc(${column * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
      }}
      className={cn(
        // Solid block, like a calendar app — the fill is the work type.
        "absolute z-10 flex flex-col overflow-hidden rounded-md px-1.5 py-1 text-left shadow-sm transition-opacity hover:opacity-85",
        primaryType
          ? WORK_TYPE_SOLID[primaryType]
          : "bg-muted text-muted-foreground",
        schedule.status === "CANCELLED" && "opacity-50"
      )}
    >
      <span className="truncate text-[11px] leading-tight font-medium">
        {formatTime(schedule.startTime)}
      </span>
      <span
        className={cn(
          "truncate text-[11px] leading-tight",
          schedule.status === "CANCELLED" && "line-through"
        )}
      >
        {schedule.branch?.name ?? schedule.client.name}
      </span>
      {detailed && schedule.branch && height > 44 && (
        <span className="truncate text-[11px] leading-tight opacity-75">
          {schedule.client.name}
        </span>
      )}
      {detailed && height > 56 && (
        <span className="mt-auto truncate text-[11px] leading-tight opacity-75">
          {schedule.assignments.length > 0
            ? schedule.assignments.map((a) => a.employeeName).join(", ")
            : "Unassigned"}
        </span>
      )}
    </button>
  )
}

function DayColumn({
  day,
  hours,
  schedules,
  startHour,
  detailed,
  onSelect,
  onCreateAt,
}: {
  day: Date
  hours: number[]
  schedules: ScheduleRecord[]
  startHour: number
  detailed: boolean
  onSelect: (schedule: ScheduleRecord) => void
  onCreateAt: (day: Date, hour: number) => void
}) {
  const daySchedules = schedules.filter((schedule) =>
    isSameDay(new Date(schedule.date), day)
  )

  const packed = packOverlapping(
    daySchedules.map((schedule) => ({
      start: minutesIntoDay(schedule.startTime),
      end: Math.max(
        minutesIntoDay(schedule.endTime),
        minutesIntoDay(schedule.startTime) + 15
      ),
      schedule,
    }))
  )

  // Every column carries a left border, including the first — the header row
  // does the same, so the two line up exactly against the time gutter.
  return (
    <div className="relative flex-1 border-l">
      {/* An hour-sized click target behind the blocks: clicking empty space
          books that day at that hour. Sits under the blocks in stacking order
          (they're z-10) so it never swallows a click meant for a job. */}
      {hours.map((hour) => (
        <button
          key={hour}
          type="button"
          onClick={() => onCreateAt(day, hour)}
          aria-label={`Book a job on ${day.toDateString()} at ${hour}:00`}
          style={{ height: HOUR_HEIGHT }}
          className="block w-full outline-none hover:bg-sky-600/5 focus-visible:bg-sky-600/5"
        />
      ))}

      {packed.map(({ item, column, columns }) => (
        <JobBlock
          key={item.schedule.id}
          schedule={item.schedule}
          column={column}
          columns={columns}
          top={((item.start - startHour * 60) / 60) * HOUR_HEIGHT}
          height={((item.end - item.start) / 60) * HOUR_HEIGHT}
          detailed={detailed}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

// Shared by the week (7 columns) and day (1 column) views — the only real
// difference is how many days are handed in and how much each block shows.
export function ScheduleTimeGrid({
  days,
  schedules,
  onSelect,
  onCreateAt,
}: {
  days: Date[]
  schedules: ScheduleRecord[]
  onSelect: (schedule: ScheduleRecord) => void
  onCreateAt: (day: Date, hour: number) => void
}) {
  const visible = useMemo(
    () =>
      schedules.filter((schedule) =>
        days.some((day) => isSameDay(new Date(schedule.date), day))
      ),
    [schedules, days]
  )
  const { startHour, endHour } = useGridBounds(visible)
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i
  )
  const today = new Date()
  const detailed = days.length === 1

  // Seven columns can't fit a phone at a usable width, so the whole grid
  // scrolls sideways under a minimum width instead of squeezing. A single-day
  // grid always fits, so it gets no minimum.
  const minWidth = days.length > 1 ? `${days.length * 5.5 + 3.5}rem` : undefined
  const gridHeight = hours.length * HOUR_HEIGHT

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <div style={{ minWidth }}>
        {/* The day header lives *inside* the vertical scroller and sticks to
            the top. Outside it, the body's scrollbar would make the columns
            narrower than the headings and the two would drift apart by the
            scrollbar's width. */}
        <div className="max-h-[26rem] overflow-y-auto sm:max-h-[34rem]">
          <div className="sticky top-0 z-20 flex border-b bg-muted">
            <div className="w-12 shrink-0 sm:w-14" />
            {days.map((day) => {
              const isToday = isSameDay(day, today)
              const count = visible.filter((schedule) =>
                isSameDay(new Date(schedule.date), day)
              ).length
              return (
                <div
                  key={day.toISOString()}
                  className="min-w-0 flex-1 border-l px-1 py-1.5 text-center"
                >
                  <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </p>
                  <p
                    className={cn(
                      "mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-sm font-medium",
                      isToday && "bg-sky-600 text-white"
                    )}
                  >
                    {day.getDate()}
                  </p>
                  {count > 0 && (
                    <p className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
                      {count} {count === 1 ? "job" : "jobs"}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* pt-3 gives the first hour label room to sit centred on its rule
              instead of being sliced off by the top of the scroll box. */}
          <div className="flex pt-3">
            <div
              className="w-12 shrink-0 sm:w-14"
              style={{ height: gridHeight }}
            >
              {hours.map((hour) => (
                <div key={hour} style={{ height: HOUR_HEIGHT }} className="relative">
                  <span className="absolute top-0 right-2 -translate-y-1/2 text-[10px] whitespace-nowrap text-muted-foreground sm:text-[11px]">
                    {new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
                      hour: "numeric",
                    })}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="relative flex flex-1"
              style={{ height: gridHeight }}
            >
              {/* Hour rules sit behind the columns so they line up across all
                  seven days regardless of what's booked in each. The rule is
                  on the row's top edge, which is where the hour actually
                  starts — that's the line each label is centred on. */}
              <div className="pointer-events-none absolute inset-0">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: HOUR_HEIGHT }}
                    className="border-t border-dashed"
                  />
                ))}
                <div className="border-t border-dashed" />
              </div>

              {days.map((day) => (
                <DayColumn
                  key={day.toISOString()}
                  day={day}
                  hours={hours}
                  schedules={visible}
                  startHour={startHour}
                  detailed={detailed}
                  onSelect={onSelect}
                  onCreateAt={onCreateAt}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
