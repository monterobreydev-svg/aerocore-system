import { dateKey } from "@/lib/schedule"

// ---------------------------------------------------------------------------
// Philippine holidays
// ---------------------------------------------------------------------------
//
// Two kinds, and the difference is money.
//
//   REGULAR   200% of the daily rate for the first eight hours if worked, and
//             a full day's pay if *not* worked — provided the person was
//             present on the workday before it.
//   SPECIAL   A special non-working day. 130% if worked, and nothing at all if
//             not: "no work, no pay" applies, which is why an unworked one
//             never reaches a payslip.
//
// That makes both a scheduling fact rather than a decoration — the office needs
// to see them *before* it puts someone on a job, and the person being scheduled
// needs to know why that Friday pays double and that Saturday does not.
//
// Computed rather than stored. These dates are fixed in law (RA 9492 as
// amended, RA 9256, RA 10966) or derived from Easter, so a table in the
// database would be a table somebody has to remember to fill in every December,
// and an empty one fails silently.
//
// What this deliberately does not know:
//
//   - Eid'l Fitr and Eid'l Adha. Both are regular holidays, but their dates
//     follow the Islamic calendar and are fixed by proclamation after the moon
//     is sighted — there is no formula, and guessing one would put a
//     double-pay badge on the wrong day.
//   - Chinese New Year, the EDSA anniversary, All Souls' Day and Christmas
//     Eve. Each has been a special non-working day in some years and not in
//     others, at the discretion of the annual proclamation. A day that is only
//     sometimes a holiday is worse than no badge at all.
//
// So this is the statutory set, and an annual proclamation can still add to it
// or move a date. It is a strong hint on a calendar, not a payroll authority.

/**
 * Which kind of holiday, because the two are paid differently.
 *
 * Carried on every holiday rather than inferred from the name: a screen that
 * has to keep a list of which names are special is a screen that will be wrong
 * the first time the list changes.
 */
export type HolidayKind = "REGULAR" | "SPECIAL"

export type Holiday = {
  /** "2026-12-25", local parts, matching `dateKey`. */
  date: string
  name: string
  kind: HolidayKind
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm.
 *
 * Holy Week is two of the ten regular holidays and it moves every year, so the
 * alternative to computing it is a hand-maintained list that goes stale.
 */
function easterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return new Date(year, month - 1, day)
}

function shift(from: Date, days: number) {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return d
}

