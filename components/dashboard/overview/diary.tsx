import Link from "next/link"

import type { Overview } from "@/lib/dashboard"
import {
  SCHEDULE_STATUS_DOT,
  SCHEDULE_STATUS_LABELS,
  WORK_TYPE_DOT,
  WORK_TYPE_LABELS,
} from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { Empty, SectionHead } from "@/components/dashboard/overview/parts"

// ---------------------------------------------------------------------------
// The diary
// ---------------------------------------------------------------------------
//
// Today's jobs, set out the way a paper diary sets them out: the time in a
// gutter down the left, the work beside it. The gutter is what makes the list
// scannable — a reader looking for "what is on at two" runs down one column of
// aligned figures rather than reading every line.
//
// Under it, the week ahead as seven counts. Not a chart of anything clever:
// the only question asked of next week from this page is "which day is heavy",
// and seven bars answer it in the space a sentence would take.

function hhmm(minute: number) {
  const hour = Math.floor(minute / 60)
  const minutes = minute % 60
  const suffix = hour < 12 ? "am" : "pm"
  const shown = hour % 12 === 0 ? 12 : hour % 12
  return `${shown}${minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`}${suffix}`
}

export function Diary({
  diary,
  today,
}: {
  diary: Overview["diary"]
  today: string
}) {
  const busiest = Math.max(1, ...diary.ahead.map((day) => day.jobs))

  return (
    <section>
      <SectionHead
        title="Today's jobs"
        meta={
          diary.total === 0
            ? undefined
            : `${diary.total} booked · ${diary.unclosed} still open`
        }
        href={`/admin/schedules?day=${today}`}
        action="Schedules"
      />

      {diary.shown.length === 0 ? (
        <Empty>Nothing booked for today.</Empty>
      ) : (
        <ul className="mt-1 divide-y">
          {diary.shown.map((job) => (
            <li key={job.id} className="flex gap-3 py-2.5 sm:gap-4">
              {/* The gutter. Fixed width and tabular so every start time in
                  the column lines up on the colon. */}
              <div className="w-14 shrink-0 pt-px text-right sm:w-16">
                <p className="text-[0.8125rem] leading-none font-medium tabular-nums">
                  {hhmm(job.startsAt)}
                </p>
                <p className="mt-1 text-[0.625rem] leading-none text-muted-foreground tabular-nums">
                  {hhmm(job.endsAt)}
                </p>
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {job.clientName}
                  </span>
                  {job.branchName && (
                    <span className="min-w-0 shrink truncate text-xs text-muted-foreground">
                      {job.branchName}
                    </span>
                  )}
                </p>

                <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                  {job.workTypes.map((type) => (
                    <span key={type} className="inline-flex items-center gap-1">
                      <span
                        className={cn(
                          "size-1.5 rounded-[1px]",
                          WORK_TYPE_DOT[type]
                        )}
                      />
                      {WORK_TYPE_LABELS[type]}
                    </span>
                  ))}
                  {job.crew.length > 0 && (
                    <span className="min-w-0 truncate">
                      {job.crew.join(", ")}
                      {job.crewOverflow > 0 && ` +${job.crewOverflow}`}
                    </span>
                  )}
                  {job.crew.length === 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      nobody assigned
                    </span>
                  )}
                </p>
              </div>

              <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[0.6875rem] text-muted-foreground">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    SCHEDULE_STATUS_DOT[job.status]
                  )}
                />
                <span className="hidden sm:inline">
                  {SCHEDULE_STATUS_LABELS[job.status]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {diary.total > diary.shown.length && (
        <Link
          href={`/admin/schedules?day=${today}`}
          className="mt-2 inline-block text-xs text-muted-foreground transition-colors hover:text-brand-strong"
        >
          and {diary.total - diary.shown.length} more today
        </Link>
      )}

      {/* ---- the week ahead ---- */}

      <div className="mt-6 flex items-end gap-4 border-t pt-4">
        <p className="w-14 shrink-0 text-[0.6875rem] leading-tight tracking-[0.1em] text-muted-foreground uppercase sm:w-16">
          Week
          <br />
          ahead
        </p>

        <ul className="flex min-w-0 flex-1 items-end gap-1.5">
          {diary.ahead.map((day) => (
            <li key={day.day} className="min-w-0 flex-1">
              <Link
                href={`/admin/schedules?day=${day.day}`}
                className="group block"
              >
                {/* Height carries the count; the figure above it carries the
                    exact number. A bar alone would be a shape nobody can read
                    a total off, and a number alone would not show the shape of
                    the week. */}
                <span className="block text-center text-[0.625rem] text-muted-foreground tabular-nums">
                  {day.jobs === 0 ? "—" : day.jobs}
                </span>
                <span className="mt-1 flex h-8 items-end">
                  <span
                    className={cn(
                      "w-full rounded-[2px] transition-colors",
                      day.jobs === 0
                        ? "h-px bg-border"
                        : "bg-foreground/20 group-hover:bg-brand"
                    )}
                    style={
                      day.jobs === 0
                        ? undefined
                        : { height: `${Math.max(12, (day.jobs / busiest) * 100)}%` }
                    }
                  />
                </span>
                <span className="mt-1.5 block text-center text-[0.625rem] text-muted-foreground">
                  {day.weekday}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
