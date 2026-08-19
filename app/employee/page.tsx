import Link from "next/link"
import {
  ArrowRight,
  CalendarClock,
  CalendarX2,
  LogIn,
  LogOut,
  MapPin,
  Receipt,
  Timer,
  Wallet,
} from "lucide-react"
import { prisma } from "@/lib/db/prisma"
import { getCurrentEmployee } from "@/lib/db/dal"
import {
  attendanceDay,
  canPunchWithoutSchedule,
  clockTime,
  cutoffEnd,
  cutoffLabel,
  cutoffStart,
  dayLabel,
  decimalHours,
  durationLabel,
  MAX_SHIFT_HOURS,
  minutesLabel,
  nextDay,
  workedMinutes,
} from "@/lib/attendance"
import { fundBalance, peso } from "@/lib/reimbursement"
import { formatTimeRange } from "@/lib/schedule"
import { Button } from "@/components/ui/button"

// ---------------------------------------------------------------------------
// The employee home screen
//
// Deliberately a server component with no interactive parts: every figure on it
// is derived here and every action is a link. That means the whole page costs
// one HTML response and no JavaScript chunk at all — which is the right trade
// for the screen that gets opened first, on a phone, on one bar of signal.
//
// It answers three questions in the order someone actually asks them: am I on
// the clock, where am I going, and what do I have outstanding.
// ---------------------------------------------------------------------------

// How many days ahead the "coming up" list looks. Three is what fits on a phone
// without scrolling past the fold; the schedule page is one tap away for the
// rest, and an unbounded list here would grow with every job ever booked.
const UPCOMING_LIMIT = 3

