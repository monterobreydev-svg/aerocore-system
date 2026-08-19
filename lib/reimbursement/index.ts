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

// The handful of things field staff actually buy, in the order they come up.
// Tapping one fills the description, which is the difference between typing
// "Fuel" forty times a month and not.
export const EXPENSE_PRESETS = [
  "Fuel",
  "Fare",
  "Meal",
  "Parking",
  "Toll",
  "Load",
  "Materials",
  "Delivery",
] as const

// Four chips, in the order they bite: file it, attach it, when it's looked at,
// when the money lands. Each used to carry a paragraph, which on a phone is a
// screen of text standing between someone and the button they came to press —
// and it repeated what the filing form already says at the moment it matters:
// the form asks for the late reason itself and refuses anything that isn't a
// PDF. Short enough to read without meaning to is the whole requirement here.
export const REIMBURSEMENT_GUIDELINES = [
  `File within ${LIQUIDATION_WINDOW_DAYS} days`,
  "One PDF per day",
  `Same-day review before ${CHECKING_CUTOFF}`,
  "Paid in 1–2 working days",
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
// How a fund actually reaches someone
// ---------------------------------------------------------------------------

// A fixed list rather than a free-text box. Typed by hand this field collected
// "gcash", "GCash", "G-cash" and "gc" for one payment channel, which makes it
// useless for the one thing it is for: the employee checking the right account.
// It is also what the release notification quotes back to them, so it has to
// read the same way every time.
export const FUND_RELEASE_METHODS = [
  "GCash",
  "GoTyme",
  "CASH",
  "BDO",
] as const

export type FundReleaseMethod = (typeof FUND_RELEASE_METHODS)[number]

export function isFundReleaseMethod(value: string): value is FundReleaseMethod {
  return (FUND_RELEASE_METHODS as readonly string[]).includes(value)
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

// ---------------------------------------------------------------------------
// Where a single liquidation's money came from
// ---------------------------------------------------------------------------

// A liquidation on its own only says "₱1,240 was spent". What an approver
// actually needs to know is whether that ₱1,240 was money the office had
// already handed over: how much of the fund was left when the receipt was
// filed, who last funded them, and what's left afterwards.
//
// The fund is drawn oldest-release-first for the running balance, but "funded
// by" names only the most recent release the employee had received when they
// filed — that's the top-up they were spending against, and listing every
// historical release turns one fact into a ledger nobody reads.

export type FundContext = {
  /** Fund still in the employee's hands when this claim was filed. */
  before: number
  /** What's left after it — negative means they overspent the fund. */
  after: number
  /** The latest release they'd received when they filed, if any. */
  fundedByReleaseId: string | null
  /** Spend the released fund couldn't cover: out of the employee's pocket. */
  shortfall: number
}

type LedgerRelease = {
  id: string
  employeeId: string
  amount: number
  releasedAt: string
}

type LedgerClaim = {
  id: string
  employeeId: string
  status: ReimbursementStatus
  totalAmount: number
  submittedAt: string
}

// Keyed by claim id so a view can look up one claim's story in O(1).
export function buildFundContexts(
  releases: LedgerRelease[],
  claims: LedgerClaim[]
): Record<string, FundContext> {
  const byEmployee = new Map<
    string,
    { releases: LedgerRelease[]; claims: LedgerClaim[] }
  >()

  function bucket(employeeId: string) {
    let entry = byEmployee.get(employeeId)
    if (!entry) {
      entry = { releases: [], claims: [] }
      byEmployee.set(employeeId, entry)
    }
    return entry
  }

  for (const release of releases) bucket(release.employeeId).releases.push(release)
  for (const claim of claims) bucket(claim.employeeId).claims.push(claim)

  const contexts: Record<string, FundContext> = {}

  for (const { releases: rows, claims: filed } of byEmployee.values()) {
    // Oldest first on both sides — the whole point is to replay the ledger in
    // the order it happened.
    const pool = rows
      .slice()
      .sort((a, b) => a.releasedAt.localeCompare(b.releasedAt))
      .map((release) => ({ release, left: release.amount }))
    const ordered = filed
      .slice()
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))

    let admitted = 0
    // Spend no release ever covered — someone who buys before they're funded is
    // owed that money, and it has to keep counting against the fund or these
    // figures stop matching the "on hand" total on the funds tab.
    let uncovered = 0

    for (const claim of ordered) {
      // Money released *after* the receipt was filed wasn't available to spend,
      // so it isn't part of "fund before".
      while (
        admitted < pool.length &&
        pool[admitted].release.releasedAt <= claim.submittedAt
      ) {
        admitted += 1
      }

      const open = pool.slice(0, admitted)
      const unspent = open.reduce((sum, entry) => sum + entry.left, 0)
      const before = unspent - uncovered

      // A rejected claim doesn't retire any of the fund — that money is still
      // in the employee's hands and still needs explaining.
      const commit = claim.status !== "REJECTED"

      let owed = claim.totalAmount
      for (const entry of open) {
        if (owed <= 0) break
        if (entry.left <= 0) continue
        const taken = Math.min(entry.left, owed)
        owed -= taken
        if (commit) entry.left -= taken
      }

      if (commit) uncovered += owed

      contexts[claim.id] = {
        before,
        after: commit ? before - claim.totalAmount : before,
        fundedByReleaseId: admitted > 0 ? pool[admitted - 1].release.id : null,
        shortfall: owed,
      }
    }
  }

  return contexts
}

