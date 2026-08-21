import type { PaymentTerms, ProjectStatus } from "@/app/generated/prisma/client"

// ---------------------------------------------------------------------------
// The project ledger's arithmetic
//
// One module, imported by the page that renders the list, the form that shows
// a live preview while somebody types, and the action that validates what they
// submit. None of these figures are stored — see the note on the Project model
// — so this file is the single definition of what they are. Two copies of a
// VAT rule is two answers to "what did we make on this job".
// ---------------------------------------------------------------------------

/** Philippine VAT. A project amount is quoted VAT-inclusive. */
export const VAT_RATE = 0.12

/** The divisor that takes a VAT-inclusive amount back to its net. */
const VAT_MULTIPLIER = 1 + VAT_RATE

/**
 * Money, to the centavo.
 *
 * Every derived figure passes through here before it is displayed *or* added
 * up, so a monthly total is the sum of the numbers actually on screen. Totting
 * up unrounded values instead would leave columns that don't add up by a peso
 * — the first thing anyone checking a spreadsheet notices.
 */
function centavos(value: number) {
  return Math.round(value * 100) / 100
}

// In the order the office reads them, which is the order they appear in the
// dropdown. Not the order Postgres stores them in and not alphabetical —
// nobody looking for "On Hold" wants to find it between two billing states.
export const PROJECT_STATUSES: ProjectStatus[] = [
  "IN_PROGRESS",
  "ACCOUNT_RECEIVABLE",
  "BILLED",
  "FOR_BILLING",
  "ON_HOLD",
  "CLOSED",
]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  IN_PROGRESS: "In Progress",
  ACCOUNT_RECEIVABLE: "Account Receivable",
  BILLED: "Billed",
  FOR_BILLING: "For Billing",
  ON_HOLD: "On Hold",
  CLOSED: "Closed",
}

// Same palette the schedule statuses use, so a status chip means the same kind
// of thing wherever it appears in the app. The three billing states get three
// distinguishable hues rather than three shades of one — at chip size, a shade
// difference is not something anyone can rely on reading correctly.
export const PROJECT_STATUS_CHIP: Record<ProjectStatus, string> = {
  IN_PROGRESS: "bg-sky-600/10 text-sky-700 dark:text-sky-400",
  ACCOUNT_RECEIVABLE: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
  BILLED: "bg-indigo-600/10 text-indigo-700 dark:text-indigo-400",
  FOR_BILLING: "bg-violet-600/10 text-violet-700 dark:text-violet-400",
  ON_HOLD: "bg-orange-600/10 text-orange-700 dark:text-orange-400",
  CLOSED: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
}

export const PAYMENT_TERMS: PaymentTerms[] = [
  "TWO_WEEKS",
  "UPON_COMPLETION",
  "NET_30",
  "NET_60",
  "DP30_PB60_RETENTION10",
  "DP50_COMPLETION50",
]

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  TWO_WEEKS: "2 weeks",
  UPON_COMPLETION: "100% upon completion",
  NET_30: "30 days",
  NET_60: "60 days",
  DP30_PB60_RETENTION10: "30% DP, 60% PB, 10% retention",
  DP50_COMPLETION50: "50% DP, 50% upon completion",
}

// ---------------------------------------------------------------------------
// Sales order numbers
// ---------------------------------------------------------------------------

/**
 * "260001" — the year's last two digits, then a running four-digit number.
 *
 * Year-scoped, so 2027's first project is 270001 rather than carrying on from
 * wherever 2026 finished. `latest` is the highest number already issued *for
 * that prefix*; anything else starts the year at one. The column is unique, so
 * two people adding a project in the same second collide at the database
 * rather than quietly sharing a number — see createProject, which retries.
 */
export function nextSalesOrderNo(
  latest: string | null | undefined,
  now: Date = new Date()
) {
  const prefix = String(now.getFullYear()).slice(2)
  const match = latest?.match(/^(\d{2})(\d{4})$/)
  const next = match && match[1] === prefix ? Number(match[2]) + 1 : 1
  return `${prefix}${String(next).padStart(4, "0")}`
}

// ---------------------------------------------------------------------------
// What the four typed figures imply
// ---------------------------------------------------------------------------

/** The numbers somebody enters on the form. */
export type ProjectInputs = {
  projectAmount: number
  cogs: number
  cashCollection: number
  accrualRevenue: number
}

/** Those numbers plus everything the system works out from them. */
export type ProjectFigures = ProjectInputs & {
  netOfVat: number
  inputVat: number
  cogsVat: number
  outputVat: number
  grossProfit: number
}

export function deriveProjectFigures(inputs: ProjectInputs): ProjectFigures {
  const projectAmount = centavos(inputs.projectAmount)
  const cogs = centavos(inputs.cogs)
  const cashCollection = centavos(inputs.cashCollection)
  const accrualRevenue = centavos(inputs.accrualRevenue)

  // The amount is VAT-inclusive, so the net is what's left after taking the
  // tax back out — and the input VAT is the difference, not a second
  // multiplication, which is what keeps net + VAT equal to the amount exactly.
  const netOfVat = centavos(projectAmount / VAT_MULTIPLIER)
  const inputVat = centavos(projectAmount - netOfVat)
  const cogsVat = centavos(cogs * VAT_RATE)

  return {
    projectAmount,
    cogs,
    cashCollection,
    accrualRevenue,
    netOfVat,
    inputVat,
    cogsVat,
    // What is actually remitted: the VAT collected on the sale less the VAT
    // already paid on what the job cost.
    outputVat: centavos(inputVat - cogsVat),
    // Against accrual revenue rather than cash collected: profit is earned
    // when the work is done, not when the client gets round to paying.
    grossProfit: centavos(accrualRevenue - cogs),
  }
}