/** National Heroes Day: the last Monday of August, whenever that falls. */
function lastMondayOfAugust(year: number) {
  const d = new Date(year, 7, 31)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

function holidaysIn(year: number): Holiday[] {
  const easter = easterSunday(year)
  const regular = (date: Date, name: string): Holiday => ({
    date: dateKey(date),
    name,
    kind: "REGULAR",
  })
  const special = (date: Date, name: string): Holiday => ({
    date: dateKey(date),
    name,
    kind: "SPECIAL",
  })

  return [
    regular(new Date(year, 0, 1), "New Year's Day"),
    regular(new Date(year, 3, 9), "Araw ng Kagitingan"),
    regular(shift(easter, -3), "Maundy Thursday"),
    regular(shift(easter, -2), "Good Friday"),
    regular(new Date(year, 4, 1), "Labor Day"),
    regular(new Date(year, 5, 12), "Independence Day"),
    regular(lastMondayOfAugust(year), "National Heroes Day"),
    regular(new Date(year, 10, 30), "Bonifacio Day"),
    regular(new Date(year, 11, 25), "Christmas Day"),
    regular(new Date(year, 11, 30), "Rizal Day"),

    // Special non-working days. Only the ones fixed in law or tied to Easter —
    // see the note at the top for the ones left out and why.
    special(shift(easter, -1), "Black Saturday"),
    special(new Date(year, 7, 21), "Ninoy Aquino Day"),
    special(new Date(year, 10, 1), "All Saints' Day"),
    special(new Date(year, 11, 8), "Immaculate Conception"),
    special(new Date(year, 11, 31), "Last Day of the Year"),
  ]
}

// A calendar asks this once per cell — forty-two times per month view, and
// again on every re-render — so each year is worked out once and kept. Fifteen
// entries a year; a decade of browsing costs a hundred and fifty.
const byYear = new Map<number, Map<string, Holiday>>()

function indexFor(year: number) {
  let index = byYear.get(year)
  if (!index) {
    index = new Map<string, Holiday>()
    for (const holiday of holidaysIn(year)) {
      // Two can land on one day — 9 April 2020 was Araw ng Kagitingan *and*
      // Maundy Thursday — and building the index straight from a Map would
      // quietly keep whichever came last. Both names, one day, one day's pay.
      const already = index.get(holiday.date)
      if (!already) {
        index.set(holiday.date, holiday)
        continue
      }
      index.set(holiday.date, {
        ...already,
        name: `${already.name} & ${holiday.name}`,
        // The better-paid kind wins the day. A special non-working day that
        // collides with a regular holiday is paid as the regular one — so a
        // cell showing the lesser badge would understate what the day is worth.
        kind:
          already.kind === "REGULAR" || holiday.kind === "REGULAR"
            ? "REGULAR"
            : "SPECIAL",
      })
    }
    byYear.set(year, index)
  }
  return index
}

/** The holiday on this day, or null. */
export function holidayOn(day: Date): Holiday | null {
  return indexFor(day.getFullYear()).get(dateKey(day)) ?? null
}

// ---------------------------------------------------------------------------
// How a holiday looks, and what it says
// ---------------------------------------------------------------------------
//
// Kept here so the month grid, the week grid, the employee calendar and the
// kiosk can't drift apart — and keyed by kind, so a screen renders the right
// one by asking rather than by remembering.
//
// Red for regular, amber for special. Red is what a holiday is on every wall
// calendar in the country and the meaning needs no legend; amber is the same
// warm family a step down, which is exactly the relationship between the two —
// a special day is a lesser holiday, not a different kind of thing. Neither
// collides with the work types, which run indigo, orange, sky, teal, violet,
// lime and rose.
//
// Deliberately *not* a filled chip. The name sits beside the date as coloured
// text, because a pill in a calendar cell reads as something scheduled — which
// a holiday isn't. The cell wash carries the signal; the words just say which.

export type HolidayStyle = {
  /** Whole-cell wash. */
  cell: string
  /** The same wash dimmed, for days spilling in from the neighbouring month. */
  cellMuted: string
  /** The date number and the holiday's name, which share one colour and row. */
  text: string
  /** The employee-side note, where the rate is spelled out. */
  note: string
  /** An inset ring, for squares too small to wash without losing the date. */
  ring: string
  /** A solid dot, for the key above the grid. */
  dot: string
  /** What the day is, in the office's words. */
  label: string
  /** What working it is worth. */
  payNote: string
}

export const HOLIDAY_STYLE: Record<HolidayKind, HolidayStyle> = {
  REGULAR: {
    cell: "bg-red-50 dark:bg-red-500/10",
    cellMuted: "bg-red-50/60 dark:bg-red-500/5",
    text: "text-red-600 dark:text-red-400",
    note: "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400",
    ring: "ring-red-500/40",
    dot: "bg-red-500",
    label: "Regular holiday",
    payNote: "Double pay if worked",
  },
  SPECIAL: {
    cell: "bg-amber-50 dark:bg-amber-500/10",
    cellMuted: "bg-amber-50/60 dark:bg-amber-500/5",
    text: "text-amber-600 dark:text-amber-400",
    note: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    ring: "ring-amber-500/40",
    dot: "bg-amber-500",
    label: "Special non-working day",
    payNote: "+30% if worked",
  },
}

/** The styling for a day, or null styling for an ordinary one. */
export function holidayStyle(holiday: Holiday | null) {
  return holiday ? HOLIDAY_STYLE[holiday.kind] : null
}
