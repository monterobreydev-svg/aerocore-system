"use client"

import { useActionState, useState } from "react"
import { AlertTriangle, Check, X } from "lucide-react"
import { reviewLiquidation, type ReviewState } from "@/app/actions/reimbursements"
import {
  LIQUIDATION_WINDOW_DAYS,
  REIMBURSEMENT_STATUS_CHIP,
  REIMBURSEMENT_STATUS_LABELS,
  peso,
} from "@/lib/reimbursement"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { FileLink } from "@/components/reimbursement/file-upload"
import type { AdminClaim } from "@/components/reimbursement/admin-reimbursements-view"

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function ReviewPanel({ claim }: { claim: AdminClaim }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(
    reviewLiquidation,
    undefined
  )
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null)

  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border p-3">
      <input type="hidden" name="reimbursementId" value={claim.id} />
      <input type="hidden" name="decision" value={decision ?? ""} />

      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Decision
      </p>

      {claim.isLate && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Filed outside the {LIQUIDATION_WINDOW_DAYS}-day window.
            {claim.lateReason ? (
              <>
                {" "}
                Reason given: <em>{claim.lateReason}</em>
              </>
            ) : (
              " No reason was given."
            )}
          </span>
        </p>
      )}

      <Field>
        <FieldLabel htmlFor={`review-note-${claim.id}`} className="text-xs">
          Note{" "}
          {decision === "REJECTED" && <span className="text-destructive">*</span>}
        </FieldLabel>
        <Textarea
          id={`review-note-${claim.id}`}
          name="reviewNote"
          rows={2}
          maxLength={1000}
          placeholder="Required when rejecting — the employee sees this."
          disabled={pending}
        />
      </Field>

      {state?.message && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          onClick={() => setDecision("REJECTED")}
          className="flex-1 text-destructive hover:bg-destructive/10"
        >
          <X />
          Reject
        </Button>
        <Button
          type="submit"
          disabled={pending}
          onClick={() => setDecision("APPROVED")}
          className="flex-1"
        >
          <Check />
          Approve
        </Button>
      </div>
    </form>
  )
}

export function AdminClaimSheet({
  claim,
  open,
  onOpenChange,
}: {
  claim: AdminClaim | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!claim) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {claim.employeeName}
            <Badge className={REIMBURSEMENT_STATUS_CHIP[claim.status]}>
              {REIMBURSEMENT_STATUS_LABELS[claim.status]}
            </Badge>
            {claim.isLate && (
              <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400">
                Late
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="font-mono">
            {claim.referenceNo} · {peso(claim.totalAmount)}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-4">
            {/* One day, one compiled scan — shown once against the claim
                rather than repeated on each line. */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Date liquidated</p>
                <p className="text-sm font-medium">
                  {shortDate(claim.expenseDate)}
                </p>
              </div>
              {claim.receiptKey && claim.receiptName ? (
                <FileLink fileKey={claim.receiptKey} name={claim.receiptName} />
              ) : (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  No receipts attached
                </span>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Breakdown
              </p>
              <div className="flex flex-col divide-y rounded-xl border px-3">
                {claim.items.map((item) => (
                  <div key={item.id} className="flex gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-tight">{item.description}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{item.clientName ?? "Not client-specific"}</span>
                        {item.soNumber && <span>· S.O. {item.soNumber}</span>}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {peso(item.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 py-2.5 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{peso(claim.totalAmount)}</span>
                </div>
              </div>
            </div>

            {claim.note && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <span className="font-medium">Employee note:</span> {claim.note}
              </p>
            )}

            {claim.status === "PENDING_REVIEW" ? (
              <ReviewPanel claim={claim} />
            ) : (
              <p
                className={cn(
                  "rounded-lg px-3 py-2 text-xs",
                  claim.status === "REJECTED"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-sky-600/10 text-sky-700 dark:text-sky-400"
                )}
              >
                <span className="font-medium">
                  {claim.status === "REJECTED" ? "Rejected" : "Approved"}
                </span>
                {claim.reviewedAt && ` on ${shortDate(claim.reviewedAt)}`}
                {claim.reviewedByName && ` by ${claim.reviewedByName}`}
                {claim.reviewNote && ` — ${claim.reviewNote}`}
              </p>
            )}
          </div>
        </div>

        <SheetFooter className="mt-auto shrink-0 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
