// ---------------------------------------------------------------------------
// Attendance rules
//
// Shared by the server actions and the phone UI, so the button an employee sees
// and the check that actually runs can't disagree about what the rules are.
// ---------------------------------------------------------------------------

import type { Role } from "@/app/generated/prisma/client"
import { isAdminSideRole } from "@/lib/auth/roles"
// The same two numbers payroll pays by, so an implied shift is the ordinary
// day and not a second opinion about how long one is.
import { HOURS_PER_DAY } from "@/lib/employee"
import { UNPAID_BREAK_HOURS } from "@/lib/payroll"

/**
 * Whether this person may punch on a day with nothing scheduled.
 *
 * A field employee's attendance is recorded against work the office assigned —
 * no shift means no punch, which is what keeps every punch answerable to a job.
 *
 * Admin-side staff aren't dispatched anywhere. They keep office hours that
 * nobody writes a schedule for, so the same rule would mean an Administrator
 * has to schedule themselves every morning before they're allowed to time in.
 * Their punch stands on its own; the day log doesn't measure hours against the
 * schedule anyway.
 */
export function canPunchWithoutSchedule(role: Role) {
  return isAdminSideRole(role)
}

// Overtime is asked for at the end of the shift it extends, not at the start of
// the day: an hour before knocking off, you know whether the job will overrun.
export const OVERTIME_WINDOW_MINUTES = 60

// A GPS fix vaguer than this is recorded but flagged. Phones indoors routinely
// report hundreds of metres, and a punch "at the site" accurate to 2km isn't
// evidence of anything.
export const COARSE_FIX_METRES = 200

export const MAX_OVERTIME_HOURS = 8

/**
 * The hours that actually count for an overtime request.
 *
 * `approvedHours` is only written when the office granted something other than
 * what was asked for, so null means "as requested" rather than "nothing" —
 * which makes `approvedHours ?? hours` the answer for every status, including
 * a request still waiting on a decision.
 *
 * This lives here, beside the other attendance rules, because both sides of
 * the app have to agree on it. It didn't: the admin screens had their own copy
 * and the employee's own attendance page had none, so a request for four hours
 * that was cut to one still read as "4h" to the person who filed it — approved,
 * apparently in full, for hours they were never going to be paid.
 */
export function grantedHours(overtime: {
  hours: number
  approvedHours: number | null
}) {
  return overtime.approvedHours ?? overtime.hours
}

/**
 * How long a punch may stay open before timing out is no longer plausible.
 *
 * A shift that runs past midnight is ordinary — 22:00 to 06:00 is one shift,
 * and the attendance row stays keyed to the day it *started*. So timing out
 * can't look for "today's row": at 6am that row doesn't exist and the person
 * standing there having worked all night is told they never timed in.
 *
 * Instead the open punch is found wherever it began, bounded by this. Past it,
 * the punch wasn't a long shift — it was one somebody forgot to close, and
 * silently stamping it now would write a thirty-hour day into payroll.
 */
export const MAX_SHIFT_HOURS = 18

/**
 * How long after a shift ends somebody still has to close their own punch.
 *
 * A crew finishing at 17:00 is packing a van, not looking at a phone, and the
 * handset they punch on is often in somebody else's pocket. An hour covers
 * that. Past it, the punch is not a long day — it is one nobody closed.
 */
export const AUTO_TIMEOUT_GRACE_MINUTES = 60

/**
 * When an abandoned punch gets closed, and what time goes on it.
 *
 * Two different instants, and the distinction is the whole design:
 *
 *   `closesAt` is *stamped* on the record — the end of the scheduled shift,
 *   plus whatever overtime the office actually approved. It is what the person
 *   was scheduled to work, and it does not move no matter when the sweep
 *   happens to run. That makes closing an abandoned punch idempotent: run it a
 *   minute after it falls due or three days later and the row reads the same.
 *
 *   `dueAt` is *when* the sweep may act — an hour later. Nothing is stamped
 *   during that hour, because the person may still be about to do it properly,
 *   with the selfie and the position that make a punch evidence.
 *
 * Deliberately not stamping the hour of grace: it is time to press a button,
 * not time at work, and paying it would hand an extra hour to everyone who
 * forgets. Staying late without approved overtime already pays nothing (see
 * lib/payroll.ts), and this keeps the two rules saying the same thing.
 */
export function autoTimeOut({
  shiftEndsAt,
  approvedOvertimeHours = 0,
}: {
  shiftEndsAt: Date
  /** Hours the office granted. Unapproved overtime does not extend anything. */
  approvedOvertimeHours?: number
}) {
  const closesAt = new Date(
    shiftEndsAt.getTime() + Math.max(0, approvedOvertimeHours) * 3_600_000
  )

  return {
    closesAt,
    dueAt: new Date(closesAt.getTime() + AUTO_TIMEOUT_GRACE_MINUTES * 60_000),
  }
}

