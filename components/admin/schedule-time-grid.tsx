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
  spansMidnight,
  startOfDay,
} from "@/lib/schedule"
import {
  holidayOn,
  holidayStyle,
} from "@/lib/payroll/holidays"
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

      // A shift that crosses midnight needs both ends of the grid: it runs to
      // the bottom of its own day and starts again at the top of the next.
      if (spansMidnight(schedule)) {
        first = 0
        last = 24
      } else {
        last = Math.max(last, Math.ceil(minutesIntoDay(schedule.endTime) / 60))
      }
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
  continues = false,
  continued = false,
  onSelect,
}: {
  schedule: ScheduleRecord
  column: number
  columns: number
  top: number
  height: number
  detailed: boolean
  /** Cut off at midnight — the rest is on tomorrow's column. */
  continues?: boolean
  /** The tail of a shift that began yesterday. */
  continued?: boolean
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
        schedule.status === "CANCELLED" && "opacity-50",
        // Square off the edge the shift runs through, so a night shift reads as
        // carrying on rather than as two jobs that happen to touch midnight.
        continues && "rounded-b-none",
        continued && "rounded-t-none"
      )}
    >
      <span className="truncate text-[11px] leading-tight font-medium">
        {/* The tail says where it came from, not "12:00 AM" — the shift did
            not start at midnight, it merely crossed it. */}
        {continued
          ? `from ${formatTime(schedule.startTime)}`
          : formatTime(schedule.startTime)}
        {continues && " →"}
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

const DAY_MINUTES = 24 * 60

/** The piece of a shift that belongs to one column of the grid. */
type Segment = {
  schedule: ScheduleRecord
  start: number
  end: number
  /** Runs past midnight — the rest of it is drawn on tomorrow's column. */
  continues: boolean
  /** Began yesterday — this is the tail of it. */
  continued: boolean
}

/**
 * A day's worth of blocks, including the tail of a shift that began yesterday.
 *
 * A grid column is a calendar day, but a night shift is one job across two of
 * them. Drawing it as a single block was impossible — the height came out
 * negative, because the end is earlier in the day than the start — so it is cut
 * at midnight and drawn twice, with each half told which way it runs so it can
 * say so rather than looking truncated.
 */
function segmentsFor(day: Date, schedules: ScheduleRecord[]): Segment[] {
  const segments: Segment[] = []

  for (const schedule of schedules) {
    const start = new Date(schedule.startTime)
    const end = new Date(schedule.endTime)
    const overnight = !isSameDay(start, end)

    if (isSameDay(start, day)) {
      segments.push({
        schedule,
        start: minutesIntoDay(schedule.startTime),
        // A shift that wraps runs to the bottom of this column; one that
        // doesn't keeps its own end, floored so a 10-minute job is still
        // visible.
        end: overnight
          ? DAY_MINUTES
          : Math.max(
              minutesIntoDay(schedule.endTime),
              minutesIntoDay(schedule.startTime) + 15
            ),
        continues: overnight,
        continued: false,
      })
    } else if (overnight && isSameDay(end, day)) {
      segments.push({
        schedule,
        start: 0,
        end: Math.max(minutesIntoDay(schedule.endTime), 15),
        continues: false,
        continued: true,
      })
    }
  }

  return segments
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
  onCreateAt?: (day: Date, hour: number) => void
}) {
  const packed = packOverlapping(segmentsFor(day, schedules))

  // The column's height comes from the grid around it, so dropping these
  // targets costs no layout — which is what lets a past day simply not have
  // them, the same way the read-only employee calendar doesn't.
  const isPast = +startOfDay(day) < +startOfDay(new Date())

  // Every column carries a left border, including the first — the header row
  // does the same, so the two line up exactly against the time gutter.
  return (
    <div className="relative flex-1 border-l">
      {/* An hour-sized click target behind the blocks: clicking empty space
          creates a schedule that day at that hour. Sits under the blocks in
          stacking order (z-10) so it never swallows a click meant for a job.
          on the employee side, where the calendar is read-only. */}
      {onCreateAt &&
        !isPast &&
        hours.map((hour) => (
          <button
            key={hour}
            type="button"
            onClick={() => onCreateAt(day, hour)}
            aria-label={`Create a schedule on ${day.toDateString()} at ${hour}:00`}
            style={{ height: HOUR_HEIGHT }}
            className="block w-full outline-none hover:bg-sky-600/5 focus-visible:bg-sky-600/5"
          />
        ))}

      {packed.map(({ item, column, columns }) => (
        // Keyed by which half it is: a night shift puts two blocks on the grid
        // and they are different elements, not the same one moved.
        <JobBlock
          key={`${item.schedule.id}-${item.continued ? "tail" : "head"}`}
          schedule={item.schedule}
          column={column}
          columns={columns}
          top={((item.start - startHour * 60) / 60) * HOUR_HEIGHT}
          height={((item.end - item.start) / 60) * HOUR_HEIGHT}
          detailed={detailed}
          continues={item.continues}
          continued={item.continued}
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
  onCreateAt?: (day: Date, hour: number) => void
}) {
  // Start *or* end, not just the day it is filed under: a shift that began
  // last night belongs on this morning's column too, and a day view of the
  // morning after would otherwise show nothing at all.
  const visible = useMemo(
    () =>
      schedules.filter((schedule) =>
        days.some(
          (day) =>
            isSameDay(new Date(schedule.startTime), day) ||
            isSameDay(new Date(schedule.endTime), day)
        )
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
              const holiday = holidayOn(day)
              const style = holidayStyle(holiday)
              const count = visible.filter((schedule) =>
                isSameDay(new Date(schedule.date), day)
              ).length
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-w-0 flex-1 border-l px-1 py-1.5 text-center",
                    style && style.cell
                  )}
                >
                  <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </p>
                  <p
                    className={cn(
                      "mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-sm font-medium",
                      style && !isToday && style.text,
                      isToday && "bg-sky-600 text-white"
                    )}
                  >
                    {day.getDate()}
                  </p>
                  {/* Under the number rather than beside it here — a column
                      head is already a stack, and the name has the full width
                      of the column to itself. */}
                  {holiday && style && (
                    <p
                      title={`${holiday.name} — ${style.label.toLowerCase()}. ${style.payNote}.`}
                      className={cn(
                        "truncate text-[10px] leading-tight font-medium sm:text-[11px]",
                        style.text
                      )}
                    >
                      {holiday.name}
                    </p>
                  )}
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
                  seven days regardless of what's scheduled in each. The rule is
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
