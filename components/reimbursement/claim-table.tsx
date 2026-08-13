"use client"

import { ChevronRight } from "lucide-react"
import {
  REIMBURSEMENT_STATUS_CHIP,
  REIMBURSEMENT_STATUS_LABELS,
  peso,
} from "@/lib/reimbursement"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { AdminClaim } from "@/components/reimbursement/admin-claim"

// Shared by the review queue on the reimbursements page and the per-employee
// history on the staff page. It lives on its own so the staff page doesn't pull
// in the whole admin view — and so the two never drift apart.
//
// Two layouts of the same rows. Seven columns is right on a desk and absurd on
// a phone: `overflow-x-auto` keeps a wide table from breaking the page, but it
// doesn't make it readable — you end up dragging a grid sideways to answer
// "how much, and was it approved". Below `md` each claim becomes a card that
// says the same things top to bottom.

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

function StatusBadges({ claim }: { claim: AdminClaim }) {
  return (
    <>
      <Badge className={REIMBURSEMENT_STATUS_CHIP[claim.status]}>
        {REIMBURSEMENT_STATUS_LABELS[claim.status]}
      </Badge>
      {claim.isLate && (
        <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400">
          Late
        </Badge>
      )}
    </>
  )
}

function ClaimCard({
  claim,
  onOpen,
  showDecision,
  hideEmployee,
}: {
  claim: AdminClaim
  onOpen: (claim: AdminClaim) => void
  showDecision?: boolean
  hideEmployee?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(claim)}
      aria-label={`Open liquidation ${claim.referenceNo}`}
      className="flex w-full flex-col gap-2 p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              {claim.referenceNo}
            </span>
            <StatusBadges claim={claim} />
          </span>
          {!hideEmployee && (
            <span className="truncate text-sm font-medium">
              {claim.employeeName}
            </span>
          )}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums">
            {peso(claim.totalAmount)}
          </div>
          <div
            className={cn(
              "text-[11px] whitespace-nowrap tabular-nums",
              claim.fund.after < 0
                ? "font-medium text-destructive"
                : "text-muted-foreground"
            )}
          >
            {peso(claim.fund.after)} left
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>{shortDate(claim.expenseDate)}</span>
        <span aria-hidden>·</span>
        <span>
          {claim.items.length}{" "}
          {claim.items.length === 1 ? "entry" : "entries"}
        </span>
        <span aria-hidden>·</span>
        <span>
          {showDecision && claim.reviewedAt
            ? `decided ${shortDate(claim.reviewedAt)}`
            : `filed ${shortDate(claim.submittedAt)}`}
        </span>
        {showDecision && claim.reviewedByName && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">by {claim.reviewedByName}</span>
          </>
        )}
      </div>
    </button>
  )
}

export function ClaimRows({
  claims,
  onOpen,
  /**
   * History mixes all three states, so it wants the outcome *and* who decided
   * it. The queue is single-state and only needs the badge.
   */
  showDecision,
  /** The employee column is noise when every row is the same person. */
  hideEmployee,
}: {
  claims: AdminClaim[]
  onOpen: (claim: AdminClaim) => void
  showDecision?: boolean
  hideEmployee?: boolean
}) {
  return (
    <>
      <div className="divide-y overflow-hidden rounded-xl ring-1 ring-foreground/10 md:hidden">
        {claims.map((claim) => (
          <ClaimCard
            key={claim.id}
            claim={claim}
            onOpen={onOpen}
            showDecision={showDecision}
            hideEmployee={hideEmployee}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 md:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Reference</TableHead>
            {!hideEmployee && <TableHead>Employee</TableHead>}
            <TableHead className="whitespace-nowrap">Date</TableHead>
            <TableHead className="text-right">Claimed</TableHead>
            <TableHead className="text-right whitespace-nowrap">
              Fund left
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => (
            <TableRow
              key={claim.id}
              role="button"
              tabIndex={0}
              aria-label={`Open liquidation ${claim.referenceNo}`}
              className="group cursor-pointer outline-none focus-visible:bg-muted/60"
              onClick={() => onOpen(claim)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                onOpen(claim)
              }}
            >
              <TableCell>
                <div className="font-mono text-xs">{claim.referenceNo}</div>
                <div className="text-xs text-muted-foreground">
                  {claim.items.length}{" "}
                  {claim.items.length === 1 ? "entry" : "entries"}
                </div>
              </TableCell>
              {!hideEmployee && (
                <TableCell>
                  <div className="text-sm">{claim.employeeName}</div>
                  {claim.employeeNo && (
                    <div className="font-mono text-xs text-muted-foreground">
                      {claim.employeeNo}
                    </div>
                  )}
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap">
                <div className="text-sm">{shortDate(claim.expenseDate)}</div>
                <div className="text-xs text-muted-foreground">
                  {showDecision && claim.reviewedAt
                    ? `decided ${shortDate(claim.reviewedAt)}`
                    : `filed ${shortDate(claim.submittedAt)}`}
                </div>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <div className="text-sm font-medium tabular-nums">
                  {peso(claim.totalAmount)}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {claim.fund.before > 0
                    ? `of ${peso(claim.fund.before)} held`
                    : "no fund held"}
                </div>
              </TableCell>
              <TableCell
                className={cn(
                  "text-right text-sm whitespace-nowrap tabular-nums",
                  claim.fund.after < 0
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {peso(claim.fund.after)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadges claim={claim} />
                </div>
                {showDecision && claim.reviewedByName && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    by {claim.reviewedByName}
                  </div>
                )}
              </TableCell>
              <TableCell className="w-8 pr-3">
                <ChevronRight className="size-4 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </>
  )
}