export default async function EmployeeHomePage() {
  const employee = await getCurrentEmployee()

  const now = new Date()
  const today = attendanceDay(now)
  const tomorrow = nextDay(today)
  const periodStart = cutoffStart(now)
  const periodEnd = cutoffEnd(now)

  const [
    openPunch,
    todayRecord,
    todayJobs,
    upcomingJobs,
    cutoffSpans,
    pendingClaims,
    releasedTotal,
    liquidatedTotal,
  ] = await Promise.all([
    // A shift that began yesterday and hasn't been closed. At 02:00 this is the
    // row that matters — without it the card would offer "Time in" to somebody
    // who has been on site all night.
    prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        timeOut: null,
        timeIn: { gte: new Date(now.getTime() - MAX_SHIFT_HOURS * 3_600_000) },
      },
      orderBy: { timeIn: "desc" },
      select: { date: true, timeIn: true },
    }),
    prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      select: { timeIn: true, timeOut: true },
    }),
    prisma.schedule.findMany({
      where: {
        assignments: { some: { employeeId: employee.id } },
        date: { gte: today, lt: tomorrow },
        status: { not: "CANCELLED" },
      },
      // Named rather than included: a schedule row carries remarks, contact
      // details and the whole assignment list, none of which this card shows.
      select: {
        id: true,
        startTime: true,
        endTime: true,
        client: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.schedule.findMany({
      where: {
        assignments: { some: { employeeId: employee.id } },
        date: { gte: tomorrow },
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        client: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: UPCOMING_LIMIT,
    }),
    // One pay period, so at most sixteen rows however long the person has
    // worked here. Three columns each — the totals are added up below and the
    // rows themselves never leave the server.
    prisma.attendance.findMany({
      where: {
        employeeId: employee.id,
        date: { gte: periodStart, lt: nextDay(periodEnd) },
      },
      select: {
        timeIn: true,
        timeOut: true,
        overtime: {
          select: { hours: true, approvedHours: true, status: true },
        },
      },
    }),
    prisma.reimbursement.count({
      where: { employeeId: employee.id, status: "PENDING_REVIEW" },
    }),
    // Summed by Postgres, not by pulling the ledger across the wire. The fund
    // is every release ever made less everything accounted for, so the rows
    // behind these two numbers grow forever — the numbers don't.
    prisma.fundRelease.aggregate({
      where: { employeeId: employee.id },
      _sum: { amount: true },
    }),
    prisma.reimbursement.aggregate({
      // A rejected liquidation doesn't reduce the balance: that money is still
      // theirs to account for, which is what a rejection means.
      where: { employeeId: employee.id, status: { not: "REJECTED" } },
      _sum: { totalAmount: true },
    }),
  ])

  // Whichever punch is live takes precedence — an overnight shift has no row
  // under today's date, and reading only today's would lose it.
  const punch = openPunch ?? todayRecord
  const working = Boolean(openPunch)
  const done = Boolean(todayRecord?.timeOut)

  // The shift bounds are the earliest start and the latest end: several jobs in
  // one day are one shift, clocked in for at the first and out after the last.
  const shiftStart = todayJobs[0]?.startTime ?? null
  const shiftEnd = todayJobs.reduce<Date | null>(
    (latest, job) => (!latest || job.endTime > latest ? job.endTime : latest),
    null
  )

  const scheduleOptional = canPunchWithoutSchedule(employee.role)
  const canPunchToday = todayJobs.length > 0 || scheduleOptional

  const cutoff = cutoffSpans.reduce(
    (totals, span) => {
      const minutes = workedMinutes(span.timeIn, span.timeOut)
      return {
        days: totals.days + 1,
        minutes: totals.minutes + (minutes ?? 0),
        overtimeHours:
          totals.overtimeHours +
          (span.overtime?.status === "APPROVED"
            ? Number(span.overtime.approvedHours ?? span.overtime.hours)
            : 0),
        pendingOvertime:
          totals.pendingOvertime + (span.overtime?.status === "PENDING" ? 1 : 0),
      }
    },
    { days: 0, minutes: 0, overtimeHours: 0, pendingOvertime: 0 }
  )

  const balance = fundBalance(
    Number(releasedTotal._sum.amount ?? 0),
    Number(liquidatedTotal._sum.totalAmount ?? 0)
  )

  return (
    <div className="flex flex-col gap-4">
      {/* --------------------------------------------------------------
          Today. The one card that has to be readable at arm's length in
          a van, so it carries the status and the action and nothing else.
      -------------------------------------------------------------- */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-sidebar to-[color-mix(in_oklab,var(--sidebar)_80%,var(--brand))] text-sidebar-foreground ring-1 ring-foreground/10">
        <div className="p-5">
          <p className="text-xs font-medium tracking-widest text-sidebar-foreground/60 uppercase">
            {done ? "Done for the day" : working ? "On the clock" : "Today"}
          </p>

          {working && punch ? (
            <>
              <p className="mt-2 text-3xl leading-none font-semibold">
                Since {clockTime(punch.timeIn)}
              </p>
              <p className="mt-2 text-sm text-sidebar-foreground/70">
                {shiftEnd
                  ? `Shift ends ${clockTime(shiftEnd)}`
                  : "No scheduled end — time out when you finish."}
              </p>
            </>
          ) : done && todayRecord ? (
            <>
              <p className="mt-2 text-3xl leading-none font-semibold tabular-nums">
                {durationLabel(
                  todayRecord.timeIn.toISOString(),
                  todayRecord.timeOut!.toISOString()
                )}
              </p>
              <p className="mt-2 text-sm text-sidebar-foreground/70">
                {clockTime(todayRecord.timeIn)} —{" "}
                {clockTime(todayRecord.timeOut!)}
              </p>
            </>
          ) : shiftStart && shiftEnd ? (
            <>
              <p className="mt-2 text-2xl leading-tight font-semibold">
                {clockTime(shiftStart)} — {clockTime(shiftEnd)}
              </p>
              <p className="mt-1 text-sm text-sidebar-foreground/70">
                {todayJobs.length} {todayJobs.length === 1 ? "job" : "jobs"}{" "}
                today
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-xl font-medium">No shift scheduled</p>
              {scheduleOptional && (
                <p className="mt-1 text-sm text-sidebar-foreground/70">
                  Office hours — time in when you start.
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-white/10 bg-black/15 p-4">
          {done ? (
            <Button
              size="lg"
              variant="ghost"
              nativeButton={false}
              className="h-11 w-full text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
              render={
                <Link href="/employee/attendance">
                  View today
                  <ArrowRight />
                </Link>
              }
            />
          ) : canPunchToday ? (
            // The punch itself lives on the attendance page, which owns the
            // camera and the GPS fix. This is the way in, not a second copy.
            <Button
              size="lg"
              nativeButton={false}
              className="h-12 w-full bg-brand text-brand-foreground hover:bg-brand-strong"
              render={
                <Link href="/employee/attendance">
                  {working ? <LogOut /> : <LogIn />}
                  {working ? "Time out" : "Time in"}
                </Link>
              }
            />
          ) : (
            <p className="flex items-start gap-2 text-xs text-sidebar-foreground/70">
              <CalendarX2 className="mt-0.5 size-3.5 shrink-0" />
              You can only time in on a day the office has scheduled you.
              Contact them if today should have a shift.
            </p>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------------
          Where today's work is. Only rendered when there is some — an
          empty card saying "no jobs" is a row of nothing to scroll past.
      -------------------------------------------------------------- */}
      {todayJobs.length > 0 && (
        <section className="rounded-2xl border p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Today&apos;s jobs
          </p>
          <ul className="mt-3 flex flex-col divide-y">
            {todayJobs.map((job) => (
              <li key={job.id} className="flex items-baseline gap-2.5 py-2.5">
                <MapPin className="size-3.5 shrink-0 translate-y-0.5 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {job.client.name}
                  </span>
                  {job.branch && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {job.branch.name}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatTimeRange(
                    job.startTime.toISOString(),
                    job.endTime.toISOString()
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --------------------------------------------------------------
          What's next, so tomorrow's start time doesn't need a phone call.
      -------------------------------------------------------------- */}
      <section className="rounded-2xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4 text-muted-foreground" />
            Coming up
          </p>
          <Link
            href="/employee/schedule"
            className="shrink-0 text-xs font-medium text-brand hover:underline"
          >
            Full schedule
          </Link>
        </div>

        {upcomingJobs.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Nothing scheduled yet. The office will assign your next job here.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y">
            {upcomingJobs.map((job) => (
              <li key={job.id} className="flex items-baseline gap-2.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {job.client.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {job.branch ? `${job.branch.name} · ` : ""}
                    {formatTimeRange(
                      job.startTime.toISOString(),
                      job.endTime.toISOString()
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium tabular-nums">
                  {dayLabel(job.date.toISOString())}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------------------
          The two running totals worth knowing without asking the office:
          what this pay period is worth so far, and what's left of the fund.
      -------------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/employee/attendance"
          className="flex flex-col rounded-2xl border p-4 transition-colors hover:bg-muted/50"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <Timer className="size-4 text-muted-foreground" />
            This cutoff
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {decimalHours(cutoff.minutes)}h
          </p>
          {/* The big figure is decimal because that is the shape payroll adds
              up; this says the same span the way a person counts it. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {minutesLabel(cutoff.minutes)} over {cutoff.days}{" "}
            {cutoff.days === 1 ? "day" : "days"}
            {cutoff.overtimeHours > 0 && ` · +${cutoff.overtimeHours}h OT`}
          </p>
          <p className="mt-2 text-[0.6875rem] text-muted-foreground/80">
            {cutoffLabel(periodStart, periodEnd)}
          </p>
        </Link>

        <Link
          href="/employee/reimbursements"
          className="flex flex-col rounded-2xl border p-4 transition-colors hover:bg-muted/50"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <Wallet className="size-4 text-muted-foreground" />
            Fund on hand
          </p>
          <p
            className={
              // A negative balance means they have spent past what was
              // released and are owed — it should not read as an ordinary
              // figure.
              balance < 0
                ? "mt-2 text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400"
                : "mt-2 text-2xl font-semibold tabular-nums"
            }
          >
            {peso(balance)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {balance < 0
              ? "Spent past your fund — the office owes this back."
              : "Released, less what you've accounted for."}
          </p>
        </Link>
      </div>

      {/* --------------------------------------------------------------
          Outstanding paperwork. Only appears when something is actually
          waiting — a permanent "0 pending" tile teaches people to ignore it.
      -------------------------------------------------------------- */}
      {(pendingClaims > 0 || cutoff.pendingOvertime > 0) && (
        <section className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
            Awaiting review
          </p>
          {pendingClaims > 0 && (
            <Link
              href="/employee/reimbursements"
              className="flex items-center gap-2 text-sm hover:underline"
            >
              <Receipt className="size-4 shrink-0 text-muted-foreground" />
              {pendingClaims}{" "}
              {pendingClaims === 1 ? "liquidation" : "liquidations"} with the
              office
              <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          )}
          {cutoff.pendingOvertime > 0 && (
            <Link
              href="/employee/attendance"
              className="flex items-center gap-2 text-sm hover:underline"
            >
              <Timer className="size-4 shrink-0 text-muted-foreground" />
              {cutoff.pendingOvertime} overtime{" "}
              {cutoff.pendingOvertime === 1 ? "request" : "requests"} pending
              <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          )}
        </section>
      )}
    </div>
  )
}
