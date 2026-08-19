"use client"

import { useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  StickyNote,
  Users,
} from "lucide-react"
import {
  SCHEDULE_STATUS_CHIP,
  SCHEDULE_STATUS_LABELS,
  WORK_TYPE_LABELS,
  WORK_TYPE_SOLID,
  addDays,
  addMonths,
  formatTime,
  isSameDay,
  parseDateKey,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "@/lib/schedule"
import {
  HOLIDAY_CELL,
  HOLIDAY_NOTE,
  HOLIDAY_PAY_NOTE,
  HOLIDAY_TEXT,
  holidayOn,
} from "@/lib/payroll/holidays"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { ScheduleRecord } from "@/components/admin/schedule-types"

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]

// The holiday, named, with what it's worth to the person reading it. On the
// employee side that second half is the whole point: a shaded square tells you
// a day is different, this tells you it pays double to work it.
function HolidayNote({ day }: { day: Date }) {
  const holiday = holidayOn(day)
  if (!holiday) return null

  return (
    <p
      className={cn(
        "mt-1 inline-flex flex-wrap items-center gap-x-1.5 rounded-lg px-2 py-1 text-xs",
        HOLIDAY_NOTE
      )}
    >
      <span className="font-medium">{holiday}</span>
      <span className="opacity-80">· {HOLIDAY_PAY_NOTE}</span>
    </p>
  )
}

function byStartTime(a: ScheduleRecord, b: ScheduleRecord) {
  return a.startTime.localeCompare(b.startTime)
}