// The same ledger read from the other side: what the balance stood at right
// after each top-up. An employee looking at their history asks "where did this
// number come from", and the answer is only legible if the releases carry a
// running balance too — otherwise the money appears from nowhere between two
// liquidations.
//
// Replays releases oldest-first, retiring every liquidation filed before each
// one. Rejected claims never retire fund, exactly as in `buildFundContexts`, so
// the last balance here always equals `released - liquidated`.
export function buildReleaseBalances(
  releases: { id: string; amount: number; releasedAt: string }[],
  claims: { status: ReimbursementStatus; totalAmount: number; submittedAt: string }[]
): Record<string, number> {
  const spends = claims
    .filter((claim) => claim.status !== "REJECTED")
    .map((claim) => ({ at: claim.submittedAt, amount: claim.totalAmount }))
    .sort((a, b) => a.at.localeCompare(b.at))

  const ordered = releases
    .slice()
    .sort((a, b) => a.releasedAt.localeCompare(b.releasedAt))

  const balances: Record<string, number> = {}
  let balance = 0
  let spent = 0

  for (const release of ordered) {
    // Strictly before: a claim filed at the same instant as a release was
    // spending money the release hadn't provided, which is how the claim side
    // admits releases too.
    while (spent < spends.length && spends[spent].at < release.releasedAt) {
      balance -= spends[spent].amount
      spent += 1
    }
    balance += release.amount
    balances[release.id] = balance
  }

  return balances
}

// ---------------------------------------------------------------------------
// Splitting one payment across the jobs it covered
// ---------------------------------------------------------------------------

// A tank of fuel that served two client sites is charged half to each. Worked in
// centavos so the shares always add back up to the payment: ₱100 across three
// jobs is 33.34 / 33.33 / 33.33, never 33.33 × 3 with a centavo unaccounted for.
// The odd centavo goes to the earliest job on the line, which is arbitrary but
// consistent — and it's the only way the total can be reconciled to the receipt.
export function splitAmount(amount: number, parts: number): number[] {
  if (parts <= 0) return []
  if (parts === 1) return [amount]

  const centavos = Math.round(amount * 100)
  const base = Math.floor(centavos / parts)
  const extra = centavos - base * parts

  return Array.from(
    { length: parts },
    (_, index) => (base + (index < extra ? 1 : 0)) / 100
  )
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
