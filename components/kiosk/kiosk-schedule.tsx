"use client"

import { useMemo, useState } from "react"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Phone,
  StickyNote,
  Users,
} from "lucide-react"
import { listPublicMonth } from "@/app/actions/public-schedule"
import {
  HOLIDAY_STYLE,
  holidayOn,
  holidayStyle,
} from "@/lib/payroll/holidays"
import {
  addDays,
  formatTimeRange,
  isSameDay,
  SCHEDULE_STATUS_CHIP,
  SCHEDULE_STATUS_LABELS,
  startOfDay,
  startOfMonth,
  startOfWeek,
  WORK_TYPE_LABELS,
  WORK_TYPE_SOLID,
} from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { ScheduleStatus, WorkType } from "@/app/generated/prisma/client"

export type KioskJob = {
  id: string
  startTime: string
  endTime: string
  status: ScheduleStatus
  workTypes: WorkType[]
  clientName: string
  branchName: string | null
  address: string
  contactPerson: string | null
  contactNumber: string | null
  remarks: string | null
  crew: string[]
}

export type KioskDay = {
  /** Local-midnight ISO of the day. */
  date: string
  /** "Today", "Tomorrow" or a written date — worked out on the server. */
  label: string
  jobs: KioskJob[]
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

function monthKeyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

/** One job, with everything a crew needs to get there and get in. */
function JobCard({ job }: { job: KioskJob }) {
  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      {/* The time leads: at a gate, "when" is read before "who". */}
      <div className="flex items-start gap-3 border-b bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{job.clientName}</p>
          {job.branchName && (
            <p className="truncate text-xs text-muted-foreground">
              {job.branchName}
            </p>
          )}
        </div>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">
            {formatTimeRange(job.startTime, job.endTime)}
          </span>
          <span
            className={cn(
              "mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              SCHEDULE_STATUS_CHIP[job.status]
            )}
          >
            {SCHEDULE_STATUS_LABELS[job.status]}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3 py-2.5">
        {job.workTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {job.workTypes.map((type) => (
              <span
                key={type}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                  WORK_TYPE_SOLID[type]
                )}
              >
                {WORK_TYPE_LABELS[type]}
              </span>
            ))}
          </div>
        )}

        {job.address && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">{job.address}</span>
          </p>
        )}

        {(job.contactPerson || job.contactNumber) && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Phone className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">
              {job.contactPerson}
              {job.contactPerson && job.contactNumber && " · "}
              {job.contactNumber && (
                // Tappable: the person reading this is usually trying to get
                // through a gate, and typing a number into a keypad is the
                // step that fails.
                <a
                  href={`tel:${job.contactNumber.replace(/\s/g, "")}`}
                  className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
                >
                  {job.contactNumber}
                </a>
              )}
            </span>
          </p>
        )}

        {job.crew.length > 0 && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Users className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">{job.crew.join(", ")}</span>
          </p>
        )}

        {job.remarks && (
          <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-2 py-1.5 text-xs">
            <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 whitespace-pre-wrap">{job.remarks}</span>
          </p>
        )}
      </div>
    </li>
  )
}

function Empty({ line }: { line: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <CalendarDays className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{line}</p>
    </div>
  )
}

/**
 * The whole company's work — the day in front of you, or the month around it.
 *
 * Two views on purpose, and Today is the one it opens on: somebody standing at
 * a site wants this morning, not August. The month is there for the driver
 * planning a run and the supervisor checking next week, and it fetches its own
 * data so the common case stays a small page.
 */
