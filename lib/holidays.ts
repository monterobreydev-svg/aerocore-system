import { dateKey } from "@/lib/schedule"

// ---------------------------------------------------------------------------
// Philippine regular holidays
// ---------------------------------------------------------------------------
//
// A regular holiday is the one kind of day where working changes what the day
// is worth: 200% of the daily rate for the first eight hours, against 130% on a
// special non-working day. That makes it a scheduling fact, not a decoration —
// the office needs to see it *before* it puts someone on a job, and the person
// being scheduled needs to know why that Friday pays double.
//
// Computed rather than stored. These dates are fixed in law (RA 9492 as
// amended) or derived from Easter, so a table in the database would be a table
// somebody has to remember to fill in every December, and an empty one fails
// silently.
//
// Two things this deliberately does not know:
//
//   - Eid'l Fitr and Eid'l Adha. Both are regular holidays, but their dates
//     follow the Islamic calendar and are fixed by proclamation after the moon
//     is sighted — there is no formula, and guessing one would put a
//     double-pay badge on the wrong day.
//   - Special non-working days (Ninoy Aquino Day, All Saints' Day, the
//     Christmas–New Year bridges). They pay 130%, not 200%, and the annual
//     proclamation moves them around.
//
// So this is the statutory set, and an annual proclamation can still shift a
// date. It is a strong hint on a calendar, not a payroll authority.

export type Holiday = {
  /** "2026-12-25", local parts, matching `dateKey`. */
  date: string
  name: string
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

function regularHolidays(year: number): Holiday[] {
  const easter = easterSunday(year)

  return [
    { date: dateKey(new Date(year, 0, 1)), name: "New Year's Day" },
    { date: dateKey(new Date(year, 3, 9)), name: "Araw ng Kagitingan" },
    { date: dateKey(shift(easter, -3)), name: "Maundy Thursday" },
    { date: dateKey(shift(easter, -2)), name: "Good Friday" },
    { date: dateKey(new Date(year, 4, 1)), name: "Labor Day" },
    { date: dateKey(new Date(year, 5, 12)), name: "Independence Day" },
    { date: dateKey(lastMondayOfAugust(year)), name: "National Heroes Day" },
    { date: dateKey(new Date(year, 10, 30)), name: "Bonifacio Day" },
    { date: dateKey(new Date(year, 11, 25)), name: "Christmas Day" },
    { date: dateKey(new Date(year, 11, 30)), name: "Rizal Day" },
  ]
}

// A calendar asks this once per cell — forty-two times per month view, and
// again on every re-render — so each year is worked out once and kept. Ten
// entries a year; a decade of browsing costs a hundred strings.
const byYear = new Map<number, Map<string, string>>()

function indexFor(year: number) {
  let index = byYear.get(year)
  if (!index) {
    index = new Map<string, string>()
    for (const { date, name } of regularHolidays(year)) {
      // Two can land on one day — 9 April 2020 was Araw ng Kagitingan *and*
      // Maundy Thursday — and building the index straight from a Map would
      // quietly keep whichever came last. Both names, one day, one day's pay.
      const already = index.get(date)
      index.set(date, already ? `${already} & ${name}` : name)
    }
    byYear.set(year, index)
  }
  return index
}

/** The regular holiday on this day, or null. Names only — the rate is fixed. */
export function holidayOn(day: Date): string | null {
  return indexFor(day.getFullYear()).get(dateKey(day)) ?? null
}

/** What working a regular holiday is worth, for the one line that says so. */
export const HOLIDAY_PAY_NOTE = "Double pay if worked"

// The holiday's colour, kept here so the month grid, the week grid and the
// employee calendar can't drift apart.
//
// Red, because that is what a holiday is on every wall calendar in the country
// and the meaning needs no legend. Nothing else on this screen is red: the
// seven work types run indigo, orange, sky, teal, violet, lime and rose, so a
// red day can't be mistaken for a job.
//
// Deliberately *not* a filled chip. The name sits beside the date as coloured
// text, because a pill in a calendar cell reads as something scheduled — which
// a holiday isn't. The cell wash carries the signal; the words just say which.

/** Whole-cell wash for a holiday. */
export const HOLIDAY_CELL = "bg-red-50 dark:bg-red-500/10"

/** Same wash, dimmed, for days spilling in from the neighbouring month. */
export const HOLIDAY_CELL_MUTED = "bg-red-50/60 dark:bg-red-500/5"

/** The date number and the holiday's name, which share one colour and one row. */
export const HOLIDAY_TEXT = "text-red-600 dark:text-red-400"

/** The employee-side note, where the pay rate is spelled out. */
export const HOLIDAY_NOTE =
  "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400"