/** Every money column, added up. The shape of a monthly or yearly total. */
export type ProjectTotals = ProjectFigures & { count: number }

const ZERO_TOTALS: ProjectTotals = {
  count: 0,
  projectAmount: 0,
  netOfVat: 0,
  inputVat: 0,
  cogs: 0,
  cogsVat: 0,
  outputVat: 0,
  cashCollection: 0,
  accrualRevenue: 0,
  grossProfit: 0,
}

export function sumFigures(rows: ProjectFigures[]): ProjectTotals {
  return rows.reduce<ProjectTotals>(
    (total, row) => ({
      count: total.count + 1,
      projectAmount: centavos(total.projectAmount + row.projectAmount),
      netOfVat: centavos(total.netOfVat + row.netOfVat),
      inputVat: centavos(total.inputVat + row.inputVat),
      cogs: centavos(total.cogs + row.cogs),
      cogsVat: centavos(total.cogsVat + row.cogsVat),
      outputVat: centavos(total.outputVat + row.outputVat),
      cashCollection: centavos(total.cashCollection + row.cashCollection),
      accrualRevenue: centavos(total.accrualRevenue + row.accrualRevenue),
      grossProfit: centavos(total.grossProfit + row.grossProfit),
    }),
    { ...ZERO_TOTALS }
  )
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** "1,250,000.00" — for table cells, where a ₱ on every row is just noise. */
export function amount(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** "₱1,250,000.00" — for the figures that are read on their own. */
export function pesoAmount(value: number) {
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  })
}

/**
 * The columns of the ledger, in the order the office reads them.
 *
 * One list, used by the table header, every project row, the monthly total row
 * and the yearly summary — so a column can never appear in one and not the
 * others, and the totals can't drift out of line with what they're totalling.
 * `derived` marks the ones nobody may type.
 */
export const MONEY_COLUMNS = [
  { key: "projectAmount", label: "Project amount", short: "Amount", derived: false },
  { key: "netOfVat", label: "Net of VAT", short: "Net of VAT", derived: true },
  { key: "inputVat", label: "Input VAT", short: "Input VAT", derived: true },
  { key: "cogs", label: "COGS", short: "COGS", derived: false },
  { key: "cogsVat", label: "COGS VAT", short: "COGS VAT", derived: true },
  { key: "outputVat", label: "Output VAT", short: "Output VAT", derived: true },
  { key: "cashCollection", label: "Cash collection", short: "Cash coll.", derived: false },
  { key: "accrualRevenue", label: "Accrual revenue", short: "Accrual rev.", derived: false },
  { key: "grossProfit", label: "Gross profit", short: "Gross profit", derived: true },
] as const satisfies readonly {
  key: keyof ProjectFigures
  label: string
  /** The heading a 7rem column can actually hold. */
  short: string
  derived: boolean
}[]

// ---------------------------------------------------------------------------
// What the browser is sent
// ---------------------------------------------------------------------------
//
// Dates as "YYYY-MM-DD" and money as plain numbers: a Prisma Decimal doesn't
// survive the trip to a client component, and a Date arrives as a string
// anyway. Derived figures are worked out on the server and shipped as numbers
// — the browser renders them, it doesn't recompute them.

export type ProjectRow = ProjectFigures & {
  id: string
  salesOrderNo: string
  status: ProjectStatus
  startDate: string
  endDate: string | null
  siNo: string | null
  name: string
  clientId: string
  clientName: string
  terms: PaymentTerms
}

/** One month's section of the ledger: its projects and their total. */
export type ProjectMonth = {
  /** 0–11, so it sorts and indexes MONTH_NAMES without parsing anything. */
  month: number
  projects: ProjectRow[]
  totals: ProjectTotals
}

// ---------------------------------------------------------------------------
// The company sheet
// ---------------------------------------------------------------------------
//
// What the projects add up to as a business, a month at a time: the profit the
// jobs made, what it cost to keep the lights on, and what was left.
//
// OPEX is not recorded anywhere yet — rent, salaries and the rest live outside
// this system for now, so the column reads as blank and the arithmetic treats
// it as zero. Everything below already takes it as a parameter, so the day
// those figures exist, they are passed in here and nothing else changes.

export type MonthSummary = {
  /** 0–11, or null for the row that totals the year. */
  month: number | null
  projects: number
  grossProfit: number
  accrualRevenue: number
  opex: number
  netProfit: number
  /**
   * Net profit as a share of accrual revenue, or null when there is no revenue
   * to be a share *of*. Dividing by zero would put "Infinity%" or "NaN%" in a
   * column of money — null is the honest answer and renders as a dash.
   */
  netMargin: number | null
}

export function summariseMonth(
  month: number | null,
  totals: ProjectTotals,
  opex = 0
): MonthSummary {
  const netProfit = Math.round((totals.grossProfit - opex) * 100) / 100

  return {
    month,
    projects: totals.count,
    grossProfit: totals.grossProfit,
    accrualRevenue: totals.accrualRevenue,
    opex,
    netProfit,
    netMargin:
      totals.accrualRevenue === 0 ? null : netProfit / totals.accrualRevenue,
  }
}

/** "42.5%" — one decimal is as fine as a margin off estimated figures gets. */
export function percent(value: number | null) {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`
}
