"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react"
import {
  clockTime,
  dayLabel,
  dayParam,
  decimalHours,
  minutesLabel,
  parseDayParam,
} from "@/lib/attendance"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RosterRow } from "@/components/attendance/roster-row"
import type {
  AdminAttendanceTab,
  AttendancePaging,
  AttendanceRow,
  MissingRow,
  OvertimeQueueRow,
  TimesheetRow,
} from "@/components/attendance/admin-attendance"

// Neither belongs in the chunk that draws a roster. The detail dialog carries
// the photo viewer; the decision form only exists on one of the three tabs.
const AttendanceDetailDialog = dynamic(() =>
  import("@/components/attendance/attendance-detail-dialog").then(
    (m) => m.AttendanceDetailDialog
  )
)
const OvertimeDecision = dynamic(() =>
  import("@/components/attendance/overtime-decision").then(
    (m) => m.OvertimeDecision
  )
)

const TABS: { value: AdminAttendanceTab; label: string }[] = [
  { value: "day", label: "Day log" },
  { value: "timesheet", label: "Timesheet" },
  { value: "overtime", label: "Overtime" },
]

function shiftDay(value: string, days: number) {
  const day = parseDayParam(value, new Date())
  day.setDate(day.getDate() + days)
  return dayParam(day)
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase()
}

// ---------------------------------------------------------------------------
// The band at the top. Attendance gets its own signature here rather than the
// four white stat cards every other page opens with — this one is about a
// moment in time, so it reads as an instrument panel and carries the day
// controls inside it.
// ---------------------------------------------------------------------------

