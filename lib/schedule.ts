import type { WorkType, ScheduleStatus } from "@/app/generated/prisma/client"

export const WORK_TYPES: WorkType[] = [
  "INSTALLATION",
  "REPAIR",
  "MAINTENANCE",
  "CLEANING",
  "INSPECTION",
  "SURVEY",
  "TROUBLESHOOT",
]

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  INSTALLATION: "Installation",
  REPAIR: "Repair",
  MAINTENANCE: "Maintenance",
  CLEANING: "Cleaning",
  INSPECTION: "Inspection",
  SURVEY: "Survey",
  TROUBLESHOOT: "Troubleshoot",
}

// bg + text pairing per work type, used as a small colored chip next to the
// job's client name so the table/calendar reads at a glance without leaning
// on text. A schedule can have several work types, so each needs its own
// clearly distinct hue.
export const WORK_TYPE_CHIP: Record<WorkType, string> = {
  INSTALLATION: "bg-indigo-600/10 text-indigo-700 dark:text-indigo-400",
  REPAIR: "bg-orange-600/10 text-orange-700 dark:text-orange-400",
  MAINTENANCE: "bg-sky-600/10 text-sky-700 dark:text-sky-400",
  CLEANING: "bg-teal-600/10 text-teal-700 dark:text-teal-400",
  INSPECTION: "bg-violet-600/10 text-violet-700 dark:text-violet-400",
  SURVEY: "bg-lime-600/10 text-lime-700 dark:text-lime-400",
  TROUBLESHOOT: "bg-rose-600/10 text-rose-700 dark:text-rose-400",
}

// Solid fills for calendar entries, Google-Calendar style — the whole block
// carries the colour rather than a thin edge, so a month at a glance reads as
// blocks of work rather than a grey list. Kept in the pastel range (100/200 in
// light, a soft translucent wash in dark) so a packed week doesn't glare, and
// text is a deep tint of the same hue rather than white for contrast at small
// sizes.
export const WORK_TYPE_SOLID: Record<WorkType, string> = {
  INSTALLATION:
    "bg-indigo-100 text-indigo-900 dark:bg-indigo-400/25 dark:text-indigo-50",
  REPAIR:
    "bg-orange-100 text-orange-900 dark:bg-orange-400/25 dark:text-orange-50",
  MAINTENANCE: "bg-sky-100 text-sky-900 dark:bg-sky-400/25 dark:text-sky-50",
  CLEANING: "bg-teal-100 text-teal-900 dark:bg-teal-400/25 dark:text-teal-50",
  INSPECTION:
    "bg-violet-100 text-violet-900 dark:bg-violet-400/25 dark:text-violet-50",
  SURVEY: "bg-lime-100 text-lime-900 dark:bg-lime-400/25 dark:text-lime-50",
  TROUBLESHOOT:
    "bg-rose-100 text-rose-900 dark:bg-rose-400/25 dark:text-rose-50",
}

// Left-border accent per work type, used on calendar chips.
export const WORK_TYPE_BORDER: Record<WorkType, string> = {
  INSTALLATION: "border-l-indigo-500",
  REPAIR: "border-l-orange-500",
  MAINTENANCE: "border-l-sky-500",
  CLEANING: "border-l-teal-500",
  INSPECTION: "border-l-violet-500",
  SURVEY: "border-l-lime-500",
  TROUBLESHOOT: "border-l-rose-500",
}

export const WORK_TYPE_DOT: Record<WorkType, string> = {
  INSTALLATION: "bg-indigo-500",
  REPAIR: "bg-orange-500",
  MAINTENANCE: "bg-sky-500",
  CLEANING: "bg-teal-500",
  INSPECTION: "bg-violet-500",
  SURVEY: "bg-lime-500",
  TROUBLESHOOT: "bg-rose-500",
}

// PENDING is the only "upcoming" state — the rest are outcomes recorded
// after the job happens (or was supposed to).
export const SCHEDULE_STATUSES: ScheduleStatus[] = [
  "PENDING",
  "COMPLETED",
  "NEED_TO_RETURN",
  "RESCHEDULED",
  "CANCELLED",
]

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  NEED_TO_RETURN: "Need to Return",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
}

export const SCHEDULE_STATUS_DOT: Record<ScheduleStatus, string> = {
  PENDING: "bg-amber-500",
  COMPLETED: "bg-emerald-500",
  NEED_TO_RETURN: "bg-orange-500",
  RESCHEDULED: "bg-sky-500",
  CANCELLED: "bg-rose-500",
}

export const SCHEDULE_STATUS_TEXT: Record<ScheduleStatus, string> = {
  PENDING: "text-amber-700 dark:text-amber-400",
  COMPLETED: "text-emerald-700 dark:text-emerald-400",
  NEED_TO_RETURN: "text-orange-700 dark:text-orange-400",
  RESCHEDULED: "text-sky-700 dark:text-sky-400",
  CANCELLED: "text-rose-700 dark:text-rose-400",
}