// One job, laid out as a time on the left and everything about it on the
// right. No card, no border — on your own schedule the jobs are the content,
// not items in a list of records.
function JobEntry({
  schedule,
  employeeId,
}: {
  schedule: ScheduleRecord
  employeeId: string
}) {
  const teammates = schedule.assignments.filter(
    (assignment) => assignment.employeeId !== employeeId
  )
  const cancelled = schedule.status === "CANCELLED"

  return (
    <div className={cn("flex gap-3 py-4", cancelled && "opacity-60")}>
      <div className="w-14 shrink-0 text-right">
        <p
          className={cn(
            "text-sm leading-tight font-semibold tabular-nums",
            cancelled && "line-through"
          )}
        >
          {formatTime(schedule.startTime)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {formatTime(schedule.endTime)}
        </p>
      </div>

      {/* Thin rail instead of a box — it groups the entry without drawing a
          frame around every job. */}
      <div className="w-0.5 shrink-0 rounded-full bg-sky-600/25" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <p
            className={cn(
              "text-base leading-tight font-medium",
              cancelled && "line-through"
            )}
          >
            {schedule.branch?.name ?? schedule.client.name}
          </p>
          {schedule.status !== "PENDING" && (
            <Badge className={SCHEDULE_STATUS_CHIP[schedule.status]}>
              {SCHEDULE_STATUS_LABELS[schedule.status]}
            </Badge>
          )}
        </div>

        {schedule.branch && (
          <p className="text-sm text-muted-foreground">
            {schedule.client.name}
          </p>
        )}

        {/* What the job actually is — same colours as the office calendar, so
            a job reads the same on both sides. */}
        {schedule.workTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {schedule.workTypes.map((type) => (
              <span
                key={type}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  WORK_TYPE_SOLID[type]
                )}
              >
                {WORK_TYPE_LABELS[type]}
              </span>
            ))}
          </div>
        )}

        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">
            {schedule.branch?.address ?? schedule.client.address}
          </span>
        </p>

        {teammates.length > 0 && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Users className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">
              with {teammates.map((t) => t.employeeName).join(", ")}
            </span>
          </p>
        )}

        {(schedule.contactPerson || schedule.contactNumber) && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Phone className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">
              {schedule.contactPerson}
              {schedule.contactPerson && schedule.contactNumber ? " · " : ""}
              {schedule.contactNumber}
            </span>
          </p>
        )}

        {schedule.remarks && (
          <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-sm">
            <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 whitespace-pre-wrap">
              {schedule.remarks}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

function DayAgenda({
  day,
  schedules,
  employeeId,
  emptyMessage,
}: {
  day: Date
  schedules: ScheduleRecord[]
  employeeId: string
  emptyMessage: React.ReactNode
}) {
  const jobs = schedules
    .filter((schedule) => isSameDay(new Date(schedule.date), day))
    .sort(byStartTime)

  if (jobs.length === 0) {
    // Left-aligned like everything else on the page — a centred block under a
    // left-aligned heading reads as a misplaced element, not a deliberate one.
    return <div className="py-5">{emptyMessage}</div>
  }

  return (
    <div className="divide-y">
      {jobs.map((schedule) => (
        <JobEntry
          key={schedule.id}
          schedule={schedule}
          employeeId={employeeId}
        />
      ))}
    </div>
  )
}

// Borderless month grid: day numbers with a dot per job. Tapping a day shows
// that day's agenda underneath, so looking ahead never leaves this screen.
function MonthGrid({
  cursor,
  selected,
  schedules,
  onSelectDay,
}: {
  cursor: Date
  selected: Date
  schedules: ScheduleRecord[]
  onSelectDay: (day: Date) => void
}) {
  const today = new Date()
  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor))
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursor])

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="py-1 text-center text-[11px] font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth()
          const count = schedules.filter(
            (schedule) =>
              isSameDay(new Date(schedule.date), day) &&
              schedule.status !== "CANCELLED"
          ).length
          const isSelected = isSameDay(day, selected)
          const isToday = isSameDay(day, today)
          const holiday = holidayOn(day)

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(day)}
              title={holiday ? `${holiday} — ${HOLIDAY_PAY_NOTE}` : undefined}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-sm transition-colors outline-none",
                !inMonth && "text-muted-foreground/40",
                isSelected
                  ? "bg-sky-600 font-semibold text-white"
                  : isToday
                    ? "bg-sky-600/10 font-semibold text-sky-700 dark:text-sky-400"
                    : holiday
                      ? cn(HOLIDAY_CELL, HOLIDAY_TEXT, "font-semibold")
                      : "hover:bg-muted",
                // A ring rather than a fill, so a holiday that is also today or
                // the selected day still says so instead of losing to the blue.
                // These squares are too small for a name — it goes under the
                // grid, on the day that's open.
                holiday && "ring-1 ring-red-500/40 ring-inset"
              )}
            >
              <span className="leading-none">{day.getDate()}</span>
              <span className="flex h-1.5 items-center gap-0.5">
                {Array.from({ length: Math.min(count, 3) }).map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "size-1 rounded-full",
                      isSelected ? "bg-white" : "bg-sky-600 dark:bg-sky-400"
                    )}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function EmployeeScheduleView({
  schedules,
  employeeId,
  focusDate,
}: {
  schedules: ScheduleRecord[]
  employeeId: string
  // A day to open on, from ?date= — how a notification shows the job it just
  // announced instead of dropping you on today and leaving you to find it.
  focusDate?: string
}) {
  const today = useMemo(() => startOfDay(new Date()), [])

  // A linked day that isn't today can only be shown on the month view, so
  // that's where it lands, with the day already selected. Linking to today
  // still opens Today — it's the same jobs, in the view built for them.
  const focus = useMemo(() => {
    const parsed = parseDateKey(focusDate)
    return parsed && !isSameDay(parsed, today) ? startOfDay(parsed) : null
  }, [focusDate, today])

  // Today is what an employee opens this for, so it's the landing view.
  const [view, setView] = useState<"today" | "month">(focus ? "month" : "today")
  const [cursor, setCursor] = useState(focus ? startOfMonth(focus) : today)
  const [selectedDay, setSelectedDay] = useState(focus ?? today)

  const nextJob = useMemo(
    () =>
      schedules
        .filter(
          (schedule) =>
            new Date(schedule.date) > today && schedule.status !== "CANCELLED"
        )
        .sort(
          (a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime() ||
            byStartTime(a, b)
        )[0] ?? null,
    [schedules, today]
  )

  const todayCount = schedules.filter(
    (schedule) =>
      isSameDay(new Date(schedule.date), today) &&
      schedule.status !== "CANCELLED"
  ).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-0.5 self-start rounded-lg border p-0.5">
        <Button
          type="button"
          variant={view === "today" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-3"
          aria-pressed={view === "today"}
          onClick={() => setView("today")}
        >
          Today
        </Button>
        <Button
          type="button"
          variant={view === "month" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-3"
          aria-pressed={view === "month"}
          onClick={() => {
            setCursor(today)
            setSelectedDay(today)
            setView("month")
          }}
        >
          Month
        </Button>
      </div>

      {view === "today" ? (
        <div className="flex flex-col">
          <div>
            <p className="text-lg leading-tight font-semibold">
              {today.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {todayCount === 0
                ? "Nothing scheduled"
                : `${todayCount} ${todayCount === 1 ? "job" : "jobs"}`}
            </p>
            <HolidayNote day={today} />
          </div>

          <DayAgenda
            day={today}
            schedules={schedules}
            employeeId={employeeId}
            emptyMessage={
              nextJob ? (
                <button
                  type="button"
                  onClick={() => {
                    setCursor(startOfMonth(new Date(nextJob.date)))
                    setSelectedDay(startOfDay(new Date(nextJob.date)))
                    setView("month")
                  }}
                  className="flex w-full flex-col gap-1 rounded-xl bg-sky-600/10 px-4 py-3 text-left outline-none transition-colors hover:bg-sky-600/15"
                >
                  <span className="text-xs font-medium tracking-wide text-sky-700 uppercase dark:text-sky-400">
                    Next job
                  </span>
                  <span className="text-sm font-medium">
                    {nextJob.branch?.name ?? nextJob.client.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(nextJob.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {formatTime(nextJob.startTime)}
                  </span>
                  {/* The work type carries over here too — knowing it's a
                      repair vs a survey matters before you set off. */}
                  {nextJob.workTypes.length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {nextJob.workTypes.map((type) => (
                        <span
                          key={type}
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            WORK_TYPE_SOLID[type]
                          )}
                        >
                          {WORK_TYPE_LABELS[type]}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled for you today. Enjoy the quiet.
                </p>
              )
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {cursor.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Previous month"
                onClick={() => setCursor((c) => addMonths(c, -1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCursor(today)
                  setSelectedDay(today)
                }}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Next month"
                onClick={() => setCursor((c) => addMonths(c, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>

          <MonthGrid
            cursor={cursor}
            selected={selectedDay}
            schedules={schedules}
            onSelectDay={(day) => {
              setSelectedDay(startOfDay(day))
              if (day.getMonth() !== cursor.getMonth()) {
                setCursor(startOfMonth(day))
              }
            }}
          />

          <div>
            <p className="text-sm font-semibold">
              {selectedDay.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <HolidayNote day={selectedDay} />
            <DayAgenda
              day={selectedDay}
              schedules={schedules}
              employeeId={employeeId}
              emptyMessage={
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled for this day.
                </p>
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
