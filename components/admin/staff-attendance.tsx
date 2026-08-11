"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { CalendarClock, Loader2 } from "lucide-react"
import { listEmployeeAttendance } from "@/app/actions/attendance"
import {
  cutoffLabel,
  dayLabel,
  decimalHours,
  minutesLabel,
} from "@/lib/attendance"
import { useNow } from "@/lib/use-now"
import { Pager } from "@/components/ui/pager"
import {
  RosterRow,
  UnworkedDayRow,
} from "@/components/attendance/roster-row"
import {
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
 * One payroll cutoff of this person's record at a time.
 *
 * The attendance page answers "who is on site today"; this answers "what has
 * this person actually worked", which is the question asked when a payslip is
 * queried or a contract is reviewed. Because that question is always asked of a
 * pay period, a page here *is* a pay period — the 1st–15th, then the 16th to the
 * end of the month — and the totals on it are that period's, ready to pay
 * against. Fetched only when the tab is opened.
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

  const { summary, cutoff } = current
  const period = cutoffLabel(cutoff.start, cutoff.end)
  // The pay period we are inside right now, which is the one people mean when
  // they ask what someone is owed. `useNow` reports 0 until the first client
  // tick, and 0 is before every cutoff ever recorded, so this simply stays off
  // rather than flashing the wrong badge.
  const isCurrent =
    now >= new Date(cutoff.start).getTime() &&
    now <= new Date(cutoff.end).setHours(23, 59, 59, 999)

  const stats = [
    { label: "Days worked", value: String(cutoff.days) },
    { label: "Total hours", value: minutesLabel(cutoff.minutes) },
    {
      label: "Decimal hours",
      value: decimalHours(cutoff.minutes).toFixed(2),
    },
    {
      label: "Approved OT",
      value: cutoff.overtimeHours > 0 ? `+${cutoff.overtimeHours}h` : "—",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* The cutoff being looked at, named before its figures. These totals are
          this pay period's and no other — that is the whole point of cutting the
          record on the 15th and the end of the month rather than every fifteen
          rows, where a total would span two payslips and mean nothing. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-sm font-medium tabular-nums">{period}</h4>
        {isCurrent ? (
          <span className="rounded-full bg-sky-600/10 px-2 py-0.5 text-[0.6875rem] font-medium text-sky-700 dark:text-sky-400">
            Current cutoff
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">pay period</span>
        )}
      </div>

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

      {cutoff.openDays > 0 && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {cutoff.openDays} day{cutoff.openDays === 1 ? "" : "s"} in this cutoff
          {cutoff.openDays === 1 ? " was" : " were"} never timed out, so
          {cutoff.openDays === 1 ? " it adds" : " they add"} no hours to the
          total above.
        </p>
      )}

      {/* The lifetime figures the tab used to lead with, kept as context rather
          than as the headline: they answer "how long have they been with us",
          not "what do we pay them this cutoff". */}
      <p className="text-xs text-muted-foreground">
        {summary.firstDay && summary.lastDay
          ? `Clocked ${dayLabel(summary.firstDay, true)} — ${dayLabel(summary.lastDay, true)}`
          : "Nothing clocked yet"}
        {summary.days > 0 &&
          ` · ${summary.days} days and ${minutesLabel(summary.minutes)} on record overall`}
        {summary.openDays > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {" "}
            · {summary.openDays} day{summary.openDays === 1 ? "" : "s"} never
            timed out in total
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

      {/* Stepping back a page steps back a pay period, so it says so. Cutoffs
          nobody worked are skipped server-side — "cutoff 4 of 9" counts periods
          with days in them, not every fortnight since they were hired. */}
      <Pager
        page={current.page}
        pages={current.pages}
        total={current.total}
        noun="days"
        pageSize={current.days.length}
        unit="Cutoff"
        label={`${current.days.length} day${current.days.length === 1 ? "" : "s"} on record this cutoff`}
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
