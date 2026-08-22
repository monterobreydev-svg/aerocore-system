"use client"

import { useEffect, useState } from "react"
import {
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Phone,
  StickyNote,
  Users,
} from "lucide-react"
import {
  listEmployeeDaySchedule,
  type StaffScheduleDay,
  type StaffScheduleJob,
} from "@/app/actions/schedules"
import {
  addDays,
  dateKey,
  formatTime,
  parseDateKey,
  SCHEDULE_STATUS_CHIP,
  SCHEDULE_STATUS_LABELS,
  todayKey,
  WORK_TYPE_LABELS,
  WORK_TYPE_SOLID,
} from "@/lib/schedule"
import { minutesLabel } from "@/lib/attendance"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** "Tue, 4 Mar" — plus "Today" when it is, since that's what's being asked. */
function dayHeading(date: string, today: string) {
  const parsed = parseDateKey(date)
  if (!parsed) return date
  const label = parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  return date === today ? `Today · ${label}` : label
}

function shiftDay(date: string, days: number) {
  const parsed = parseDateKey(date)
  return parsed ? dateKey(addDays(parsed, days)) : date
}

/**
 * One job on the day: the hours on the left, everything about the job on the
 * right. Same rail-and-times shape the employee's own schedule uses, so a job
 * looks the same to the office as it does to the person doing it.
 */
function JobEntry({ job }: { job: StaffScheduleJob }) {
  const cancelled = job.status === "CANCELLED"

  return (
    <div className={cn("flex gap-3 py-4", cancelled && "opacity-60")}>
      <div className="w-14 shrink-0 text-right">
        <p
          className={cn(
            "text-sm leading-tight font-semibold tabular-nums",
            cancelled && "line-through"
          )}
        >
          {formatTime(job.startTime)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {formatTime(job.endTime)}
        </p>
        <p className="mt-1 text-[0.6875rem] text-muted-foreground tabular-nums">
          {minutesLabel(job.minutes)}
        </p>
      </div>

      <div className="w-0.5 shrink-0 rounded-full bg-sky-600/25" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <p
            className={cn(
              "text-base leading-tight font-medium",
              cancelled && "line-through"
            )}
          >
            {job.branchName ?? job.clientName}
          </p>
          {job.status !== "PENDING" && (
            <Badge className={SCHEDULE_STATUS_CHIP[job.status]}>
              {SCHEDULE_STATUS_LABELS[job.status]}
            </Badge>
          )}
        </div>

        {/* The client under the branch, then the sales order — the expense
            from this day gets filed against that number, so it is worth
            carrying from the office's booking to the person doing the work. */}
        {job.branchName && (
          <p className="text-sm text-muted-foreground">{job.clientName}</p>
        )}

        {job.salesOrderNo && (
          <p className="font-mono text-sm text-muted-foreground">
            SO {job.salesOrderNo}
          </p>
        )}

        {job.workTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {job.workTypes.map((type) => (
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
          <span className="min-w-0">{job.address}</span>
        </p>

        {job.crew.length > 0 && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Users className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">with {job.crew.join(", ")}</span>
          </p>
        )}

        {(job.contactPerson || job.contactNumber) && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Phone className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">
              {job.contactPerson}
              {job.contactPerson && job.contactNumber ? " · " : ""}
              {job.contactNumber}
            </span>
          </p>
        )}

        {job.remarks && (
          <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-sm">
            <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 whitespace-pre-wrap">{job.remarks}</span>
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Where this person is deployed on a chosen day.
 *
 * A day at a time on purpose — that is the shape of the question ("is she on
 * site Thursday?") and it keeps the fetch to a handful of rows however long
 * somebody has been with the company. The day is fetched when the tab is
 * opened, then cached per date so stepping back and forth costs nothing.
 */
export function StaffSchedule({
  employeeId,
  firstName,
}: {
  employeeId: string
  firstName: string
}) {
  const today = todayKey()
  const [date, setDate] = useState(today)
  const [cache, setCache] = useState<Record<string, StaffScheduleDay>>({})

  const current = cache[date]

  useEffect(() => {
    if (cache[date]) return
    let cancelled = false
    listEmployeeDaySchedule(employeeId, date).then((result) => {
      if (!cancelled) setCache((prev) => ({ ...prev, [result.date]: result }))
    })
    return () => {
      cancelled = true
    }
  }, [employeeId, date, cache])

  return (
    <div className="flex flex-col gap-4">
      {/* The day being looked at, and the ways to change it: a step either
          side, the date itself, and a way back to today. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous day"
          onClick={() => setDate(shiftDay(date, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <label className="relative">
          <span className="sr-only">Day being viewed</span>
          <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || today)}
            className="h-9 w-[10.5rem] pl-8"
          />
        </label>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next day"
          onClick={() => setDate(shiftDay(date, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>

        {date !== today && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDate(today)}
          >
            Today
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-sm font-medium">{dayHeading(date, today)}</h4>
        {current && current.jobs.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {current.jobs.length} job{current.jobs.length === 1 ? "" : "s"}
            {current.minutes > 0 && ` · ${minutesLabel(current.minutes)} scheduled`}
          </span>
        )}
      </div>

      {!current ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading {firstName}&apos;s schedule…
        </div>
      ) : current.jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarOff className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">
              Nothing scheduled for {firstName} this day
            </p>
            {/* Blind stepping is the thing that makes a day view tedious, so
                the nearest days they *are* on are one tap away. */}
            {(current.prevDate || current.nextDate) && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {current.prevDate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDate(current.prevDate!)}
                  >
                    <ChevronLeft className="size-4" />
                    {dayHeading(current.prevDate, today)}
                  </Button>
                )}
                {current.nextDate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDate(current.nextDate!)}
                  >
                    {dayHeading(current.nextDate, today)}
                    <ChevronRight className="size-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="divide-y rounded-xl border px-4">
          {current.jobs.map((job) => (
            <JobEntry key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}
