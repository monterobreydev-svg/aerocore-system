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
