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

/** "8h 12m" — worked time, or the elapsed time so far if still on the clock. */
export function durationLabel(fromIso: string, toIso: string | null) {
  const minutes = Math.max(
    0,
    Math.round(
      ((toIso ? +new Date(toIso) : Date.now()) - +new Date(fromIso)) / 60_000
    )
  )
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return `${hours}h ${rest}m`
}

/** Coordinates to something a person can read back over the phone. */
export function coordinateLabel(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

export function mapsLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
}
