import type { NotificationType } from "@/app/generated/prisma/client"
import { formatDayAndMonth } from "@/lib/format-date"

// Kept free of prisma and of `server-only` on purpose: the bell in the header
// is a client component and needs the labels and the formatter. Anything that
// touches the database lives in lib/notify.ts instead.

// How many the bell carries. Opening one clears it, so a full list is a
// backlog, not a history — eight is what fits on a phone, and the count on the
// bell says how many more are behind them.
export const NOTIFICATION_LIMIT = 8

export type InboxItem = {
  id: string
  type: NotificationType
  title: string
  body: string
  href: string | null
  createdAt: string
}

// One accent per kind, so the sources are told apart at a glance while staying
// inside the app's sky/emerald/amber vocabulary.
export const NOTIFICATION_ACCENT: Record<NotificationType, string> = {
  SCHEDULE_ASSIGNED: "bg-sky-600/10 text-sky-700 dark:text-sky-400",
  LIQUIDATION_SUBMITTED: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
  FUND_RELEASED: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  OVERTIME_REQUESTED: "bg-violet-600/10 text-violet-700 dark:text-violet-400",
  PAYSLIP_RELEASED: "bg-brand/10 text-brand",
}

// "just now", "4m", "3h", "2d", then a plain date. Short because it sits on a
// line with the title and must not push it around.
/**
 * "just now", "4m ago", "3h ago" — or the date, once that stops being useful.
 *
 * `now` is required rather than defaulting to `new Date()`. The bell renders in
 * the layout, so it is on every page and it is server-rendered: a default clock
 * would be read once on the server and again a moment later in the browser, and
 * a notification either side of a minute boundary renders "just now" on one and
 * "1m ago" on the other. That is the hydration mismatch lib/use-now.ts exists to
 * avoid, so the caller has to say which clock it means.
 */
export function timeAgo(iso: string, now: Date) {
  const then = new Date(iso)
  const seconds = Math.max(0, Math.floor((+now - +then) / 1000))

  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

  return formatDayAndMonth(then)
}
