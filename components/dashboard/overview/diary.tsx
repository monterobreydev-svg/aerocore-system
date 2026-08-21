import Link from "next/link"
import { CalendarClock, ChevronRight } from "lucide-react"

import type { Overview } from "@/lib/dashboard"
import {
  SCHEDULE_STATUS_DOT,
  SCHEDULE_STATUS_LABELS,
  WORK_TYPE_DOT,
  WORK_TYPE_LABELS,
} from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { Empty, Panel, PanelHead } from "@/components/dashboard/overview/parts"

// ---------------------------------------------------------------------------
// The diary
// ---------------------------------------------------------------------------
//
// Today's jobs, set out the way a paper diary sets them out: the time in a
// gutter down the left, the work beside it. The gutter is what makes the list
// scannable — somebody looking for "what is on at two" runs down one column of
// aligned figures rather than reading every line.
//
// The status colours are the schedule module's own, not the chart palette's.
// A job's state means the same thing on the calendar, in the table and here,
// and a fourth set of colours for the same five words would be a fourth thing
// to learn.

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
  return (
    <Panel>
      <PanelHead
        icon={CalendarClock}
        title="Today's jobs"
        meta={
          diary.total === 0
            ? "Nothing booked"
            : `${diary.total} booked · ${diary.unclosed} with no outcome yet`
        }
        href={`/admin/schedules?day=${today}`}
        action="Schedules"
      />

      {diary.shown.length === 0 ? (
        <Empty>Nothing booked for today.</Empty>
      ) : (
        <ul className="divide-y">
          {diary.shown.map((job) => (
            <li key={job.id}>
              <Link
                href={`/admin/schedules?day=${today}`}
                className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60 sm:gap-4 sm:px-5"
              >
                {/* The gutter. Fixed width and tabular, so every start time in
                    the column lines up on the colon. The rule down its right is
                    what turns two columns of text into a diary. */}
                <div className="w-12 shrink-0 border-r pr-3 text-right sm:w-14 sm:pr-4">
                  <p className="text-[0.8125rem] leading-none font-semibold tabular-nums">
                    {hhmm(job.startsAt)}
                  </p>
                  <p className="mt-1.5 text-[0.625rem] leading-none text-muted-foreground tabular-nums">
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

                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                    {job.workTypes.map((type) => (
                      <span
                        key={type}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-[1px]",
                            WORK_TYPE_DOT[type]
                          )}
                        />
                        {WORK_TYPE_LABELS[type]}
                      </span>
                    ))}
                    {job.crew.length > 0 ? (
                      <span className="min-w-0 truncate">
                        {job.crew.join(", ")}
                        {job.crewOverflow > 0 && ` +${job.crewOverflow}`}
                      </span>
                    ) : (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        nobody assigned
                      </span>
                    )}
                  </p>
                </div>

                {/* The outcome, as a chip. On a phone it collapses to the dot —
                    five states in five colours, which the schedules page teaches
                    and this one only has to be consistent with. */}
                <span className="flex shrink-0 items-center gap-1.5 self-start rounded-full bg-muted px-1.5 py-1 text-[0.6875rem] text-muted-foreground sm:px-2">
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
              </Link>
            </li>
          ))}
        </ul>
      )}

      {diary.total > diary.shown.length && (
        <Link
          href={`/admin/schedules?day=${today}`}
          className="flex items-center gap-1 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-brand-strong sm:px-5 dark:hover:text-brand"
        >
          and {diary.total - diary.shown.length} more booked today
          <ChevronRight className="size-3.5" />
        </Link>
      )}
    </Panel>
  )
}
