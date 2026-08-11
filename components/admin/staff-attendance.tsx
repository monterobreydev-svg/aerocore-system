"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { CalendarClock, Loader2 } from "lucide-react"
import { listEmployeeAttendance } from "@/app/actions/attendance"
import { dayLabel, decimalHours, minutesLabel } from "@/lib/attendance"
import { useNow } from "@/lib/use-now"
import { Pager } from "@/components/ui/pager"
import {
  RosterRow,
  UnworkedDayRow,
} from "@/components/attendance/roster-row"
import {
  STAFF_ATTENDANCE_PAGE_SIZE,
  STAFF_SUMMARY_DAYS,
  type AttendanceRow,
  type StaffAttendancePage,
} from "@/components/attendance/admin-attendance"

// Carries the photo viewer, so it stays out of the chunk that lists days.
const AttendanceDetailDialog = dynamic(() =>
  import("@/components/attendance/attendance-detail-dialog").then(
    (m) => m.AttendanceDetailDialog
  )
)

/**
 * Every day this person has clocked, on their own record.
 *
 * The attendance page answers "who is on site today"; this answers "what has
 * this person actually worked", which is the question asked when a payslip is
 * queried or a contract is reviewed. Same rows, same detail view — fetched only
 * when the tab is opened.
 */
export function StaffAttendance({
  employeeId,
  firstName,
}: {
  employeeId: string
  firstName: string
}) {
  const now = useNow()
  const [page, setPage] = useState(1)
  // Cached per page, so stepping back through the history is free.
  const [cache, setCache] = useState<Record<number, StaffAttendancePage>>({})
  const [selected, setSelected] = useState<AttendanceRow | null>(null)

  const current = cache[page]

  useEffect(() => {
    if (cache[page]) return
    let cancelled = false
    listEmployeeAttendance(employeeId, page).then((result) => {
      if (!cancelled) setCache((prev) => ({ ...prev, [result.page]: result }))
    })
    return () => {
      cancelled = true
    }
  }, [employeeId, page, cache])

  if (!current) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading {firstName}&apos;s attendance…
      </div>
    )
  }

  if (current.total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarClock className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Nothing on record yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Every day {firstName} is scheduled or times in lands here — the
            jobs assigned, the photos, the location each punch was made from
            and any reports filed.
          </p>
        </div>
      </div>
    )
  }

  const { summary } = current

  const stats = [
    { label: "Days worked", value: String(summary.days) },
    { label: "Total hours", value: minutesLabel(summary.minutes) },
    {
      label: "Decimal hours",
      value: decimalHours(summary.minutes).toFixed(2),
    },
    {
      label: "Approved OT",
      value: summary.overtimeHours > 0 ? `+${summary.overtimeHours}h` : "—",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Totals are for the whole recorded history, not the page being looked
          at — a per-page total on a paged list is a number nobody can use. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card px-3 py-2.5">
            <p className="text-base leading-none font-semibold tabular-nums">
              {stat.value}
            </p>
            <p className="mt-1.5 truncate text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {summary.firstDay && summary.lastDay
          ? `Clocked ${dayLabel(summary.firstDay, true)} — ${dayLabel(summary.lastDay, true)}`
          : "Nothing clocked yet"}
        {summary.openDays > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {" "}
            · {summary.openDays} day{summary.openDays === 1 ? "" : "s"} never
            timed out, adding no hours
          </span>
        )}
        {/* Only when there really is older history behind the window. */}
        {summary.truncated && ` · totals cover the last ${STAFF_SUMMARY_DAYS} days`}
      </p>

      {/* Listed by day, not by punch: a day the office assigned that nobody
          clocked has no attendance row to hang off, and is exactly the day
          worth seeing. */}
      <ul className="divide-y overflow-hidden rounded-xl border">
        {current.days.map((day) =>
          day.attendance ? (
            <RosterRow
              key={day.date}
              row={day.attendance}
              now={now}
              variant="record"
              scheduled={day.scheduled}
              onOpen={() => setSelected(day.attendance!)}
            />
          ) : (
            <UnworkedDayRow key={day.date} day={day} />
          )
        )}
      </ul>

      <Pager
        page={current.page}
        pages={current.pages}
        total={current.total}
        noun="days"
        pageSize={STAFF_ATTENDANCE_PAGE_SIZE}
        onPage={setPage}
      />

      {selected && (
        <AttendanceDetailDialog
          key={selected.id}
          row={selected}
          open
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}
    </div>
  )
}