export function KioskSchedule({ days }: { days: KioskDay[] }) {
  const [view, setView] = useState<"today" | "month">("today")
  const today = useMemo(() => startOfDay(new Date()), [])
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(today)

  // One entry per month already fetched, so paging back and forth is free.
  const [months, setMonths] = useState<Record<string, KioskDay[]>>({})
  const [loading, setLoading] = useState(false)

  const key = monthKeyOf(cursor)
  const monthDays = months[key]

  async function goToMonth(next: Date) {
    setCursor(next)
    const nextKey = monthKeyOf(next)
    if (months[nextKey]) return

    setLoading(true)
    try {
      const rows = await listPublicMonth(nextKey)
      setMonths((prev) => ({
        ...prev,
        [nextKey]: rows.map((row) => ({ ...row, label: "" })),
      }))
    } finally {
      setLoading(false)
    }
  }

  async function openMonthView() {
    setView("month")
    if (!months[key]) await goToMonth(cursor)
  }

  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor))
    return Array.from({ length: 42 }, (_, index) => addDays(start, index))
  }, [cursor])

  const jobsOn = (day: Date) =>
    monthDays?.find((entry) => isSameDay(new Date(entry.date), day))?.jobs ?? []

  const selectedJobs = jobsOn(selected)
  const selectedHoliday = holidayOn(selected)

  return (
    <div className="flex flex-col gap-3">
      {/* Segmented control rather than tabs: two states, one obviously on. */}
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        <button
          type="button"
          onClick={() => setView("today")}
          className={cn(
            "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
            view === "today"
              ? "bg-background shadow-sm"
              : "text-muted-foreground"
          )}
        >
          Today &amp; next
        </button>
        <button
          type="button"
          onClick={() => void openMonthView()}
          className={cn(
            "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
            view === "month"
              ? "bg-background shadow-sm"
              : "text-muted-foreground"
          )}
        >
          Month
        </button>
      </div>

      {view === "today" ? (
        days.length === 0 ? (
          <Empty line="Nothing booked in the next two weeks." />
        ) : (
          <div className="flex flex-col gap-5">
            {days.map((day) => (
              <section key={day.date} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold">{day.label}</h3>
                  <span className="text-xs text-muted-foreground">
                    {day.jobs.length} {day.jobs.length === 1 ? "job" : "jobs"}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {day.jobs.map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() =>
                void goToMonth(
                  new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
                )
              }
            >
              <ChevronLeft />
            </Button>
            <p className="text-sm font-semibold">
              {cursor.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              onClick={() =>
                void goToMonth(
                  new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
                )
              }
            >
              <ChevronRight />
            </Button>
          </div>

          <div>
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((label, index) => (
                <div
                  key={`${label}-${index}`}
                  className="py-1 text-center text-[11px] font-medium text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {grid.map((day) => {
                const inMonth = day.getMonth() === cursor.getMonth()
                const count = jobsOn(day).length
                const isSelected = isSameDay(day, selected)
                const isToday = isSameDay(day, today)
                const holiday = holidayOn(day)
                const style = holidayStyle(holiday)

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setSelected(day)}
                    title={holiday?.name}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-sm transition-colors outline-none",
                      !inMonth && "text-muted-foreground/40",
                      isSelected
                        ? "bg-brand font-semibold text-brand-foreground"
                        : isToday
                          ? "bg-brand/10 font-semibold text-brand"
                          : holiday
                            ? cn(style?.cell, style?.text, "font-semibold")
                            : "hover:bg-muted",
                      holiday && "ring-1 ring-red-500/40 ring-inset"
                    )}
                  >
                    <span className="leading-none">{day.getDate()}</span>
                    {/* A dot per job, to three — past that the number stops
                        meaning anything at this size. */}
                    <span className="flex h-1.5 items-center gap-0.5">
                      {Array.from({ length: Math.min(count, 3) }).map(
                        (_, index) => (
                          <span
                            key={index}
                            className={cn(
                              "size-1 rounded-full",
                              isSelected ? "bg-brand-foreground" : "bg-brand"
                            )}
                          />
                        )
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-semibold">
                {selected.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h3>
              {selectedHoliday && (
                <span
                  className={cn(
                    "text-xs font-medium",
                    HOLIDAY_STYLE[selectedHoliday.kind].text
                  )}
                >
                  {selectedHoliday.name}
                  <span className="opacity-70">
                    {" · "}
                    {HOLIDAY_STYLE[selectedHoliday.kind].payNote}
                  </span>
                </span>
              )}
            </div>

            {loading && !monthDays ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading the month…
              </p>
            ) : selectedJobs.length === 0 ? (
              <Empty line="Nothing booked on this day." />
            ) : (
              <ul className="flex flex-col gap-2">
                {selectedJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
