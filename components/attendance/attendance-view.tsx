"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
  CalendarX2,
  Clock,
  FileText,
  LogIn,
  LogOut,
  MapPin,
  Timer,
} from "lucide-react"
import {
  clockTime,
  dayLabel,
  dayOffset,
  durationLabel,
  overtimeGate,
  OVERTIME_WINDOW_MINUTES,
  grantedOvertimeHours,
  shiftEndFor,
  shiftEndWithOvertime,
} from "@/lib/attendance"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// Two dialogs, not one with a flag: timing out carries the report flow and its
// three steps, and timing in should not download any of that.
const PunchDialog = dynamic(() =>
  import("@/components/attendance/punch-dialog").then((m) => m.PunchDialog)
)
const TimeOutDialog = dynamic(() =>
  import("@/components/attendance/time-out-dialog").then((m) => m.TimeOutDialog)
)
const OvertimeDialog = dynamic(() =>
  import("@/components/attendance/overtime-dialog").then(
    (m) => m.OvertimeDialog
  )
)

export type ShiftJob = {
  clientName: string
  branchName: string | null
  startTime: string
  endTime: string
}

export type TodayShift = {
  startsAt: string
  endsAt: string
  jobs: ShiftJob[]
}

export type TodayPunch = {
  timeIn: string
  timeOut: string | null
  /** How many reports were filed with the time out. */
  reportCount: number
  hasNote: boolean
  overtime: {
    /** What was asked for. */
    hours: number
    /** What was granted, when that differs from what was asked. */
    approvedHours: number | null
    status: string
  } | null
}

export type AttendanceDay = {
  id: string
  date: string
  timeIn: string
  timeOut: string | null
  reportCount: number
  overtimeHours: number | null
  overtimeStatus: string | null
}

const OVERTIME_CHIP: Record<string, string> = {
  PENDING: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
  APPROVED: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  REJECTED: "bg-rose-600/10 text-rose-700 dark:text-rose-400",
}

/**
 * What happened to the request, in the employee's own terms.
 *
 * The reduction is the case that has to be spelled out. An approval for fewer
 * hours than were asked for used to show the requested figure beside an
 * "Approved" chip, so someone who asked for four and was granted one read it
 * as four approved — and only found out at payday. The two numbers are named
 * together, in the same sentence, whenever they differ.
 */
function overtimeSummary(overtime: NonNullable<TodayPunch["overtime"]>) {
  if (overtime.status === "REJECTED") {
    return `Your ${overtime.hours}h request was turned down.`
  }

  if (overtime.status === "APPROVED") {
    return overtime.approvedHours == null
      ? `Approved for ${overtime.hours}h.`
      : `Approved for ${overtime.approvedHours}h of the ${overtime.hours}h you asked for.`
  }

  return `You asked for ${overtime.hours}h. Waiting on the office.`
}