export const SCHEDULE_STATUS_CHIP: Record<ScheduleStatus, string> = {
  PENDING: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
  COMPLETED: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  NEED_TO_RETURN: "bg-orange-600/10 text-orange-700 dark:text-orange-400",
  RESCHEDULED: "bg-sky-600/10 text-sky-700 dark:text-sky-400",
  CANCELLED: "bg-rose-600/10 text-rose-700 dark:text-rose-400",
}

export function formatScheduleDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function formatTimeRange(startIso: string, endIso: string) {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`
}

export function toDateInputValue(iso: string) {
  const date = new Date(iso)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function toTimeInputValue(iso: string) {
  const date = new Date(iso)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

// ---------------------------------------------------------------------------
// Calendar date maths
//
// All of it is local-time. Schedules are written as `new Date("YYYY-MM-DDT00:00:00")`,
// i.e. local midnight, so comparing with toISOString() would shift the day for
// anyone east of UTC — Manila included, which is the whole user base.
// ---------------------------------------------------------------------------

export function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

// Weeks run Monday–Sunday, matching how the working week is described.
export function startOfWeek(date: Date) {
  const d = startOfDay(date)
  const day = d.getDay()
  d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day))
  return d
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// "2026-07-29" from local parts — the value a <input type="date"> expects.
export function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// The reverse of dateKey, for a ?date= in the URL. Local midnight again, so a
// linked day lines up with the calendar rather than landing a day off. Anything
// that isn't a plain date returns null — a hand-edited URL should fall back to
// today, not put the grid on Invalid Date.
export function parseDateKey(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(+date) ? null : date
}

export function minutesIntoDay(iso: string) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

// ---------------------------------------------------------------------------
// Schedule conflicts
// ---------------------------------------------------------------------------

// Half-open intervals: a job ending at 12:00 and one starting at 12:00 don't
// clash, so back-to-back deployments at the same site stay schedulable.
export function rangesOverlap(
  aStart: number | Date,
  aEnd: number | Date,
  bStart: number | Date,
  bEnd: number | Date
) {
  return +aStart < +bEnd && +bStart < +aEnd
}

// A cancelled job doesn't hold anyone's time. Everything else does, including
// NEED_TO_RETURN and RESCHEDULED — those rows still carry a live date/time the
// employee is expected at.
export const BLOCKING_STATUSES: ScheduleStatus[] = SCHEDULE_STATUSES.filter(
  (status) => status !== "CANCELLED"
)

// One employee's existing commitment, flattened for the browser so the
// assignment picker can warn about a clash before anything is submitted.
// The server re-checks regardless — this is a courtesy, not the guard.
export type EmployeeBusyBlock = {
  employeeId: string
  scheduleId: string
  start: string
  end: string
  label: string
}

export function findBusyConflicts(
  busy: EmployeeBusyBlock[],
  employeeId: string,
  start: Date | null,
  end: Date | null,
  excludeScheduleId?: string
) {
  if (!start || !end || +end <= +start) return []
  return busy.filter(
    (block) =>
      block.employeeId === employeeId &&
      block.scheduleId !== excludeScheduleId &&
      rangesOverlap(start, end, new Date(block.start), new Date(block.end))
  )
}

// Combines a date input value and a time input value into a local Date.
// Returns null when either half is missing or unparseable.
export function combineDateTime(date: string, time: string) {
  if (!date || !time) return null
  const value = new Date(`${date}T${time}:00`)
  return Number.isNaN(+value) ? null : value
}

// ---------------------------------------------------------------------------
// Week/day time-grid layout
// ---------------------------------------------------------------------------

// Side-by-side placement for jobs whose times overlap. Events are grouped into
// clusters that transitively overlap, and within a cluster each event takes the
// first column that's free — the same approach desktop calendars use.
export function packOverlapping<T extends { start: number; end: number }>(
  items: T[]
) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const placed: { item: T; column: number; columns: number }[] = []

  let cluster: { item: T; column: number }[] = []
  let clusterEnd = -Infinity
  let columnEnds: number[] = []

  function flush() {
    for (const entry of cluster) {
      placed.push({ ...entry, columns: columnEnds.length })
    }
    cluster = []
    columnEnds = []
    clusterEnd = -Infinity
  }

  for (const item of sorted) {
    if (item.start >= clusterEnd && cluster.length > 0) flush()

    let column = columnEnds.findIndex((end) => end <= item.start)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(item.end)
    } else {
      columnEnds[column] = item.end
    }

    cluster.push({ item, column })
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  if (cluster.length > 0) flush()

  return placed
}