/**
 * The day before which punch photographs are deleted.
 *
 * The first of *last* month: in September, July and everything older goes and
 * August is kept. So a photograph lives between 30 and 62 days — long enough
 * that both of its month's payroll cutoffs have been paid and had time to be
 * queried, and not a day longer.
 *
 * Expressed as "the start of the previous month" rather than "delete last month
 * on the 1st" on purpose: the answer is the same on any day of the month, so
 * the sweep can run whenever the app happens to be used and always does the
 * same thing. A rule that only works on the 1st is a rule that silently does
 * nothing if nobody opens the app that morning.
 *
 * Only the two selfies are affected. The punch — times, coordinates, accuracy —
 * and every report filed against it are kept: those are the record, the
 * photograph was only ever the proof that the person was standing there.
 */
export function photoRetentionCutoff(now: Date = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1)
}

/**
 * When a shift ends for somebody nobody scheduled.
 *
 * Admin-side staff punch without a roster — see `canPunchWithoutSchedule` —
 * which left them with no shift end at all. Nothing could work out when their
 * overtime window opened, so they could never request any, and nothing could
 * close an abandoned punch, so a forgotten time-out stayed open indefinitely
 * and the day paid nothing.
 *
 * So the clock they started is the roster. Nine hours from timing in: eight
 * paid and the unpaid break, exactly the ordinary day the rest of payroll is
 * built around. Overtime opens in the final hour of that, at the eight-hour
 * mark, the same rule a scheduled shift follows.
 */
export function impliedShiftEndsAt(timeIn: Date) {
  return new Date(
    timeIn.getTime() + (HOURS_PER_DAY + UNPAID_BREAK_HOURS) * 3_600_000
  )
}

/**
 * The end of the shift this punch belongs to.
 *
 * A scheduled end wins whenever there is one — an admin-side person assigned to
 * a job is on that job's hours like anyone else. Only when nobody wrote a shift
 * down does the punch imply its own.
 */
export function shiftEndFor(timeIn: Date, scheduledEndsAt: Date | null) {
  return scheduledEndsAt ?? impliedShiftEndsAt(timeIn)
}

export type OvertimeGate =
  /** No shift today, so there's nothing to extend. */
  | { state: "no-shift" }
  /** Too early — the window hasn't opened yet. */
  | { state: "early"; opensAt: string; minutesUntilOpen: number }
  /** Inside the last hour of the shift: the only time the button works. */
  | { state: "open"; closesAt: string; minutesLeft: number }
  /** The shift end has passed without a request. */
  | { state: "closed"; closedAt: string }
  /** Already asked for today. */
  | { state: "requested" }
  /** Not on the clock, or already off it. */
  | { state: "not-working" }

/**
 * The one rule: a request may only be filed inside the final
 * `OVERTIME_WINDOW_MINUTES` of the scheduled shift. Earlier than that and nobody
 * yet knows the job will overrun; later and the shift has already ended, which
 * is a correction for the office rather than a request.
 */
export function overtimeGate({
  shiftEndsAt,
  now = new Date(),
  isWorking,
  alreadyRequested,
}: {
  shiftEndsAt: Date | null
  now?: Date
  isWorking: boolean
  alreadyRequested: boolean
}): OvertimeGate {
  if (alreadyRequested) return { state: "requested" }
  if (!isWorking) return { state: "not-working" }
  if (!shiftEndsAt) return { state: "no-shift" }

  const opensAt = new Date(
    shiftEndsAt.getTime() - OVERTIME_WINDOW_MINUTES * 60_000
  )

  if (now < opensAt) {
    return {
      state: "early",
      opensAt: opensAt.toISOString(),
      minutesUntilOpen: Math.ceil((+opensAt - +now) / 60_000),
    }
  }

  if (now > shiftEndsAt) {
    return { state: "closed", closedAt: shiftEndsAt.toISOString() }
  }

  return {
    state: "open",
    closesAt: shiftEndsAt.toISOString(),
    minutesLeft: Math.max(0, Math.ceil((+shiftEndsAt - +now) / 60_000)),
  }
}

// Local midnight, which is what an attendance row is keyed by. A shift that
// starts at 22:00 still belongs to the day it started on.
export function attendanceDay(value: Date) {
  const day = new Date(value)
  day.setHours(0, 0, 0, 0)
  return day
}

export function clockTime(iso: string | Date) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * "8h 12m". How the office reads a shift.
 *
 * Not how payroll reads it — payroll takes whole hours only and caps the day
 * at eight, which is `paidRegularHours` in lib/employee. Neither this nor
 * `decimalHours` below is a payable figure, so neither belongs under a label
 * that says one is.
 */
