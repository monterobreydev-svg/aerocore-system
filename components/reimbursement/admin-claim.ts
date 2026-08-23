import type { ReimbursementStatus } from "@/app/generated/prisma/client"

// Shapes shared by the liquidation list and the detail dialog. They live on
// their own so the light table doesn't drag the dialog's chunk in with the
// type, and vice versa.

/**
 * A job an expense was for. One expense can carry several, and `amount` is the
 * share charged to this one — the expense divided by the jobs it covered.
 */
export type ClaimItemClient = {
  name: string
  soNumber: string | null
  amount: number
}

export type AdminClaimItem = {
  id: string
  description: string
  amount: number
  clients: ClaimItemClient[]
}

/** The release this liquidation was spending against, resolved server-side. */
export type ClaimFunder = {
  amount: number
  releasedAt: string
  releasedByName: string
  method: string | null
  proofKey: string | null
  proofName: string | null
}

/** Fund on hand around this one claim — see `buildFundContexts`. */
export type ClaimFund = {
  before: number
  after: number
  shortfall: number
}

export type AdminClaim = {
  id: string
  referenceNo: string
  employeeId: string
  employeeName: string
  employeeNo: string | null
  status: ReimbursementStatus
  totalAmount: number
  expenseDate: string
  receiptKey: string | null
  receiptName: string | null
  /**
   * When the scan was deleted for retention, or null.
   *
   * Carried so the panel can tell "deleted after a month" from "never
   * attached" — with only the key to go on, both look like nothing was ever
   * sent, and one of those is an accusation.
   */
  receiptPurgedAt: string | null
  isLate: boolean
  lateReason: string | null
  note: string | null
  submittedAt: string
  reviewedAt: string | null
  reviewNote: string | null
  reviewedByName: string | null
  items: AdminClaimItem[]
  fund: ClaimFund
  funder: ClaimFunder | null
}

export type EmployeeBalance = {
  id: string
  name: string
  employeeNo: string | null
  released: number
  liquidated: number
}

export type FundLedgerRow = {
  id: string
  employeeId: string
  employeeName: string
  amount: number
  method: string | null
  note: string | null
  proofKey: string | null
  proofName: string | null
  releasedAt: string
  releasedByName: string
}

// One screenful of rows. Small enough that a page of history is a couple of KB
// over a mobile connection, big enough that nobody is paging constantly. Lives
// here so the server queries and the pager agree without one importing the
// other's module.
export const CLAIM_PAGE_SIZE = 20

export type AdminTab = "queue" | "funds"

// Which page of the release log the server sent, so the view can build links for
// the rest and open on the tab the link came from.
export type Paging = {
  tab: AdminTab
  releasePage: number
  releasePages: number
  releaseTotal: number
}
