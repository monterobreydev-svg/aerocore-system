"use client"

import { useActionState, useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  MessageSquare,
  Receipt,
  Wallet,
  X,
} from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileLink } from "@/components/reimbursement/file-upload"
import type { AdminClaim, ClaimFunder } from "@/components/reimbursement/admin-claim"

// Description, client, S.O., amount — shared by the header and every row so
// they can't drift out of alignment. The S.O. column is sized for a full job
// reference rather than whatever's left over.
const BREAKDOWN_COLS =
  "sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_minmax(0,10rem)_6.5rem]"

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function filedAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      <Icon className="size-3.5" />
      {children}
    </p>
  )
}

// The three numbers that turn an amount into a decision: what the office had
// already given them, what this claim takes out of it, and what's left to
// account for. Reading left to right is the arithmetic itself.
function FundFlow({ claim }: { claim: AdminClaim }) {
  const { before, after, shortfall } = claim.fund
  const spentPct =
    before > 0 ? Math.min(100, (claim.totalAmount / before) * 100) : 100
  const overspent = after < 0

  return (
    <div className="rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/10 sm:p-4">
      {/* Three across on a desktop, where the arrows carry the arithmetic. On a
          phone that squeezes ₱ figures into 90px, so it becomes three labelled
          rows instead. */}
      <div className="flex flex-col divide-y divide-foreground/10 sm:grid sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center sm:gap-2 sm:divide-y-0">
        <div className="flex min-w-0 items-baseline justify-between gap-2 pb-1.5 sm:block sm:pb-0">
          <p className="text-[11px] leading-tight tracking-wide text-muted-foreground uppercase">
            Fund before
          </p>
          <p className="truncate text-base font-semibold tabular-nums sm:mt-1 sm:text-lg">
            {peso(before)}
          </p>
        </div>

        <span className="hidden text-muted-foreground/60 sm:block" aria-hidden>
          <ArrowRight className="size-3.5" />
        </span>

        <div className="flex min-w-0 items-baseline justify-between gap-2 py-1.5 sm:block sm:py-0">
          <p className="text-[11px] leading-tight tracking-wide text-muted-foreground uppercase">
            This liquidation
          </p>
          <p className="truncate text-base font-semibold text-amber-700 tabular-nums sm:mt-1 sm:text-lg dark:text-amber-400">
            −{peso(claim.totalAmount)}
          </p>
        </div>

        <span className="hidden text-muted-foreground/60 sm:block" aria-hidden>
          <ArrowRight className="size-3.5" />
        </span>

        <div className="flex min-w-0 items-baseline justify-between gap-2 pt-1.5 sm:block sm:pt-0">
          <p className="text-[11px] leading-tight tracking-wide text-muted-foreground uppercase">
            {claim.status === "REJECTED" ? "Still on hand" : "Remaining fund"}
          </p>
          <p
            className={cn(
              "truncate text-base font-semibold tabular-nums sm:mt-1 sm:text-lg",
              overspent
                ? "text-destructive"
                : "text-emerald-700 dark:text-emerald-400"
            )}
          >
            {peso(after)}
          </p>
        </div>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10"
        role="presentation"
      >
        <div
          className={cn(
            "h-full rounded-full",
            overspent ? "bg-destructive" : "bg-amber-500"
          )}
          style={{ width: `${spentPct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {before > 0 ? (
          <>
            {Math.round(spentPct)}% of the fund on hand was spent on this
            liquidation.
          </>
        ) : (
          "No working fund was on hand — this was spent out of pocket."
        )}
        {claim.status === "REJECTED" && before > 0 && (
          <> Rejected, so nothing was retired from the fund.</>
        )}
      </p>

      {shortfall > 0 && before > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {peso(shortfall)} of this claim goes beyond the fund released to
            them — that part came out of their own pocket.
          </span>
        </p>
      )}
    </div>
  )
}

// The top-up they were spending against: the most recent release they'd
// received when this was filed, and who authorised it.
function FundedBy({ funder }: { funder: ClaimFunder | null }) {
  if (!funder) {
    return (
      <p className="rounded-xl border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        No fund had been released to them when this was filed.
      </p>
    )
  }

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-base font-semibold tabular-nums">
          {peso(funder.amount)}
        </p>
        <p className="shrink-0 text-xs text-muted-foreground">
          {shortDate(funder.releasedAt)}
        </p>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        released by{" "}
        <span className="font-medium text-foreground">
          {funder.releasedByName}
        </span>
      </p>

      <div className="mt-2 flex flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">
            {funder.method ?? "Method not recorded"}
          </span>
        </div>
        {funder.proofKey && funder.proofName && (
          <FileLink fileKey={funder.proofKey} name={funder.proofName} />
        )}
      </div>
    </div>
  )
}

function ReviewBar({
  claim,
  onDecided,
}: {
  claim: AdminClaim
  onDecided: () => void
}) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(
    reviewLiquidation,
    undefined
  )
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null)

  // An approved claim leaves the queue for the history tab, so holding the
  // dialog open on a row that no longer exists there is just confusing.
  useEffect(() => {
    if (state?.success) onDecided()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="reimbursementId" value={claim.id} />
      <input type="hidden" name="decision" value={decision ?? ""} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`review-note-${claim.id}`}
            className="mb-1 block text-xs font-medium"
          >
            Note{" "}
            <span className="font-normal text-muted-foreground">
              — required when rejecting, the employee sees it
            </span>
          </label>
          <Textarea
            id={`review-note-${claim.id}`}
            name="reviewNote"
            rows={2}
            maxLength={1000}
            placeholder="Why is this being rejected, or anything worth recording."
            disabled={pending}
            className="resize-none"
          />
        </div>

        <div className="flex gap-2 sm:w-auto">
          <Button
            type="submit"
            variant="outline"
            disabled={pending}
            onClick={() => setDecision("REJECTED")}
            className="flex-1 text-destructive hover:bg-destructive/10 sm:flex-none"
          >
            <X />
            Reject
          </Button>
          <Button
            type="submit"
            disabled={pending}
            onClick={() => setDecision("APPROVED")}
            className="flex-1 sm:flex-none"
          >
            <Check />
            Approve
          </Button>
        </div>
      </div>

      {state?.message && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
    </form>
  )
}

// A dialog rather than a side sheet: the fund story, the breakdown and the
// funding source are three things an approver reads together, and a 24rem
// column forces them into a single cramped stack.
export function AdminClaimDialog({
  claim,
  open,
  onOpenChange,
}: {
  claim: AdminClaim
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider at xl than the usual dialog: four columns of breakdown plus the
          funding panel is what an approver reads, and squeezing them is what
          clipped the S.O. in the first place. */}
      <DialogContent className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl">
        <DialogHeader className="border-b p-3 pr-12 sm:p-4 sm:pr-12">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {claim.employeeName}
            {claim.employeeNo && (
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {claim.employeeNo}
              </span>
            )}
            <Badge className={REIMBURSEMENT_STATUS_CHIP[claim.status]}>
              {REIMBURSEMENT_STATUS_LABELS[claim.status]}
            </Badge>
            {claim.isLate && (
              <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400">
                Late
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className="font-mono">{claim.referenceNo}</span>
            <span aria-hidden>·</span>
            <span>spent {shortDate(claim.expenseDate)}</span>
            <span aria-hidden>·</span>
            <span>filed {filedAt(claim.submittedAt)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
          <div className="flex flex-col gap-4">
            <FundFlow claim={claim} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex min-w-0 flex-col gap-4">
                <div>
                  <SectionLabel icon={Receipt}>
                    Expense breakdown · {claim.items.length}{" "}
                    {claim.items.length === 1 ? "entry" : "entries"}
                  </SectionLabel>
                  {/* The S.O. gets a column of its own. Hung off the client name
                      it was the thing that got clipped, and it's the reference
                      the expense is recorded against — the one field on this
                      panel that has to be transcribable. */}
                  <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                    <div className={cn("hidden bg-muted/40 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:grid", BREAKDOWN_COLS)}>
                      <span>Description</span>
                      <span>Client</span>
                      <span>S.O. number</span>
                      <span className="text-right">Amount</span>
                    </div>
                    <div className="divide-y">
                      {claim.items.map((item) => {
                        // A payment covering two sites becomes two rows sharing
                        // one description, each with its own S.O. and share. No
                        // clients at all still gets a row, so every peso on the
                        // claim is on a line.
                        const rows =
                          item.clients.length > 0 ? item.clients : [null]
                        return (
                          <div key={item.id} className="px-3 py-2.5">
                            {rows.map((client, index) => (
                              <div
                                key={client ? `${client.name}-${index}` : "none"}
                                className={cn(
                                  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 sm:items-baseline",
                                  BREAKDOWN_COLS,
                                  index > 0 && "mt-1.5 sm:mt-0.5"
                                )}
                              >
                                <p className="min-w-0 text-sm leading-snug break-words sm:order-1">
                                  {index === 0 ? (
                                    item.description
                                  ) : (
                                    // Repeated on a phone, where the rows aren't
                                    // side by side to group themselves.
                                    <span className="text-muted-foreground sm:hidden">
                                      {item.description}
                                    </span>
                                  )}
                                </p>
                                <p className="order-2 shrink-0 text-sm font-medium tabular-nums sm:order-4 sm:text-right">
                                  {peso(client ? client.amount : item.amount)}
                                </p>
                                <p className="col-span-2 min-w-0 text-xs break-words text-muted-foreground sm:order-2 sm:col-span-1">
                                  {client?.name ?? "Not job-specific"}
                                </p>
                                <p className="col-span-2 min-w-0 font-mono text-xs break-all text-muted-foreground sm:order-3 sm:col-span-1">
                                  {client?.soNumber ?? (
                                    <span className="font-sans">—</span>
                                  )}
                                </p>
                              </div>
                            ))}
                            {item.clients.length > 1 && (
                              <p className="mt-1 text-[11px] text-muted-foreground/80">
                                One payment of {peso(item.amount)} divided evenly
                                between {item.clients.length} jobs.
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-3 py-2.5">
                      <span className="text-sm font-medium">Total claimed</span>
                      <span className="text-base font-semibold tabular-nums">
                        {peso(claim.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                {claim.note && (
                  <div>
                    <SectionLabel icon={MessageSquare}>
                      Employee note
                    </SectionLabel>
                    <p className="rounded-xl bg-muted/40 px-3 py-2.5 text-sm leading-relaxed break-words">
                      {claim.note}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <div>
                  <SectionLabel icon={Wallet}>Funded by</SectionLabel>
                  <FundedBy funder={claim.funder} />
                </div>

                <div>
                  <SectionLabel icon={Receipt}>Receipt</SectionLabel>
                  {claim.receiptKey && claim.receiptName ? (
                    <div className="rounded-xl border px-3 py-2.5">
                      <FileLink
                        fileKey={claim.receiptKey}
                        name={claim.receiptName}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        One compiled scan for {shortDate(claim.expenseDate)}.
                      </p>
                    </div>
                  ) : (
                    <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      No receipt was attached to this liquidation.
                    </p>
                  )}
                </div>

                {claim.isLate && (
                  <div>
                    <SectionLabel icon={AlertTriangle}>
                      Filed late
                    </SectionLabel>
                    <div className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                      <p>
                        Outside the {LIQUIDATION_WINDOW_DAYS}-day window.
                      </p>
                      <p className="mt-1">
                        {claim.lateReason ? (
                          <>
                            Reason given: <em>{claim.lateReason}</em>
                          </>
                        ) : (
                          "No reason was given."
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* The decision sits in the footer so it's reachable without scrolling
            back up, however long the breakdown runs. */}
        <div className="rounded-b-xl border-t bg-muted/50 p-3 sm:p-4">
          {claim.status === "PENDING_REVIEW" ? (
            <ReviewBar claim={claim} onDecided={() => onOpenChange(false)} />
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p
                className={cn(
                  "min-w-0 flex-1 rounded-lg px-3 py-2 text-xs break-words",
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
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