export function minutesLabel(minutes: number) {
  const whole = Math.max(0, Math.round(minutes))
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (hours === 0) return `${rest}m`
  return `${hours}h ${rest}m`
}

/** "8h 12m" — worked time, or the elapsed time so far if still on the clock. */
export function durationLabel(fromIso: string, toIso: string | null) {
  return minutesLabel(
    ((toIso ? +new Date(toIso) : Date.now()) - +new Date(fromIso)) / 60_000
  )
}

/**
 * Time on the clock, in whole minutes — or null while the day is still open.
 * A shift that was never timed out has no length, and guessing one (shift end?
 * midnight?) would quietly invent hours nobody worked. The office is shown the
 * gap instead and corrects it.
 */
export function workedMinutes(
  timeIn: string | Date,
  timeOut: string | Date | null
) {
  if (!timeOut) return null
  return Math.max(0, Math.round((+new Date(timeOut) - +new Date(timeIn)) / 60_000))
}

/** The same span as a decimal, which is the shape payroll adds up. */
export function decimalHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100
}

/**
 * Calendar days between two punches — 0 for an ordinary shift, 1 when the time
 * out landed after midnight. Both timestamps are absolute, so the *duration*
 * was never in doubt; this is only so the display can say "06:00 +1d" instead
 * of showing 22:00 → 06:00 as though it were an eight-hour trip backwards.
 */
export function dayOffset(from: string | Date, to: string | Date) {
  return Math.round(
    (+attendanceDay(new Date(to)) - +attendanceDay(new Date(from))) / 86_400_000
  )
}

// ---------------------------------------------------------------------------
// Days as URL parameters
//
// Attendance is keyed by local midnight, so the day in a link has to be read
// back in local time too. `new Date("2026-08-11")` parses as UTC and lands on
// the 10th anywhere west of Greenwich — hence the explicit construction.
// ---------------------------------------------------------------------------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

export function dayParam(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${value.getFullYear()}-${month}-${day}`
}

export function parseDayParam(
  raw: string | string[] | undefined,
  fallback: Date
) {
  const value = Array.isArray(raw) ? raw[0] : raw
  const match = value?.match(DATE_ONLY)
  if (!match) return attendanceDay(fallback)

  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  )
  return Number.isNaN(+parsed) ? attendanceDay(fallback) : attendanceDay(parsed)
}

/** Exclusive upper bound for a day, for `date: { gte: day, lt: nextDay(day) }`. */
export function nextDay(value: Date) {
  const next = new Date(value)
  next.setDate(next.getDate() + 1)
  return next
}

export function dayLabel(value: string | Date, withYear = false) {
  // A bare "2026-08-11" is parsed as UTC midnight by the Date constructor, which
  // prints as the 10th anywhere west of Greenwich. Route those through the same
  // local-midnight construction the URLs use; full timestamps are already
  // unambiguous.
  const date =
    typeof value === "string" && DATE_ONLY.test(value)
      ? parseDayParam(value, new Date())
      : new Date(value)

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  })
}

// ---------------------------------------------------------------------------
// Payroll cutoffs
// ---------------------------------------------------------------------------
//
// Pay here runs twice a month: the 1st–15th, then the 16th to whatever the last
// day of the month happens to be. Attendance is read a cutoff at a time because
// that is the unit it gets checked in — an arbitrary fifteen *rows* straddles
// two pay periods and makes the one question anybody asks of this screen ("what
// do we pay them for this cutoff") impossible to answer without a calculator.

/** Local midnight on the 1st or the 16th, whichever cutoff the day falls in. */
export function cutoffStart(value: Date) {
  const day = attendanceDay(value)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() <= 15 ? 1 : 16)
}

/** The 15th, or the last day of the month — day 0 of the next one. */
export function cutoffEnd(value: Date) {
  const day = attendanceDay(value)
  return day.getDate() <= 15
    ? new Date(day.getFullYear(), day.getMonth(), 15)
    : new Date(day.getFullYear(), day.getMonth() + 1, 0)
}

/**
 * "Aug 1 – 15, 2026". Both ends sit in one month by construction, so only the
 * opening date carries it.
 *
 * The closing day and year are written out rather than formatted: asking
 * `toLocaleDateString` for a day and a year with no month gives back
 * "2026 (day: 15)" under ICU, which is correct and unreadable.
 */
export function cutoffLabel(start: string | Date, end: string | Date) {
  const from = new Date(start)
  const to = new Date(end)

  const opening = from.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })

  return `${opening} – ${to.getDate()}, ${to.getFullYear()}`
}

/** Coordinates to something a person can read back over the phone. */
export function coordinateLabel(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

export function mapsLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
}
