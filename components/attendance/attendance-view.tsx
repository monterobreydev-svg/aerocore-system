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
  durationLabel,
  overtimeGate,
  OVERTIME_WINDOW_MINUTES,
} from "@/lib/attendance"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const PunchDialog = dynamic(() =>
  import("@/components/attendance/punch-dialog").then((m) => m.PunchDialog)
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
  hasReport: boolean
  overtime: { hours: number; status: string } | null
}

export type AttendanceDay = {
  id: string
  date: string
  timeIn: string
  timeOut: string | null
  hasReport: boolean
  overtimeHours: number | null
  overtimeStatus: string | null
}

const OVERTIME_CHIP: Record<string, string> = {
  PENDING: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
  APPROVED: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  REJECTED: "bg-rose-600/10 text-rose-700 dark:text-rose-400",
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function AttendanceView({
  shift,
  punch,
  history,
}: {
  shift: TodayShift | null
  punch: TodayPunch | null
  history: AttendanceDay[]
}) {
  const [punchOpen, setPunchOpen] = useState(false)
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

  const gate = useMemo(
    () =>
      overtimeGate({
        shiftEndsAt: shift ? new Date(shift.endsAt) : null,
        now: new Date(now),
        isWorking: working,
        alreadyRequested: Boolean(punch?.overtime),
      }),
    [shift, now, working, punch]
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
                {shift && ` · shift ends ${clockTime(shift.endsAt)}`}
              </p>
            </>
          ) : done && punch ? (
            <>
              <p className="mt-2 text-4xl leading-none font-semibold tabular-nums">
                {durationLabel(punch.timeIn, punch.timeOut)}
              </p>
              <p className="mt-2 text-sm text-sidebar-foreground/70">
                {clockTime(punch.timeIn)} — {clockTime(punch.timeOut!)}
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
            <p className="mt-2 text-lg font-medium">No shift scheduled</p>
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
          {!shift ? (
            <p className="flex items-start gap-2 text-xs text-sidebar-foreground/70">
              <CalendarX2 className="mt-0.5 size-3.5 shrink-0" />
              You can only time in on a day the office has scheduled you.
              Contact them if today should have a shift.
            </p>
          ) : done ? (
            <p className="text-center text-xs text-sidebar-foreground/70">
              Timed out at {clockTime(punch!.timeOut!)}
              {punch?.hasReport && " · report attached"}
            </p>
          ) : (
            <Button
              type="button"
              size="lg"
              onClick={() => setPunchOpen(true)}
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
                ? `You asked for ${punch.overtime.hours}h.`
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
                    {day.hasReport && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="size-3" />
                        report
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

      {punchOpen && (
        <PunchDialog
          kind={working ? "time-out" : "time-in"}
          open
          onOpenChange={setPunchOpen}
        />
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