export function AttendanceView({
  shift,
  punch,
  history,
  scheduleOptional = false,
}: {
  shift: TodayShift | null
  punch: TodayPunch | null
  history: AttendanceDay[]
  /**
   * Whether this person may time in on a day with nothing scheduled — true for
   * admin-side staff, who work office hours nobody dispatches. The server
   * decides the same thing from the same rule (canPunchWithoutSchedule); this
   * only keeps the button from offering something that would be refused.
   */
  scheduleOptional?: boolean
}) {
  // Which punch dialog is open, rather than whether one is — and it is chosen
  // when the button is pressed, not re-derived on every render.
  //
  // Deriving it from `working` meant timing in swapped the dialog underneath
  // itself: saving the punch revalidates the page, `working` turns true, and
  // that render replaced the time-in dialog with the time-out one. The time-in
  // dialog closes itself in an effect, and effects don't run for a component
  // that has already been unmounted — so nothing ever closed it and the
  // employee was left staring at a Time out screen they hadn't asked for.
  const [punchMode, setPunchMode] = useState<"in" | "out" | null>(null)
  const [overtimeOpen, setOvertimeOpen] = useState(false)

  // The overtime window opens on a clock, not on a page load. Without a tick the
  // button an employee is staring at would stay disabled until they thought to
  // refresh — at exactly the moment they need it.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const working = Boolean(punch && !punch.timeOut)
  const done = Boolean(punch?.timeOut)

  // When this shift ends: the roster if there is one, otherwise the nine hours
  // implied by the punch, and then however much overtime the office granted.
  // Admin-side staff work office hours nobody schedules, and without the
  // implied day their overtime button could never open.
  //
  // The granted hours matter here as much as the roster does. Three hours
  // approved on an 11:00–17:00 shift means the day ends at 20:00 — that is
  // when the punch will be stamped if it is abandoned, so it is what this card
  // has to say. Showing 17:00 to somebody approved until 20:00 is the card
  // contradicting the sweep.
  const scheduledEnd = shift?.endsAt ?? null
  const timedInAt = punch?.timeIn ?? null
  const granted = grantedOvertimeHours(punch?.overtime)
  const shiftEndsAt = useMemo(() => {
    const scheduled = scheduledEnd ? new Date(scheduledEnd) : null
    const rostered = timedInAt
      ? shiftEndFor(new Date(timedInAt), scheduled)
      : scheduled
    return rostered ? shiftEndWithOvertime(rostered, granted) : null
  }, [scheduledEnd, timedInAt, granted])

  const gate = useMemo(
    () =>
      overtimeGate({
        shiftEndsAt,
        now: new Date(now),
        isWorking: working,
        alreadyRequested: Boolean(punch?.overtime),
      }),
    [shiftEndsAt, now, working, punch]
  )

  return (
    <div className="flex flex-col gap-4">
      {/* --------------------------------------------------------------
          Today. One card that answers "am I on the clock, and until when".
      -------------------------------------------------------------- */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-sidebar to-[color-mix(in_oklab,var(--sidebar)_80%,var(--brand))] text-sidebar-foreground ring-1 ring-foreground/10">
        <div className="p-5">
          <p className="text-xs font-medium tracking-widest text-sidebar-foreground/60 uppercase">
            {done ? "Done for the day" : working ? "On the clock" : "Today"}
          </p>

          {working && punch ? (
            <>
              <p className="mt-2 text-4xl leading-none font-semibold tabular-nums">
                {durationLabel(punch.timeIn, null)}
              </p>
              <p className="mt-2 text-sm text-sidebar-foreground/70">
                Since {clockTime(punch.timeIn)}
                {/* Said for an implied shift too. Someone working office hours
                    nobody scheduled is still closed automatically an hour
                    after this, and finding that out from a payslip is too
                    late. */}
                {shiftEndsAt &&
                  ` · shift ends ${clockTime(shiftEndsAt.toISOString())}`}
              </p>
            </>
          ) : done && punch ? (
            <>
              <p className="mt-2 text-4xl leading-none font-semibold tabular-nums">
                {durationLabel(punch.timeIn, punch.timeOut)}
              </p>
              <p className="mt-2 text-sm text-sidebar-foreground/70">
                {clockTime(punch.timeIn)} — {clockTime(punch.timeOut!)}
                {dayOffset(punch.timeIn, punch.timeOut!) > 0 &&
                  ` (${dayLabel(punch.timeOut!)})`}
              </p>
            </>
          ) : shift ? (
            <>
              <p className="mt-2 text-2xl leading-tight font-semibold">
                {clockTime(shift.startsAt)} — {clockTime(shift.endsAt)}
              </p>
              <p className="mt-1 text-sm text-sidebar-foreground/70">
                {shift.jobs.length} {shift.jobs.length === 1 ? "job" : "jobs"}{" "}
                scheduled
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-medium">No shift scheduled</p>
              {scheduleOptional && (
                <p className="mt-1 text-sm text-sidebar-foreground/70">
                  Office hours — time in when you start.
                </p>
              )}
            </>
          )}

          {shift && (
            <ul className="mt-4 flex flex-col gap-1.5 border-t border-white/10 pt-3">
              {shift.jobs.map((job, index) => (
                <li
                  key={`${job.clientName}-${index}`}
                  className="flex items-baseline gap-2 text-xs"
                >
                  <MapPin className="size-3 shrink-0 text-sidebar-primary" />
                  <span className="min-w-0 flex-1 truncate">
                    {job.clientName}
                    {job.branchName && (
                      <span className="text-sidebar-foreground/50">
                        {" "}
                        · {job.branchName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-sidebar-foreground/60">
                    {clockTime(job.startTime)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-white/10 bg-black/15 p-4">
          {/* Done first: a shift cancelled after the punch shouldn't turn a
              finished day back into "you can't time in today". */}
          {done ? (
            <p className="text-center text-xs text-sidebar-foreground/70">
              Timed out at {clockTime(punch!.timeOut!)}
              {punch!.reportCount > 0 &&
                ` · ${punch!.reportCount} report${punch!.reportCount === 1 ? "" : "s"} filed`}
            </p>
          ) : !shift && !scheduleOptional ? (
            <p className="flex items-start gap-2 text-xs text-sidebar-foreground/70">
              <CalendarX2 className="mt-0.5 size-3.5 shrink-0" />
              You can only time in on a day the office has scheduled you.
              Contact them if today should have a shift.
            </p>
          ) : (
            <Button
              type="button"
              size="lg"
              onClick={() => setPunchMode(working ? "out" : "in")}
              className="h-12 w-full bg-brand text-brand-foreground hover:bg-brand-strong"
            >
              {working ? <LogOut /> : <LogIn />}
              {working ? "Time out" : "Time in"}
            </Button>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------------
          Overtime. The button only lives in the last hour of the shift, so
          the card explains where in that hour you are rather than sitting
          there greyed out with no reason given.
      -------------------------------------------------------------- */}
      <section className="rounded-2xl border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Timer className="size-4 text-muted-foreground" />
              Overtime
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {gate.state === "requested" && punch?.overtime
                ? overtimeSummary(punch.overtime)
                : gate.state === "open"
                  ? `The window closes in ${gate.minutesLeft} min, when your shift ends.`
                  : gate.state === "early"
                    ? `Opens ${clockTime(gate.opensAt)} — the last ${OVERTIME_WINDOW_MINUTES} minutes of your shift.`
                    : gate.state === "closed"
                      ? `The window closed at ${clockTime(gate.closedAt)}. Ask the office to record extra hours.`
                      : gate.state === "no-shift"
                        ? "There's no scheduled shift today to extend."
                        : "Time in first."}
            </p>
          </div>

          {punch?.overtime && (
            <Badge className={OVERTIME_CHIP[punch.overtime.status]}>
              {punch.overtime.status === "PENDING"
                ? "Awaiting review"
                : punch.overtime.status === "APPROVED"
                  ? "Approved"
                  : "Rejected"}
            </Badge>
          )}
        </div>

        {gate.state !== "requested" && (
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            disabled={gate.state !== "open"}
            onClick={() => setOvertimeOpen(true)}
          >
            Request overtime
          </Button>
        )}
      </section>

      {/* -------------------------------------------------------------- */}
      <section>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Recent days
        </p>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
            Your timed days will appear here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border px-3">
            {history.map((day) => (
              <li key={day.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{dayLabel(day.date)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {clockTime(day.timeIn)} —{" "}
                      {day.timeOut ? clockTime(day.timeOut) : "still in"}
                    </span>
                    {/* A shift worked through midnight, so the times don't
                        read as running backwards. */}
                    {day.timeOut && dayOffset(day.timeIn, day.timeOut) > 0 && (
                      <span className="text-violet-700 dark:text-violet-400">
                        next day
                      </span>
                    )}
                    {day.reportCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="size-3" />
                        {day.reportCount}{" "}
                        {day.reportCount === 1 ? "report" : "reports"}
                      </span>
                    )}
                  </p>
                </div>

                {day.overtimeHours != null && (
                  <Badge
                    className={cn(
                      "shrink-0",
                      OVERTIME_CHIP[day.overtimeStatus ?? "PENDING"]
                    )}
                  >
                    +{day.overtimeHours}h
                  </Badge>
                )}

                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {day.timeOut ? (
                    durationLabel(day.timeIn, day.timeOut)
                  ) : (
                    <Clock className="size-4 text-muted-foreground" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Keyed off the mode the button chose, so a punch saving mid-dialog
          can't swap one of these for the other under the employee's hands. */}
      {punchMode === "out" && (
        <TimeOutDialog open onOpenChange={() => setPunchMode(null)} />
      )}
      {punchMode === "in" && (
        <PunchDialog open onOpenChange={() => setPunchMode(null)} />
      )}

      {overtimeOpen && shift && (
        <OvertimeDialog
          shiftEndsAt={shift.endsAt}
          open
          onOpenChange={setOvertimeOpen}
        />
      )}
    </div>
  )
}