function CommandBar({
  paging,
  stats,
  children,
}: {
  paging: AttendancePaging
  stats: { label: string; value: string; tone?: string }[]
  /** The tab's own controls — day stepper, period pickers, pending count. */
  children?: React.ReactNode
}) {
  const isToday = paging.date === paging.today
  const viewing = parseDayParam(paging.date, new Date())

  return (
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-sidebar to-[color-mix(in_oklab,var(--sidebar)_78%,var(--brand))] text-sidebar-foreground ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4 sm:gap-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-medium tracking-[0.16em] text-sidebar-foreground/55 uppercase">
            {paging.tab === "day"
              ? isToday
                ? "Today"
                : viewing.toLocaleDateString(undefined, { weekday: "long" })
              : paging.tab === "timesheet"
                ? "Pay period"
                : "Awaiting a decision"}
          </p>
          <h3 className="font-heading mt-1.5 text-xl leading-none font-semibold tracking-tight sm:text-2xl">
            {paging.tab === "day"
              ? viewing.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : paging.tab === "timesheet"
                ? `${dayLabel(paging.from)} — ${dayLabel(paging.to)}`
                : "Overtime requests"}
          </h3>
        </div>

        {children}
      </div>

      {stats.length > 0 && (
        <dl className="grid grid-cols-2 divide-x divide-y divide-white/10 border-t border-white/10 bg-black/15 sm:grid-cols-4 sm:divide-y-0">
          {stats.map((stat) => (
            <div key={stat.label} className="px-3 py-2.5 sm:px-4 sm:py-3">
              <dd
                className={cn(
                  "text-lg leading-none font-semibold tabular-nums",
                  stat.tone
                )}
              >
                {stat.value}
              </dd>
              <dt className="mt-1.5 truncate text-[0.6875rem] tracking-wide text-sidebar-foreground/55 uppercase">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

export function AdminAttendanceView({
  rows,
  missing,
  timesheet,
  overtimeQueue,
  pendingOvertime,
  paging,
}: {
  rows: AttendanceRow[]
  missing: MissingRow[]
  timesheet: TimesheetRow[]
  overtimeQueue: OvertimeQueueRow[]
  pendingOvertime: number
  paging: AttendancePaging
}) {
  const router = useRouter()
  const now = useNow()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<AttendanceRow | null>(null)

  const today = paging.today

  // The tab is a URL, not browser state: each tab's data is fetched on its own
  // so that opening one doesn't pay for the other two.
  function tabHref(tab: AdminAttendanceTab) {
    if (tab === "day") return `/admin/attendance?tab=day&date=${paging.date}`
    if (tab === "timesheet") {
      return `/admin/attendance?tab=timesheet&from=${paging.from}&to=${paging.to}`
    }
    return "/admin/attendance?tab=overtime"
  }

  function goToDay(date: string) {
    if (date) router.push(`/admin/attendance?tab=day&date=${date}`)
  }

  function setWindow(part: "from" | "to", value: string) {
    if (!value) return
    const from = part === "from" ? value : paging.from
    const to = part === "to" ? value : paging.to
    router.push(`/admin/attendance?tab=timesheet&from=${from}&to=${to}`)
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      [row.employeeName, row.employeeNo]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
  }, [rows, query])

  const grand = timesheet.reduce(
    (totals, row) => ({
      days: totals.days + row.days,
      minutes: totals.minutes + row.minutes,
      overtimeHours: totals.overtimeHours + row.overtimeHours,
    }),
    { days: 0, minutes: 0, overtimeHours: 0 }
  )

  // Scales the bars in the timesheet. Relative to the busiest person, so the
  // shape of the period is visible without anyone having to read every number.
  const peakMinutes = Math.max(1, ...timesheet.map((row) => row.minutes))

  const onTheClock = rows.filter((row) => !row.timeOut).length
  const loggedMinutes = rows.reduce((sum, row) => sum + (row.minutes ?? 0), 0)

  const stats =
    paging.tab === "day"
      ? [
          {
            label: "On the clock",
            value: String(onTheClock),
            tone: onTheClock > 0 ? "text-emerald-400" : undefined,
          },
          { label: "Timed in", value: String(rows.length) },
          {
            label: "No punch",
            value: String(missing.length),
            tone: missing.length > 0 ? "text-amber-400" : undefined,
          },
          { label: "Hours logged", value: minutesLabel(loggedMinutes) },
        ]
      : paging.tab === "timesheet"
        ? [
            { label: "People", value: String(timesheet.length) },
            { label: "Days worked", value: String(grand.days) },
            { label: "Hours", value: decimalHours(grand.minutes).toFixed(2) },
            {
              label: "Payable with OT",
              value: (
                decimalHours(grand.minutes) + grand.overtimeHours
              ).toFixed(2),
            },
          ]
        : []

  return (
    <div className="flex flex-col gap-4">
      <CommandBar paging={paging} stats={stats}>
        {paging.tab === "day" && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous day"
              onClick={() => goToDay(shiftDay(paging.date, -1))}
              className="text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <label className="relative">
              <span className="sr-only">Day being viewed</span>
              <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sidebar-foreground/60" />
              <Input
                type="date"
                value={paging.date}
                max={today}
                onChange={(event) => goToDay(event.target.value)}
                className="h-9 w-[10.5rem] border-white/15 bg-white/10 pl-8 text-sidebar-foreground [color-scheme:dark]"
              />
            </label>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next day"
              disabled={paging.date >= today}
              onClick={() => goToDay(shiftDay(paging.date, 1))}
              className="text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>

            {paging.date !== today && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => goToDay(today)}
                className="text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
              >
                Today
              </Button>
            )}
          </div>
        )}

        {paging.tab === "timesheet" && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              aria-label="Period start"
              value={paging.from}
              max={paging.to}
              onChange={(event) => setWindow("from", event.target.value)}
              className="h-9 w-[9.5rem] border-white/15 bg-white/10 text-sidebar-foreground [color-scheme:dark]"
            />
            <span className="text-sidebar-foreground/50">—</span>
            <Input
              type="date"
              aria-label="Period end"
              value={paging.to}
              min={paging.from}
              max={today}
              onChange={(event) => setWindow("to", event.target.value)}
              className="h-9 w-[9.5rem] border-white/15 bg-white/10 text-sidebar-foreground [color-scheme:dark]"
            />
          </div>
        )}

        {paging.tab === "overtime" && (
          <p className="text-2xl leading-none font-semibold tabular-nums sm:text-3xl">
            {pendingOvertime}
          </p>
        )}
      </CommandBar>

      {/* A segmented control rather than the underlined tabs used elsewhere —
          each one is a real page with its own data, and should behave like a
          link: back button, new tab, the lot. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
          {TABS.map((tab) => {
            const active = paging.tab === tab.value
            return (
              <Link
                key={tab.value}
                href={tabHref(tab.value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.value === "overtime" && pendingOvertime > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
                    {pendingOvertime}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {paging.tab === "day" && rows.length > 0 && (
          <div className="relative min-w-40 flex-1 sm:max-w-56 sm:flex-none">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search employees"
              className="h-9 pl-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground outline-none hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {paging.tab === "day" && (
        <div className="flex flex-col gap-4">
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {rows.length === 0
                  ? `Nobody timed in on ${dayLabel(paging.date)}.`
                  : "No one matches that search."}
              </p>
            </div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border">
              {visible.map((row) => (
                <RosterRow
                  key={row.id}
                  row={row}
                  now={now}
                  onOpen={() => setSelected(row)}
                />
              ))}
            </ul>
          )}

          {/* Who is unaccounted for matters as much as who isn't — it's the
              only thing on this page that prompts a phone call. */}
          {missing.length > 0 && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
              <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
                <AlertTriangle className="size-3.5" />
                No punch on {dayLabel(paging.date)} · {missing.length}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {missing.map((person) => (
                  <span
                    key={person.id}
                    className="rounded-lg bg-background px-2.5 py-1 text-xs ring-1 ring-foreground/10"
                  >
                    {person.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {paging.tab === "timesheet" && (
        <div className="flex flex-col gap-3">
          {timesheet.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
              Nobody timed in between {dayLabel(paging.from)} and{" "}
              {dayLabel(paging.to)}.
            </div>
          ) : (
            <>
              {/* A seven-column payroll grid is unreadable on a phone, so it
                  becomes one card per person: the payable figure — the number
                  the whole period is run for — leads, with the days and hours
                  it was built from underneath. */}
              <div className="divide-y overflow-hidden rounded-2xl border md:hidden">
                {timesheet.map((row) => (
                  <div key={row.employeeId} className="flex flex-col gap-2 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {row.employeeName}
                        </p>
                        {row.employeeNo && (
                          <p className="font-mono text-xs text-muted-foreground">
                            {row.employeeNo}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-semibold tabular-nums">
                          {(
                            decimalHours(row.minutes) + row.overtimeHours
                          ).toFixed(2)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          payable hours
                        </p>
                      </div>
                    </div>

                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      role="presentation"
                    >
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{
                          width: `${Math.round((row.minutes / peakMinutes) * 100)}%`,
                        }}
                      />
                    </div>

                    <p className="text-xs text-muted-foreground tabular-nums">
                      {row.days} {row.days === 1 ? "day" : "days"}
                      {row.openDays > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {" "}
                          +{row.openDays} open
                        </span>
                      )}{" "}
                      · {minutesLabel(row.minutes)} ·{" "}
                      {decimalHours(row.minutes).toFixed(2)}h
                      {row.overtimeHours > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {" "}
                          +{row.overtimeHours.toFixed(2)} OT
                        </span>
                      )}
                    </p>
                  </div>
                ))}

                <div className="flex items-baseline justify-between gap-3 bg-muted/40 p-3">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {(decimalHours(grand.minutes) + grand.overtimeHours).toFixed(
                      2
                    )}{" "}
                    h
                  </span>
                </div>
              </div>

              <div className="hidden overflow-x-auto rounded-2xl border md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Employee</TableHead>
                      <TableHead className="hidden w-40 md:table-cell" />
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead className="text-right whitespace-nowrap">
                        Worked
                      </TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right whitespace-nowrap">
                        OT
                      </TableHead>
                      <TableHead className="text-right">Payable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timesheet.map((row) => (
                      <TableRow
                        key={row.employeeId}
                        className="hover:bg-muted/40"
                      >
                        <TableCell>
                          <div className="text-sm font-medium">
                            {row.employeeName}
                          </div>
                          {row.employeeNo && (
                            <div className="font-mono text-xs text-muted-foreground">
                              {row.employeeNo}
                            </div>
                          )}
                        </TableCell>

                        {/* The shape of the period at a glance — who carried
                            it and who barely appeared — without anyone having
                            to read down a column of numbers. */}
                        <TableCell className="hidden md:table-cell">
                          <div
                            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                            role="presentation"
                          >
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{
                                width: `${Math.round((row.minutes / peakMinutes) * 100)}%`,
                              }}
                            />
                          </div>
                        </TableCell>

                        <TableCell className="text-right text-sm tabular-nums">
                          {row.days}
                          {/* An unclosed day contributes nothing to the total,
                              so say so rather than let the hours look short. */}
                          {row.openDays > 0 && (
                            <span
                              className="ml-1 text-xs text-amber-600 dark:text-amber-400"
                              title={`${row.openDays} day(s) never timed out`}
                            >
                              +{row.openDays} open
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
                          {minutesLabel(row.minutes)}
                        </TableCell>

                        <TableCell className="text-right text-sm tabular-nums">
                          {decimalHours(row.minutes).toFixed(2)}
                        </TableCell>

                        <TableCell className="text-right text-sm tabular-nums">
                          {row.overtimeHours > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{row.overtimeHours.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right text-sm font-semibold tabular-nums">
                          {(
                            decimalHours(row.minutes) + row.overtimeHours
                          ).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}

                    <TableRow className="border-t-2 bg-muted/40 hover:bg-muted/40">
                      <TableCell className="text-sm font-semibold">
                        Total
                      </TableCell>
                      <TableCell className="hidden md:table-cell" />
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {grand.days}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold whitespace-nowrap tabular-nums">
                        {minutesLabel(grand.minutes)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {decimalHours(grand.minutes).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {grand.overtimeHours > 0
                          ? `+${grand.overtimeHours.toFixed(2)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {(
                          decimalHours(grand.minutes) + grand.overtimeHours
                        ).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <p className="text-xs text-muted-foreground">
                Hours are time in to time out — no schedule is involved. Days
                marked <span className="text-amber-600 dark:text-amber-400">open</span>{" "}
                were never timed out and add nothing to the total. Overtime
                counts only what was approved.
              </p>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {paging.tab === "overtime" && (
        <div className="flex flex-col gap-3">
          {overtimeQueue.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
              No overtime waiting on a decision.
            </div>
          ) : (
            overtimeQueue.map((request) => (
              <article
                key={request.id}
                className="overflow-hidden rounded-2xl border"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-xs font-semibold text-brand"
                    >
                      {initials(request.employeeName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {request.employeeName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {dayLabel(request.date)} · in{" "}
                        {clockTime(request.timeIn)} · shift ended{" "}
                        {clockTime(request.shiftEndsAt)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg leading-none font-semibold tabular-nums">
                      {request.hours}h
                    </p>
                    <p className="mt-1 text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
                      requested
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 p-4">
                  <p className="text-sm">{request.reason}</p>

                  <p className="text-xs text-muted-foreground">
                    Asked at {clockTime(request.requestedAt)}
                    {request.timeOut
                      ? ` · timed out ${clockTime(request.timeOut)}`
                      : " · still on the clock"}
                  </p>

                  <OvertimeDecision
                    requestId={request.id}
                    requestedHours={request.hours}
                    className="border-t pt-3"
                  />
                </div>
              </article>
            ))
          )}
        </div>
      )}

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
