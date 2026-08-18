// ---------------------------------------------------------------------------
// The period a report covers
// ---------------------------------------------------------------------------
//
// Pure date arithmetic on "YYYY-MM-DD" strings, with "today" always passed in
// rather than read from the ambient clock.
//
// That last part is the whole point: the picker is a client component that also
// renders on the server. If it called `new Date()` itself, the server would
// compute its presets against server time and the browser would recompute them
// against the phone's — and any disagreement (a different timezone, or simply
// crossing midnight between render and hydration) is a hydration mismatch.
// Server time is the source of truth everywhere else in this codebase, so the
// page computes these once and hands them down as plain strings.

export type Preset = {
  key: string
  label: string
  from: string
  to: string
}

/** "2026-08-17" from local parts, matching what a date input expects. */
export function dayValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseDay(value: string | undefined, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(+parsed) ? fallback : parsed
}

function lastOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

/**
 * The ranges somebody actually asks for, in the order they ask for them.
 *
 * Rows, not a calendar grid — nobody wants to click their way to "last 30 days"
 * one day cell at a time.
 */
export function buildPresets(today: Date): Preset[] {
  const day = dayValue
  const shifted = (back: number) => {
    const date = new Date(today)
    date.setDate(date.getDate() - back)
    return date
  }
  const monthStart = (offset: number) =>
    new Date(today.getFullYear(), today.getMonth() + offset, 1)

  return [
    { key: "7d", label: "Last 7 days", from: day(shifted(6)), to: day(today) },
    { key: "30d", label: "Last 30 days", from: day(shifted(29)), to: day(today) },
    { key: "month", label: "This month", from: day(monthStart(0)), to: day(today) },
    {
      key: "last-month",
      label: "Last month",
      from: day(monthStart(-1)),
      to: day(lastOfMonth(monthStart(-1))),
    },
    {
      key: "quarter",
      label: "Last 3 months",
      from: day(monthStart(-2)),
      to: day(today),
    },
    {
      key: "year",
      label: "This year",
      from: day(new Date(today.getFullYear(), 0, 1)),
      to: day(today),
    },
  ]
}

/**
 * The same window, moved one period back or forward.
 *
 * A range that is a month — whole, or month-to-date — steps by calendar month,
 * because "the month before August 1–17" is July, not July 15–31. Anything else
 * steps by its own length.
 */
export function stepRange(
  fromValue: string,
  toValue: string,
  direction: -1 | 1
): { from: string; to: string } {
  const from = parseDay(fromValue, new Date())
  const to = parseDay(toValue, new Date())

  const isMonthish =
    from.getDate() === 1 &&
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear()

  if (isMonthish) {
    const target = new Date(from.getFullYear(), from.getMonth() + direction, 1)
    return { from: dayValue(target), to: dayValue(lastOfMonth(target)) }
  }

  const span = Math.round((+to - +from) / 86_400_000) + 1
  const nextFrom = new Date(from)
  nextFrom.setDate(nextFrom.getDate() + direction * span)
  const nextTo = new Date(to)
  nextTo.setDate(nextTo.getDate() + direction * span)
  return { from: dayValue(nextFrom), to: dayValue(nextTo) }
}
