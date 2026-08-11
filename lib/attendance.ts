// ---------------------------------------------------------------------------
// Attendance rules
//
// Shared by the server actions and the phone UI, so the button an employee sees
// and the check that actually runs can't disagree about what the rules are.
// ---------------------------------------------------------------------------

// Overtime is asked for at the end of the shift it extends, not at the start of
// the day: an hour before knocking off, you know whether the job will overrun.
export const OVERTIME_WINDOW_MINUTES = 60

// A GPS fix vaguer than this is recorded but flagged. Phones indoors routinely
// report hundreds of metres, and a punch "at the site" accurate to 2km isn't
// evidence of anything.
export const COARSE_FIX_METRES = 200

export const MAX_OVERTIME_HOURS = 8

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

/** "8h 12m". The office reads shifts this way; payroll reads decimalHours. */
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

/** Coordinates to something a person can read back over the phone. */
export function coordinateLabel(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

export function mapsLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
}
