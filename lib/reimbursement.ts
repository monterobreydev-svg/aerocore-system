import type { ReimbursementStatus } from "@/app/generated/prisma/client"

export const REIMBURSEMENT_STATUSES: ReimbursementStatus[] = [
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
]

export const REIMBURSEMENT_STATUS_LABELS: Record<ReimbursementStatus, string> = {
  PENDING_REVIEW: "For review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
}

export const REIMBURSEMENT_STATUS_CHIP: Record<ReimbursementStatus, string> = {
  PENDING_REVIEW: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
  APPROVED: "bg-sky-600/10 text-sky-700 dark:text-sky-400",
  REJECTED: "bg-rose-600/10 text-rose-700 dark:text-rose-400",
}

export const REIMBURSEMENT_STATUS_DOT: Record<ReimbursementStatus, string> = {
  PENDING_REVIEW: "bg-amber-500",
  APPROVED: "bg-sky-500",
  REJECTED: "bg-rose-500",
}

// ---------------------------------------------------------------------------
// Liquidation window
// ---------------------------------------------------------------------------

// A receipt must be filed within a week of the purchase. Past that the claim
// still goes in, but it needs a written reason and an admin decision — the
// rule is "needs justifying", not "silently refused".
export const LIQUIDATION_WINDOW_DAYS = 7

// The daily cut-off for a claim to be picked up the same working day.
export const CHECKING_CUTOFF = "3:00 PM"

export const REIMBURSEMENT_GUIDELINES = [
  {
    title: "Funds released in 1–2 working days",
    detail:
      "Approved liquidations are reimbursed within one to two working days of approval.",
  },
  {
    title: `Checked daily until ${CHECKING_CUTOFF}`,
    detail: `Liquidations submitted before ${CHECKING_CUTOFF} on a weekday are reviewed that same day. Anything later is picked up the next working day.`,
  },
  {
    title: `File receipts within ${LIQUIDATION_WINDOW_DAYS} days`,
    detail: `A receipt older than ${LIQUIDATION_WINDOW_DAYS} days is outside the window. You can still submit it, but you'll be asked why it's late and an administrator decides whether it's reimbursed.`,
  },
] as const

function startOfDay(value: Date) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

// Whole days between the receipt date and today, comparing calendar days so a
// receipt from this morning is 0 regardless of the hour it's filed.
export function daysSince(expenseDate: string | Date, now: Date = new Date()) {
  const then = startOfDay(new Date(expenseDate))
  const today = startOfDay(now)
  return Math.floor((+today - +then) / 86400000)
}

// Late = older than the window. A future-dated receipt is not late (it's a
// different problem, caught by validation).
export function isLateExpense(expenseDate: string | Date, now: Date = new Date()) {
  return daysSince(expenseDate, now) > LIQUIDATION_WINDOW_DAYS
}

// ---------------------------------------------------------------------------
// Working fund balance
// ---------------------------------------------------------------------------

// The office releases a fund up front; the employee spends it and liquidates
// against it. What's left in their hands is simply released minus what they've
// accounted for. Rejected liquidations don't count as accounted — that money
// is still theirs to explain.
export function fundBalance(released: number, liquidated: number) {
  return released - liquidated
}

export function peso(amount: number) {
  return amount.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  })
}

// "RB-2026-0007" — year-scoped so the running number restarts each year and
// stays short enough to quote over the phone.
export function nextReferenceNo(latest: string | null | undefined, now: Date = new Date()) {
  const year = now.getFullYear()
  const match = latest?.match(/^RB-(\d{4})-(\d+)$/)
  const next = match && Number(match[1]) === year ? Number(match[2]) + 1 : 1
  return `RB-${year}-${String(next).padStart(4, "0")}`
}
