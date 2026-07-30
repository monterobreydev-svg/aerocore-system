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

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
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
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
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
                  <Badge className={REIMBURSEMENT_STATUS_CHIP[claim.status]}>
                    {REIMBURSEMENT_STATUS_LABELS[claim.status]}
                  </Badge>
                  {claim.isLate && (
                    <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400">
                      Late
                    </Badge>
                  )}
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
  )
}
